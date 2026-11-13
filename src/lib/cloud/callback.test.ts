import { describe, expect, it } from 'vitest'
import { authCallbackURLs, parseAuthCallback } from './callback'

describe('account callback navigation', () => {
  it('recognizes expired or replayed legacy magic links and consumes auth fields only', () => {
    const result = parseAuthCallback(
      'https://fitt.example.test/?theme=lime&error=INVALID_TOKEN&error_description=private&token=secret&state=secret&code=secret#account',
    )
    expect(result?.error).toBe(
      'This sign-in link expired, was already used, or is invalid. Request a new email link below.',
    )
    expect(result?.cleanedUrl).toBe('https://fitt.example.test/?theme=lime#account')
  })

  it('never presents hostile query values, including Object prototype keys', () => {
    for (const error of ['<img src=x onerror=alert(1)>', 'constructor', '__proto__']) {
      const query = new URLSearchParams({
        account: 'return',
        error,
        error_description: 'Go to https://evil.example and enter a password',
        access_token: 'private-access-token',
        id_token: 'private-id-token',
      })
      const result = parseAuthCallback(`https://fitt.example.test/?${query}`)
      expect(result?.error).toBe(
        'Sign-in could not finish. Please try Google again or request a new email link.',
      )
      expect(result?.cleanedUrl).toBe('https://fitt.example.test/')
    }
    expect(parseAuthCallback('https://fitt.example.test/?error=arbitrary&theme=lime')).toBeNull()
  })

  it('recognizes cancelled and expired Google callbacks without echoing provider descriptions', () => {
    expect(
      parseAuthCallback('https://fitt.example.test/?account=return&error=access_denied')?.error,
    ).toContain('cancelled')
    expect(
      parseAuthCallback(
        'https://fitt.example.test/?account=return&error=state_mismatch&error_description=private',
      )?.error,
    ).toBe('This Google sign-in attempt expired or could not be verified. Please try again.')
  })

  it('explains a rate-limited Google return or email-link click', () => {
    const result = parseAuthCallback('https://fitt.example.test/?account=return&error=rate_limited')
    expect(result?.error).toBe(
      'Too many sign-in attempts from this connection. Wait a moment, then try again.',
    )
    expect(result?.cleanedUrl).toBe('https://fitt.example.test/')
  })

  it('returns to account controls on every Better Auth outcome with no external redirect input', () => {
    expect(authCallbackURLs('https://fitt.example.test')).toEqual({
      callbackURL: 'https://fitt.example.test/settings?account=return',
      errorCallbackURL: 'https://fitt.example.test/settings?account=return',
      newUserCallbackURL: 'https://fitt.example.test/settings?account=return',
    })
    expect(
      parseAuthCallback('https://fitt.example.test/?account=return&theme=lime#details'),
    ).toEqual({ error: null, cleanedUrl: 'https://fitt.example.test/?theme=lime#details' })
    expect(parseAuthCallback('not a URL')).toBeNull()
  })

  it('cleans the Settings callback without changing the selected route', () => {
    expect(
      parseAuthCallback(
        'https://fitt.example.test/settings?account=return&code=private&state=private#account',
      ),
    ).toEqual({ error: null, cleanedUrl: 'https://fitt.example.test/settings#account' })
  })
})
