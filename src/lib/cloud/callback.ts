/** URL parameters are navigation hints, never proof of an authenticated session. */
export interface AuthCallback {
  error: string | null
  cleanedUrl: string
}

const genericFailure =
  'Sign-in could not finish. Please try Google again or request a new email link.'
const restartGoogle =
  'This Google sign-in attempt expired or could not be verified. Please try again.'
const errorMessages = new Map<string, string>([
  [
    'INVALID_TOKEN',
    'This sign-in link expired, was already used, or is invalid. Request a new email link below.',
  ],
  ['access_denied', 'Google sign-in was cancelled. Try again whenever you’re ready.'],
  ['state_mismatch', restartGoogle],
  ['state_not_found', restartGoogle],
  ['state_invalid', restartGoogle],
  ['invalid_callback_request', restartGoogle],
  ['invalid_code', restartGoogle],
  ['no_code', restartGoogle],
  ['oauth_provider_not_found', genericFailure],
  ['unable_to_get_user_info', genericFailure],
  [
    'email_not_found',
    'Google did not provide a verified email address. Try signing in with an email link instead.',
  ],
  ['failed_to_create_user', genericFailure],
  ['new_user_signup_disabled', 'New accounts are not available right now. Please try again later.'],
  ['failed_to_create_session', genericFailure],
  ['internal_server_error', genericFailure],
])

/** Accept only known legacy errors or our explicit return marker; never reflect query text. */
export function parseAuthCallback(href: string): AuthCallback | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const marked = url.searchParams.get('account') === 'return'
  const error = url.searchParams.get('error')
  const knownMessage = error === null ? undefined : errorMessages.get(error)
  if (!marked && !knownMessage) return null
  const failed = url.searchParams.has('error') || url.searchParams.has('error_description')
  if (marked) url.searchParams.delete('account')
  for (const name of [
    'error',
    'error_description',
    'token',
    'code',
    'state',
    'access_token',
    'id_token',
    'refresh_token',
    'callbackURL',
    'newUserCallbackURL',
    'errorCallbackURL',
  ])
    url.searchParams.delete(name)
  return { error: failed ? (knownMessage ?? genericFailure) : null, cleanedUrl: url.href }
}

/** All three Better Auth outcomes return to the app's account controls. */
export function authCallbackURLs(origin: string) {
  const callbackURL = new URL('/settings?account=return', origin).href
  return { callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: callbackURL }
}
