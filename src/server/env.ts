import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { SendEmail } from './email'
export { isWorkerRuntime } from './runtime'

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
  /** Request-local adapter supplied by worker.ts; not a configured secret. */
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
  if (typeof worker.__FITT_SEND_EMAIL === 'function') {
    output.__FITT_SEND_EMAIL = worker.__FITT_SEND_EMAIL as SendEmail
  }
  return output
}

export function getServerContext(): { env: FittEnv; waitUntil?: WaitUntil } {
  let worker: Record<string, unknown> = {}
  let waitUntil: WaitUntil | undefined
  try {
    const context = getCloudflareContext()
    worker = context.env as unknown as Record<string, unknown>
    waitUntil = context.ctx.waitUntil.bind(context.ctx)
  } catch {
    // Ordinary Next development has no Worker execution context.
  }
  return {
    env: resolveServerEnv(worker, process.env, process.env.NODE_ENV === 'development'),
    waitUntil,
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
