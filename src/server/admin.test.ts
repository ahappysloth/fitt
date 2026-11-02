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
import { serveAdminPreview } from './admin-preview'
import { GET as access } from '../app/api/admin/access/route'

const identity = { id: 'verified-owner', email: 'owner@example.test', emailVerified: true }
const request = (headers: HeadersInit = {}) =>
  new Request('https://fitt.example/api/admin/previews/form', {
    headers: { Cookie: 'better-auth.session_token=fixture', ...headers },
  })

describe('private admin studio authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.env.FITT_ADMIN_EMAILS = 'owner@example.test'
    state.configured = true
    state.session.mockResolvedValue({ user: identity })
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

  it('rejects guests before opening services or loading the preview bundle', async () => {
    const load = vi.fn(() => 'private preview')
    const response = await serveAdminPreview(
      new Request('https://fitt.example/api/admin/previews/form'),
      'form',
      load,
    )
    expect(response.status).toBe(401)
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
  ])('prevents direct preview access by an unverified or non-admin user', async (user) => {
    state.session.mockResolvedValue({ user })
    const load = vi.fn(() => 'private preview')
    const response = await serveAdminPreview(request(), 'components', load)
    expect(response.status).toBe(403)
    expect(load).not.toHaveBeenCalled()
    expect(await (await access(request())).json()).toEqual({ allowed: false })
  })

  it('rejects requests left over from a different signed-in account', async () => {
    const load = vi.fn(() => 'private preview')
    const response = await serveAdminPreview(
      request({ 'X-Fitt-Account': 'previous-account' }),
      'form',
      load,
    )
    expect(response.status).toBe(403)
    expect(load).not.toHaveBeenCalled()
  })

  it('serves allowed previews uncached with both document and HTTP isolation', async () => {
    const load = vi.fn(
      () => '<!doctype html><html><head><title>Studio</title></head><body>Preview</body></html>',
    )
    const response = await serveAdminPreview(
      request({ 'X-Fitt-Account': identity.id }),
      'components',
      load,
    )
    expect(response.status).toBe(200)
    expect(load).toHaveBeenCalledExactlyOnceWith('components')
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self'; sandbox allow-scripts",
    )
    expect(response.headers.get('content-security-policy')).not.toContain('allow-same-origin')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    const html = await response.text()
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain('window.__FITT_ADMIN_PREVIEW__="components"')
    const metadata = await access(request())
    expect(await metadata.json()).toEqual({ allowed: true, userId: identity.id })
    expect(metadata.headers.get('cache-control')).toContain('no-store')
  })

  it('only exposes the two known studio documents', async () => {
    const load = vi.fn(() => 'private preview')
    const response = await serveAdminPreview(request(), '../../.env', load)
    expect(response.status).toBe(404)
    expect(load).not.toHaveBeenCalled()
  })
})
