import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  dispose: vi.fn(async () => {}),
  create: vi.fn(),
  session: vi.fn(),
  execution: undefined as undefined | ((task: Promise<unknown>) => void),
}))
vi.mock('./db', () => ({ createRequestDb: state.create }))
vi.mock('./auth', () => ({
  buildRequestAuth: () => ({ auth: { api: { getSession: state.session } } }),
}))
vi.mock('./env', () => ({
  getServerContext: () => ({ env: { DATABASE_URL: 'not-printed' }, waitUntil: state.execution }),
  authIsConfigured: () => true,
  trustedOrigins: () => ['https://fitt.example'],
}))

import { withAuthenticatedRequest } from './request'

describe('authenticated request lifetime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.execution = undefined
    state.create.mockResolvedValue({ db: {}, dispose: state.dispose })
    state.session.mockResolvedValue({
      user: { id: 'server-user', name: 'Athlete', email: 'athlete@example.test' },
    })
  })

  it('rejects an untrusted write before opening a pool', async () => {
    const handler = vi.fn()
    const response = await withAuthenticatedRequest(
      new Request('https://fitt.example/api/training', {
        method: 'PUT',
        headers: { origin: 'https://attacker.example' },
      }),
      handler,
    )
    expect(response.status).toBe(403)
    expect(state.create).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses only the authenticated user and closes unauthorized requests', async () => {
    state.session.mockResolvedValue(null)
    const handler = vi.fn()
    const response = await withAuthenticatedRequest(
      new Request('https://fitt.example/api/training?userId=other'),
      handler,
    )
    expect(response.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(state.dispose).toHaveBeenCalledOnce()
  })

  it('awaits Node background work before disposing its pool', async () => {
    let release!: () => void
    const work = new Promise<void>((resolve) => {
      release = resolve
    })
    const response = withAuthenticatedRequest(
      new Request('https://fitt.example/api/training'),
      async ({ waitUntil, user }) => {
        expect(user.id).toBe('server-user')
        waitUntil!(work)
        return Response.json({ ok: true })
      },
    )
    await vi.waitFor(() => expect(state.session).toHaveBeenCalledOnce())
    expect(state.dispose).not.toHaveBeenCalled()
    release()
    expect((await response).status).toBe(200)
    expect(state.dispose).toHaveBeenCalledOnce()
  })

  it('registers combined Worker background cleanup without closing a live pool', async () => {
    const pending: Promise<unknown>[] = []
    state.execution = (task) => {
      pending.push(task)
    }
    let release!: () => void
    const work = new Promise<void>((resolve) => {
      release = resolve
    })
    const response = await withAuthenticatedRequest(
      new Request('https://fitt.example/api/training'),
      async ({ waitUntil }) => {
        waitUntil!(work)
        return Response.json({ ok: true })
      },
    )
    expect(response.status).toBe(200)
    expect(pending).toHaveLength(1)
    expect(state.dispose).not.toHaveBeenCalled()
    release()
    await Promise.all(pending)
    expect(state.dispose).toHaveBeenCalledOnce()
  })

  it('redacts unexpected errors and still releases resources', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await withAuthenticatedRequest(
      new Request('https://fitt.example/api/training'),
      async () => {
        throw new Error('private connection details must not escape')
      },
    )
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private connection')
    expect(output.mock.calls.flat().join(' ')).not.toContain('private connection')
    expect(state.dispose).toHaveBeenCalledOnce()
    output.mockRestore()
  })
})
