import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Children, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { eq, inArray, sql } from 'drizzle-orm'
import { account, session, user, verification } from '../db/auth'
import { createRequestDb } from './db'
import { buildRequestAuth } from './auth'
import type { FittEnv } from './env'

const enabled = process.env.FITT_RUN_LIVE_DB_TESTS === '1' && !!process.env.DATABASE_URL

/** @turnal-io/auth stores magic-link tokens hashed (Better Auth's SHA-256, base64url). */
async function storedToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Buffer.from(digest).toString('base64url')
}

function emailLink(node: ReactNode): string | undefined {
  if (!isValidElement<{ href?: string; children?: ReactNode }>(node)) return undefined
  if (node.props.href) return node.props.href
  for (const child of Children.toArray(node.props.children)) {
    const link = emailLink(child)
    if (link) return link
  }
}

describe.skipIf(!enabled)('passwordless auth against development Neon', () => {
  const fixtureEmail = `fitt-auth-${crypto.randomUUID()}@example.test`
  const tokens: string[] = []
  let createdUserId: string | undefined
  let resource: Awaited<ReturnType<typeof createRequestDb>>
  const env: FittEnv = {
    DATABASE_URL: process.env.DATABASE_URL || '',
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET || 'isolated-live-test-secret-with-32-characters',
    BETTER_AUTH_URL: 'http://localhost:5173',
    TRUSTED_ORIGINS: 'http://localhost:5173',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    EMAIL_FROM: '',
  }

  beforeAll(async () => {
    resource = await createRequestDb(env.DATABASE_URL)
  })

  afterAll(async () => {
    if (!resource) return
    try {
      if (tokens.length)
        await resource.db.delete(verification).where(inArray(verification.identifier, tokens))
      if (createdUserId) await resource.db.delete(user).where(eq(user.id, createdUserId))
      else await resource.db.delete(user).where(eq(user.email, fixtureEmail))
    } finally {
      await resource.dispose()
    }
  })

  it('creates a session from a delivered link, rejects replay and expired links, and cleans up only its fixture', async () => {
    const pending: Promise<unknown>[] = []
    let delivered: string | undefined
    const built = buildRequestAuth(
      resource.db,
      env,
      (task) => {
        pending.push(task)
      },
      async (options) => {
        // In-memory sink only: no provider, SMTP connection, disk output, or token logging.
        delivered = emailLink(options.react)
      },
    )
    const requestLink = async () => {
      delivered = undefined
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
          body: JSON.stringify({ email: fixtureEmail, callbackURL: '/' }),
        }),
      )
      await built.finishEmailDeliveries()
      await Promise.allSettled(pending)
      expect(response.status).toBe(200)
      expect(typeof delivered).toBe('string')
      const token = new URL(delivered!).searchParams.get('token')
      expect(Boolean(token)).toBe(true)
      const identifier = await storedToken(token!)
      const [stored] = await resource.db
        .select({ identifier: verification.identifier })
        .from(verification)
        .where(eq(verification.identifier, identifier))
      // The database never holds a usable sign-in link.
      expect(stored?.identifier).toBe(identifier)
      tokens.push(identifier)
      return delivered!
    }

    const firstLink = await requestLink()
    const verified = await built.auth.handler(new Request(firstLink))
    expect(verified.status).toBe(302)
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    expect(cookie.includes('better-auth.session_token=')).toBe(true)
    const current = await built.auth.api.getSession({ headers: new Headers({ Cookie: cookie }) })
    expect(current?.user.email === fixtureEmail).toBe(true)
    createdUserId = current?.user.id
    expect(Boolean(createdUserId)).toBe(true)

    const replay = await built.auth.handler(new Request(firstLink))
    expect(replay.status).toBe(302)
    expect(new URL(replay.headers.get('location')!).searchParams.get('error')).toBe('INVALID_TOKEN')

    const secondLink = await requestLink()
    await resource.db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(verification.identifier, tokens[1]))
    const expired = await built.auth.handler(new Request(secondLink))
    expect(expired.status).toBe(302)
    expect(new URL(expired.headers.get('location')!).searchParams.get('error')).toBe(
      'INVALID_TOKEN',
    )
    const sessions = await resource.db
      .select({ count: sql<number>`count(*)::int` })
      .from(session)
      .where(eq(session.userId, createdUserId!))
    expect(sessions[0].count).toBe(1)
    const accounts = await resource.db
      .select({ count: sql<number>`count(*)::int` })
      .from(account)
      .where(eq(account.userId, createdUserId!))
    expect(accounts[0].count).toBe(0)
  }, 30_000)
})
