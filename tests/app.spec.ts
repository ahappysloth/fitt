import { test, expect, type Page } from '@playwright/test'

const key = 'form.training.v1'
const readState = (page: Page) =>
  page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key)
async function boot(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
}
async function finishPartial(page: Page) {
  await page.getByRole('button', { name: 'Save & finish workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
}

test('personalizes an equipment-aware plan, keeps existing guides, and filters the library', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await boot(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('textbox', { name: 'What should we call you?' }).fill('Alex')
  await page.getByRole('button', { name: /Pull-up bar Build/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hey, Alex.' })).toBeVisible()
  await page
    .getByRole('button', { name: 'View Scapular pull-up instructions', exact: true })
    .click()
  await expect(
    page.getByRole('img', { name: 'Muscles worked: Upper back, Shoulders, Forearms' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('plank')
  await page.getByRole('button', { name: 'View Forearm plank instructions', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Muscles worked: Core, Shoulders' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('adjusts a hard set, resumes saved inputs, awards once, and round-trips backups', async ({
  page,
}) => {
  await boot(page)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }).fill('4')
  await page.getByRole('button', { name: 'Challenging', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('3')
  await page.reload()
  await page.getByRole('button', { name: 'Resume workout', exact: true }).first().click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('3')
  await finishPartial(page)
  await expect(page.locator('.earned-xp')).toContainText('40')
  await page.getByRole('button', { name: 'See my journey', exact: true }).click()
  await expect(page.locator('.xp-total').first()).toContainText('40')
  const saved = await readState(page)
  expect(saved.history).toHaveLength(1)
  expect(saved.history[0].exercises[0].sets[0].reps).toBe(4)
  expect(saved.active).toBeNull()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup', exact: true }).click()
  const download = await pendingDownload
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk)
  const raw = Buffer.concat(chunks)
  expect(JSON.parse(raw.toString()).history).toHaveLength(1)
  await page
    .getByLabel('Import Fitt backup')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: raw })
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await page.getByRole('button', { name: 'Journey', exact: true }).click()
  await expect(page.locator('.xp-total').first()).toContainText('40')
  expect((await readState(page)).history).toHaveLength(1)
})

test('creates and reuses custom workouts with independent session IDs', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name' }).fill('My push practice')
  await page.getByRole('button', { name: 'Add Knee push-up', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up sets', exact: true }).fill('1')
  await page.getByRole('spinbutton', { name: 'Knee push-up target reps', exact: true }).fill('8')
  await page.getByRole('button', { name: 'Save routine', exact: true }).click()
  const routine = page
    .locator('.routine-card')
    .filter({ has: page.getByRole('heading', { name: 'My push practice', exact: true }) })
  await routine.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }),
  ).toHaveValue('8')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  const first = await readState(page)
  expect(first.routines).toHaveLength(1)
  expect(first.routines[0].exercises[0].sets[0].done).toBe(false)
  await routine.getByRole('button', { name: 'Start', exact: true }).click()
  const second = await readState(page)
  expect(second.active.id).not.toBe(first.history[0].id)
  expect(second.active.exercises[0].sets[0].id).not.toBe(first.history[0].exercises[0].sets[0].id)
})

test('protects dirty builder changes, confirms reset, and respects calm celebrations', async ({
  page,
}) => {
  await boot(page)
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name' }).fill('Unsaved practice')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Routine name' })).toHaveValue('Unsaved practice')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click()
  await page.getByRole('button', { name: /^Keep it calm/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page.locator('.quick-start-strip').click()
  await expect(page.getByRole('heading', { name: 'A five-minute win.' })).toBeVisible()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await finishPartial(page)
  expect(await page.locator('.confetti').count()).toBe(0)
  expect((await readState(page)).history[0].duration).toBe(5)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Reset/ }).click()
  await page.getByRole('button', { name: 'Keep my data', exact: true }).click()
  expect((await readState(page)).history).toHaveLength(1)
})

test('rejects malformed imports and preserves corrupted original data while allowing session-only use', async ({
  page,
}) => {
  await boot(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const before = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)
  await page.getByLabel('Import Fitt backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":5}'),
  })
  await expect(page.getByText('This isn’t a supported Fitt backup.')).toBeVisible()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(before)
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, '{malformed'), key)
  await page.reload()
  await expect(page.locator('.state-banner.warning')).toContainText('Automatic saving is paused')
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(
    '{malformed',
  )
  await expect(page.getByRole('button', { name: 'Download original data' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export current progress' })).toBeVisible()
})

test('pauses writes when another tab updates training data', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  const original = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)
  await page.evaluate(
    (storageKey) =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: storageKey, newValue: 'changed elsewhere' }),
      ),
    key,
  )
  await expect(page.locator('.state-banner.warning')).toContainText('Another tab changed')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(original)
})

test('uses its offline cache for guides and logging after a full reload', async ({
  page,
  context,
}) => {
  await boot(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await page.getByRole('button', { name: 'View Knee push-up instructions', exact: true }).click()
  await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toBeVisible()
  expect((await readState(page)).active.exercises[0].sets[0].done).toBe(true)
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  expect(manifest).toHaveProperty('display', 'standalone')
})

test('exports unsaved progress after a quota failure and recovers on the next successful write', async ({
  page,
}) => {
  await boot(page)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.evaluate(() => {
    const native = Storage.prototype.setItem
    ;(window as unknown as { blockWrites: boolean }).blockWrites = true
    Storage.prototype.setItem = function (key, value) {
      if (key === 'form.training.v1' && (window as unknown as { blockWrites: boolean }).blockWrites)
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return native.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(page.locator('.state-banner.warning')).toContainText('could not save')
  expect((await readState(page)).active.exercises[0].sets[0].done).toBe(false)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export current progress', exact: true }).click()
  const stream = await (await pending).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk)
  expect(JSON.parse(Buffer.concat(chunks).toString()).active.exercises[0].sets[0].done).toBe(true)
  await page.evaluate(() => {
    ;(window as unknown as { blockWrites: boolean }).blockWrites = false
  })
  await page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }).fill('7')
  await expect(page.locator('.state-banner.warning')).toHaveCount(0)
  expect((await readState(page)).active.exercises[0].sets[0].done).toBe(true)
})

test('a second real tab cannot overwrite a session created by the first tab', async ({
  page,
  context,
}) => {
  await boot(page)
  const other = await context.newPage()
  await boot(other)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  const saved = await readState(page)
  await expect(other.locator('.state-banner.warning')).toContainText('Another tab changed')
  await other.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await other.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  expect((await readState(page)).active.id).toBe(saved.active.id)
  expect((await readState(page)).active.exercises[0].sets[0].done).toBe(false)
  await other.close()
})

test('preserves legacy saved workouts through migration and a second reload', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await finishPartial(page)
  const legacy = await readState(page)
  delete legacy.preferences
  delete legacy.routines
  delete legacy.history[0].rewardContext
  await page.evaluate(({ key, legacy }) => localStorage.setItem(key, JSON.stringify(legacy)), {
    key,
    legacy,
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  const migrated = await readState(page)
  expect(migrated.history[0].id).toBe(legacy.history[0].id)
  expect(migrated.history[0].exercises).toEqual(legacy.history[0].exercises)
  expect(migrated.history[0].rewardContext.weeklyGoal).toBe(3)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  expect((await readState(page)).history).toEqual(migrated.history)
})

test('keeps the quick-workout intent when leaving a dirty builder', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Quick action is in the desktop sidebar.')
  await boot(page)
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name' }).fill('Unsaved practice')
  await page.locator('.sidebar-challenge').click()
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A five-minute win.' })).toBeVisible()
  expect((await readState(page)).active.duration).toBe(5)
})

test('requires explicit bodyweight conversion after removing a weighted vest', async ({ page }) => {
  await boot(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Weighted vest Add/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name' }).fill('Weighted push practice')
  await page.getByRole('button', { name: 'Add Push-up', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Push-up added load', exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save routine', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Weighted vest Add/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  const routine = page
    .locator('.routine-card')
    .filter({ has: page.getByRole('heading', { name: 'Weighted push practice', exact: true }) })
  await routine.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('includes added weight')
  expect((await readState(page)).active).toBeNull()
  await routine.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save routine', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Use bodyweight', exact: true }).click()
  await page.getByRole('button', { name: 'Save routine', exact: true }).click()
  await routine.getByRole('button', { name: 'Start', exact: true }).click()
  expect((await readState(page)).active.exercises[0].sets[0].targetLoad).toBe(0)
})
