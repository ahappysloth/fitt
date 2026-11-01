import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// A file preview has no server or service-worker scope. Keep PWA registration in
// the normal deployment build; bundle the full application into this preview.
const result = await build({
  root,
  configFile: false,
  mode: 'standalone',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.NEXT_PUBLIC_STANDALONE': JSON.stringify('true'),
  },
  plugins: [react()],
  build: {
    write: false,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, 'src/main.tsx'),
      name: 'FittPreview',
      formats: ['iife'],
      fileName: 'form-preview',
      cssFileName: 'form-preview',
    },
  },
})

const output = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)
const scripts = output.filter((file) => file.type === 'chunk')
const styles = output.filter((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
if (scripts.length !== 1 || !styles.length)
  throw new Error('Expected a single script and bundled styles for the standalone preview.')
const javascript = scripts[0].code.replace(/<\/script/gi, '<\\/script')
const css = styles.map((file) => file.source.toString()).join('\n')
const icon = await readFile(resolve(root, 'public/icon.svg'), 'utf8')
const source = await readFile(resolve(root, 'index.html'), 'utf8')
const html = source
  .replace('href="/icon.svg"', `href="data:image/svg+xml,${encodeURIComponent(icon)}"`)
  .replace(/\s*<link[^>]+rel="apple-touch-icon"[^>]*>/, '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace(
    /<script type="module" src="\/src\/main.tsx"><\/script>/,
    () => `<script>${javascript}</script>`,
  )

if (html.includes('src="/src/main.tsx"')) throw new Error('The source entry was not bundled.')
await mkdir(resolve(root, 'preview'), { recursive: true })
await writeFile(resolve(root, 'preview/fitt.html'), html)
// Keep the earlier preview link working after the Fitt rename.
await writeFile(resolve(root, 'preview/form.html'), html)
console.log(
  `Standalone preview: preview/fitt.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`,
)
