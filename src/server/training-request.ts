import { MAX_CLOUD_BODY_BYTES } from '../lib/cloud-contract'

export class TrainingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TrainingRequestError'
  }
}

/** Bind a queued device write to the account the device last verified. */
export function checkTrainingAccount(request: Request, userId: string): Response | null {
  const expected = request.headers.get('X-Fitt-Account')
  if (expected && expected !== userId) {
    return Response.json(
      { error: 'account_changed', message: 'Your account changed. Sign in again before syncing.' },
      { status: 403 },
    )
  }
  if (request.method !== 'GET' && !expected) {
    return Response.json(
      { error: 'account_required', message: 'Verify your account before syncing.' },
      { status: 400 },
    )
  }
  return null
}

/** Bound the actual stream, not just the caller-controlled Content-Length. */
export async function readTrainingJson(request: Request): Promise<unknown> {
  const tooLarge = () =>
    new TrainingRequestError(413, 'too_large', 'This backup exceeds the 10 MB sync limit.')
  const invalid = () =>
    new TrainingRequestError(400, 'invalid_json', 'This sync request is not valid JSON.')
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new TrainingRequestError(415, 'unsupported_type', 'Send training data as JSON.')
  }
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_CLOUD_BODY_BYTES) throw tooLarge()
  if (!request.body) throw invalid()

  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let bytes = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new TrainingRequestError(408, 'body_timeout', 'The upload timed out. Try syncing again.'),
        ),
      10_000,
    )
  })
  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeout])
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > MAX_CLOUD_BODY_BYTES) throw tooLarge()
      parts.push(result.value)
    }
    const joined = new Uint8Array(bytes)
    let offset = 0
    for (const part of parts) {
      joined.set(part, offset)
      offset += part.byteLength
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)) as unknown
    } catch {
      throw invalid()
    }
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
