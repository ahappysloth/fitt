import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type WorkerEvent = {
  request?: Request
  data?: { type: string }
  waitUntil(promise: Promise<unknown>): void
  respondWith(promise: Promise<Response>): void
}

function workerFixture({ incompleteInstall = false } = {}) {
  const origin = 'https://fitt.example'
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const stores = new Map<string, Map<string, Response>>()
  let offline = false
  let document = 'original complete shell'
  const keyFor = (request: Request | string) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href
  const fetch = vi.fn(async () => {
    if (offline) throw new TypeError('Network unavailable')
    return new Response(document, { headers: { 'Content-Type': 'text/html' } })
  })
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map())
      const entries = stores.get(name)!
      return {
        async addAll(requests: Request[]) {
          for (const request of requests) entries.set(keyFor(request), await fetch())
          if (incompleteInstall) throw new Error('A required client chunk could not be cached')
        },
        async match(request: Request | string) {
          return entries.get(keyFor(request))?.clone()
        },
        async put(request: Request | string, response: Response) {
          entries.set(keyFor(request), response.clone())
        },
      }
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name: string) {
      return stores.delete(name)
    },
  }
  const skipWaiting = vi.fn()
  const claim = vi.fn()
  const source = readFileSync('scripts/service-worker-template.js', 'utf8')
    .replace('__BUILD_VERSION__', 'current')
    .replace('__PRECACHE_URLS__', JSON.stringify(['/', '/_next/static/app.js', '/icon.svg']))
  vm.runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) =>
        listeners.set(name, handler),
      clients: { claim },
      skipWaiting,
    },
    caches,
    fetch,
    URL,
    Response,
    Request: class extends Request {
      constructor(input: string | Request, options?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, origin) : input, options)
      }
    },
  })
  function dispatch(name: string, details: Partial<WorkerEvent> = {}) {
    let pending: Promise<unknown> | undefined
    listeners.get(name)!({
      waitUntil: (promise) => (pending = promise),
      respondWith: (promise) => (pending = promise),
      ...details,
    })
    return pending
  }
  const navigate = () => {
    const request = new Request(origin + '/')
    Object.defineProperty(request, 'mode', { value: 'navigate' })
    return dispatch('fetch', { request }) as Promise<Response>
  }
  return {
    caches,
    dispatch,
    navigate,
    skipWaiting,
    claim,
    goOffline: () => (offline = true),
    serveNewBuild: () => (document = 'new online shell'),
  }
}

describe('offline app shell', () => {
  it('keeps offline HTML paired with its fully cached build after a new deployment', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    worker.serveNewBuild()
    expect(await (await worker.navigate()).text()).toBe('new online shell')
    worker.goOffline()
    expect(await (await worker.navigate()).text()).toBe('original complete shell')
  })

  it('does not leave a partly cached build after an interrupted installation', async () => {
    const worker = workerFixture({ incompleteInstall: true })
    await expect(worker.dispatch('install')).rejects.toThrow('required client chunk')
    expect(await worker.caches.keys()).toEqual([])
  })

  it('never intercepts API, RSC, mutation, or external requests', () => {
    const worker = workerFixture()
    const requests = [
      new Request('https://fitt.example/api/workouts'),
      new Request('https://fitt.example/api/auth/session'),
      new Request('https://fitt.example/', { headers: { RSC: '1' } }),
      new Request('https://fitt.example/', { method: 'POST' }),
      new Request('https://other.example/_next/static/app.js'),
    ]
    for (const request of requests) expect(worker.dispatch('fetch', { request })).toBeUndefined()
  })

  it('retains one previous build for open tabs and leaves unrelated caches alone', async () => {
    const worker = workerFixture()
    await worker.caches.open('another-app')
    await worker.caches.open('fitt-shell-older')
    await worker.caches.open('fitt-shell-previous')
    await worker.dispatch('install')
    await worker.dispatch('activate')
    expect(await worker.caches.keys()).toEqual([
      'another-app',
      'fitt-shell-previous',
      'fitt-shell-current',
    ])
    expect(worker.claim).toHaveBeenCalledOnce()
  })

  it('waits for an explicit update action before replacing an active worker', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    expect(worker.skipWaiting).not.toHaveBeenCalled()
    worker.dispatch('message', { data: { type: 'SKIP_WAITING' } })
    expect(worker.skipWaiting).toHaveBeenCalledOnce()
  })
})
