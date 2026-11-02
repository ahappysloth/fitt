import { existsSync } from 'node:fs'
import { copyFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Keep the exact FMark geometry, canvas, and lime in one vector source.
// All artwork stays inside a maskable icon's central 80%-diameter safe circle.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root, 'public/icons')
const source = resolve(directory, 'fitt-mark.svg')
const svg = await readFile(source, 'utf8')
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
  )
  for (const size of [32, 180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size })
    await page.screenshot({ path: resolve(directory, `fitt-mark-${size}.png`) })
  }
} finally {
  await browser.close()
}
// Older saved manifests and standalone preview exports still use these URLs.
await copyFile(source, resolve(root, 'public/icon.svg'))
for (const [sourceName, legacyName] of [
  ['fitt-mark-180.png', 'apple-touch-icon.png'],
  ['fitt-mark-192.png', 'icon-192.png'],
  ['fitt-mark-512.png', 'icon-512.png'],
]) {
  await copyFile(resolve(directory, sourceName), resolve(root, 'public', legacyName))
}
console.log('Exported canvas-and-lime F icons at 32, 180, 192, and 512 pixels.')
