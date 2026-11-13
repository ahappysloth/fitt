import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertAuthConfig, assertAuthSchema } from '@turnal-io/auth'
import { boolean, pgTable, text, timestamp, type PgColumnBuilderBase } from 'drizzle-orm/pg-core'
import { fittAuthConfig } from './auth'
import type { FittEnv } from './env'
import * as schema from '../db/schema'

/**
 * createAuth runs per request, so a configuration it refuses would be a 503 on
 * every account request after deploy rather than a failed deploy. This runs
 * @turnal-io/auth's own construction checks against the production values in
 * wrangler.jsonc, with stand-in secrets and bindings, under the Workers rules.
 */

interface WranglerConfig {
  vars: Record<string, string>
  durable_objects: { bindings: Array<{ name: string; class_name: string }> }
  migrations: Array<{ tag: string; new_sqlite_classes?: string[] }>
}

function wranglerConfig(): WranglerConfig {
  const source = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
  // wrangler.jsonc uses whole-line comments and trailing commas only.
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'))
}

const wrangler = wranglerConfig()
// A stand-in with the shape of `openssl rand -base64 32`; never a real secret.
const standInSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
const rateLimitNamespace = {
  idFromName: (name: string) => name,
  get: () => ({
    fetch: async () => Response.json({ allowed: true, remaining: 1, resetMs: 1 }),
  }),
} as unknown as NonNullable<FittEnv['RATE_LIMIT_DO']>

function environment(overrides: Partial<FittEnv> = {}): FittEnv {
  return {
    DATABASE_URL: 'postgresql://fixture:fixture@ep-fixture-pooler.example.neon.tech/test',
    BETTER_AUTH_SECRET: standInSecret,
    BETTER_AUTH_URL: wrangler.vars.BETTER_AUTH_URL,
    TRUSTED_ORIGINS: wrangler.vars.TRUSTED_ORIGINS,
    GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'fixture-google-client-secret',
    SMTP_HOST: 'smtp.purelymail.com',
    SMTP_USER: 'fixture',
    SMTP_PASS: 'fixture',
    EMAIL_FROM: 'Fitt <fitt@example.test>',
    FITT_ADMIN_EMAILS: 'owner@example.test',
    RATE_LIMIT_DO: rateLimitNamespace,
    ...overrides,
  }
}

const options = { waitUntil: () => {}, sendEmail: async () => {} }
const check = (env: FittEnv, config = options) =>
  assertAuthConfig(fittAuthConfig(env, config), { workers: true })

describe('production auth configuration', () => {
  it('declares the rate-limit Durable Object with its own migration', () => {
    expect(wrangler.durable_objects.bindings).toContainEqual({
      name: 'RATE_LIMIT_DO',
      class_name: 'RateLimitDO',
    })
    const migrated = wrangler.migrations.flatMap((entry) => entry.new_sqlite_classes ?? [])
    expect(migrated.filter((name) => name === 'RateLimitDO')).toHaveLength(1)
    expect(new Set(wrangler.migrations.map((entry) => entry.tag)).size).toBe(
      wrangler.migrations.length,
    )
  })

  it('passes every @turnal-io/auth construction check with the deployed values', () => {
    expect(new URL(wrangler.vars.BETTER_AUTH_URL).protocol).toBe('https:')
    expect(() => check(environment())).not.toThrow()
    const config = fittAuthConfig(environment(), options)
    expect(config.magicLink).toEqual({ enabled: true, allowSignUp: true })
    expect(config.rateLimiter).toBeDefined()
    // Package defaults Fitt relies on: only pre-auth routes reach the Durable
    // Object; a rate-limited navigation returns to onAPIError.errorURL.
    expect(config.rateLimiterScope).toBeUndefined()
    expect(config.rateLimitRedirectURL).toBeUndefined()
    expect(config.emailDelivery).toBe('await')
    expect(config.logger?.disabled).not.toBe(true)
    expect(config.admin).toBeUndefined()
  })

  // Better Auth 1.7 compares the Drizzle schema with what it needs on the
  // first auth request and answers every auth request with a 500 on a
  // mismatch. No query is sent: only the schema object is read.
  it('has the Drizzle schema Better Auth checks on the first request', async () => {
    await expect(
      assertAuthSchema(fittAuthConfig(environment(), options), { schema }),
    ).resolves.toBeUndefined()
  })

  it('fails the schema check for a missing column or an unwritten NOT NULL column', async () => {
    const timestamps = {
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    }
    const user = (extra: Record<string, PgColumnBuilderBase> = {}) =>
      pgTable('fitt_user', {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        email: text('email').notNull().unique(),
        image: text('image'),
        ...timestamps,
        ...extra,
      })
    const assertWith = (table: ReturnType<typeof user>) =>
      assertAuthSchema(fittAuthConfig(environment(), options), {
        schema: { ...schema, user: table },
      })
    // email_verified dropped from fitt_user.
    await expect(assertWith(user())).rejects.toThrow(/Missing columns\s+user\.emailVerified/)
    // A required column Better Auth never writes: every sign-up would fail.
    await expect(
      assertWith(
        user({
          emailVerified: boolean('email_verified').notNull().default(false),
          plan: text('plan').notNull(),
        }),
      ),
    ).rejects.toThrow(/never writes\s+user\.plan/)
  })

  it('fails without the shared limiter binding or the request waitUntil', () => {
    expect(() => check(environment({ RATE_LIMIT_DO: undefined }))).toThrow(/no shared rate limiter/)
    expect(() => check(environment(), { ...options, waitUntil: undefined! })).toThrow(/waitUntil/)
  })

  it('canonicalises TRUSTED_ORIGINS and drops entries that can never match', () => {
    const env = environment({
      TRUSTED_ORIGINS: ` ${wrangler.vars.TRUSTED_ORIGINS}/ , HTTPS://Preview.Fitt.Example:443/,, http://plain.example, https://*.example `,
    })
    expect(() => check(env)).not.toThrow()
    expect(fittAuthConfig(env, options).trustedOrigins).toEqual([
      wrangler.vars.BETTER_AUTH_URL,
      'https://preview.fitt.example',
    ])
  })

  it('refuses a short or placeholder signing secret', () => {
    expect(() => check(environment({ BETTER_AUTH_SECRET: 'too-short' }))).toThrow(/secret/)
    expect(() =>
      check(environment({ BETTER_AUTH_SECRET: 'change-me-change-me-change-me-change-me' })),
    ).toThrow(/placeholder/)
  })

  it('accepts the localhost development and preview origins', () => {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4173']) {
      const local = { BETTER_AUTH_URL: origin, TRUSTED_ORIGINS: origin }
      expect(() => check(environment(local))).not.toThrow()
      // Node tooling without the Durable Object binding falls back to Better Auth's limiter.
      expect(() => check(environment({ ...local, RATE_LIMIT_DO: undefined }))).not.toThrow()
    }
  })
})
