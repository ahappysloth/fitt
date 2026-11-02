import { test, expect, type Page } from '@playwright/test'

const storageKey = 'form.training.v1'
const readState = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)

test('public pages support direct links and refresh without starting a workout', async ({
  page,
}) => {
  for (const [path, heading] of [
    ['/workout', 'Ready when you are.'],
    ['/settings', 'Your space. Your pace.'],
    ['/journey', 'Your effort has a story.'],
    ['/library', 'Good form starts here.'],
    ['/builder', 'Your workout. Your way.'],
    ['/', 'Your next chapter.'],
  ]) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    expect((await readState(page)).active).toBeNull()
  }
  const unknown = await page.request.get('/not-a-fitt-page')
  expect(unknown.status()).toBe(404)
  for (const path of ['/admin', '/admin/components']) {
    const denied = await page.request.get(path, { maxRedirects: 0 })
    expect(denied.status()).toBe(303)
    expect(denied.headers().location).toMatch(/\/settings\?admin=restricted$/)
    expect(denied.headers()['cache-control']).toContain('private, no-store')
  }
})

test('Back and Forward protect unsaved routines without replacing history entries', async ({
  page,
}) => {
  await page.goto('/journey')
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await expect(page).toHaveURL(/\/builder$/)
  const name = page.getByRole('textbox', { name: 'Routine name', exact: true })
  await name.fill('Keep my draft')
  await page.evaluate(() => history.back())
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/builder$/)
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(name).toHaveValue('Keep my draft')
  await page.evaluate(() => history.back())
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Leave without saving', exact: true }).click()
  await expect(page).toHaveURL(/:\d+\/$/)
  await expect(page.getByRole('heading', { name: 'Your next chapter.', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/builder$/)
  await expect(name).not.toHaveValue('Keep my draft')
  await page.goBack()
  await expect(page).toHaveURL(/:\d+\/$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/journey$/)
  await expect(page.getByRole('heading', { name: 'Your effort has a story.' })).toBeVisible()
})

test('route changes preserve a workout and protected set edits, including offline refresh', async ({
  page,
  context,
}) => {
  await page.goto('/workout')
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  const reps = page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true })
  await reps.fill('4')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  const nextReps = page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true })
  await nextReps.fill('7')
  const before = (await readState(page)).active
  await nextReps.fill('')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(nextReps).toHaveValue('')
  await nextReps.fill('7')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(nextReps).toHaveValue('7')
  expect((await readState(page)).active).toEqual(before)

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(nextReps).toHaveValue('7')
  expect((await readState(page)).active).toEqual(before)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await page.getByRole('link', { name: 'Workout', exact: true }).click()
  await expect(nextReps).toHaveValue('7')
  expect((await readState(page)).active).toEqual(before)
})

test('navigation links retain normal new-tab behavior', async ({ page, context }, info) => {
  test.skip(!!info.project.use.isMobile, 'Modifier clicks are a desktop interaction.')
  await page.goto('/')
  const settings = page.getByRole('link', { name: 'Settings', exact: true })
  await expect(settings).toHaveAttribute('href', '/settings')
  const opened = context.waitForEvent('page')
  await settings.click({ modifiers: ['ControlOrMeta'] })
  const tab = await opened
  await expect(tab).toHaveURL(/\/settings$/)
  await expect(tab.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page).toHaveURL(/:\d+\/$/)
  await tab.close()
})
