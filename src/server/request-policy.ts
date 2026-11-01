import { trustedOrigins, type FittEnv } from './env'

export function isTrustedRequestOrigin(request: Request, env: FittEnv) {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return false
  return trustedOrigins(env).includes(origin)
}

export function isMutation(request: Request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())
}

export function privateResponse(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  headers.set('Pragma', 'no-cache')
  headers.set('Vary', [headers.get('Vary'), 'Cookie'].filter(Boolean).join(', '))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function errorResponse(error: string, status: number) {
  return privateResponse(Response.json({ error }, { status }))
}

export class RequestBodyTimeout extends Error {
  constructor() {
    super('The account request timed out. Please try again.')
  }
}

export async function boundedRequest(request: Request, maxBytes: number, timeoutMs = 10_000) {
  const statedLength = request.headers.get('content-length')
  if (statedLength && (!/^\d+$/.test(statedLength) || Number(statedLength) > maxBytes)) return null
  if (!request.body) return request
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestBodyTimeout()), timeoutMs)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        return null
      }
      chunks.push(value)
    }
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request.url, { method: request.method, headers: request.headers, body })
}
