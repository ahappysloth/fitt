import { expect, test, type Locator, type Page } from '@playwright/test'
import type { AppState, Session } from '../src/lib/types'
import { defaultProfile, emptyState, generateWorkout, prescribe } from '../src/lib/workout'
import { byId } from '../src/lib/catalog'
import { continueReviewedWorkout } from './helpers/workout'

const storageKey = 'form.training.v1'
const documentTop = (locator: Locator) =>
  locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
async function seed(page: Page, active?: Session) {
  const state = emptyState()
  state.preferences!.onboarded = true
  if (active) state.active = active
  state.plan = generateWorkout(defaultProfile, [])
  await page.addInitScript(
    ({ storageKey, state }) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(state))
    },
    { storageKey, state },
  )
}
const read = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as AppState, storageKey)
const activeWith = (...ids: string[]): Session => ({
  ...generateWorkout(defaultProfile, []),
  title: 'My focused session',
  startedAt: new Date().toISOString(),
  exercises: ids.map((id) => prescribe(byId[id], defaultProfile, [])),
})

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('builds from a focus, adds outside it, reviews, edits, and explicitly starts', async ({
  page,
}) => {
  await seed(page)
  await page.goto('/workout')
  await expect(page.getByRole('heading', { name: 'Your workout. Your way.' })).toBeVisible()
  expect((await read(page)).active).toBeNull()
  await page.getByRole('button', { name: /^Legs/ }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Add exercises', exact: true })
  await expect(
    picker.getByRole('combobox', { name: 'Filter exercises by workout focus' }),
  ).toContainText('Lower body')
  await expect(picker.getByRole('button', { name: 'Add Knee push-up', exact: true })).toHaveCount(0)
  await choose(page, 'Filter exercises by workout focus', 'Any focus')
  await choose(page, 'Filter exercises by category', 'Push')
  await choose(page, 'Filter routine exercises by muscle', 'Chest')
  await picker.getByRole('button', { name: 'Add Knee push-up', exact: true }).click()
  await picker.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up target reps', exact: true }).fill('11')
  await page.getByRole('button', { name: 'Review workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Make it a good one.' })).toBeVisible()
  expect((await read(page)).active).toBeNull()
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up target reps', exact: true }),
  ).toHaveValue('11')
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await expect(
    picker.getByRole('combobox', { name: 'Filter exercises by workout focus' }),
  ).toContainText('Lower body')
  await picker.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Review workout', exact: true }).click()
  await page.reload()
  expect((await read(page)).active).toBeNull()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up target reps', exact: true }),
  ).toHaveValue('11')
  await page.getByRole('button', { name: 'Review workout', exact: true }).click()
  await continueReviewedWorkout(page)
  const started = (await read(page)).active!
  const authored = started.exercises.find((entry) => entry.exerciseId === 'knee-pushup')
  expect(authored?.plannedSetCount).toBe(authored?.sets.length)
  expect(authored?.sets[0]).toMatchObject({
    prescription: { target: 11, load: 0, source: 'manual' },
    recommendationSource: 'prescribed',
    effortConfirmed: false,
    targetLocked: false,
  })
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  const strip = page.getByRole('button', { name: /Return to active workout/ })
  await expect(strip).toBeVisible()
  if (test.info().project.name.startsWith('mobile')) {
    const stripBox = await strip.boundingBox()
    const navBox = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
    expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(navBox!.y)
  }
  await strip.click()
  expect((await read(page)).active!.id).toBe(started.id)
  await page.getByLabel('Session options', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Discard session', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard session', exact: true })
    .click()
  await page.getByRole('link', { name: 'Workout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your workout. Your way.' })).toBeVisible()
  expect((await read(page)).active).toBeNull()
})

test('keeps logging first, preserves edits between tabs, and adapts an explicit Just right 20 squat to 18', async ({
  page,
}) => {
  if (test.info().project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 393, height: 727 })
  await seed(page, activeWith('squat', 'plank'))
  await page.goto('/workout')
  await expect(page.getByText('Log at least one set to save your workout.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save & finish workout' })).toBeDisabled()
  if (test.info().project.name.startsWith('mobile')) {
    const log = await page
      .getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true })
      .boundingBox()
    const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
    expect(log!.y).toBeGreaterThan(0)
    expect(log!.y + log!.height).toBeLessThanOrEqual(nav!.y - 16)
  }
  if (test.info().project.name.startsWith('mobile')) {
    // iPhone SE/8 class screens keep the main action clear of the bottom nav.
    await page.setViewportSize({ width: 375, height: 667 })
    const log = await page
      .getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true })
      .boundingBox()
    const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
    expect(log!.y + log!.height).toBeLessThanOrEqual(nav!.y - 8)
    await page.setViewportSize({ width: 393, height: 727 })
  }
  const input = page.getByRole('spinbutton', { name: 'Bodyweight squat set 1 reps', exact: true })
  await expect(page.getByText('Find your level.', { exact: true })).toBeVisible()
  await input.fill('20')
  await page.getByRole('tab', { name: 'Form guide', exact: true }).click()
  await expect(page.getByRole('button', { name: 'All form instructions' })).toBeVisible()
  await page.getByRole('tab', { name: 'Form guide', exact: true }).press('Home')
  await expect(page.getByRole('tab', { name: 'Log sets', exact: true })).toBeFocused()
  await expect(input).toHaveValue('20')
  const logger = await documentTop(page.locator('.workout-session__logger'))
  const setsBefore = await documentTop(page.locator('.workout-session__sets'))
  const coming = await documentTop(page.locator('.workout-session__coming-up'))
  if (test.info().project.name.startsWith('mobile')) expect(logger).toBeLessThan(setsBefore)
  else {
    // Wide screens put logging first in the left column, with the set list beside it.
    const loggerBox = await page.locator('.workout-session__logger').boundingBox()
    const setsBox = await page.locator('.workout-session__sets').boundingBox()
    expect(loggerBox!.x).toBeLessThan(setsBox!.x)
    expect(setsBox!.y + setsBox!.height).toBeLessThanOrEqual(1000)
  }
  expect(setsBefore).toBeLessThan(coming)
  await page.getByRole('button', { name: 'Just right', exact: true }).click()
  await page.getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Bodyweight squat set 2 reps', exact: true }),
  ).toHaveValue('15') // 85% of 20, capped at the top of the squat range
  const setsAfter = await documentTop(page.locator('.workout-session__sets'))
  expect(Math.abs(setsBefore - setsAfter)).toBeLessThanOrEqual(3)
  await page.getByRole('button', { name: 'Edit Bodyweight squat set 1', exact: true }).click()
  await input.fill('21')
  await choose(page, 'Current exercise', '2. Forearm plank · 0/3 sets')
  await expect(page.getByRole('dialog', { name: 'Leave this set edit?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(input).toHaveValue('21')
  await page
    .getByRole('button', { name: 'Save changes to Bodyweight squat set 1', exact: true })
    .click()
  await page.getByRole('button', { name: 'Add set to Bodyweight squat', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Bodyweight squat sets', exact: true }).locator('li'),
  ).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('pauses rest across reload and navigation, then finishes excluding paused time', async ({
  page,
}) => {
  await page.clock.install()
  await seed(page, activeWith('squat', 'plank'))
  await page.goto('/workout')
  await page.getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true }).click()
  await page.getByRole('button', { name: 'Pause session', exact: true }).click()
  const frozenRest = await page.getByRole('timer').innerText()
  const frozenClock = await page.locator('.workout-session__clock').innerText()
  await page.clock.fastForward(120_000)
  await expect(page.getByRole('timer')).toHaveText(frozenRest)
  await expect(page.locator('.workout-session__clock')).toHaveText(frozenClock)
  await expect(
    page.getByRole('button', { name: 'Log Bodyweight squat set 2', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(frozenRest)
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.clock.fastForward(60_000)
  await page.getByRole('button', { name: /Return to paused workout/ }).click()
  await page.getByRole('button', { name: 'Resume session', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText(frozenRest)
  await page.clock.fastForward(5000)
  await page.getByRole('button', { name: 'Pause session', exact: true }).click()
  await page.clock.fastForward(120_000)
  await expect(
    page.getByRole('button', { name: 'Save & finish workout', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Save & finish workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  const finished = (await read(page)).history[0]
  expect(finished.elapsedSeconds).toBeLessThan(20)
  expect((await read(page)).active).toBeNull()
})

test('freezes and restores the hold timer during a session pause', async ({ page }) => {
  await page.clock.install()
  await seed(page, activeWith('plank'))
  await page.goto('/workout')
  await page.getByRole('button', { name: 'Start hold timer', exact: true }).click()
  await page.getByRole('button', { name: 'Pause session', exact: true }).click()
  const frozen = await page.getByRole('timer').innerText()
  await page.clock.fastForward(90_000)
  await page.reload()
  await expect(page.getByRole('timer')).toHaveText(frozen)
  await expect(page.getByRole('button', { name: 'Restart hold timer' })).toBeDisabled()
  await page.getByRole('button', { name: 'Resume session', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText(frozen)
  await page.clock.fastForward(5000)
  await expect(page.getByRole('timer')).not.toHaveText(frozen)
})
