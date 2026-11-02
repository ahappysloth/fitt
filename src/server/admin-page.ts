import { withAdminRequest } from './admin'
import { privateResponse } from './request-policy'

/** Match vinext's segment decoding, slash collapsing, and dot resolution. */
export function isAdminPagePath(pathname: string) {
  const segments: string[] = []
  try {
    for (const encoded of pathname.split('/')) {
      const segment = decodeURIComponent(encoded)
      if (!segment || segment === '.') continue
      if (segment === '..') segments.pop()
      else segments.push(segment)
    }
  } catch {
    // Vinext rejects malformed escapes before matching a route.
    return false
  }
  // Encoded delimiters remain within their segment, never becoming separators.
  return segments[0] === 'admin'
}

/** Protect document and RSC entry points before rendering the native studio. */
export async function serveAdminPage(request: Request, render: () => Promise<Response>) {
  const response = await withAdminRequest(request, render)
  if (response.status !== 401 && response.status !== 403) return privateResponse(response)
  const destination = new URL('/settings?admin=restricted', request.url)
  return privateResponse(Response.redirect(destination, 303))
}
