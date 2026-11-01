import { CloudValidationError, parseSyncWrite } from '../../../lib/cloud-contract'
import { withAuthenticatedRequest } from '../../../server/request'
import { readTraining, writeTraining, MutationReuseError } from '../../../server/training'
import {
  checkTrainingAccount,
  readTrainingJson,
  TrainingRequestError,
} from '../../../server/training-request'
import { notifyTrainingRevision } from '../../../server/realtime/notify'
import { allowTrainingWrite } from '../../../server/auth-rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedRequest(request, async ({ db, user }) => {
    const wrongAccount = checkTrainingAccount(request, user.id)
    if (wrongAccount) return wrongAccount
    return Response.json(await readTraining(db, user.id))
  })
}

export async function PUT(request: Request): Promise<Response> {
  return withAuthenticatedRequest(request, async ({ db, user, env, waitUntil }) => {
    const wrongAccount = checkTrainingAccount(request, user.id)
    if (wrongAccount) return wrongAccount
    if (!(await allowTrainingWrite(db, user.id, env))) {
      return Response.json(
        {
          error: 'sync_rate_limited',
          message:
            'There have been many sync attempts. Your changes are safe on this device; try again shortly.',
        },
        { status: 429, headers: { 'Retry-After': '600' } },
      )
    }
    try {
      const write = parseSyncWrite(await readTrainingJson(request))
      const result = await writeTraining(db, user.id, write)
      if (result.kind === 'conflict') return Response.json(result.snapshot, { status: 409 })
      if (result.changed) {
        // Persistence already committed. Realtime is a hint, so an unavailable
        // DO must not turn a committed workout into an apparent failed write.
        const broadcast = notifyTrainingRevision(env, user.id, result.snapshot.revision).catch(
          () => {
            console.warn(
              'Fitt realtime notification could not be delivered; clients will refresh on reconnect.',
            )
          },
        )
        if (waitUntil) waitUntil(broadcast)
        else await broadcast
      }
      return Response.json(result.snapshot)
    } catch (error) {
      if (error instanceof TrainingRequestError) {
        return Response.json(
          { error: error.code, message: error.message },
          { status: error.status },
        )
      }
      if (error instanceof CloudValidationError) {
        return Response.json({ error: 'invalid_training', message: error.message }, { status: 400 })
      }
      if (error instanceof MutationReuseError) {
        return Response.json({ error: 'mutation_reused', message: error.message }, { status: 422 })
      }
      throw error
    }
  })
}
