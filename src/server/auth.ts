import { createAuth, type CreateAuthConfig, type SharedRateLimiterLike } from '@turnal-io/auth'
import { createDurableObjectRateLimiter, type RateLimitNamespaceLike } from '@turnal-io/ratelimit'
import { APIError } from 'better-auth/api'
import { privateRateLimitKey } from './auth-rate-limit'
import type { ServerDb } from './db'
import { trustedOrigins, type FittEnv, type WaitUntil } from './env'
import { createMailSender, magicLinkEmail, type SendEmail } from './email'

export async function discardProviderTokens<T extends Record<string, unknown>>(data: T) {
  // Fitt uses Google for identity only; it never needs ongoing Google API access.
  return { data: { ...data, accessToken: null, refreshToken: null, idToken: null } }
}

/**
 * Better Auth's limiter, backed by the shared RATE_LIMIT_DO. Better Auth keys
 * buckets `<client ip>|<path>`; the key is HMAC'd before it reaches the Durable
 * Object so, as with Fitt's own Postgres limiter, no IP address is stored.
 * A failing or slow DO is handled by @turnal-io/auth (pre-auth routes refused).
 */
export function sharedAuthRateLimiter(
  namespace: RateLimitNamespaceLike,
  secret: string,
): SharedRateLimiterLike {
  const limiter = createDurableObjectRateLimiter(namespace)
  return {
    async take(key, rule) {
      return limiter.take(await privateRateLimitKey(secret, `better-auth:${key}`), rule)
    },
  }
}

const notEnabled = () => {
  throw new Error('Password authentication is not enabled')
}

/**
 * The complete createAuth configuration. Shared with the CI check in
 * auth-config.test.ts (assertAuthConfig), so a configuration that would throw
 * on every production request fails the test suite instead.
 */
export function fittAuthConfig(
  db: ServerDb,
  env: FittEnv,
  options: { waitUntil?: WaitUntil; sendEmail: SendEmail },
): CreateAuthConfig {
  return {
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(env),
    productName: 'Fitt',
    ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
    // Required off localhost; createAuth throws without it, so a missing
    // binding fails loudly. Local Node tooling uses Better Auth's own limiter.
    ...(env.RATE_LIMIT_DO
      ? { rateLimiter: sharedAuthRateLimiter(env.RATE_LIMIT_DO, env.BETTER_AUTH_SECRET) }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    // Anyone with an inbox can create a Fitt account by email, as before.
    magicLink: { enabled: true, allowSignUp: true },
    sendEmail: options.sendEmail,
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
    // Fitt policy: Better Auth writes nothing to the logs (the package's
    // redacting wrapper still sits underneath if this is ever turned on).
    logger: { disabled: true },
    onAPIError: {
      // Failed OAuth/magic-link callbacks return to the account controls.
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
  const deliveries: Promise<void>[] = []
  const built = createAuth(
    fittAuthConfig(db, env, {
      waitUntil,
      sendEmail: (options) => {
        const pending = sendEmail(options)
        deliveries.push(pending)
        void pending.catch(() => {})
        return pending
      },
    }),
  )
  return {
    ...built,
    async finishEmailDeliveries() {
      // Turnal dispatch catches/logs transport failures. Track the original
      // promises so our route can return a truthful failure to the browser.
      await Promise.resolve()
      await Promise.all(deliveries)
    },
  }
}
