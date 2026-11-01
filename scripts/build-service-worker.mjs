import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staticRoot = resolve(root, '.next/static')

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

const buildId = (await readFile(resolve(root, '.next/BUILD_ID'), 'utf8')).trim()
const staticFiles = (await filesIn(staticRoot))
  .filter((file) => /\.(?:js|css|woff2?|png|svg|webp|avif|ico)$/.test(file))
  .map((file) => '/_next/static/' + relative(staticRoot, file).split(sep).join('/'))
  .sort()

if (!staticFiles.some((file) => file.endsWith('.js')))
  throw new Error(
    'The Next.js static chunks are missing. Run the Next build before generating the worker.',
  )

// The server-rendered root is a generic loading shell. Never put authenticated
// responses, API routes, or user workout data into the service-worker cache.
const urls = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
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
await writeFile(resolve(root, 'public/sw.js'), worker)
console.log(`Offline shell: ${urls.length} local resources, version ${version}`)
