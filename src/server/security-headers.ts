import { securityHeaders, withHeaders } from '@turnal-io/security-headers'

/** Where browsers POST Content-Security-Policy violation reports (see csp-report.ts). */
export const CSP_REPORT_PATH = '/api/csp-report'

/**
 * Fitt's security response headers, set by the Worker entry on every response
 * it returns (pages, API routes, public files such as /sw.js, and the Worker's
 * own realtime and Admin responses). Files under /_next/static/* are served
 * without running the Worker and keep public/_headers instead.
 *
 * The CSP is report-only: nothing is blocked, violations go to
 * CSP_REPORT_PATH. Every other header is enforced.
 */
export function buildSecurityHeaders(origin: string, { dev = false } = {}) {
  const { protocol, host } = new URL(origin)
  return securityHeaders({
    // Development drops HSTS and adds Vite's 'unsafe-eval' and ws:/wss: for HMR.
    dev,
    reportOnly: true,
    csp: {
      // The `app` preset already covers the rest of Fitt: vinext's inline
      // scripts and React's inline styles, Three.js canvases and textures
      // ('self' scripts, data:/blob: images), the service worker
      // (worker-src 'self') and the manifest.
      add: {
        // The realtime socket (src/lib/cloud/manager.ts) connects to this
        // origin over ws:/wss:, which older browsers do not match with 'self'.
        'connect-src': [`${protocol === 'https:' ? 'wss' : 'ws'}://${host}`],
        // Vite inlines the smallest @fontsource subset (Manrope cyrillic-ext)
        // into the CSS as a data: URL.
        'font-src': ['data:'],
      },
      reportUri: CSP_REPORT_PATH,
    },
  })
}

let cached: { key: string; headers: Record<string, string> } | undefined

/** Return `response` with Fitt's security headers for the origin `request` was sent to. */
export function applySecurityHeaders(request: Request, response: Response, { dev = false } = {}) {
  const origin = new URL(request.url).origin
  const key = `${dev}:${origin}`
  if (cached?.key !== key) cached = { key, headers: buildSecurityHeaders(origin, { dev }) }
  // WebSocket upgrades (101) are returned unchanged by withHeaders.
  return withHeaders(response, cached.headers)
}
