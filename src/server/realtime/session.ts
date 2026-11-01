import { createDb } from '@turnal-io/db/serverless'
import { and, eq, gt } from 'drizzle-orm'
import { session, user } from '../../db/auth'
import { verifiedSessionToken } from './session-cookie'
import type { RealtimeEnv, RealtimeExecutionContext, RealtimeIdentity } from './types'

/** Worker-only: real signed cookie plus live DB row, not cached cookie metadata. */
export async function resolveRealtimeSession(
  request: Request,
  env: RealtimeEnv,
  context: RealtimeExecutionContext,
): Promise<RealtimeIdentity | null> {
  if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return null
  const token = await verifiedSessionToken(request, env.BETTER_AUTH_SECRET, env.BETTER_AUTH_URL)
  if (!token) return null
  const { db, pool } = createDb({
    schema: { session, user },
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMs: 8_000,
  })
  pool.options.query_timeout = 8_000
  try {
    const [row] = await db
      .select({ userId: user.id, expiresAt: session.expiresAt })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
      .limit(1)
    return row ? { userId: row.userId, expiresAt: row.expiresAt.getTime() } : null
  } finally {
    context.waitUntil(pool.end())
  }
}
