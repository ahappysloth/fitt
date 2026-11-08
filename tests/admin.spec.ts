import { test, expect, type Page } from '@playwright/test'
import { emptyCloudData } from '../src/lib/cloud-contract'

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

test('guests cannot see Admin or receive an admin access grant', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  const access = await page.request.get('/api/admin/access')
  expect(access.status()).toBe(200)
  expect(await access.json()).toEqual({ allowed: false })
  expect(access.headers()['cache-control']).toContain('no-store')
})

test('an ordinary signed-in account does not receive an Admin navigation item', async ({
  page,
}) => {
  await mockAccount(page, false)
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText(owner.email, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
})

test('the wide desktop sidebar stays in place during Admin loading and scroll locks', async ({
  playwright,
  browserName,
  launchOptions,
}, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'Desktop classic-scrollbar layout')
  // Headless Chromium normally hides scrollbars, which conceals the layout shift.
  const browser = await playwright[browserName].launch({
    ...launchOptions,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: [...(launchOptions.args || []), '--disable-features=OverlayScrollbar,OverlayScrollbars'],
  })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } })
  let releaseAccess = () => {}
  try {
    await mockAccount(page, true)
    await page.goto('/')
    const admin = page.getByRole('link', { name: 'Admin', exact: true })
    await expect(admin).toBeVisible()
    const sidebar = page.locator('.sidebar')
    const before = await sidebar.boundingBox()
    // Exercise a real non-overlay scrollbar on a page taller than the viewport.
    expect(
      await page.evaluate(() => innerWidth - document.documentElement.clientWidth),
    ).toBeGreaterThan(0)
    const accessGate = new Promise<void>((resolve) => (releaseAccess = resolve))
    await page.route('**/api/admin/access', async (route) => {
      await accessGate
      await route.fulfill({ json: { allowed: true, userId: owner.id } })
    })
    await admin.click()
    await expect(page.getByText('Checking admin access…', { exact: true })).toBeVisible()
    const loading = await sidebar.boundingBox()
    releaseAccess()
    await expect(page.locator('.admin-view')).toBeVisible()
    const loaded = await sidebar.boundingBox()
    expect(loading!.x).toBeCloseTo(before!.x, 2)
    expect(loaded!.x).toBeCloseTo(before!.x, 2)
    expect(loading!.width).toBe(before!.width)
    expect(loaded!.width).toBe(before!.width)

    await page.getByRole('link', { name: 'Library', exact: true }).click()
    await page.getByRole('combobox', { name: 'Filter muscle group', exact: true }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    expect((await sidebar.boundingBox())!.x).toBeCloseTo(before!.x, 2)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    expect((await sidebar.boundingBox())!.x).toBeCloseTo(before!.x, 2)

    await page
      .getByRole('button', { name: /^View .* instructions$/ })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await sidebar.boundingBox())!.x).toBeCloseTo(before!.x, 2)
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    expect((await sidebar.boundingBox())!.x).toBeCloseTo(before!.x, 2)
  } finally {
    releaseAccess()
    await browser.close()
  }
})

test('native admin studios isolate demo state and close on access revocation or another-tab sign out', async ({
  page,
}, info) => {
  test.setTimeout(90000)
  // Full-page capture can corrupt software-WebGL layers under mobile device emulation.
  const fullPage = !info.project.name.startsWith('mobile')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { writes, revokeAccess, restoreAccess } = await mockAccount(page, true)
  await page.goto('/')
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const before = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`fitt.account.${id}.v1`)!).state,
    owner.id,
  )
  const originalWrites = writes.length
  const originalTheme = await page.evaluate(() => ({ ...document.documentElement.dataset }))
  const form = page.getByRole('region', { name: 'Form studio preview', exact: true })
  const guide = form.locator('.form-3d[data-ready=true]')
  await expect(guide).toBeVisible()
  await expect(form.locator('#model-inspector')).toBeAttached()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveCount(1)
  await guide
    .getByRole('group', { name: 'Body model', exact: true })
    .getByRole('button', { name: 'Female', exact: true })
    .click()
  await expect(guide).toHaveAttribute('data-model', 'female')
  const inspector = form.locator('#model-inspector')
  await expect(inspector).toHaveAttribute('data-model', 'female')
  // The standing viewer initializes only when it reaches the page viewport.
  await inspector.locator('.model-inspector__viewport').scrollIntoViewIfNeeded()
  await expect(inspector).toHaveAttribute('data-ready', 'true')
  await expect(inspector.locator('canvas')).toBeVisible()
  await inspector.getByRole('button', { name: 'Preview muscle groups', exact: true }).click()
  const muscles = inspector.locator('#muscle-preview-options')
  await muscles.getByRole('button', { name: 'Clear', exact: true }).click()
  for (const name of ['Core', 'Forearms', 'Calves']) {
    await muscles.getByRole('button', { name, exact: true }).click()
  }
  await expect(guide).toHaveAttribute('data-highlighted-muscles', 'core,forearms,calves')
  await inspector.locator('.model-inspector__studio').screenshot({
    path: `preview/admin-inspector-native-${info.project.name}.png`,
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await form.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible')
  await page.screenshot({
    path: `preview/admin-form-native-${info.project.name}.png`,
    fullPage,
  })
  await page.getByRole('button', { name: 'Preview mobile', exact: true }).click()
  await expect(form).toHaveClass(/is-mobile/)
  expect((await form.boundingBox())!.width).toBeLessThanOrEqual(390)
  expect(
    (await muscles.getByRole('button', { name: 'Core', exact: true }).boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `preview/admin-form-mobile-preview-${info.project.name}.png`,
    fullPage,
  })

  await page.getByRole('button', { name: 'Components', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/components$/)
  const components = page.getByRole('region', { name: 'Component playground preview', exact: true })
  await expect(
    components.getByRole('heading', { name: 'The little things, considered.' }),
  ).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(components).toHaveClass(/is-mobile/)
  expect((await components.boundingBox())!.width).toBeLessThanOrEqual(390)
  expect(await components.evaluate((element) => getComputedStyle(element).overflowY)).toBe(
    'visible',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await components.getByRole('button', { name: /Log this set/ }).click()
  await expect(components.getByRole('status')).toContainText('+5 sample XP')
  await expect(components.locator('.xp-total')).toContainText('1,435')
  await components.getByRole('button', { name: 'I have five minutes', exact: true }).click()
  const sample = page.getByRole('dialog', { name: 'Five-minute sample', exact: true })
  await expect(sample).toBeVisible()
  await sample.getByRole('button', { name: /Log sample set/ }).click()
  await expect(sample.getByRole('status')).toHaveText('1 of 3 sample sets logged')
  await sample.getByRole('button', { name: 'Close dialog', exact: true }).click()

  await page.getByRole('button', { name: 'Test celebration', exact: true }).click()
  const celebration = page.getByRole('dialog', { name: 'Your effort, celebrated', exact: true })
  await expect(celebration).toBeVisible()
  await expect(celebration.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
  await expect(celebration.getByText('SAMPLE WORKOUT', { exact: true })).toBeVisible()
  await page.screenshot({
    path: `preview/admin-celebration-${info.project.name}.png`,
    fullPage: false,
  })
  await celebration.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(celebration).toHaveCount(0)
  await page.getByRole('button', { name: 'Tune the feel', exact: true }).click()
  const tuning = page.getByRole('dialog', { name: 'Tune the feel', exact: true })
  await tuning.getByRole('button', { name: 'Fresh mint', exact: true }).click()
  await tuning.getByRole('button', { name: 'Calm', exact: true }).click()
  await tuning.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.locator('.admin-demo-theme')).toHaveAttribute('data-accent', 'mint')
  await expect(page.locator('.admin-demo-theme')).toHaveAttribute('data-motion', 'calm')
  await page.getByRole('button', { name: 'Test celebration', exact: true }).click()
  await expect(celebration).toBeVisible()
  await expect(celebration.locator('.confetti')).toHaveCount(0)
  await celebration.getByRole('button', { name: 'Close dialog', exact: true }).click()
  expect(await page.evaluate(() => ({ ...document.documentElement.dataset }))).toEqual(
    originalTheme,
  )
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`fitt.account.${id}.v1`)!).state,
      owner.id,
    ),
  ).toEqual(before)
  expect(writes.length).toBe(originalWrites)
  await page.getByRole('button', { name: 'Desktop preview', exact: true }).click()
  await page.screenshot({
    path: `preview/admin-components-native-${info.project.name}.png`,
    fullPage,
  })

  revokeAccess()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.admin-view')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)

  restoreAccess()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(guide).toBeVisible()
  await expect(guide).toHaveAttribute('data-model', 'male')
  await page.getByRole('button', { name: 'Components', exact: true }).click()
  await expect(page.locator('.admin-demo-theme')).toHaveAttribute('data-accent', 'lime')
  await expect(components.locator('.xp-total')).toContainText('1,430')
  await page.getByRole('button', { name: 'Test celebration', exact: true }).click()
  await expect(celebration).toBeVisible()
  // A focus refresh must evict the native studio and any open dialog after another tab signs out.
  await page.evaluate(async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    window.dispatchEvent(new Event('focus'))
  })
  await expect(page.locator('.admin-view')).toHaveCount(0)
  await expect(celebration).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
