import { expect, test, type Page } from '@playwright/test'
import { byId } from '../src/lib/catalog'
import type { AppState, Session } from '../src/lib/types'
import { defaultProfile, emptyState, generateWorkout, prescribe } from '../src/lib/workout'

const storageKey = 'form.training.v1'
const activeSquats = (): Session => ({
  ...generateWorkout(defaultProfile, []),
  title: 'Effort and targets',
  startedAt: new Date().toISOString(),
  exercises: [prescribe(byId.squat, defaultProfile, [])],
})
async function seed(page: Page, active = activeSquats()) {
  const state = emptyState()
  state.preferences!.onboarded = true
  state.active = active
  await page.addInitScript(
    ({ storageKey, state }) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(state))
    },
    { storageKey, state },
  )
  await page.goto('/workout')
}
const read = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as AppState, storageKey)
const reps = (page: Page, set: number) =>
  page.getByRole('spinbutton', { name: `Bodyweight squat set ${set} reps`, exact: true })
const effort = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function expectUnrated(page: Page) {
  for (const name of ['Easy', 'Just right', 'Too hard'])
    await expect(effort(page, name)).toHaveAttribute('aria-pressed', 'false')
}
async function saveCorrection(page: Page, value: string) {
  await page.getByRole('button', { name: 'Edit Bodyweight squat set 1', exact: true }).click()
  await reps(page, 1).fill(value)
  await page
    .getByRole('button', { name: 'Save changes to Bodyweight squat set 1', exact: true })
    .click()
}

test('effort stays optional through reload and an unrated log', async ({ page }) => {
  await seed(page)
  await expectUnrated(page)
  await reps(page, 1).fill('20')
  await page.reload()
  await expect(reps(page, 1)).toHaveValue('20')
  await expectUnrated(page)
  await page.screenshot({ path: test.info().outputPath('effort-optional.png'), fullPage: true })
  await page.getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true }).click()
  await expect(reps(page, 2)).toBeVisible()
  await expectUnrated(page)
  await expect(page.getByText('Effort not rated', { exact: true })).toBeVisible()
  const entry = (await read(page)).active!.exercises[0]
  expect(entry.sets[0]).toMatchObject({ reps: 20, done: true, effortConfirmed: false })
  expect(entry.sets[1].effortConfirmed).toBe(false)
  await page.reload()
  await expectUnrated(page)
  const remove = page.getByRole('button', {
    name: 'Remove last set of Bodyweight squat',
    exact: true,
  })
  await remove.click()
  await remove.click()
  const shortened = (await read(page)).active!.exercises[0]
  expect(shortened.sets).toHaveLength(1)
  expect(shortened.plannedSetCount).toBe(3)
})

for (const [label, expected] of [
  ['Just right', 18],
  ['Easy', 20],
] as const) {
  test(`explicit ${label} calibrates 20 reps to ${expected} and leaves the next rating fresh`, async ({
    page,
  }) => {
    await seed(page)
    await reps(page, 1).fill('20')
    await effort(page, label).click()
    await expect(effort(page, label)).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true }).click()
    await expect(reps(page, 2)).toHaveValue(String(expected))
    await expectUnrated(page)
    const entry = (await read(page)).active!.exercises[0]
    expect(entry.sets[0].effortConfirmed).toBe(true)
    expect(entry.sets[1]).toMatchObject({
      reps: expected,
      effortConfirmed: false,
      recommendationSource: 'adapted',
    })
    expect(entry.sets[1].prescription!.target).toBeLessThan(expected)
    await page.reload()
    await expect(reps(page, 2)).toHaveValue(String(expected))
    await expectUnrated(page)
  })
}

test('same-value manual input survives corrections and can follow suggestions again', async ({
  page,
}) => {
  await seed(page)
  const original = (await read(page)).active!.exercises[0].sets[0].prescription
  await reps(page, 1).fill('20')
  await effort(page, 'Just right').click()
  await page.getByRole('button', { name: 'Log Bodyweight squat set 1', exact: true }).click()
  await expect(reps(page, 2)).toHaveValue('18')
  await reps(page, 2).fill('')
  await reps(page, 2).fill('18')
  await effort(page, 'Just right').click()
  await expect(page.getByRole('button', { name: 'Follow suggestion', exact: true })).toBeVisible()
  await saveCorrection(page, '30')
  await expect(reps(page, 2)).toHaveValue('18')
  expect((await read(page)).active!.exercises[0].sets[1].targetLocked).toBe(true)
  await page.reload()
  await expect(reps(page, 2)).toHaveValue('18')
  await expect(effort(page, 'Just right')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Follow suggestion', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Follow suggestion', exact: true })).toHaveCount(0)
  await expect(effort(page, 'Just right')).toHaveAttribute('aria-pressed', 'true')
  expect((await read(page)).active!.exercises[0].sets[1].targetLocked).toBe(false)
  await saveCorrection(page, '24')
  await expect(reps(page, 2)).toHaveValue('22')
  const entry = (await read(page)).active!.exercises[0]
  expect(entry.sets[0].prescription).toEqual(original)
  expect(entry.sets[1]).toMatchObject({ targetLocked: false, effortConfirmed: true })
})

for (const [label, value] of [
  ['Just right', 'good'],
  ['Easy', 'easy'],
  ['Too hard', 'hard'],
] as const) {
  test(`an explicit ${label} rating protects unchanged input until following suggestions`, async ({
    page,
  }) => {
    const active = activeSquats()
    const [first, ...pending] = active.exercises[0].sets
    Object.assign(first, { done: true, reps: 20, effortConfirmed: true })
    for (const set of pending)
      Object.assign(set, { target: 18, reps: 18, recommendationSource: 'adapted' })
    await seed(page, active)
    await expect(reps(page, 2)).toHaveValue('18')
    await effort(page, label).click()
    await saveCorrection(page, '30')
    await expect(reps(page, 2)).toHaveValue('18')
    expect((await read(page)).active!.exercises[0].sets[1]).toMatchObject({
      effort: value,
      effortConfirmed: true,
      targetLocked: true,
    })
    await page.getByRole('button', { name: 'Follow suggestion', exact: true }).click()
    await expect(effort(page, label)).toHaveAttribute('aria-pressed', 'true')
    await saveCorrection(page, '24')
    await expect(reps(page, 2)).toHaveValue('22')
    await expect(effort(page, label)).toHaveAttribute('aria-pressed', 'true')
    expect((await read(page)).active!.exercises[0].sets[1]).toMatchObject({
      effort: value,
      effortConfirmed: true,
      targetLocked: false,
    })
  })
}

test('correcting an older log preserves its prescription and other completed evidence', async ({
  page,
}) => {
  const active = activeSquats()
  const [first, second, third] = active.exercises[0].sets
  Object.assign(first, { done: true, reps: 20, effortConfirmed: true })
  Object.assign(second, {
    done: true,
    target: 18,
    reps: 18,
    effortConfirmed: true,
    recommendationSource: 'adapted',
  })
  Object.assign(third, { target: 18, reps: 18, recommendationSource: 'adapted' })
  await seed(page, active)
  const before = (await read(page)).active!.exercises[0]
  await page.getByRole('button', { name: 'Edit Bodyweight squat set 1', exact: true }).click()
  await expect(effort(page, 'Just right')).toHaveAttribute('aria-pressed', 'true')
  await reps(page, 1).fill('14')
  await effort(page, 'Too hard').click()
  await expect(page.locator('.workout-session__effort-help')).toHaveText(
    'Couldn’t finish comfortably or keep good form.',
  )
  await page
    .getByRole('button', { name: 'Save changes to Bodyweight squat set 1', exact: true })
    .click()
  await expect(reps(page, 3)).toHaveValue('18')
  const after = (await read(page)).active!.exercises[0]
  expect(after.sets[0]).toMatchObject({ reps: 14, effort: 'hard', effortConfirmed: true })
  expect(after.sets[0].prescription).toEqual(before.sets[0].prescription)
  expect(after.sets[1]).toEqual(before.sets[1])
  expect(after.sets[2]).toEqual(before.sets[2])
})

test('added sets start from suggested values with fresh evidence and retain the planned dose', async ({
  page,
}) => {
  const active = activeSquats()
  const entry = active.exercises[0]
  for (const set of entry.sets)
    Object.assign(set, {
      done: true,
      reps: 3,
      effort: 'hard',
      effortConfirmed: true,
      targetLocked: true,
    })
  const target = entry.sets.at(-1)!.target
  await seed(page, active)
  await page.getByRole('button', { name: 'Add set to Bodyweight squat', exact: true }).click()
  await expect(reps(page, 4)).toHaveValue(String(target))
  await expectUnrated(page)
  const added = (await read(page)).active!.exercises[0]
  expect(added.plannedSetCount).toBe(3)
  expect(added.sets[3]).toMatchObject({
    reps: target,
    target,
    effort: 'good',
    effortConfirmed: false,
    targetLocked: false,
    done: false,
    prescription: { target, load: 0, source: 'manual' },
  })
  expect(added.sets[3].id).not.toBe(added.sets[2].id)
  await page
    .getByRole('button', { name: 'Remove last set of Bodyweight squat', exact: true })
    .click()
  expect((await read(page)).active!.exercises[0].plannedSetCount).toBe(3)
})
