import { createAuth, type CreateAuthConfig } from '@turnal-io/auth'
import { createDurableObjectRateLimiter } from '@turnal-io/ratelimit'
import { APIError } from 'better-auth/api'
import type { ServerDb } from './db'
import { trustedOrigins, type FittEnv, type WaitUntil } from './env'
import { createMailSender, magicLinkEmail, type SendEmail } from './email'

export async function discardProviderTokens<T extends Record<string, unknown>>(data: T) {
  // Fitt uses Google for identity only; it never needs ongoing Google API access.
  return { data: { ...data, accessToken: null, refreshToken: null, idToken: null } }
}

// @turnal-io/auth prefixes the lines it writes itself (limiter failure, missing
// client IP, failed email send, ignored trusted origin, ...); Better Auth's own
// lines carry no such prefix.
const PACKAGE_LINE = '[turnalbase/auth] '
// A driver error thrown inside an endpoint: Fitt's onError below already logs a
// constant line for it, and driver errors can carry SQL parameters that
// pattern-based redaction may miss.
const ENDPOINT_THREW = `${PACKAGE_LINE}Better Auth endpoint threw`

/**
 * Fitt's auth log sink. Better Auth's own lines (redacted by the package,
 * mostly request noise) stay out of the logs, as before. The package's own
 * lines are operational signals and are printed; the package has already
 * redacted them before they reach this sink.
 */
export function logAuthLine(level: string, message: unknown, ...args: unknown[]) {
  if (typeof message !== 'string' || !message.startsWith(PACKAGE_LINE)) return
  if (message.startsWith(ENDPOINT_THREW)) return
  ;(level === 'error' ? console.error : console.warn)(message, ...args)
}

const notEnabled = () => {
  throw new Error('Password authentication is not enabled')
}

/**
 * The complete createAuth configuration except the request's database.
 * Shared with the CI check in auth-config.test.ts (assertAuthConfig, which
 * needs no database), so a configuration that would throw on every production
 * request fails the test suite instead.
 */
export function fittAuthConfig(
  env: FittEnv,
  options: { waitUntil?: WaitUntil; sendEmail: SendEmail },
): Omit<CreateAuthConfig, 'db'> {
  return {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(env),
    productName: 'Fitt',
    ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
    // Required off localhost; createAuth throws without it, so a missing
    // binding fails loudly. Local Node tooling uses Better Auth's own limiter.
    // The package HMACs Better Auth's `<ip>|<path>` key (from `secret`) before
    // it reaches the limiter, which spreads buckets over 16 RateLimitDO
    // instances. Only pre-auth routes (sign-in, magic link, OAuth callback)
    // reach it; session reads and sign-out use a per-isolate bucket. Fitt has
    // no public auth route outside the package's pre-auth list.
    ...(env.RATE_LIMIT_DO
      ? { rateLimiter: createDurableObjectRateLimiter(env.RATE_LIMIT_DO) }
      : {}),
    // Trimmed: a secret stored with a trailing newline would otherwise fail construction.
    ...(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID.trim(),
            clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
          },
        }
      : {}),
    // Anyone with an inbox can create a Fitt account by email, as before.
    magicLink: { enabled: true, allowSignUp: true },
    sendEmail: options.sendEmail,
    // The magic-link send is awaited: a failed send answers 503
    // EMAIL_DELIVERY_FAILED, so the browser is told the email did not go out.
    emailDelivery: 'await',
    emailTemplates: {
      magicLink: magicLinkEmail,
      verification: notEnabled,
      resetPassword: notEnabled,
    },
    databaseHooks: {
      account: {
        create: { before: discardProviderTokens },
        update: { before: discardProviderTokens },
      },
    },
    // Better Auth's own lines are dropped; the package's own (already
    // redacted) operational lines are printed. See logAuthLine.
    logger: { level: 'warn', log: logAuthLine },
    onAPIError: {
      // Failed or rate-limited (error=rate_limited) OAuth/magic-link
      // navigations return to the account controls.
      errorURL: new URL('/?account=return', env.BETTER_AUTH_URL).toString(),
      onError(error) {
        if (error instanceof APIError) throw error
        // A constant line only: driver errors can carry SQL parameters.
        console.error('[Fitt] Authentication action could not complete')
        throw new APIError('INTERNAL_SERVER_ERROR', {
          message: 'Account action could not be completed.',
        })
      },
    },
  }
}

export function buildRequestAuth(
  db: ServerDb,
  env: FittEnv,
  waitUntil?: WaitUntil,
  sendEmail: SendEmail = createMailSender(env),
) {
  return createAuth({ ...fittAuthConfig(env, { waitUntil, sendEmail }), db })
}
