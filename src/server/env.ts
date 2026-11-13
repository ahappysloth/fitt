import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { RateLimitNamespaceLike } from '@turnal-io/ratelimit'
import type { SendEmail } from './email'
import { isWorkerRuntime } from './runtime'
export { isWorkerRuntime } from './runtime'

// Keep Workers-only builtins and SMTP transport out of Node test/development
// evaluation. The Worker module reads bindings when a request asks for them.
const getWorkerContext = isWorkerRuntime()
  ? (await import('./worker-context')).getWorkerContext
  : undefined

const keys = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'TRUSTED_ORIGINS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
] as const

export type FittEnv = Record<(typeof keys)[number], string> & {
  /** Comma-separated verified emails; absent means no administrator access. */
  FITT_ADMIN_EMAILS?: string
  WORKSPACE_DO?: DurableObjectNamespace
  /**
   * Shared bucket store for Better Auth's rate limiter (required off localhost).
   * Typed by the limiter's structural view of a namespace: its `AbortSignal`
   * is the DOM one, which workers-types' DurableObjectNamespace does not match.
   */
  RATE_LIMIT_DO?: RateLimitNamespaceLike
  /** Request-local adapter supplied by the Worker context; not a configured secret. */
  __FITT_SEND_EMAIL?: SendEmail
}
export type WaitUntil = (promise: Promise<unknown>) => void

export function resolveServerEnv(
  worker: Record<string, unknown>,
  local: Record<string, string | undefined>,
  development: boolean,
): FittEnv {
  const output = {} as FittEnv
  for (const key of keys) {
    const fromWorker = typeof worker[key] === 'string' ? worker[key] : undefined
    output[key] = String((development ? local[key] || fromWorker : fromWorker || local[key]) ?? '')
  }
  const adminFromWorker =
    typeof worker.FITT_ADMIN_EMAILS === 'string' ? worker.FITT_ADMIN_EMAILS : undefined
  output.FITT_ADMIN_EMAILS = String(
    (development
      ? local.FITT_ADMIN_EMAILS || adminFromWorker
      : adminFromWorker || local.FITT_ADMIN_EMAILS) ?? '',
  )
  if (worker.WORKSPACE_DO) output.WORKSPACE_DO = worker.WORKSPACE_DO as FittEnv['WORKSPACE_DO']
  if (worker.RATE_LIMIT_DO) output.RATE_LIMIT_DO = worker.RATE_LIMIT_DO as FittEnv['RATE_LIMIT_DO']
  if (typeof worker.__FITT_SEND_EMAIL === 'function') {
    output.__FITT_SEND_EMAIL = worker.__FITT_SEND_EMAIL as SendEmail
  }
  return output
}

export function getServerContext(): { env: FittEnv; waitUntil?: WaitUntil } {
  const context = getWorkerContext?.()
  return {
    env: resolveServerEnv(context?.env ?? {}, process.env, process.env.NODE_ENV === 'development'),
    waitUntil: context?.waitUntil,
  }
}

export function serverEnv() {
  return getServerContext().env
}

export function validOrigin(value: string) {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      // URL parsing accepts `*` in a host; a wildcard is never an exact origin.
      !url.hostname.includes('*') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  } catch {
    return false
  }
}

export function authIsConfigured(env: FittEnv) {
  return (
    !!env.DATABASE_URL && env.BETTER_AUTH_SECRET.length >= 32 && validOrigin(env.BETTER_AUTH_URL)
  )
}

/**
 * Canonical origins (`new URL(value).origin`) from BETTER_AUTH_URL and the
 * comma-separated TRUSTED_ORIGINS. Whitespace, a trailing slash, upper case or
 * a default port are normalised; anything that is not an exact http(s) origin
 * (plain http only on localhost) is dropped. Better Auth and the Fitt request
 * policy both use this list, and @turnal-io/auth refuses non-canonical entries.
 */
export function trustedOrigins(env: FittEnv) {
  return [
    ...new Set(
      [env.BETTER_AUTH_URL, ...env.TRUSTED_ORIGINS.split(',')]
        .map((value) => value.trim())
        .filter(validOrigin)
        .map((value) => new URL(value).origin),
    ),
  ]
}
