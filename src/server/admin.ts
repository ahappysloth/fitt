import { authIsConfigured, getServerContext } from './env'
import { errorResponse, privateResponse } from './request-policy'
import { withRequestServices } from './request'

interface AdminIdentity {
  id: string
  email: string
  emailVerified: boolean
}

export function isAdminIdentity(
  identity: Pick<AdminIdentity, 'email' | 'emailVerified'> | null | undefined,
  configuredEmails: string | undefined,
) {
  if (identity?.emailVerified !== true || !configuredEmails) return false
  const allowed = configuredEmails
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(identity.email.trim().toLowerCase())
}

export async function withAdminRequest(
  request: Request,
  handler: (identity: AdminIdentity) => Promise<Response> | Response,
  accessProbe = false,
) {
  const deny = (status: number) =>
    accessProbe
      ? privateResponse(Response.json({ allowed: false }))
      : errorResponse(
          status === 401
            ? 'Sign in to open the admin studio.'
            : 'This account does not have admin access.',
          status,
        )
  if (!request.headers.get('cookie')) return deny(401)
  const { env } = getServerContext()
  if (!authIsConfigured(env) || !env.FITT_ADMIN_EMAILS?.trim()) return deny(403)
  return withRequestServices(request, async ({ auth, env }) => {
    // Admin checks use a live session, not Better Auth's optional cookie cache.
    const current = await auth.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    })
    if (!current?.user) return deny(401)
    const expectedAccount = request.headers.get('x-fitt-account')
    if (expectedAccount && expectedAccount !== current.user.id) return deny(403)
    if (!isAdminIdentity(current.user, env.FITT_ADMIN_EMAILS)) return deny(403)
    return handler(current.user)
  })
}
