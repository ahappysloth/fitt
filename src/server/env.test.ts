import { afterEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  worker: false,
  context:
    vi.fn<() => { env: Record<string, unknown>; waitUntil: (task: Promise<unknown>) => void }>(),
}))

vi.mock('./runtime', () => ({ isWorkerRuntime: () => runtime.worker }))
vi.mock('./worker-context', () => ({ getWorkerContext: runtime.context }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
  runtime.worker = false
})

describe('server runtime context', () => {
  it('uses the Node environment without evaluating Workers-only bindings', async () => {
    vi.stubEnv('DATABASE_URL', 'local-fixture-db')
    const { getServerContext } = await import('./env')
    const context = getServerContext()
    expect(context.env.DATABASE_URL).toBe('local-fixture-db')
    expect(context.waitUntil).toBeUndefined()
    expect(runtime.context).not.toHaveBeenCalled()
  })

  it('reads current Worker bindings and keeps cleanup attached to that request', async () => {
    runtime.worker = true
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'local-fixture-db')
    const firstWait = vi.fn()
    const secondWait = vi.fn()
    const firstSender = vi.fn(async () => {})
    const secondSender = vi.fn(async () => {})
    runtime.context
      .mockReturnValueOnce({
        env: { DATABASE_URL: 'first-request-db', __FITT_SEND_EMAIL: firstSender },
        waitUntil: firstWait,
      })
      .mockReturnValueOnce({
        env: { DATABASE_URL: 'second-request-db', __FITT_SEND_EMAIL: secondSender },
        waitUntil: secondWait,
      })
    const { getServerContext } = await import('./env')
    const first = getServerContext()
    const second = getServerContext()
    expect(first.env.DATABASE_URL).toBe('first-request-db')
    expect(second.env.DATABASE_URL).toBe('second-request-db')
    expect(first.env.__FITT_SEND_EMAIL).toBe(firstSender)
    expect(second.env.__FITT_SEND_EMAIL).toBe(secondSender)
    const cleanup = Promise.resolve()
    first.waitUntil!(cleanup)
    expect(firstWait).toHaveBeenCalledWith(cleanup)
    expect(secondWait).not.toHaveBeenCalled()
    second.waitUntil!(cleanup)
    expect(secondWait).toHaveBeenCalledWith(cleanup)
  })
})
