import { beforeEach, describe, expect, it, vi } from 'vitest'
import { privateResponse } from './request-policy'

const state = vi.hoisted(() => ({
  env: { FITT_ADMIN_EMAILS: 'owner@example.test' },
  configured: true,
  session: vi.fn(),
  services: vi.fn(),
}))
vi.mock('./env', () => ({
  authIsConfigured: () => state.configured,
  getServerContext: () => ({ env: state.env }),
}))
vi.mock('./request', () => ({
  withRequestServices: async (
    _request: Request,
    handler: (context: unknown) => Promise<Response>,
  ) => {
    state.services()
    return privateResponse(
      await handler({
        env: state.env,
        auth: { auth: { api: { getSession: state.session } } },
      }),
    )
  },
}))

import { isAdminIdentity, withAdminRequest } from './admin'
import { isAdminPagePath, serveAdminPage } from './admin-page'
import { GET as access } from '../app/api/admin/access/route'

const identity = { id: 'verified-owner', email: 'owner@example.test', emailVerified: true }
const request = (headers: HeadersInit = {}) =>
  new Request('https://fitt.example/admin', {
    headers: { Cookie: 'better-auth.session_token=fixture', ...headers },
  })

describe('private admin studio authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.env.FITT_ADMIN_EMAILS = 'owner@example.test'
    state.configured = true
    state.session.mockResolvedValue({ user: identity })
  })

  it('protects encoded and slash-normalized aliases of Admin routes', () => {
    for (const path of [
      '/admin',
      '/admin/components',
      '/%61dmin',
      '/%61dmin/components',
      '//admin',
      '/public/../admin',
      '/./admin/',
    ])
      expect(isAdminPagePath(path), path).toBe(true)
    for (const path of [
      '/settings',
      '/api/admin/access',
      '/adminish',
      '/%2Fadmin',
      '/%ZZ',
      '/admin/../settings',
    ])
      expect(isAdminPagePath(path), path).toBe(false)
  })

  it('requires an exact verified email match and fails closed without configuration', () => {
    expect(isAdminIdentity(identity, '  OWNER@example.test, second@example.test ')).toBe(true)
    expect(isAdminIdentity(identity, '')).toBe(false)
    expect(isAdminIdentity(identity, undefined)).toBe(false)
    expect(isAdminIdentity(null, 'owner@example.test')).toBe(false)
    expect(isAdminIdentity({ ...identity, emailVerified: false }, 'owner@example.test')).toBe(false)
    expect(
      isAdminIdentity({ ...identity, email: 'owner+other@example.test' }, 'owner@example.test'),
    ).toBe(false)
    expect(isAdminIdentity(identity, 'someone-owner@example.test')).toBe(false)
  })

  it('redirects guests before opening services or rendering the studio', async () => {
    const load = vi.fn(async () => new Response('private studio'))
    const response = await serveAdminPage(new Request('https://fitt.example/admin'), load)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://fitt.example/settings?admin=restricted')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(load).not.toHaveBeenCalled()
    expect(state.services).not.toHaveBeenCalled()
  })

  it('does not advertise an admin role for guests or an unconfigured service', async () => {
    expect(
      await (await access(new Request('https://fitt.example/api/admin/access'))).json(),
    ).toEqual({ allowed: false })
    state.configured = false
    expect(await (await access(request())).json()).toEqual({ allowed: false })
    expect(state.services).not.toHaveBeenCalled()
  })

  it('ignores forged identity headers and refuses a signed-out session', async () => {
    state.session.mockResolvedValue(null)
    const handler = vi.fn(() => Response.json({ secret: 'not visible' }))
    const response = await withAdminRequest(
      request({ 'X-Fitt-Account': identity.id, 'X-Admin': 'true' }),
      handler,
    )
    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(state.session).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    )
  })

  it.each([
    { ...identity, emailVerified: false },
    { ...identity, email: 'another@example.test' },
  ])('prevents direct studio access by an unverified or non-admin user', async (user) => {
    state.session.mockResolvedValue({ user })
    const load = vi.fn(async () => new Response('private studio'))
    const response = await serveAdminPage(request(), load)
    expect(response.status).toBe(303)
    expect(load).not.toHaveBeenCalled()
    expect(await (await access(request())).json()).toEqual({ allowed: false })
  })

  it('rejects requests left over from a different signed-in account', async () => {
    const load = vi.fn(async () => new Response('private studio'))
    const response = await serveAdminPage(request({ 'X-Fitt-Account': 'previous-account' }), load)
    expect(response.status).toBe(303)
    expect(load).not.toHaveBeenCalled()
  })

  it.each<HeadersInit>([{}, { RSC: '1', Accept: 'text/x-component' }])(
    'serves authorized document and RSC requests with private, uncached responses',
    async (headers) => {
      const render = vi.fn(async () => new Response('Native studio'))
      const response = await serveAdminPage(request(headers), render)
      expect(response.status).toBe(200)
      expect(render).toHaveBeenCalledOnce()
      expect(response.headers.get('cache-control')).toContain('private, no-store')
      expect(response.headers.get('vary')).toContain('Cookie')
      expect(await response.text()).toBe('Native studio')
      const metadata = await access(request())
      expect(await metadata.json()).toEqual({ allowed: true, userId: identity.id })
      expect(metadata.headers.get('cache-control')).toContain('no-store')
    },
  )

  it('rechecks the live session for an RSC request and redirects an expired session', async () => {
    state.session.mockResolvedValue(null)
    const render = vi.fn(async () => new Response('Private studio'))
    const response = await serveAdminPage(request({ RSC: '1' }), render)
    expect(response.status).toBe(303)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(render).not.toHaveBeenCalled()
  })
})
