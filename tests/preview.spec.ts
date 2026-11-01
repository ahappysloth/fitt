import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('standalone preview renders its bundled HTML without a server or network assets', async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(/^https?:/, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  // Load the exported document as an HTML viewer does. Managed Chromium blocks
  // file:// navigation; keep that policy intact and supply the document itself.
  await page.setContent(await readFile(resolve('preview/fitt.html'), 'utf8'))
  await expect(page.getByRole('heading', { name: 'Your daily practice.' })).toBeVisible()
  await page.getByRole('button', { name: 'View Knee push-up instructions' }).click()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Let’s get moving' }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(page.getByText('1 of 15 sets complete')).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('embedded preview supports workouts with storage and randomUUID unavailable', async ({
  page,
  context,
}) => {
  const html = await readFile(resolve('preview/fitt.html'), 'utf8')
  const errors: string[] = [],
    requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(/^https?:/, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.setContent(
    '<iframe title="Fitt preview" sandbox="allow-scripts allow-downloads" style="width:100%;height:900px;border:0"></iframe>',
  )
  // Match an opaque-origin HTML viewer and explicitly exercise the UUID fallback.
  const restrictedHtml = html.replace(
    '<head>',
    '<head><script>Object.defineProperty(crypto,"randomUUID",{value:undefined,configurable:true})</script>',
  )
  await page.locator('iframe').evaluate((frame, source) => {
    ;(frame as HTMLIFrameElement).srcdoc = source
  }, restrictedHtml)
  const frame = page.frameLocator('iframe')
  await expect(frame.getByRole('heading', { name: 'Your daily practice.' })).toBeVisible()
  await expect(frame.getByRole('alert')).toContainText('This preview cannot save data')
  await frame.getByRole('button', { name: 'Let’s get moving' }).click()
  await frame.getByRole('button', { name: 'Add set to Knee push-up', exact: true }).click()
  await frame.getByRole('button', { name: 'Log Knee push-up set 4', exact: true }).click()
  await expect(frame.getByText('1 of 16 sets complete')).toBeVisible()
  await frame.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await frame.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(
    frame.getByText('Export a backup to keep this workout before closing the app.'),
  ).toBeVisible()
  await frame.getByRole('button', { name: 'See your progress' }).click()
  await expect(frame.getByRole('heading', { name: 'Your training journal' })).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})
