import { verifySessionCookie } from '@turnal-io/auth'

const MAX_COOKIE_HEADER = 16_384
// Better Auth session tokens are 32 URL-safe characters; allow some headroom.
const TOKEN_SHAPE = /^[a-zA-Z0-9_-]{16,256}$/

/**
 * Database-free pre-check for the realtime upgrade: the session token when the
 * Better Auth session cookie carries this server's HMAC signature, else null.
 * The signature check, cookie name (`__Secure-` on https) and duplicate-cookie
 * refusal are @turnal-io/auth's `verifySessionCookie`; Fitt adds bounds on the
 * header and token and refuses a weak secret or a non-http(s) auth origin.
 *
 * SIGNATURE ONLY: a signed-out, revoked or expired session's cookie still
 * passes. It is never authorisation on its own; resolveRealtimeSession looks
 * the token up as a live, unexpired session row before any channel opens.
 */
export async function verifiedSessionToken(
  request: Request,
  secret: string,
  baseURL: string,
): Promise<string | null> {
  if (secret.length < 32) return null
  try {
    if (!['http:', 'https:'].includes(new URL(baseURL).protocol)) return null
  } catch {
    return null
  }
  const header = request.headers.get('cookie')
  if (!header || header.length > MAX_COOKIE_HEADER) return null
  try {
    const token = await verifySessionCookie(request, { secret, baseURL })
    return token && TOKEN_SHAPE.test(token) ? token : null
  } catch {
    return null
  }
}
