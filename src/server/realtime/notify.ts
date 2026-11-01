import type { Request as WorkerRequest } from '@cloudflare/workers-types'
import { isRevision, isUserId } from './types'
import type { RealtimeEnv } from './types'

/** Called only after the training transaction commits. The binding is private. */
export async function notifyTrainingRevision(
  env: Pick<RealtimeEnv, 'WORKSPACE_DO'>,
  userId: string,
  revision: number,
): Promise<void> {
  if (!env.WORKSPACE_DO) return // Ordinary Next development uses HTTP polling.
  if (!isUserId(userId) || !isRevision(revision)) throw new Error('Invalid revision notification')
  const id = env.WORKSPACE_DO.idFromName(userId)
  const response = await env.WORKSPACE_DO.get(id).fetch(
    new Request('https://realtime.internal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, revision }),
    }) as unknown as WorkerRequest,
  )
  if (!response.ok) throw new Error('Realtime notification was not accepted')
}
