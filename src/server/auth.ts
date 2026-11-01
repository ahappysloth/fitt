import { createAuth } from '@turnal-io/auth'
import { APIError } from 'better-auth/api'
import type { ServerDb } from './db'
import type { FittEnv, WaitUntil } from './env'
import { createMailSender, magicLinkEmail, type SendEmail } from './email'

export async function discardProviderTokens<T extends Record<string, unknown>>(data: T) {
  // Fitt uses Google for identity only; it never needs ongoing Google API access.
  return { data: { ...data, accessToken: null, refreshToken: null, idToken: null } }
}

export function buildRequestAuth(
  db: ServerDb,
  env: FittEnv,
  waitUntil?: WaitUntil,
  sendEmail: SendEmail = createMailSender(env),
) {
  const deliveries: Promise<void>[] = []
  const built = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      ...new Set(
        [env.BETTER_AUTH_URL, ...env.TRUSTED_ORIGINS.split(',')]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    productName: 'Fitt',
    ...(waitUntil ? { waitUntil } : {}),
    advanced: {
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
        }
      : {}),
    magicLink: { enabled: true },
    sendEmail: (options) => {
      const pending = sendEmail(options)
      deliveries.push(pending)
      void pending.catch(() => {})
      return pending
    },
    emailTemplates: {
      magicLink: magicLinkEmail,
      verification: () => {
        throw new Error('Password authentication is not enabled')
      },
      resetPassword: () => {
        throw new Error('Password authentication is not enabled')
      },
    },
    databaseHooks: {
      account: {
        create: { before: discardProviderTokens },
        update: { before: discardProviderTokens },
      },
    },
  })
  // The Turnal factory does not yet forward these Better Auth options. Its
  // returned public options object is shared with the lazy context/router.
  // Install error handling synchronously before any auth request: Drizzle
  // errors can contain SQL parameters, including one-time verification tokens.
  built.auth.options.logger = { disabled: true }
  built.auth.options.onAPIError = {
    errorURL: new URL('/?account=return', env.BETTER_AUTH_URL).toString(),
    onError(error) {
      if (error instanceof APIError) throw error
      console.error('[Fitt] Authentication action could not complete')
      throw new APIError('INTERNAL_SERVER_ERROR', {
        message: 'Account action could not be completed.',
      })
    },
  }
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
