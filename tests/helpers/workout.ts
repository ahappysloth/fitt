import { expect, type FrameLocator, type Page } from '@playwright/test'

type WorkoutPage = Page | FrameLocator

export async function continueReviewedWorkout(page: WorkoutPage) {
  await expect(
    page.getByRole('heading', { name: 'Make it a good one.', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Continue to workout', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Log sets', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('#main-content')).toBeFocused()
}

export async function openWorkoutFormGuide(page: WorkoutPage) {
  await page.getByRole('tab', { name: 'Form guide', exact: true }).click()
  await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()
}

export async function addBuilderExercise(page: WorkoutPage, name: string) {
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Add exercises', exact: true })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: `Add ${name}`, exact: true }).click()
  await picker.getByRole('button', { name: 'Close dialog', exact: true }).click()
}
