import { expect, test } from '@playwright/test'

// Released 3D motions replace the illustrated guide in exercise details;
// unreleased exercises keep the illustration.
test('exercise details use the 3D guide for released motions only', async ({ page }) => {
  await page.goto('/library')
  for (const [name, id] of [
    ['Bodyweight squat', 'squat'],
    ['Pull-up', 'pullup'],
    ['Push-up', 'pushup'],
    ['Wall push-up', 'wall-pushup'],
    ['Negative pull-up', 'negative-pullup'],
    ['Band-assisted pull-up', 'assisted-pullup'],
    ['Seated band row', 'band-row'],
    ['Ring row', 'ring-row'],
  ]) {
    await page.getByRole('button', { name: `View ${name} instructions`, exact: true }).click()
    const guide = page.locator('.form-3d[data-ready=true]')
    await expect(guide).toBeVisible()
    await expect(guide).toHaveAttribute('data-exercise', id)
    await page.getByRole('button', { name: 'Close dialog' }).click()
  }
  await page.getByRole('button', { name: 'View Glute bridge instructions', exact: true }).click()
  await expect(page.getByRole('img', { name: /Glute bridge:/ })).toBeVisible()
  await expect(page.locator('.form-3d')).toHaveCount(0)
})
