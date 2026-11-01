import { createRequestDb, type ServerDb } from './db'
import { buildRequestAuth } from './auth'
import { authIsConfigured, getServerContext, type FittEnv, type WaitUntil } from './env'
import {
  errorResponse,
  isMutation,
  isTrustedRequestOrigin,
  privateResponse,
} from './request-policy'
import { authContextReady } from './realtime/auth-context'

export interface AccountUser {
  id: string
  name: string
  email: string
}
export interface AuthenticatedRequestContext {
  db: ServerDb
  user: AccountUser
  env: FittEnv
  waitUntil?: WaitUntil
}

export async function drainBackgroundTasks(tasks: Promise<unknown>[]) {
  let offset = 0
  while (offset < tasks.length) {
    const batch = tasks.slice(offset)
    offset = tasks.length
    const settled = await Promise.allSettled(batch)
    if (settled.some((result) => result.status === 'rejected')) {
      console.error('[Fitt] An account background task did not complete')
    }
  }
}

export async function withRequestServices(
  request: Request,
  handler: (context: {
    db: ServerDb
    env: FittEnv
    waitUntil: WaitUntil
    auth: ReturnType<typeof buildRequestAuth>
  }) => Promise<Response>,
) {
  const execution = getServerContext()
  if (!authIsConfigured(execution.env))
    return errorResponse('Account services are not configured.', 503)
  if (isMutation(request) && !isTrustedRequestOrigin(request, execution.env)) {
    return errorResponse('This request did not come from a trusted Fitt page.', 403)
  }
  let resource: Awaited<ReturnType<typeof createRequestDb>> | undefined
  const background: Promise<unknown>[] = []
  const waitUntil: WaitUntil = (task) => {
    background.push(task)
    void task.catch(() => {})
  }
  try {
    await authContextReady
    resource = await createRequestDb(execution.env.DATABASE_URL)
    const auth = buildRequestAuth(resource.db, execution.env, waitUntil)
    return privateResponse(await handler({ db: resource.db, env: execution.env, waitUntil, auth }))
  } catch {
    console.error('[Fitt] Account request could not be completed')
    return errorResponse(
      'Account services are temporarily unavailable. Your device data is safe.',
      503,
    )
  } finally {
    if (resource) {
      const opened = resource
      const cleanup = async () => {
        await drainBackgroundTasks(background)
        await opened.dispose()
      }
      const pending = cleanup().catch(() => console.error('[Fitt] Account request cleanup failed'))
      if (execution.waitUntil) execution.waitUntil(pending)
      else await pending
    }
  }
}

export function withAuthenticatedRequest(
  request: Request,
  handler: (context: AuthenticatedRequestContext) => Promise<Response>,
) {
  return withRequestServices(request, async ({ db, env, waitUntil, auth }) => {
    const current = await auth.auth.api.getSession({ headers: request.headers })
    if (!current?.user) return errorResponse('Sign in to access your saved workouts.', 401)
    const user: AccountUser = {
      id: current.user.id,
      name: current.user.name,
      email: current.user.email,
    }
    return handler({ db, env, waitUntil, user })
  })
}
