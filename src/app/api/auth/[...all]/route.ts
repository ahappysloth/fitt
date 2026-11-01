import { authIsConfigured, serverEnv } from '@/server/env'
import { emailDeliveryAvailable } from '@/server/email'
import { allowAuthAttempt } from '@/server/auth-rate-limit'
import { withRequestServices } from '@/server/request'
import {
  boundedRequest,
  errorResponse,
  isTrustedRequestOrigin,
  RequestBodyTimeout,
} from '@/server/request-policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const readPaths = new Set(['get-session', 'callback/google', 'magic-link/verify', 'error', 'ok'])
const writePaths = new Set(['sign-in/social', 'sign-in/magic-link', 'sign-out'])

async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, '')
  if (!(request.method === 'GET' ? readPaths : writePaths).has(path)) {
    return errorResponse('This account action is not available.', 404)
  }
  if (request.url.length > 8192) return errorResponse('The request is too large.', 414)
  let bounded = request
  if (request.method === 'POST') {
    const env = serverEnv()
    if (!authIsConfigured(env)) return errorResponse('Account services are not configured.', 503)
    if (!isTrustedRequestOrigin(request, env)) {
      return errorResponse('This request did not come from a trusted Fitt page.', 403)
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return errorResponse('Send account requests as JSON.', 415)
    }
    let body: Request | null
    try {
      body = await boundedRequest(request, 16_384)
    } catch (error) {
      return errorResponse(
        error instanceof RequestBodyTimeout
          ? error.message
          : 'The account request could not be read.',
        error instanceof RequestBodyTimeout ? 408 : 400,
      )
    }
    if (!body) return errorResponse('The request is too large.', 413)
    bounded = body
    try {
      await bounded.clone().json()
    } catch {
      return errorResponse('The request is not valid JSON.', 400)
    }
    if (path === 'sign-in/magic-link' && !emailDeliveryAvailable(env)) {
      return errorResponse(
        'Email sign-in is unavailable here. Continue with Google or keep using this device.',
        503,
      )
    }
  }
  return withRequestServices(bounded, async ({ auth, db, env }) => {
    if (
      bounded.method === 'POST' &&
      path.startsWith('sign-in/') &&
      !(await allowAuthAttempt(db, bounded, env))
    ) {
      return Response.json(
        { error: 'Too many sign-in attempts. Please try again in ten minutes.' },
        { status: 429, headers: { 'Retry-After': '600' } },
      )
    }
    const response = await auth.auth.handler(bounded)
    try {
      await auth.finishEmailDeliveries()
    } catch {
      return errorResponse('Your sign-in email could not be sent. Please try again later.', 503)
    }
    return response
  })
}

export const GET = handle
export const POST = handle
