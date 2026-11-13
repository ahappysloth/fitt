import { describe, expect, it } from 'vitest'
import { serializeSignedCookie } from 'better-call'
import { verifiedSessionToken } from './session-cookie'

const secret = 'fitt-unit-test-signing-secret-not-a-real-credential'
const token = 'SufficientlyLongSessionToken_123456789'
const request = (cookie: string) =>
  new Request('https://fitt.example/api/realtime', {
    headers: { cookie },
  })
const signed = async (name = 'better-auth.session_token', value = token) =>
  (await serializeSignedCookie(name, value, secret)).split(';')[0]

describe('realtime session cookies', () => {
  it('verifies the actual better-call signed cookie format', async () => {
    const cookie = await signed()
    expect(await verifiedSessionToken(request(cookie), secret, 'http://localhost:5173')).toBe(token)
  })

  it('uses only the secure cookie name for an HTTPS auth origin', async () => {
    expect(
      await verifiedSessionToken(request(await signed()), secret, 'https://fitt.example'),
    ).toBeNull()
    const secure = await signed('__Secure-better-auth.session_token')
    expect(await verifiedSessionToken(request(secure), secret, 'https://fitt.example')).toBe(token)
  })

  it('rejects forged, unsigned, malformed and ambiguous cookie values', async () => {
    const valid = await signed()
    const forged = valid.replace(token, 'AttackerChosenSessionToken_123456789')
    for (const cookie of [
      forged,
      `better-auth.session_token=${token}`,
      'better-auth.session_token=%E0%A4%A',
      `${valid}; ${valid}`,
    ]) {
      expect(
        await verifiedSessionToken(request(cookie), secret, 'http://localhost:5173'),
      ).toBeNull()
    }
    expect(
      await verifiedSessionToken(
        request(valid),
        'different-signing-secret-at-least-thirty-two-characters',
        'http://localhost:5173',
      ),
    ).toBeNull()
  })

  it('accepts a cookie signed with the same secret, whatever the session state', async () => {
    // Signature only: the session lookup in resolveRealtimeSession decides.
    const cookie = await signed()
    expect(await verifiedSessionToken(request(cookie), secret, 'http://localhost:5173')).toBe(token)
    const shortToken = await signed('better-auth.session_token', 'short')
    expect(
      await verifiedSessionToken(request(shortToken), secret, 'http://localhost:5173'),
    ).toBeNull()
  })

  it('fails closed for missing configuration and unbounded cookie input', async () => {
    expect(
      await verifiedSessionToken(request(await signed()), '', 'https://fitt.example'),
    ).toBeNull()
    expect(await verifiedSessionToken(request(await signed()), secret, 'not-an-origin')).toBeNull()
    expect(
      await verifiedSessionToken(request('x'.repeat(16_385)), secret, 'https://fitt.example'),
    ).toBeNull()
  })
})
