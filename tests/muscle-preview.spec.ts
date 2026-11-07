import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('admin muscle preview shares independent selections across both viewers without resetting them', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Shader compilation errors are logged rather than thrown by the renderer.
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const html = await readFile('preview/fitt-form-studio.html', 'utf8')
  await page.route('**/muscle-study', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto('/muscle-study')
  const guide = page.locator('.form-3d[data-ready=true]')
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Lower & pause', exact: true }).click()
  await guide.getByRole('button', { name: 'Side', exact: true }).click()
  const guideCanvas = await guide.locator('canvas').elementHandle()
  const inspector = page.locator('#model-inspector')
  await inspector.scrollIntoViewIfNeeded()
  await expect(inspector).toHaveAttribute('data-ready', 'true')
  await inspector.getByRole('button', { name: 'Front', exact: true }).click()
  await inspector.getByRole('button', { name: 'Zoom in on standing model' }).click()
  const inspectorCanvas = await inspector.locator('canvas').elementHandle()
  const neutral = await inspector.locator('canvas').screenshot()
  const toggle = inspector.getByRole('button', { name: 'Preview muscle groups', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  const options = inspector.locator('#muscle-preview-options')
  await expect(options.getByRole('button', { name: 'Chest', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await inspector.locator('canvas').screenshot()).not.toEqual(neutral)
  await options.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(inspector).toHaveAttribute('data-highlighted-muscles', '')
  await expect(guide).toHaveAttribute('data-highlighted-muscles', '')
  await expect(options.getByText('No highlights', { exact: true })).toBeVisible()
  for (const name of ['Forearms', 'Lower back', 'Calves']) {
    await options.getByRole('button', { name, exact: true }).click()
    await expect(options.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  await expect(inspector).toHaveAttribute('data-highlighted-muscles', 'forearms,lower-back,calves')
  await expect(guide).toHaveAttribute('data-highlighted-muscles', 'forearms,lower-back,calves')
  await expect(guide.getByRole('slider', { name: 'Movement progress' })).toHaveValue('54')
  await expect(guide.getByRole('button', { name: 'Side', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(inspector.getByRole('button', { name: 'Front', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(inspector.locator('.model-inspector__stage-note')).toContainText('125%')
  await inspector
    .getByRole('group', { name: 'Inspector body model' })
    .getByRole('button', { name: 'Female', exact: true })
    .click()
  await expect(inspector).toHaveAttribute('data-model', 'female')
  await expect(guide).toHaveAttribute('data-model', 'female')
  await expect(guide).toHaveAttribute('data-highlighted-muscles', 'forearms,lower-back,calves')
  expect(
    await guideCanvas!.evaluate((canvas) => canvas === document.querySelector('.form-3d canvas')),
  ).toBe(true)
  expect(
    await inspectorCanvas!.evaluate(
      (canvas) => canvas === document.querySelector('#model-inspector canvas'),
    ),
  ).toBe(true)
  await toggle.click()
  await expect(options).toHaveCount(0)
  await expect(guide).toHaveAttribute('data-muscle-preview', 'false')
  await expect(guide.getByRole('button', { name: 'Muscle focus', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await toggle.click()
  await expect(options.getByRole('button', { name: 'Calves', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await options.getByRole('button', { name: 'Select all', exact: true }).click()
  await expect(options.getByText('12 selected', { exact: true })).toBeVisible()
  await expect(options.locator('button[aria-pressed=true]')).toHaveCount(12)
  await options.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(options.locator('button[aria-pressed=true]')).toHaveCount(0)
  // Native buttons support keyboard toggles and the expanded panel wraps on narrow phones.
  const chest = options.getByRole('button', { name: 'Chest', exact: true })
  await chest.focus()
  await page.keyboard.press('Space')
  await expect(chest).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 320, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
