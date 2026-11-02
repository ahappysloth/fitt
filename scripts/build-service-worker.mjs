import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import appRoutes from '../src/lib/app-routes.json' with { type: 'json' }

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function prepareServiceWorker({ root = projectRoot } = {}) {
  // Vinext snapshots public paths during compilation. Register this path before
  // that snapshot; the final asset list only exists after all environments build.
  // A failed/interrupted build must not install a worker that claims offline readiness.
  const placeholder = `// FITT_SW_BUILD_PENDING: replaced after the production build.
self.addEventListener('install', (event) => {
  event.waitUntil(Promise.reject(new Error('Offline assets are not built yet.')))
})
`
  await mkdir(resolve(root, 'public'), { recursive: true })
  await writeFile(resolve(root, 'public/sw.js'), placeholder)
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? filesIn(path) : path
    }),
  )
  return files.flat()
}

export async function buildServiceWorker({ root = projectRoot } = {}) {
  const clientRoot = resolve(root, 'dist/client')
  const staticRoot = resolve(clientRoot, '_next/static')
  const buildId = (await readFile(resolve(root, 'dist/server/BUILD_ID'), 'utf8')).trim()
  if (!buildId) throw new Error('The vinext build identifier is missing.')
  const staticFiles = (await filesIn(staticRoot))
    .filter((file) => /\.(?:js|css|woff2?|png|svg|webp|avif|ico)$/.test(file))
    .map((file) => '/' + relative(clientRoot, file).split(sep).join('/'))
    .sort()

  if (!staticFiles.some((file) => file.endsWith('.js')))
    throw new Error(
      'The vinext client chunks are missing. Run the production build before generating the worker.',
    )

  // Restrict discovery to the compiled client asset subtree. Server bundles,
  // private Admin documents, build manifests, and API responses never belong here.
  // Each public route has its own anonymous HTML/RSC shell. Cache that exact
  // shell for refreshes; never substitute the root's route tree for a deep link.
  const publicAppRoutes = [
    appRoutes.today,
    appRoutes.workout,
    appRoutes.journey,
    appRoutes.library,
    appRoutes.settings,
    appRoutes.builder,
  ]
  const urls = [
    ...publicAppRoutes,
    '/manifest.webmanifest',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/apple-touch-icon.png',
    '/icons/fitt-mark.svg',
    '/icons/fitt-mark-32.png',
    '/icons/fitt-mark-180.png',
    '/icons/fitt-mark-192.png',
    '/icons/fitt-mark-512.png',
    ...staticFiles,
  ]
  const template = await readFile(resolve(root, 'scripts/service-worker-template.js'), 'utf8')
  const version = createHash('sha256')
    .update(buildId + template + JSON.stringify(urls))
    .digest('hex')
    .slice(0, 16)
  const worker = template
    .replace('__BUILD_VERSION__', version)
    .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2))
    .replace('__PUBLIC_APP_ROUTES__', JSON.stringify(publicAppRoutes))
  // Vite has already copied public/ into dist/client/ by this postbuild step.
  // Update the deployed asset as well as the local public copy.
  await Promise.all(
    [resolve(root, 'public/sw.js'), resolve(clientRoot, 'sw.js')].map((path) =>
      writeFile(path, worker),
    ),
  )
  return { urls, version }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--prepare')) {
    await prepareServiceWorker()
    console.log('Registered the service-worker path for the vinext build.')
  } else {
    const { urls, version } = await buildServiceWorker()
    console.log(`Offline shell: ${urls.length} local resources, version ${version}`)
  }
}
