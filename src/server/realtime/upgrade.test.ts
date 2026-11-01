import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import { upgradeRealtime } from './upgrade'
import { notifyTrainingRevision } from './notify'
import {
  EXPIRY_HEADER,
  IDENTITY_HEADER,
  isRealtimeOriginAllowed,
  SOCKET_LIFETIME_MS,
} from './types'
import type { RealtimeEnv } from './types'

const canonical = 'https://fitt.example'
const context = { waitUntil: vi.fn() }
const request = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`${canonical}/api/realtime?userId=another-user`, {
    method,
    headers: { origin: canonical, upgrade: 'websocket', ...headers },
  })
function setup() {
  const fetch = vi.fn(async (_input: unknown) => new Response(null, { status: 204 }))
  const idFromName = vi.fn((name: string) => ({ name }))
  const namespace = {
    idFromName,
    get: vi.fn(() => ({ fetch })),
  } as unknown as DurableObjectNamespace
  const env: RealtimeEnv = {
    BETTER_AUTH_URL: canonical,
    TRUSTED_ORIGINS: 'https://preview.fitt.example',
    WORKSPACE_DO: namespace,
  }
  const resolve = vi.fn(async () => ({ userId: 'real-user', expiresAt: Date.now() + 3600_000 }))
  return { fetch, idFromName, env, resolve }
}

afterEach(() => vi.useRealTimers())

describe('realtime upgrade policy', () => {
  it('allows exact configured origins only, rejecting null, reflected hosts and suffix tricks', () => {
    const { env } = setup()
    expect(isRealtimeOriginAllowed(canonical, env)).toBe(true)
    expect(isRealtimeOriginAllowed('https://preview.fitt.example', env)).toBe(true)
    expect(
      isRealtimeOriginAllowed('http://public.fitt.example', {
        BETTER_AUTH_URL: 'http://public.fitt.example',
      }),
    ).toBe(false)
    for (const origin of [
      null,
      'null',
      'https://fitt.example.evil.test',
      'https://fitt.example/path',
      'https://attacker.test',
      'file://fitt.example',
    ]) {
      expect(isRealtimeOriginAllowed(origin, env)).toBe(false)
    }
  })

  it('rejects forbidden origins and non-upgrades before any session lookup', async () => {
    const { env, resolve } = setup()
    expect(
      (await upgradeRealtime(request({ origin: 'https://attacker.test' }), env, context, resolve))
        .status,
    ).toBe(403)
    expect((await upgradeRealtime(request({ upgrade: '' }), env, context, resolve)).status).toBe(
      426,
    )
    expect((await upgradeRealtime(request({}, 'POST'), env, context, resolve)).status).toBe(405)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('selects the authenticated account and overwrites every caller-supplied identity', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
    const { env, resolve, fetch, idFromName } = setup()
    const response = await upgradeRealtime(
      request({
        [IDENTITY_HEADER]: 'another-user',
        [EXPIRY_HEADER]: String(Number.MAX_SAFE_INTEGER),
        cookie: 'never-forward-this-cookie',
      }),
      env,
      context,
      resolve,
    )
    expect(response.status).toBe(204)
    expect(idFromName).toHaveBeenCalledWith('real-user')
    const sent = fetch.mock.calls[0][0] as unknown as Request
    expect(sent.url).toBe('https://realtime.internal/connect')
    expect(sent.headers.get(IDENTITY_HEADER)).toBe('real-user')
    expect(sent.headers.get(EXPIRY_HEADER)).toBe(String(Date.now() + SOCKET_LIFETIME_MS))
    expect(sent.headers.get('cookie')).toBeNull()
  })

  it('rejects expired sessions and lookup errors without allocating a room', async () => {
    const { env, idFromName } = setup()
    expect((await upgradeRealtime(request(), env, context, async () => null)).status).toBe(401)
    expect(
      (
        await upgradeRealtime(request(), env, context, async () => ({
          userId: 'real-user',
          expiresAt: Date.now() - 1,
        }))
      ).status,
    ).toBe(401)
    expect(
      (
        await upgradeRealtime(request(), env, context, async () => {
          throw new Error('database unavailable')
        })
      ).status,
    ).toBe(503)
    expect(idFromName).not.toHaveBeenCalled()
  })

  it('caps socket lifetime to the session expiry when it is sooner', async () => {
    const { env, fetch } = setup()
    const expiry = Date.now() + 10_000
    await upgradeRealtime(request(), env, context, async () => ({
      userId: 'real-user',
      expiresAt: expiry,
    }))
    const sent = fetch.mock.calls[0][0] as unknown as Request
    expect(sent.headers.get(EXPIRY_HEADER)).toBe(String(expiry))
  })
})

describe('server revision notifications', () => {
  it('uses only the authenticated user namespace and a revision-only internal body', async () => {
    const { env, fetch, idFromName } = setup()
    await notifyTrainingRevision(env, 'real-user', 7)
    expect(idFromName).toHaveBeenCalledWith('real-user')
    const sent = fetch.mock.calls[0][0] as unknown as Request
    expect(sent.url).toBe('https://realtime.internal/notify')
    expect(await sent.json()).toEqual({ userId: 'real-user', revision: 7 })
  })

  it('supports plain Next without a namespace and rejects invalid notifications when bound', async () => {
    await expect(notifyTrainingRevision({}, 'real-user', 1)).resolves.toBeUndefined()
    const { env, fetch } = setup()
    await expect(notifyTrainingRevision(env, 'real-user', -1)).rejects.toThrow()
    await expect(notifyTrainingRevision(env, '../../other-user', 2)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
