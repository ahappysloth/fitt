import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { emptyCloudData } from '../src/lib/cloud-contract'
import { privatePreviewDocument, type AdminPreviewKind } from '../src/server/admin-preview'

const owner = { id: 'admin-browser-fixture', email: 'owner@example.test', name: 'Studio owner' }

async function mockAccount(page: Page, administrator: boolean) {
  let signedIn = true
  let allowed = administrator
  const writes: unknown[] = []
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: signedIn ? owner : null,
        providers: { google: true, magicLink: true },
        realtime: false,
      },
    }),
  )
  await page.route('**/api/training', (route) => {
    if (route.request().method() === 'PUT') writes.push(route.request().postDataJSON())
    return route.fulfill({ json: { revision: 0, data: emptyCloudData() } })
  })
  await page.route('**/api/admin/access', (route) =>
    route.fulfill({
      json: signedIn && allowed ? { allowed: true, userId: owner.id } : { allowed: false },
    }),
  )
  await page.route('**/api/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ json: { success: true } })
  })
  return {
    writes,
    revokeAccess: () => (allowed = false),
    restoreAccess: () => (allowed = true),
  }
}

test('guests cannot see Admin or fetch either private preview directly', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  const access = await page.request.get('/api/admin/access')
  expect(access.status()).toBe(200)
  expect(await access.json()).toEqual({ allowed: false })
  expect(access.headers()['cache-control']).toContain('no-store')
  for (const kind of ['form', 'components']) {
    const preview = await page.request.get(`/api/admin/previews/${kind}`)
    expect(preview.status()).toBe(401)
    expect(preview.headers()['cache-control']).toContain('no-store')
    expect(await preview.text()).not.toContain('__FITT_ADMIN_PREVIEW__')
  }
})

test('an ordinary signed-in account does not receive an Admin navigation item', async ({
  page,
}) => {
  await mockAccount(page, false)
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText(owner.email, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
})

test('admin previews isolate demo state and close on access revocation or another-tab sign out', async ({
  page,
}, info) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { writes, revokeAccess, restoreAccess } = await mockAccount(page, true)
  const documents = JSON.parse(await readFile('.generated/admin-previews.json', 'utf8')) as Record<
    AdminPreviewKind,
    string
  >
  await page.route('**/api/admin/previews/*', (route) => {
    const kind = new URL(route.request().url()).pathname.split('/').at(-1) as AdminPreviewKind
    return route.fulfill({
      body: privatePreviewDocument(documents[kind], kind),
      contentType: 'text/html',
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  const before = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`fitt.account.${id}.v1`)!).state,
    owner.id,
  )
  const originalWrites = writes.length
  const originalAccent = await page.evaluate(() => document.documentElement.dataset.accent)
  const form = page.frameLocator('iframe[title="Fitt form studio preview"]')
  await expect(form.locator('.form-3d[data-ready=true]')).toBeVisible()
  await expect(form.locator('#model-inspector')).toBeAttached()
  await page.getByRole('button', { name: 'Components', exact: true }).click()
  const components = page.frameLocator('iframe[title="Fitt component preview"]')
  await expect(
    components.getByRole('heading', { name: 'The little things, considered.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Test celebration', exact: true })).toBeEnabled()
  expect(
    await components.locator('html').evaluate(() => {
      try {
        localStorage.getItem('admin-isolation-probe')
        return 'storage available'
      } catch (error) {
        return `${self.origin}:${(error as Error).name}`
      }
    }),
  ).toBe('null:SecurityError')
  await page.getByRole('button', { name: 'Preview mobile', exact: true }).click()
  await expect(page.locator('.admin-preview-stage')).toHaveClass(/is-mobile/)
  const bounds = await page.locator('.admin-preview-frame').boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Test celebration', exact: true }).click()
  await expect(components.getByRole('dialog', { name: 'Your effort, celebrated' })).toBeVisible()
  await expect(components.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
  await components.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(components.getByRole('dialog', { name: 'Your effort, celebrated' })).toHaveCount(0)
  await components.getByRole('button', { name: 'Tune the feel', exact: true }).click()
  await components.getByRole('button', { name: /Fresh mint/ }).click()
  await components.getByRole('button', { name: 'Close dialog', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBe(originalAccent)
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`fitt.account.${id}.v1`)!).state,
      owner.id,
    ),
  ).toEqual(before)
  expect(writes.length).toBe(originalWrites)
  revokeAccess()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.admin-preview-frame')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)

  restoreAccess()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await expect(form.locator('.form-3d[data-ready=true]')).toBeVisible()
  await page.getByRole('button', { name: 'Components', exact: true }).click()
  await page.getByRole('button', { name: 'Preview mobile', exact: true }).click()
  await page.getByRole('button', { name: 'Test celebration', exact: true }).click()
  await expect(components.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
  await page.screenshot({
    path: `preview/admin-celebration-${info.project.name}.png`,
    // Chromium full-page capture can change mobile srcDoc frame geometry.
    // Capture the real mobile viewport after the interactive checks instead.
    fullPage: !info.project.name.startsWith('mobile'),
  })
  // A sign-out in another tab changes the server session while Admin is open.
  // A focus refresh must evict the loaded preview as well as its navigation item.
  await page.evaluate(async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    window.dispatchEvent(new Event('focus'))
  })
  await expect(page.locator('.admin-preview-frame')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
