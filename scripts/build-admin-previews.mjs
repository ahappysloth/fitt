import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPreview } from './build-preview.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// This bundle is imported by authenticated server routes, never copied to public/.
const previews = {}
for (const kind of ['form', 'components']) {
  previews[kind] = await buildPreview(kind)
}
await mkdir(resolve(root, '.generated'), { recursive: true })
await writeFile(resolve(root, '.generated/admin-previews.json'), JSON.stringify(previews))
console.log('Private admin preview bundle ready.')
