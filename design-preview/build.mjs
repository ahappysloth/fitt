import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const result = await build({
  root,
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  build: {
    write: false,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, 'design-preview/main.tsx'),
      name: 'FittDesignStudy',
      formats: ['iife'],
      fileName: 'fitt-design-study',
    },
  },
})
const output = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)
const code = output
  .filter((file) => file.type === 'chunk')
  .map((file) => file.code)
  .join('\n')
const css = output
  .filter((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
  .map((file) => file.source.toString())
  .join('\n')
const icon = await readFile(resolve(root, 'public/icon.svg'), 'utf8')
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#10110f"><title>Fitt · Momentum design preview</title><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}"><style>${css}</style></head><body><div id="root"></div><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
await mkdir(resolve(root, 'preview'), { recursive: true })
await writeFile(resolve(root, 'preview/fitt-redesign.html'), html)
console.log(
  `Design preview: preview/fitt-redesign.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`,
)
