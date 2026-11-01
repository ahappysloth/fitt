const encoder = new TextEncoder()
const BASE_COOKIE_NAME = 'better-auth.session_token'

/**
 * Matches better-call's serializeSignedCookie: URI-encoded token + '.' + base64
 * HMAC-SHA256. Kept outside the Next auth factory so the Worker upgrade path
 * does not bundle Next's request/cookie machinery. Tests use better-call itself.
 */
export async function verifiedSessionToken(
  request: Request,
  secret: string,
  baseURL: string,
): Promise<string | null> {
  if (secret.length < 32) return null
  let secure: boolean
  try {
    const url = new URL(baseURL)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    secure = url.protocol === 'https:'
  } catch {
    return null
  }
  const cookieName = `${secure ? '__Secure-' : ''}${BASE_COOKIE_NAME}`
  const header = request.headers.get('cookie')
  if (!header || header.length > 16_384) return null
  const matching = header.split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    return separator >= 0 && part.slice(0, separator).trim() === cookieName
      ? [part.slice(separator + 1).trim()]
      : []
  })
  // Ambiguous cookies with different paths must not choose a different identity
  // from the application auth middleware.
  if (matching.length !== 1) return null
  try {
    const value = decodeURIComponent(matching[0])
    const separator = value.lastIndexOf('.')
    if (separator <= 0) return null
    const token = value.slice(0, separator)
    const signature = value.slice(separator + 1)
    if (!/^[a-zA-Z0-9_-]{16,256}$/.test(token)) return null
    if (!/^[a-zA-Z0-9+/]{43}=$/.test(signature)) return null
    const bytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0))
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(token))
    return valid ? token : null
  } catch {
    return null
  }
}
