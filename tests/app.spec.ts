import { test, expect } from '@playwright/test'

test('equipment filters plans, exercise guide highlights muscles, and pages fit the viewport', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your daily practice.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'My setup', exact: true }).click()
  await page.getByRole('button', { name: /Pull-up bar Build/ }).click()
  await page.getByRole('button', { name: 'Your workout', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'View Scapular pull-up instructions' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'View Scapular pull-up instructions' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Muscles worked: Back, Shoulders' })).toBeVisible()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.getByRole('button', { name: 'Playback speed 1x' }).click()
  await expect(page.getByRole('button', { name: 'Playback speed 0.5x' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('plank')
  await expect(page.getByRole('button', { name: /Forearm plank/ })).toBeVisible()
  await page.getByRole('button', { name: /Forearm plank/ }).click()
  await expect(page.getByRole('img', { name: 'Muscles worked: Core, Shoulders' })).toBeVisible()
  expect(errors).toEqual([])
})

test('logs a hard set, adjusts targets, resumes after reload, saves a partial workout and exports it', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Let’s get moving' }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }).fill('4')
  await page.getByRole('combobox', { name: 'Knee push-up set 1 effort' }).selectOption('hard')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('3')
  await expect(page.getByText('1 of 15 sets complete')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Undo Knee push-up set 1', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('3')
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Another step forward.' })).toBeVisible()
  await page.getByRole('button', { name: 'See your progress' }).click()
  await page.getByRole('button', { name: /Full body foundations/ }).click()
  await expect(page.getByText('4 reps (hard)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'My setup', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^fitt-backup-.*\.json$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(chunk)
  const backup = JSON.parse(Buffer.concat(chunks).toString())
  expect(backup.history).toHaveLength(1)
  expect(backup.history[0].exercises[0].sets[0].reps).toBe(4)
  await page.getByLabel('Import Fitt backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await expect(page.getByText('Backup restored. Welcome back.')).toBeVisible()
})

test('supports weighted sets and a full completed workout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'My setup', exact: true }).click()
  await page.getByRole('button', { name: /Weighted vest Add/ }).click()
  await page.getByRole('button', { name: /Finding my next level/ }).click()
  await page.getByRole('combobox', { name: 'Session length' }).selectOption('20')
  await page.getByRole('button', { name: 'Your workout', exact: true }).click()
  await page.getByRole('button', { name: 'Let’s get moving' }).click()
  await page.getByRole('spinbutton', { name: 'Push-up set 1 added kg', exact: true }).fill('5')
  await page.getByRole('button', { name: 'Log Push-up set 1', exact: true }).click()
  await page.getByRole('button', { name: 'Log Push-up set 2', exact: true }).click()
  const headings = page.locator('.session-exercise-title')
  for (let i = 1; i < (await headings.count()); i++) {
    await headings.nth(i).click()
    const section = page.locator('.session-exercise').nth(i)
    const logButtons = section.getByRole('button', { name: /^Log / })
    const count = await logButtons.count()
    for (let j = 0; j < count; j++) await logButtons.first().click()
  }
  await expect(page.getByText('8 of 8 sets complete')).toBeVisible()
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Another step forward.' })).toBeVisible()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('form.training.v1')!))
  expect(stored.history[0].exercises[0].sets[0].load).toBe(5)
  expect(
    stored.history[0].exercises.every((e: { sets: { done: boolean }[] }) =>
      e.sets.every((s) => s.done),
    ),
  ).toBe(true)
})

test('rejects an invalid import without replacing existing data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'My setup', exact: true }).click()
  const before = await page.evaluate(() => localStorage.getItem('form.training.v1'))
  await page.getByLabel('Import Fitt backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":5}'),
  })
  await expect(page.getByText('This isn’t a supported Fitt backup.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('form.training.v1'))).toBe(before)
})

test('installs an offline cache and keeps guides and logging usable without network', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your daily practice.' })).toBeVisible()
  await page.getByRole('button', { name: 'View Knee push-up instructions' }).click()
  await page.getByRole('button', { name: 'Play animation' }).click()
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Let’s get moving' }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await expect(page.getByText('1 of 15 sets complete')).toBeVisible()
  const response = await page.evaluate(async () => {
    const r = await fetch('/manifest.webmanifest')
    return r.json()
  })
  expect(response.display).toBe('standalone')
  expect(response.icons).toHaveLength(2)
})
