import type { Request as WorkerRequest } from '@cloudflare/workers-types'
import {
  EXPIRY_HEADER,
  IDENTITY_HEADER,
  isRealtimeOriginAllowed,
  isUserId,
  realtimeError,
  SOCKET_LIFETIME_MS,
} from './types'
import type { RealtimeEnv, RealtimeExecutionContext, RealtimeIdentity } from './types'

type ResolveSession = (
  request: Request,
  env: RealtimeEnv,
  context: RealtimeExecutionContext,
) => Promise<RealtimeIdentity | null>

/** Dependency injection keeps route policy testable without database credentials. */
export async function upgradeRealtime(
  request: Request,
  env: RealtimeEnv,
  context: RealtimeExecutionContext,
  resolveSession: ResolveSession,
): Promise<Response> {
  if (request.method !== 'GET') return realtimeError(405, 'Method not allowed')
  if (!isRealtimeOriginAllowed(request.headers.get('origin'), env)) {
    return realtimeError(403, 'Origin not allowed')
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return realtimeError(426, 'WebSocket upgrade required')
  }
  if (!env.WORKSPACE_DO) return realtimeError(503, 'Realtime is unavailable')
  try {
    const identity = await resolveSession(request, env, context)
    const now = Date.now()
    if (
      !identity ||
      !isUserId(identity.userId) ||
      !Number.isFinite(identity.expiresAt) ||
      identity.expiresAt <= now
    ) {
      return realtimeError(401, 'Sign in to connect')
    }
    // Construct headers from scratch; caller-supplied identity headers and room
    // query parameters can never reach the Durable Object.
    const headers = new Headers({
      Upgrade: 'websocket',
      [IDENTITY_HEADER]: identity.userId,
      [EXPIRY_HEADER]: String(Math.min(identity.expiresAt, now + SOCKET_LIFETIME_MS)),
    })
    const id = env.WORKSPACE_DO.idFromName(identity.userId)
    const response = await env.WORKSPACE_DO.get(id).fetch(
      new Request('https://realtime.internal/connect', {
        method: 'GET',
        headers,
      }) as unknown as WorkerRequest,
    )
    return response as unknown as Response
  } catch {
    // Authentication/database failures never grant a channel or leak credentials.
    return realtimeError(503, 'Realtime connection could not be established')
  }
}
