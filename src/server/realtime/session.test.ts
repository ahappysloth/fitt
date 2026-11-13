import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeSignedCookie } from 'better-call'

const database = vi.hoisted(() => ({
  rows: [] as Array<{ userId: string; expiresAt: Date }>,
  opened: 0,
  ended: 0,
}))

vi.mock('@turnal-io/db/serverless', () => ({
  createDb: () => {
    database.opened += 1
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => database.rows,
    }
    return {
      db: { select: () => query },
      pool: {
        options: {},
        end: async () => {
          database.ended += 1
        },
      },
    }
  },
}))

import { resolveRealtimeSession } from './session'

const env = {
  DATABASE_URL: 'postgresql://fixture:fixture@ep-fixture-pooler.example.neon.tech/test',
  BETTER_AUTH_SECRET: 'fitt-unit-test-signing-secret-not-a-real-credential',
  BETTER_AUTH_URL: 'https://fitt.example',
}
const context = { waitUntil: (task: Promise<unknown>) => void task }
const token = 'SufficientlyLongSessionToken_123456789'
const request = async (secret = env.BETTER_AUTH_SECRET) =>
  new Request('https://fitt.example/api/realtime', {
    headers: {
      cookie: (
        await serializeSignedCookie('__Secure-better-auth.session_token', token, secret)
      ).split(';')[0],
    },
  })

describe('realtime session resolution', () => {
  beforeEach(() => {
    database.rows = []
    database.opened = 0
    database.ended = 0
  })

  it('never treats a validly signed cookie as a session without a live database row', async () => {
    // A signed-out, revoked or expired session keeps a valid signature; only
    // the session lookup (token match and expires_at > now) can say no.
    expect(await resolveRealtimeSession(await request(), env, context)).toBeNull()
    expect(database.opened).toBe(1)
    expect(database.ended).toBe(1)
  })

  it('returns the live session owner', async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    database.rows = [{ userId: 'user-1', expiresAt }]
    expect(await resolveRealtimeSession(await request(), env, context)).toEqual({
      userId: 'user-1',
      expiresAt: expiresAt.getTime(),
    })
  })

  it('does not open a database connection for a forged cookie', async () => {
    database.rows = [{ userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) }]
    const forged = await request('another-signing-secret-with-at-least-32-characters')
    expect(await resolveRealtimeSession(forged, env, context)).toBeNull()
    expect(database.opened).toBe(0)
  })
})
