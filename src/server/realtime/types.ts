import type { DurableObjectNamespace, ExecutionContext } from '@cloudflare/workers-types'

/** Only bindings needed by the Worker-side realtime path. No Next context imports. */
export interface RealtimeEnv {
  DATABASE_URL?: string
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  TRUSTED_ORIGINS?: string
  WORKSPACE_DO?: DurableObjectNamespace
}

export type RealtimeExecutionContext = Pick<ExecutionContext, 'waitUntil'>

export interface RealtimeIdentity {
  userId: string
  expiresAt: number
}

export interface RevisionMessage {
  type: 'revision'
  revision: number
}

export const REALTIME_PATH = '/api/realtime'
export const SOCKET_LIFETIME_MS = 60_000
export const MAX_USER_SOCKETS = 8
export const IDENTITY_HEADER = 'x-fitt-realtime-user'
export const EXPIRY_HEADER = 'x-fitt-realtime-expires'

export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
}

export function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Cookies never authorize a cross-origin upgrade on their own. */
export function isRealtimeOriginAllowed(origin: string | null, env: RealtimeEnv): boolean {
  if (!origin || origin === 'null') return false
  try {
    const parsed = new URL(origin)
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return false
    if (
      parsed.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    )
      return false
    const allowed = [env.BETTER_AUTH_URL || '', ...(env.TRUSTED_ORIGINS || '').split(',')]
    return allowed.some((value) => {
      if (!value.trim()) return false
      try {
        const configured = new URL(value.trim())
        return (
          ['http:', 'https:'].includes(configured.protocol) &&
          !configured.username &&
          !configured.password &&
          configured.pathname === '/' &&
          !configured.search &&
          !configured.hash &&
          configured.origin === origin
        )
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export function realtimeError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    },
  )
}
