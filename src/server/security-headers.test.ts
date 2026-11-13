import { describe, expect, it } from 'vitest'
import { applySecurityHeaders, buildSecurityHeaders, CSP_REPORT_PATH } from './security-headers'

function directives(policy: string) {
  return new Map(
    policy.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ')
      return [name, sources] as const
    }),
  )
}

describe('security headers', () => {
  const headers = buildSecurityHeaders('https://fitt.example')

  it('enforces the non-CSP headers', () => {
    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    })
  })

  it('reports the CSP without enforcing it, to the report endpoint', () => {
    expect(headers['Content-Security-Policy']).toBeUndefined()
    const policy = directives(headers['Content-Security-Policy-Report-Only'])
    expect(policy.get('report-uri')).toEqual([CSP_REPORT_PATH])
    expect(policy.get('frame-ancestors')).toEqual(["'none'"])
    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'none'"])
    expect(policy.get('default-src')).toEqual(["'self'"])
  })

  it('allows every source Fitt loads and nothing broader', () => {
    const policy = directives(headers['Content-Security-Policy-Report-Only'])
    // vinext's inline bootstrap scripts; no eval in production.
    expect(policy.get('script-src')).toEqual(["'self'", "'unsafe-inline'"])
    // The realtime socket on this origin only, not every wss: host.
    expect(policy.get('connect-src')).toEqual(["'self'", 'wss://fitt.example'])
    expect(policy.get('worker-src')).toEqual(["'self'"])
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(policy.get('font-src')).toEqual(["'self'", 'data:'])
    expect(policy.get('form-action')).toEqual(["'self'"])
    const local = directives(
      buildSecurityHeaders('http://127.0.0.1:4173')['Content-Security-Policy-Report-Only'],
    )
    expect(local.get('connect-src')).toEqual(["'self'", 'ws://127.0.0.1:4173'])
  })

  it('drops HSTS in development only', () => {
    expect(buildSecurityHeaders('http://localhost:5173', { dev: true })).not.toHaveProperty(
      'Strict-Transport-Security',
    )
  })

  it('replaces any weaker value a route set and keeps the rest of the response', async () => {
    const response = applySecurityHeaders(
      new Request('https://fitt.example/api/training'),
      Response.json(
        { ok: true },
        {
          status: 401,
          headers: { 'X-Frame-Options': 'ALLOWALL', 'Cache-Control': 'private, no-store' },
        },
      ),
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-security-policy-report-only')).toContain(
      'wss://fitt.example',
    )
    expect(await response.json()).toEqual({ ok: true })
  })

  it('builds the realtime source from the origin each request was sent to', () => {
    const policy = (url: string) =>
      applySecurityHeaders(new Request(url), new Response('ok')).headers.get(
        'content-security-policy-report-only',
      )
    expect(policy('https://fitt.example/')).toContain('wss://fitt.example;')
    expect(policy('https://preview.fitt.example/')).toContain('wss://preview.fitt.example;')
    expect(policy('https://preview.fitt.example/')).not.toContain('wss://fitt.example;')
  })
})
