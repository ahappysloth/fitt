import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { emptyState, generateWorkout } from '../src/lib/workout'

const storageKey = 'form.training.v1'
const reviewButton = (page: Page) =>
  page.getByRole('button', { name: 'Review workout', exact: true })
const reviewHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Make it a good one.', exact: true })

function captureErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

for (const path of ['/workout', '/builder']) {
  test(`bottom Review workout opens the review from direct ${path}, including dirty edits`, async ({
    page,
  }) => {
    const errors = captureErrors(page)
    await page.goto(path)
    await reviewButton(page).scrollIntoViewIfNeeded()
    await reviewButton(page).click()
    await expect(reviewHeading(page)).toBeVisible()
    await expect(page).toHaveURL(/\/workout$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'Edit workout', exact: true }).click()
    await page.getByRole('textbox', { name: 'Routine name', exact: true }).fill('Reviewed edits')
    await reviewButton(page).scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath('review-button.png') })
    await reviewButton(page).click()
    await expect(reviewHeading(page)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reviewed edits', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.locator('#main-content')).toBeFocused()
    const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)
    expect(state.plan.title).toBe('Reviewed edits')
    expect(state.active).toBeNull()
    await page.screenshot({ path: test.info().outputPath('review-open.png'), fullPage: true })
    expect(errors).toEqual([])
  })
}

test('an invalid target can be corrected and reviewed without leaving the direct builder', async ({
  page,
}) => {
  const errors = captureErrors(page)
  await page.goto('/builder')
  const target = page.getByRole('spinbutton', { name: 'Knee push-up target reps', exact: true })
  await target.fill('6.5')
  await expect(target).toHaveAttribute('aria-invalid', 'true')
  await reviewButton(page).scrollIntoViewIfNeeded()
  await reviewButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Choose a whole target from 1 to 100 reps.')
  await expect(target).toBeFocused()
  await expect(reviewHeading(page)).toHaveCount(0)
  await target.fill('7')
  await expect(target).toHaveAttribute('aria-invalid', 'false')
  await reviewButton(page).scrollIntoViewIfNeeded()
  await reviewButton(page).click()
  await expect(reviewHeading(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Workout review', exact: true })).toContainText(
    '7 reps',
  )
  expect(errors).toEqual([])
})

test('accepted legacy title and duration explain blocked review and can be repaired', async ({
  page,
}) => {
  const errors = captureErrors(page)
  const state = emptyState()
  state.preferences!.onboarded = true
  state.plan = {
    ...generateWorkout(state.profile, []),
    title: `Legacy ${'x'.repeat(70)}`,
    duration: 1.5,
  }
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state))
    },
    { key: storageKey, state },
  )
  await page.goto('/builder')
  const title = page.getByRole('textbox', { name: 'Routine name', exact: true })
  const duration = page.getByRole('combobox', { name: 'Time to set aside', exact: true })
  await reviewButton(page).scrollIntoViewIfNeeded()
  await reviewButton(page).click()
  await expect(page.getByRole('alert')).toContainText(/name.{0,50}60|60.{0,50}name/i)
  await expect(page.locator('.builder-basics .builder-field-error').last()).toContainText(
    /whole.{0,50}(minute|duration)|duration.{0,50}whole/i,
  )
  await expect(title).toBeFocused()
  await expect(reviewHeading(page)).toHaveCount(0)

  await title.fill('Recovered legacy routine')
  await reviewButton(page).click()
  await expect(page.getByRole('alert')).toContainText('whole number of minutes')
  await expect(duration).toBeFocused()
  await duration.click()
  await page.getByRole('option', { name: '20 minutes', exact: true }).click()
  await reviewButton(page).click()
  await expect(reviewHeading(page)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Recovered legacy routine', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active, storageKey),
  ).toBeNull()
  expect(errors).toEqual([])
})

test('standalone preview reviews bottom-button edits using local navigation', async ({
  page,
  context,
}) => {
  const errors = captureErrors(page)
  const requests: string[] = []
  await context.route(/^https?:/, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.setContent(await readFile(resolve('preview/fitt.html'), 'utf8'))
  await page.getByRole('link', { name: 'Workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name', exact: true }).fill('Standalone review')
  await reviewButton(page).scrollIntoViewIfNeeded()
  await reviewButton(page).click()
  await expect(reviewHeading(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standalone review', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to workout', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause session', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path: test.info().outputPath('standalone-review.png'), fullPage: true })
  expect(page.url()).toBe('about:blank')
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})
