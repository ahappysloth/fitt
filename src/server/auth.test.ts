import { describe, expect, it, vi } from 'vitest'
import { createDb } from '@turnal-io/db/serverless'
import { makeSignature } from 'better-auth/crypto'
import { buildRequestAuth, discardProviderTokens, logAuthLine } from './auth'
import {
  boundedDelivery,
  createMailSender,
  emailDeliveryAvailable,
  safeEmailOptions,
} from './email'
import type { FittEnv } from './env'
import * as schema from '../db/schema'
import { createElement } from 'react'

// Stand-in for the RATE_LIMIT_DO binding: records the instance and bucket key
// of every take and answers with `allowed`.
const takes: Array<{ instance: string; key: string; limit: number; windowMs: number }> = []
let allowed = true
const rateLimitNamespace = {
  idFromName: (name: string) => name,
  get: (instance: string) => ({
    fetch: async (_url: string, init: { body: string }) => {
      takes.push({ instance, ...JSON.parse(init.body) })
      return Response.json({ allowed, remaining: allowed ? 1 : 0, resetMs: allowed ? 0 : 1_000 })
    },
  }),
} as unknown as NonNullable<FittEnv['RATE_LIMIT_DO']>

const env = {
  DATABASE_URL: 'postgresql://fixture:fixture@invalid.example/test',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'https://fitt.example',
  TRUSTED_ORIGINS: 'https://fitt.example',
  GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fixture',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  EMAIL_FROM: '',
  RATE_LIMIT_DO: rateLimitNamespace,
} satisfies FittEnv

describe('passwordless authentication', () => {
  it('returns a callback with missing OAuth state to the trusted account controls', async () => {
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    try {
      const built = buildRequestAuth(db, env, undefined, async () => {})
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/callback/google`),
      )
      expect(response.status).toBe(302)
      const destination = new URL(response.headers.get('location')!)
      expect(destination.origin).toBe(env.BETTER_AUTH_URL)
      expect(destination.pathname).toBe('/')
      expect(destination.searchParams.get('account')).toBe('return')
      expect(destination.searchParams.has('error')).toBe(true)
    } finally {
      await pool.end()
    }
  })

  it('limits pre-auth routes through the sharded Durable Object without storing client IPs', async () => {
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    takes.length = 0
    try {
      const built = buildRequestAuth(
        db,
        env,
        () => {},
        async () => {},
      )
      const request = (path: string, ip: string) =>
        built.auth.handler(
          new Request(`${env.BETTER_AUTH_URL}/api/auth/${path}`, {
            headers: { 'cf-connecting-ip': ip },
          }),
        )
      // Signed-in and health routes use a per-isolate bucket: no DO round trip.
      expect((await request('ok', '203.0.113.7')).status).toBe(200)
      expect((await request('get-session', '203.0.113.7')).status).toBe(200)
      expect(takes).toHaveLength(0)
      // The OAuth callback is pre-auth: it reaches the shared limiter.
      await request('callback/google', '203.0.113.7')
      await request('callback/google', '203.0.113.7')
      await request('callback/google', '203.0.113.8')
      expect(takes).toHaveLength(3)
      for (const take of takes) {
        expect(take.key).toMatch(/^[0-9a-f]{64}$/)
        expect(take.instance).toMatch(/^(global|shard-([1-9]|1[0-5]))$/)
      }
      // One HMAC'd key per client and path, never the address itself.
      expect(takes[1].key).toBe(takes[0].key)
      expect(takes[2].key).not.toBe(takes[0].key)
      expect(JSON.stringify(takes)).not.toMatch(/203\.0\.113/)
      // The refusal of pre-auth requests without cf-connecting-ip cannot be
      // exercised here: Better Auth substitutes 127.0.0.1 when NODE_ENV=test.
      // scripts/test-worker-account.mjs checks it in the built Worker.
    } finally {
      await pool.end()
    }
  })

  it('limits signed-in routes per isolate even though auth is built per request', async () => {
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    takes.length = 0
    // Frozen clock: the bucket refills a token every 100 ms, so a slow run
    // would otherwise let request 101 through.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // A fresh auth instance per request, as in production; the per-isolate
      // buckets live at module scope, so they still accumulate.
      const session = () =>
        buildRequestAuth(
          db,
          env,
          () => {},
          async () => {},
        ).auth.handler(
          new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, {
            headers: { 'cf-connecting-ip': '203.0.113.20' },
          }),
        )
      const statuses: number[] = []
      for (let index = 0; index < 101; index += 1) statuses.push((await session()).status)
      // Better Auth's default rule: 100 per 10 seconds per client IP.
      expect(statuses.slice(0, 100).every((status) => status === 200)).toBe(true)
      expect(statuses[100]).toBe(429)
      expect(takes).toHaveLength(0)
    } finally {
      vi.useRealTimers()
      await pool.end()
    }
  })

  it('returns a rate-limited browser navigation to the account controls', async () => {
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    allowed = false
    try {
      const built = buildRequestAuth(
        db,
        env,
        () => {},
        async () => {},
      )
      const callback = (headers: Record<string, string>) =>
        built.auth.handler(
          new Request(`${env.BETTER_AUTH_URL}/api/auth/callback/google?state=fixture`, {
            headers: { 'cf-connecting-ip': '203.0.113.9', ...headers },
          }),
        )
      const navigation = await callback({ 'Sec-Fetch-Mode': 'navigate' })
      expect(navigation.status).toBe(302)
      const destination = new URL(navigation.headers.get('location')!)
      expect(destination.origin + destination.pathname).toBe(`${env.BETTER_AUTH_URL}/`)
      expect(destination.searchParams.get('account')).toBe('return')
      expect(destination.searchParams.get('error')).toBe('rate_limited')
      // A fetch keeps Better Auth's JSON 429.
      expect((await callback({})).status).toBe(429)
    } finally {
      allowed = true
      await pool.end()
    }
  })

  it('retains provider identity while discarding unneeded Google credentials', async () => {
    const input = {
      userId: 'user',
      providerId: 'google',
      accountId: 'identity',
      accessToken: 'access',
      refreshToken: 'refresh',
      idToken: 'id',
    }
    const { data } = await discardProviderTokens(input)
    expect(data).toMatchObject({
      userId: 'user',
      providerId: 'google',
      accountId: 'identity',
      accessToken: null,
      refreshToken: null,
      idToken: null,
    })
    expect(input.accessToken).toBe('access')
  })

  it('answers 503 EMAIL_DELIVERY_FAILED when the sign-in email cannot be sent', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    const sender = vi.fn(async () => {
      throw new Error('delivery failed for athlete@example.test')
    })
    try {
      const built = buildRequestAuth(db, env, () => {}, sender)
      const plugin = built.auth.options.plugins?.find((value) => value.id === 'magic-link')
      const options = plugin?.options as {
        sendMagicLink: (options: { email: string; url: string }) => Promise<void>
      }
      // Better Auth awaits this callback inside /sign-in/magic-link.
      await expect(
        options.sendMagicLink({
          email: 'athlete@example.test',
          url: 'https://fitt.example/api/auth/magic-link/verify?token=fixture',
        }),
      ).rejects.toMatchObject({ statusCode: 503, body: { code: 'EMAIL_DELIVERY_FAILED' } })
      expect(sender).toHaveBeenCalledOnce()
      // The failure is logged, redacted, through Fitt's sink.
      const logged = output.mock.calls.flat().map(String).join('\n')
      expect(logged).toContain('email send failed (magic-link)')
      expect(logged).not.toContain('athlete@example.test')
    } finally {
      await pool.end()
      output.mockRestore()
    }
  })

  it('answers 503 EMAIL_DELIVERY_FAILED through the auth handler', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    // The verification row is written before the send; no database here.
    const insert = vi.spyOn(db, 'insert').mockImplementation(
      () =>
        ({
          values: (row: unknown) => ({ returning: async () => [row] }),
        }) as never,
    )
    try {
      const built = buildRequestAuth(
        db,
        env,
        () => {},
        async () => {
          throw new Error('delivery failed for athlete@example.test')
        },
      )
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: env.BETTER_AUTH_URL,
            'cf-connecting-ip': '203.0.113.30',
          },
          body: JSON.stringify({ email: 'athlete@example.test', callbackURL: '/' }),
        }),
      )
      expect(insert).toHaveBeenCalled()
      // Not replaced by onError's 500: the browser shows "could not be sent".
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' })
      const logged = output.mock.calls.flat().map(String).join('\n')
      expect(logged).toContain('email send failed (magic-link)')
      expect(logged).not.toContain('athlete@example.test')
      expect(logged).not.toContain('Authentication action could not complete')
    } finally {
      insert.mockRestore()
      await pool.end()
      output.mockRestore()
    }
  })

  it("keeps Better Auth's own client-error answers instead of a 500", async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    try {
      const built = buildRequestAuth(db, env, undefined, async () => {})
      // Request validation raises an APIError of a class other than
      // better-auth/api's; onError must still recognise it.
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: env.BETTER_AUTH_URL,
            'cf-connecting-ip': '203.0.113.31',
          },
          body: JSON.stringify({ email: 'not-an-email', callbackURL: '/' }),
        }),
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
      expect(output).not.toHaveBeenCalled()
    } finally {
      await pool.end()
      output.mockRestore()
    }
  })

  it('logs only a constant line when a session read fails in the database', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    const select = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('Failed query: select from fitt_session params: fixture-session-token')
    })
    try {
      const built = buildRequestAuth(db, env, undefined, async () => {})
      // A correctly signed cookie, so Better Auth reaches the database.
      const token = 'fixture-session-token'
      const signed = `${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, {
          headers: {
            cookie: `__Secure-better-auth.session_token=${encodeURIComponent(signed)}`,
            'cf-connecting-ip': '203.0.113.32',
          },
        }),
      )
      expect(select).toHaveBeenCalled()
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain('fixture-session-token')
      // The package's "endpoint failed" line carries the driver error as its
      // cause; Fitt prints its own constant line instead.
      expect([...output.mock.calls, ...warn.mock.calls]).toEqual([
        ['[Fitt] Authentication action could not complete'],
      ])
    } finally {
      select.mockRestore()
      await pool.end()
      output.mockRestore()
      warn.mockRestore()
    }
  })

  it("prints the package's own log lines and drops Better Auth's", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      logAuthLine('error', '[turnalbase/auth] rate limiter failed — REFUSING /sign-in/social', 'x')
      logAuthLine('warn', '[turnalbase/auth] RATE LIMITING HAS NO CLIENT IP: …')
      logAuthLine('error', '[turnalbase/auth] Better Auth endpoint threw:', 'driver detail')
      logAuthLine('error', '[turnalbase/auth] Better Auth endpoint failed:', 'driver detail')
      logAuthLine('error', 'Failed to create user')
      logAuthLine('warn', 'Social sign-in failed')
      expect(error.mock.calls).toEqual([
        ['[turnalbase/auth] rate limiter failed — REFUSING /sign-in/social', 'x'],
      ])
      expect(warn.mock.calls).toEqual([['[turnalbase/auth] RATE LIMITING HAS NO CLIENT IP: …']])
    } finally {
      error.mockRestore()
      warn.mockRestore()
    }
  })

  it('rejects header injection and bounds hanging mail delivery', async () => {
    expect(() =>
      safeEmailOptions({
        to: 'a@example.test\r\nBcc: another@example.test',
        subject: 'Sign in',
        react: createElement('p'),
      }),
    ).toThrow('Invalid email header')
    await expect(boundedDelivery(() => new Promise(() => {}), 5)).rejects.toThrow('timed out')
  })

  it('uses the request-local Worker sender and fails closed when it is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    const configured = {
      ...env,
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'fixture',
      SMTP_PASS: 'fixture',
      EMAIL_FROM: 'Fitt <fitt@example.test>',
    }
    const options = {
      to: 'athlete@example.test',
      subject: 'Sign in',
      react: createElement('p', null, 'Fitt'),
    }
    try {
      expect(emailDeliveryAvailable(configured)).toBe(false)
      await expect(createMailSender(configured)(options)).rejects.toThrow('unavailable')
      const sender = vi.fn(async () => {})
      const injected = { ...configured, __FITT_SEND_EMAIL: sender }
      expect(emailDeliveryAvailable(injected)).toBe(true)
      await createMailSender(injected)(options)
      expect(sender).toHaveBeenCalledWith(options)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not expose raw adapter errors or query credentials in responses or logs', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, pool } = createDb({ schema, connectionString: env.DATABASE_URL })
    const insert = vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('fixture-sensitive-query-parameter')
    })
    try {
      const built = buildRequestAuth(db, env, undefined, async () => {})
      const response = await built.auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
          body: JSON.stringify({ email: 'athlete@example.test', callbackURL: '/' }),
        }),
      )
      expect(response.status).toBe(500)
      // onError's APIError is the response (since @turnal-io/auth 4.0 the
      // package, not Better Auth, calls onError).
      expect(await response.json()).toEqual({ message: 'Account action could not be completed.' })
      expect(output.mock.calls).toEqual([['[Fitt] Authentication action could not complete']])
    } finally {
      insert.mockRestore()
      await pool.end()
      output.mockRestore()
    }
  })
})
