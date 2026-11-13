import { sql } from 'drizzle-orm'
import type { ServerDb } from './db'
import type { FittEnv } from './env'
import { isWorkerRuntime } from './runtime'

/** HMAC-SHA256 (hex) so limiter keys never store a raw IP address or email. */
export async function privateRateLimitKey(secret: string, value: string) {
  const bytes = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    bytes.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const result = await crypto.subtle.sign('HMAC', key, bytes.encode(value))
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function consume(db: ServerDb, key: string, maximum: number) {
  const result = await db.execute(sql`
    WITH expired AS (
      SELECT id FROM fitt_auth_rate_limits
      WHERE reset_at < now() - interval '1 day' AND id <> ${key}
      ORDER BY reset_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ), pruned AS (
      DELETE FROM fitt_auth_rate_limits USING expired
      WHERE fitt_auth_rate_limits.id = expired.id
    )
    INSERT INTO fitt_auth_rate_limits (id, count, reset_at)
    VALUES (${key}, 1, now() + interval '10 minutes')
    ON CONFLICT (id) DO UPDATE SET
      count = CASE WHEN fitt_auth_rate_limits.reset_at <= now() THEN 1 ELSE fitt_auth_rate_limits.count + 1 END,
      reset_at = CASE WHEN fitt_auth_rate_limits.reset_at <= now() THEN now() + interval '10 minutes' ELSE fitt_auth_rate_limits.reset_at END
    WHERE fitt_auth_rate_limits.reset_at <= now() OR fitt_auth_rate_limits.count < ${maximum}
    RETURNING count
  `)
  return result.rows.length === 1
}

export async function allowTrainingWrite(db: ServerDb, userId: string, env: FittEnv) {
  return consume(db, await privateRateLimitKey(env.BETTER_AUTH_SECRET, `training:${userId}`), 120)
}

export async function allowAuthAttempt(db: ServerDb, request: Request, env: FittEnv) {
  // Cloudflare owns this header. Do not trust a client-supplied forwarded IP in Node.
  const source = isWorkerRuntime()
    ? request.headers.get('cf-connecting-ip') || 'unknown'
    : 'node-development'
  if (
    !(await consume(db, await privateRateLimitKey(env.BETTER_AUTH_SECRET, `source:${source}`), 20))
  )
    return false
  if (new URL(request.url).pathname.endsWith('/sign-in/magic-link')) {
    const body: unknown = await request.clone().json()
    const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined
    if (typeof email === 'string' && email.length <= 254) {
      return consume(
        db,
        await privateRateLimitKey(env.BETTER_AUTH_SECRET, `email:${email.trim().toLowerCase()}`),
        5,
      )
    }
  }
  return true
}
