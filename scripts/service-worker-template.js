// Generated with the production build. Local workout data stays in app storage.
const CACHE_PREFIX = 'fitt-shell-'
const CACHE_NAME = `${CACHE_PREFIX}__BUILD_VERSION__`
const PRECACHE_URLS = __PRECACHE_URLS__
const PUBLIC_ASSETS = new Set(PRECACHE_URLS.filter((url) => url !== '/'))

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        // Completing installation means the full shell, including every lazy
        // client chunk and local font, can load without a network connection.
        await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))
      } catch (error) {
        await caches.delete(CACHE_NAME)
        throw error
      }
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const owned = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX))
      // Keep one previous build for another open tab that has not reloaded yet.
      const previous = owned.filter((key) => key !== CACHE_NAME).at(-1)
      await Promise.all(
        owned
          .filter((key) => key !== CACHE_NAME && key !== previous)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  // Updates are activated only by the app's explicit update action.
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

async function cachedStatic(request) {
  const current = await caches.open(CACHE_NAME)
  let cached = await current.match(request, { ignoreSearch: true })
  if (!cached) {
    const previous = (await caches.keys()).filter(
      (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
    )
    for (const key of previous) {
      cached = await (await caches.open(key)).match(request, { ignoreSearch: true })
      if (cached) break
    }
  }
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await current.put(request, response.clone())
  return response
}

async function rootNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (!response.ok) throw new Error('The app shell is temporarily unavailable.')
    // Keep the offline HTML paired with the assets from this exact build. A
    // newer online document is cached only when its whole worker installs.
    return response
  } catch {
    const shell = await cache.match('/')
    if (shell) return shell
    return new Response(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fitt</title><body style="background:#101010;color:#f4f4ef;font-family:system-ui;padding:2rem;line-height:1.6"><h1>You’re offline.</h1><p>Open Fitt once with an internet connection to prepare it for offline training.</p><button onclick="location.reload()">Try again</button></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // RSC, API, authentication, and realtime requests always go to the network.
  if (request.headers.has('RSC') || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(rootNavigation(request))
  } else if (url.pathname.startsWith('/_next/static/') || PUBLIC_ASSETS.has(url.pathname)) {
    event.respondWith(cachedStatic(request))
  }
})
