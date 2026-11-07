import { continueReviewedWorkout } from './helpers/workout'
import { test, expect } from '@playwright/test'

test('blocked actions explain their controls and share one return to the saved workout', async ({
  page,
}) => {
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: null,
        providers: { google: true, magicLink: true },
        realtime: false,
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await continueReviewedWorkout(page)
  await page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }).fill('4')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  const savedId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('form.training.v1')!).active.id as string,
  )

  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create workout', exact: true })).toBeDisabled()
  await expect(
    page.getByText('Finish or discard your workout to create, edit, or start a saved routine.', {
      exact: true,
    }),
  ).toBeVisible()
  const strip = page.getByRole('button', { name: /^Return to active workout:/ })
  await expect(strip).toHaveCount(1)
  await strip.screenshot({
    path: `preview/workout-shortcut-${test.info().project.name}.png`,
  })
  await strip.click()
  await expect(page).toHaveURL(/\/workout$/)

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(
    page.getByRole('button', { name: 'Continue with Google', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Session length' })).toBeDisabled()
  await expect(
    page.getByText('Finish or discard your workout to sign in.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Finish or discard your workout to change equipment and training preferences.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.locator('.active-workout-notice')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Go to workout', exact: true })).toHaveCount(0)
  await expect(strip).toHaveCount(1)
  await strip.click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => {
      const active = JSON.parse(localStorage.getItem('form.training.v1')!).active
      return {
        id: active.id,
        reps: active.exercises[0].sets[0].reps,
        done: active.exercises[0].sets[0].done,
      }
    }),
  ).toEqual({ id: savedId, reps: 4, done: true })

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(strip).toHaveCount(1)
  await strip.click()
  await expect(page).toHaveURL(/\/workout$/)
  await page.getByLabel('Session options', { exact: true }).click()
  await page.getByRole('button', { name: 'Discard session', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard session', exact: true })
    .click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Session length' })).toBeEnabled()
  await expect(strip).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Go to workout', exact: true })).toHaveCount(0)
})

test('main focus stays unobtrusive while topbar actions retain hover and keyboard affordances', async ({
  page,
}, info) => {
  await page.goto('/settings?account=return')
  const main = page.locator('#main-content')
  await expect(main).toBeFocused()
  await expect(main).toHaveCSS('outline-style', 'none')

  const xp = page.locator('.app-topbar .xp-chip')
  const avatar = page.locator('.app-topbar .avatar-button')
  if (!info.project.use.isMobile) {
    const xpBackground = await xp.evaluate((element) => getComputedStyle(element).backgroundColor)
    await xp.hover()
    await expect
      .poll(() => xp.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(xpBackground)
    await page.mouse.move(0, 0)
    const avatarBorder = await avatar.evaluate((element) => getComputedStyle(element).borderColor)
    await avatar.hover()
    await expect
      .poll(() => avatar.evaluate((element) => getComputedStyle(element).borderColor))
      .not.toBe(avatarBorder)
  }

  const skip = page.getByRole('link', { name: 'Skip to content', exact: true })
  await skip.focus()
  await expect(skip).toBeVisible()
  await skip.press('Enter')
  await expect(main).toBeFocused()
  await expect(main).toHaveCSS('outline-style', 'none')

  await page.keyboard.press('Tab')
  await xp.focus()
  await expect(xp).toHaveCSS('outline-style', 'solid')
  await xp.press('Enter')
  await expect(page).toHaveURL(/\/journey$/)
  await avatar.focus()
  await expect(avatar).toHaveCSS('outline-style', 'solid')
  await avatar.press('Enter')
  await expect(page).toHaveURL(/\/settings$/)
  const settingsLink = page.getByRole('link', { name: 'Settings', exact: true })
  await expect(settingsLink).toHaveAttribute('href', '/settings')
  await expect(settingsLink).toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
