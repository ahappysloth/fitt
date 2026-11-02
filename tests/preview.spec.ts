import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mountSandboxedPreview, openPreviewHost } from './helpers/embedded-preview'

test('standalone full app renders without network dependencies', async ({ page, context }) => {
  const errors: string[] = [],
    requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(/^https?:/, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.setContent(await readFile(resolve('preview/fitt.html'), 'utf8'))
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await page.getByRole('button', { name: 'View Knee push-up instructions', exact: true }).click()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('sandboxed embedded preview supports session-only workouts and the UUID fallback', async ({
  page,
  context,
}) => {
  await openPreviewHost(page)
  const errors: string[] = [],
    requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(/^https?:/, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  const html = (await readFile(resolve('preview/fitt.html'), 'utf8')).replace(
    '<head>',
    '<head><script>Object.defineProperty(crypto,"randomUUID",{value:undefined,configurable:true})</script>',
  )
  const frame = await mountSandboxedPreview(page, html, 'Fitt preview', true)
  await expect(frame.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await expect(frame.getByRole('alert')).toContainText('This preview cannot save data')
  await frame.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await frame.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await frame.getByRole('button', { name: 'Save & finish workout', exact: true }).click()
  await frame.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(
    frame.getByText('Export a backup to keep this workout before closing the app.'),
  ).toBeVisible()
  await frame.getByRole('button', { name: 'See my journey', exact: true }).click()
  await expect(frame.getByRole('heading', { name: 'Your effort has a story.' })).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})
