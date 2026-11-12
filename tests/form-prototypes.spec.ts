import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('studio exercises share playback, body selection, muscle controls and clean switching', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const html = await readFile('preview/fitt-form-studio.html', 'utf8')
  await page.route('**/prototype-study', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto('/prototype-study')
  const guide = page.locator('.form-3d')
  await expect(guide).toHaveAttribute('data-ready', 'true')
  await expect(guide).toHaveAttribute('data-exercise', 'knee-pushup')
  const firstCanvas = await guide.locator('canvas').elementHandle()
  for (const [name, id, phase, region] of [
    ['Bodyweight squat', 'squat', 'Pause', 'Quads'],
    ['Pull-up', 'pullup', 'Pause', 'Biceps'],
    ['Wall push-up', 'wall-pushup', 'Pause', 'Chest'],
    ['Incline push-up', 'incline-pushup', 'Pause', 'Chest'],
    ['Push-up', 'pushup', 'Pause', 'Chest'],
    ['Close-grip push-up', 'diamond-pushup', 'Pause', 'Triceps'],
    ['Ring push-up', 'ring-pushup', 'Pause', 'Forearms'],
    ['Knee push-up', 'knee-pushup', 'Pause', 'Chest'],
  ]) {
    await page.getByRole('combobox', { name: 'Preview exercise', exact: true }).click()
    await page.getByRole('option', { name, exact: true }).click()
    await expect(guide).toHaveAttribute('data-exercise', id)
    await expect(guide).toHaveAttribute('data-ready', 'true')
    await expect(guide.locator('canvas')).toHaveCount(1)
    const progress = guide.getByRole('slider', { name: 'Movement progress' })
    await expect(progress).toHaveValue('0')
    await guide.getByRole('button', { name: 'Female', exact: true }).click()
    await expect(guide).toHaveAttribute('data-model', 'female')
    await progress.evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '54')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(guide.locator('.form-3d__phase strong')).toHaveText(phase)
    await guide.getByRole('button', { name: 'Side', exact: true }).click()
    await guide.getByRole('button', { name: region, exact: true }).click()
    await expect(guide.getByRole('button', { name: region, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await guide.getByRole('button', { name: 'Male', exact: true }).click()
    await expect(progress).toHaveValue('54')
    await expect(guide).toHaveAttribute('data-model', 'male')
    await page.screenshot({
      path: `preview/form-studio/${test.info().project.name}-${id}.png`,
      fullPage: true,
    })
    await guide.getByRole('button', { name: 'Play animation', exact: true }).click()
    await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(54)
    await guide.getByRole('button', { name: 'Pause animation', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(await firstCanvas!.evaluate((canvas) => canvas.isConnected)).toBe(false)
  expect(errors).toEqual([])
})
