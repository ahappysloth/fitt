import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import appRoutes from './app-routes.json'

const publicRoutes = [
  appRoutes.today,
  appRoutes.workout,
  appRoutes.journey,
  appRoutes.library,
  appRoutes.settings,
  appRoutes.builder,
]
import { describe, expect, it, vi } from 'vitest'
import { buildServiceWorker, prepareServiceWorker } from '../../scripts/build-service-worker.mjs'

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
  const fetch = vi.fn(async (_request?: Request) => {
    if (offline) throw new TypeError('Network unavailable')
    return new Response(document + ' ' + new URL(_request!.url).pathname, {
      headers: { 'Content-Type': 'text/html' },
    })
  })
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map())
      const entries = stores.get(name)!
      return {
        async addAll(requests: Request[]) {
          for (const request of requests) entries.set(keyFor(request), await fetch(request))
          if (incompleteInstall) throw new Error('A required client chunk could not be cached')
        },
        async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
          const key = keyFor(request)
          if (!options?.ignoreSearch) return entries.get(key)?.clone()
          const withoutSearch = (value: string) => {
            const url = new URL(value)
            url.search = ''
            return url.href
          }
          return [...entries.entries()]
            .find(([stored]) => withoutSearch(stored) === withoutSearch(key))?.[1]
            .clone()
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
    .replace(
      '__PRECACHE_URLS__',
      JSON.stringify([...publicRoutes, '/_next/static/app.js', '/icon.svg']),
    )
  const compiled = source.replace('__PUBLIC_APP_ROUTES__', JSON.stringify(publicRoutes))
  vm.runInNewContext(compiled, {
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
  const navigate = (path = '/') => {
    const request = new Request(origin + path)
    Object.defineProperty(request, 'mode', { value: 'navigate' })
    return dispatch('fetch', { request }) as Promise<Response>
  }
  return {
    caches,
    dispatch,
    navigate,
    skipWaiting,
    claim,
    fetch,
    goOffline: () => (offline = true),
    serveNewBuild: () => (document = 'new online shell'),
  }
}

describe('offline app shell', () => {
  it('keeps offline HTML paired with its fully cached build after a new deployment', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    worker.serveNewBuild()
    expect(await (await worker.navigate()).text()).toBe('new online shell /')
    worker.goOffline()
    expect(await (await worker.navigate()).text()).toBe('original complete shell /')
  })

  it('reopens each public route with its own shell, including callback query strings', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    worker.goOffline()
    for (const path of publicRoutes) {
      expect(await (await worker.navigate(path + '?account=return')).text()).toBe(
        'original complete shell ' + path,
      )
    }
  })

  it('never caches private, unknown, or non-navigation HTML requests', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    for (const path of ['/admin', '/admin/components', '/not-a-page']) {
      expect(worker.navigate(path)).toBeUndefined()
    }
    for (const path of publicRoutes) {
      expect(
        worker.dispatch('fetch', { request: new Request('https://fitt.example' + path) }),
      ).toBeUndefined()
    }
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
      new Request('https://fitt.example/api/realtime'),
      new Request('https://fitt.example/api/admin/access'),
      new Request('https://fitt.example/api/admin/previews/form'),
      new Request('https://fitt.example/api/admin/previews/components'),
      new Request('https://fitt.example/', { headers: { RSC: '1' } }),
      new Request('https://fitt.example/', { headers: { Accept: 'text/x-component' } }),
      new Request('https://fitt.example/?_rsc=vinext-prefetch'),
      new Request('https://fitt.example/', { method: 'POST' }),
      new Request('https://other.example/_next/static/app.js'),
      new Request('https://fitt.example/.generated/admin-previews.json'),
    ]
    for (const request of requests) expect(worker.dispatch('fetch', { request })).toBeUndefined()
  })

  it('prepares the public shell without sending account cookies', async () => {
    const worker = workerFixture()
    await worker.dispatch('install')
    for (const [request] of worker.fetch.mock.calls) {
      expect(request?.credentials).toBe('omit')
      expect(request?.cache).toBe('reload')
    }
  })

  it('serves the previous Next.js build to an existing tab after vinext activates', async () => {
    const worker = workerFixture()
    const previous = await worker.caches.open('fitt-shell-nextjs-build')
    await previous.put(
      '/_next/static/chunks/legacy-guide.js',
      new Response('the previous fully cached 3D guide'),
    )
    await worker.dispatch('install')
    await worker.dispatch('activate')
    worker.goOffline()
    const response = (await worker.dispatch('fetch', {
      request: new Request('https://fitt.example/_next/static/chunks/legacy-guide.js?v=old-tab'),
    })) as Response
    expect(await response.text()).toBe('the previous fully cached 3D guide')
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

describe('vinext offline build', () => {
  async function withBuildFixture(run: (root: string) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), 'fitt-offline-build-'))
    try {
      for (const directory of [
        'public',
        'scripts',
        'dist/server',
        'dist/client/_next/static',
        'dist/client/.vite',
        '.generated',
      ])
        await mkdir(join(root, directory), { recursive: true })
      await Promise.all([
        writeFile(join(root, 'dist/server/BUILD_ID'), 'vinext-build-one'),
        writeFile(join(root, 'dist/server/index.js'), 'private server module'),
        writeFile(join(root, '.generated/admin-previews.json'), 'private Admin documents'),
        writeFile(join(root, 'dist/client/.vite/manifest.json'), 'build manifest'),
        writeFile(join(root, 'dist/client/_next/static/app-AbCd.js'), 'client application'),
        writeFile(join(root, 'dist/client/_next/static/guide-XyZ.js'), 'lazy 3D guide'),
        writeFile(join(root, 'dist/client/_next/static/app-AbCd.js.map'), 'source map'),
        writeFile(join(root, 'dist/client/_next/static/app-AbCd.js.br'), 'compressed copy'),
        writeFile(join(root, 'dist/client/_next/static/app-AbCd.css'), 'compiled styles'),
        writeFile(join(root, 'dist/client/_next/static/dm-sans-A1.woff2'), 'local font'),
        writeFile(
          join(root, 'scripts/service-worker-template.js'),
          readFileSync('scripts/service-worker-template.js', 'utf8'),
        ),
      ])
      await run(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  it('registers the first-build worker path without activating an incomplete offline shell', async () => {
    await withBuildFixture(async (root) => {
      const path = join(root, 'public/sw.js')
      await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      await prepareServiceWorker({ root })
      const placeholder = await readFile(path, 'utf8')
      const listeners = new Map<string, (event: WorkerEvent) => void>()
      vm.runInNewContext(placeholder, {
        self: {
          addEventListener: (name: string, listener: (event: WorkerEvent) => void) =>
            listeners.set(name, listener),
        },
      })
      expect([...listeners.keys()]).toEqual(['install'])
      let pending: Promise<unknown> | undefined
      listeners.get('install')!({
        waitUntil: (promise) => (pending = promise),
        respondWith: () => {
          throw new Error('The incomplete worker must not intercept requests')
        },
      })
      await expect(pending).rejects.toThrow('Offline assets are not built yet.')
      await buildServiceWorker({ root })
      const deployed = await readFile(join(root, 'dist/client/sw.js'), 'utf8')
      expect(deployed).toBe(await readFile(path, 'utf8'))
      expect(deployed).not.toContain('FITT_SW_BUILD_PENDING')
      expect(deployed).toContain('fitt-shell-')
    })
  })

  it('includes lazy client code and fonts while excluding server and private build data', async () => {
    await withBuildFixture(async (root) => {
      const { urls } = await buildServiceWorker({ root })
      expect(urls).toEqual([
        ...publicRoutes,
        '/manifest.webmanifest',
        '/icon.svg',
        '/icon-192.png',
        '/icon-512.png',
        '/apple-touch-icon.png',
        '/_next/static/app-AbCd.css',
        '/_next/static/app-AbCd.js',
        '/_next/static/dm-sans-A1.woff2',
        '/_next/static/guide-XyZ.js',
      ])
      const deployed = await readFile(join(root, 'dist/client/sw.js'), 'utf8')
      expect(deployed).toBe(await readFile(join(root, 'public/sw.js'), 'utf8'))
      expect(deployed).not.toContain('__BUILD_VERSION__')
      expect(deployed).not.toContain('__PRECACHE_URLS__')
      expect(deployed).not.toContain('__PUBLIC_APP_ROUTES__')
      expect(urls).not.toContain('/admin')
      expect(urls).not.toContain('/admin/components')
    })
  })

  it('changes the cache identity for a new vinext build and refuses incomplete output', async () => {
    await withBuildFixture(async (root) => {
      const before = await buildServiceWorker({ root })
      await writeFile(join(root, 'dist/server/BUILD_ID'), 'vinext-build-two')
      const after = await buildServiceWorker({ root })
      expect(after.version).not.toBe(before.version)
      await rm(join(root, 'dist/client/_next/static/app-AbCd.js'))
      await rm(join(root, 'dist/client/_next/static/guide-XyZ.js'))
      await expect(buildServiceWorker({ root })).rejects.toThrow('vinext client chunks are missing')
    })
  })
})
