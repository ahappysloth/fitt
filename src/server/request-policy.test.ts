import { describe, expect, it } from 'vitest'
import type { FittEnv } from './env'
import { authIsConfigured, resolveServerEnv, validOrigin } from './env'
import { boundedRequest, isTrustedRequestOrigin, privateResponse } from './request-policy'

const env = {
  DATABASE_URL: 'postgresql://fixture:fixture@ep-fixture-pooler.example.neon.tech/test',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'https://fitt.example',
  TRUSTED_ORIGINS: 'https://preview.fitt.example',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  EMAIL_FROM: '',
} satisfies FittEnv

describe('account request boundaries', () => {
  it('trusts only exact configured origins, never a submitted host or lookalike', () => {
    const request = (origin?: string) =>
      new Request('https://attacker.example/api/training', {
        method: 'PUT',
        headers: origin ? { origin } : {},
      })
    expect(isTrustedRequestOrigin(request('https://fitt.example'), env)).toBe(true)
    expect(isTrustedRequestOrigin(request('https://preview.fitt.example'), env)).toBe(true)
    for (const origin of [
      undefined,
      'null',
      'https://fitt.example.attacker.test',
      'https://attacker.example',
      'https://fitt.example/path',
    ]) {
      expect(isTrustedRequestOrigin(request(origin), env)).toBe(false)
    }
  })

  it('rejects insecure public origins, paths, embedded credentials, and missing signing secrets', () => {
    for (const origin of [
      'http://public.example',
      'https://fitt.example/path',
      'https://name:pass@fitt.example',
      'not-a-url',
    ]) {
      expect(validOrigin(origin)).toBe(false)
    }
    expect(validOrigin('http://localhost:5173')).toBe(true)
    expect(authIsConfigured({ ...env, BETTER_AUTH_SECRET: '' })).toBe(false)
    expect(authIsConfigured(env)).toBe(true)
  })

  it('resolves Node development and Worker production bindings independently', () => {
    const worker = { BETTER_AUTH_URL: 'https://worker.example', DATABASE_URL: 'worker-db' }
    const local = { BETTER_AUTH_URL: 'http://localhost:5173', DATABASE_URL: 'local-db' }
    expect(resolveServerEnv(worker, local, true).DATABASE_URL).toBe('local-db')
    expect(resolveServerEnv(worker, local, false).DATABASE_URL).toBe('worker-db')
    expect(resolveServerEnv({}, local, false).DATABASE_URL).toBe('local-db')
    const sender = async () => {}
    expect(resolveServerEnv({ __FITT_SEND_EMAIL: sender }, local, false).__FITT_SEND_EMAIL).toBe(
      sender,
    )
    expect(
      resolveServerEnv({ __FITT_SEND_EMAIL: 'not-an-adapter' }, local, false).__FITT_SEND_EMAIL,
    ).toBeUndefined()
  })

  it('bounds streamed body bytes even when Content-Length is missing or deceptive', async () => {
    const oversized = new Request('https://fitt.example/api/auth/sign-out', {
      method: 'POST',
      body: '123456',
      headers: { 'content-length': '1' },
    })
    expect(await boundedRequest(oversized, 5)).toBeNull()
    const exact = new Request('https://fitt.example/api/auth/sign-out', {
      method: 'POST',
      body: '12345',
    })
    expect(await (await boundedRequest(exact, 5))!.text()).toBe('12345')
  })

  it('prevents caching while preserving distinct authentication cookies', () => {
    const response = new Response(null)
    response.headers.append('Set-Cookie', 'one=1; HttpOnly')
    response.headers.append('Set-Cookie', 'two=2; HttpOnly')
    const privateResult = privateResponse(response)
    expect(privateResult.headers.get('cache-control')).toContain('no-store')
    expect(privateResult.headers.get('vary')).toContain('Cookie')
    expect(privateResult.headers.getSetCookie()).toHaveLength(2)
  })

  it('cancels a body that stalls without waiting indefinitely for more bytes', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new Request('https://fitt.example/api/auth/sign-out', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    await expect(boundedRequest(request, 100, 5)).rejects.toThrow('timed out')
    expect(cancelled).toBe(true)
  })
})
