import { describe, expect, it } from 'vitest'
import { parseCspReports, receiveCspReport, redactReportUrl } from './csp-report'

const legacyReport = {
  'csp-report': {
    'document-uri': 'https://fitt.example/api/auth/magic-link/verify?token=secret#frag',
    referrer: 'https://mail.example/?inbox=athlete@example.test',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'original-policy': "default-src 'self'",
    disposition: 'report',
    'blocked-uri': 'https://cdn.example/lib.js?key=abc',
    'line-number': 12,
    'column-number': 4,
    'source-file': 'https://fitt.example/_next/static/chunks/a.js?v=1',
    'status-code': 200,
  },
}

function post(body: string, type = 'application/csp-report', headers: Record<string, string> = {}) {
  return new Request('https://fitt.example/api/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': type, ...headers },
    body,
  })
}

async function receive(request: Request) {
  const lines: string[] = []
  const response = await receiveCspReport(request, (line) => lines.push(line))
  return { response, logged: lines.map((line) => JSON.parse(line)) }
}

describe('CSP report collector', () => {
  it('logs a report-uri violation without query strings, fragments or referrers', async () => {
    const { response, logged } = await receive(post(JSON.stringify(legacyReport)))
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(logged).toEqual([
      {
        event: 'csp-report',
        disposition: 'report',
        directive: 'script-src-elem',
        blocked: 'https://cdn.example/lib.js',
        document: 'https://fitt.example/api/auth/magic-link/verify',
        source: 'https://fitt.example/_next/static/chunks/a.js',
        line: 12,
        column: 4,
      },
    ])
    const serialized = JSON.stringify(logged)
    for (const secret of ['secret', 'frag', 'athlete@example.test', 'key=abc', 'v=1'])
      expect(serialized).not.toContain(secret)
  })

  it('reads Reporting API batches and caps how many one request can log', async () => {
    const batch = Array.from({ length: 25 }, () => ({
      type: 'csp-violation',
      url: 'https://fitt.example/workout',
      body: {
        documentURL: 'https://fitt.example/workout?x=1',
        effectiveDirective: 'connect-src',
        blockedURL: 'wss://other.example/socket',
        disposition: 'report',
      },
    }))
    batch.push({ type: 'deprecation', url: '', body: {} as never })
    const { response, logged } = await receive(
      post(JSON.stringify(batch), 'application/reports+json'),
    )
    expect(response.status).toBe(204)
    expect(logged).toHaveLength(10)
    expect(logged[0]).toMatchObject({
      directive: 'connect-src',
      blocked: 'wss://other.example/socket',
      document: 'https://fitt.example/workout',
    })
  })

  it('refuses anything that is not a bounded JSON report POST, logging nothing', async () => {
    const cases: [Request, number][] = [
      [new Request('https://fitt.example/api/csp-report'), 405],
      [post(JSON.stringify(legacyReport), 'text/plain'), 415],
      [post(JSON.stringify(legacyReport), 'application/x-www-form-urlencoded'), 415],
      [post('x'.repeat(16 * 1024 + 1)), 413],
      [post('{}', 'application/csp-report', { 'Content-Length': String(1024 * 1024) }), 413],
      [post('not json'), 400],
    ]
    for (const [request, status] of cases) {
      const { response, logged } = await receive(request)
      expect(response.status, `${request.method} ${request.headers.get('content-type')}`).toBe(
        status,
      )
      expect(logged).toEqual([])
    }
  })

  it('reduces non-web URLs to their scheme and drops free text', () => {
    expect(redactReportUrl('inline')).toBe('inline')
    expect(redactReportUrl('eval')).toBe('eval')
    expect(redactReportUrl('data:image/png;base64,AAAA')).toBe('data:')
    expect(redactReportUrl('blob:https://fitt.example/1234')).toBe('blob:')
    expect(redactReportUrl('https://user:pass@fitt.example/a?b')).toBe('https://fitt.example/a')
    expect(redactReportUrl('<script>alert(1)</script>')).toBe('[other]')
    expect(redactReportUrl(42)).toBe('')
    expect(parseCspReports({ unrelated: true })).toEqual([])
    expect(
      parseCspReports({
        'csp-report': { 'effective-directive': 'script-src\nforged log line', disposition: 'x y' },
      }),
    ).toMatchObject([{ directive: '[other]', disposition: '[other]' }])
  })
})
