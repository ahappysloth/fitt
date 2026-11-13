import { boundedRequest, RequestBodyTimeout } from './request-policy'

// Browsers POST one report (report-uri, `application/csp-report`) or a small
// batch (Reporting API, `application/reports+json`). Anything larger is not a
// genuine violation report.
const MAX_REPORT_BYTES = 16 * 1024
const MAX_REPORTS_PER_REQUEST = 10
const MAX_FIELD_LENGTH = 200
const REPORT_TYPES = new Set([
  'application/csp-report',
  'application/reports+json',
  'application/json',
])

export interface CspViolation {
  disposition: string
  directive: string
  blocked: string
  document: string
  source: string
  line: number | null
  column: number | null
}

const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

function text(value: unknown) {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : ''
}

/** A directive or disposition name; anything else is free text and is not logged. */
function keyword(value: unknown) {
  const raw = text(value)
  return /^[a-z][a-z-]{0,40}$/.test(raw) ? raw : raw ? '[other]' : ''
}

function position(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Reports carry the page's full URL, including any query string or fragment
 * (tokens, emails). Keep only the origin and path of http(s) and ws(s) URLs,
 * the scheme of other URLs (`data:`, `blob:`), and short CSP keywords
 * (`inline`, `eval`).
 */
export function redactReportUrl(value: unknown) {
  const raw = text(value)
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return /^[a-z][a-z-]{0,30}$/.test(raw) ? raw : '[other]'
  }
  return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
    ? `${url.origin}${url.pathname}`.slice(0, MAX_FIELD_LENGTH)
    : url.protocol
}

function violation(body: Record<string, unknown>, camel: boolean): CspViolation {
  const field = (kebab: string, camelName: string) => body[camel ? camelName : kebab]
  return {
    disposition: keyword(field('disposition', 'disposition')) || 'report',
    directive:
      keyword(field('effective-directive', 'effectiveDirective')) ||
      keyword(field('violated-directive', 'violatedDirective')),
    blocked: redactReportUrl(field('blocked-uri', 'blockedURL')),
    document: redactReportUrl(field('document-uri', 'documentURL')),
    source: redactReportUrl(field('source-file', 'sourceFile')),
    line: position(field('line-number', 'lineNumber')),
    column: position(field('column-number', 'columnNumber')),
  }
}

/** Read the violations from a report-uri body or a Reporting API batch. */
export function parseCspReports(payload: unknown): CspViolation[] {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  if (isRecord(payload) && isRecord(payload['csp-report'])) {
    return [violation(payload['csp-report'], false)]
  }
  if (!Array.isArray(payload)) return []
  return payload
    .filter(
      (report) => isRecord(report) && report.type === 'csp-violation' && isRecord(report.body),
    )
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map((report) => violation((report as { body: Record<string, unknown> }).body, true))
}

/**
 * Receives the report-only CSP's violation reports and writes each one to the
 * Worker log as a `csp-report` event (Workers Logs: filter on
 * `event = csp-report`, or `wrangler tail fitt --search csp-report`). Nothing
 * else is stored, and the reply never depends on the report's content.
 */
export async function receiveCspReport(
  request: Request,
  log: (line: string) => void = (line) => console.warn(line),
) {
  if (request.method !== 'POST') return reply(405, { Allow: 'POST' })
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!REPORT_TYPES.has(type)) return reply(415)
  let bounded: Request | null
  try {
    bounded = await boundedRequest(request, MAX_REPORT_BYTES, 5_000)
  } catch (error) {
    if (error instanceof RequestBodyTimeout) return reply(408)
    throw error
  }
  if (!bounded) return reply(413)
  let payload: unknown
  try {
    payload = await bounded.json()
  } catch {
    return reply(400)
  }
  for (const report of parseCspReports(payload)) {
    log(JSON.stringify({ event: 'csp-report', ...report }))
  }
  return reply(204)
}
