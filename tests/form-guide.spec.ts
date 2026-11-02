import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mountSandboxedPreview, openPreviewHost } from './helpers/embedded-preview'

const study = () => readFile('preview/fitt-form-studio.html', 'utf8')
async function openStudy(page: Page) {
  const html = await study()
  await page.route('**/form-study', (route) =>
    route.fulfill({ body: html, contentType: 'text/html' }),
  )
  await page.goto('/form-study')
}

test('3D form study supports deliberate playback, scrubbing, cameras, and muscle focus', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openStudy(page)
  const guide = page.locator('.form-3d[data-ready=true]')
  await expect(guide).toBeVisible()
  const progress = page.getByRole('slider', { name: 'Movement progress' })
  await expect(progress).toHaveValue('0')
  await expect(guide).toHaveAttribute('data-model', 'male')
  await guide.getByRole('button', { name: 'Play animation', exact: true }).click()
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(3)
  await guide.getByRole('button', { name: 'Pause animation', exact: true }).click()
  const paused = await progress.inputValue()
  await page.waitForTimeout(200)
  await expect(progress).toHaveValue(paused)
  await guide.getByRole('button', { name: 'Playback speed 1x' }).click()
  await expect(guide.getByRole('button', { name: 'Playback speed 0.5x' })).toBeVisible()
  await guide.getByRole('button', { name: 'Lower & pause', exact: true }).click()
  await expect(progress).toHaveValue('54')
  await expect(page.locator('.form-3d__phase strong')).toHaveText('Pause')
  await guide.getByRole('button', { name: 'Side', exact: true }).click()
  const side = await guide.locator('canvas').screenshot()
  const canvas = await guide.locator('canvas').elementHandle()
  const models = page.getByRole('group', { name: 'Body model', exact: true })
  await models.getByRole('button', { name: 'Female', exact: true }).click()
  await expect(guide).toHaveAttribute('data-model', 'female')
  await expect(progress).toHaveValue('54')
  await expect(guide.getByRole('button', { name: 'Side', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await guide.locator('canvas').screenshot()).not.toEqual(side)
  expect(await canvas!.evaluate((element) => element === document.querySelector('canvas'))).toBe(
    true,
  )
  await models.getByRole('button', { name: 'Male', exact: true }).click()
  await guide.getByRole('button', { name: 'Front', exact: true }).click()
  expect(await guide.locator('canvas').screenshot()).not.toEqual(side)
  await guide.getByRole('button', { name: 'Rotate model right' }).click()
  await expect(guide.getByRole('button', { name: 'Front', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await guide.locator('canvas').focus()
  await page.keyboard.press('Home')
  await expect(guide.getByRole('button', { name: '3/4 view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await guide.getByRole('button', { name: 'Body line', exact: true }).click()
  await expect(guide.getByRole('button', { name: 'Body line', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await guide.getByRole('button', { name: 'Chest', exact: true }).click()
  await expect(guide.getByRole('button', { name: 'Chest', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await guide.getByRole('button', { name: 'All', exact: true }).click()
  await guide.getByRole('button', { name: 'Body line', exact: true }).click()
  await guide.getByRole('button', { name: 'Restart animation' }).click()
  await expect(progress).toHaveValue('0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `preview/form-studio/${info.project.name}.png`, fullPage: true })
  await page.setViewportSize({ width: 320, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('the timeline advances on every animation frame and seeking pauses immediately', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') })
  await openStudy(page)
  const guide = page.locator('.form-3d[data-ready=true]')
  await expect(guide).toBeVisible()
  await guide.scrollIntoViewIfNeeded()
  await page.clock.pauseAt(new Date('2026-11-01T12:01:00Z'))
  const progress = guide.getByRole('slider', { name: 'Movement progress' })
  // Use discrete clock frames to detect stale progress even on a slow CI GPU.
  await guide
    .getByRole('button', { name: 'Play animation', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  await page.clock.runFor(32)
  let previous = Number(await progress.inputValue())
  for (let frame = 0; frame < 12; frame++) {
    await page.clock.runFor(16)
    const current = Number(await progress.inputValue())
    expect(current).toBeGreaterThan(previous)
    expect(current - previous).toBeLessThan(0.4)
    const fill = await progress.evaluate((input) =>
      parseFloat(input.style.getPropertyValue('--form-progress')),
    )
    expect(Math.abs(fill - current)).toBeLessThan(0.11)
    previous = current
  }
  await progress.evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '62.5')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.clock.runFor(32)
  await expect(progress).toHaveValue('62.5')
  await expect(guide.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible()
  await page.clock.runFor(240)
  await expect(progress).toHaveValue('62.5')
  await expect(progress).toHaveAttribute('aria-valuetext', /Press, 63 percent/)
})

test('the standing inspector supports closeups, free camera movement, and both models', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openStudy(page)
  const inspector = page.locator('#model-inspector')
  await expect(inspector.locator('canvas')).toHaveCount(0)
  await inspector.scrollIntoViewIfNeeded()
  await expect(inspector).toHaveAttribute('data-ready', 'true')
  const canvas = inspector.locator('canvas')
  const element = await canvas.elementHandle()
  const body = await canvas.screenshot()
  await inspector.getByRole('button', { name: 'Head', exact: true }).click()
  await expect(inspector.locator('.model-inspector__stage-note')).toContainText('450%')
  const head = await canvas.screenshot()
  expect(head).not.toEqual(body)
  await inspector.getByRole('button', { name: 'Zoom in on standing model' }).click()
  await expect(inspector.locator('.model-inspector__stage-note')).toContainText('563%')
  await inspector.getByRole('button', { name: 'Move inspector camera up' }).click()
  expect(await canvas.screenshot()).not.toEqual(head)
  await inspector.getByRole('button', { name: 'Reset inspector camera' }).click()
  await inspector
    .getByRole('group', { name: 'Inspector body model' })
    .getByRole('button', { name: 'Female', exact: true })
    .click()
  await expect(inspector).toHaveAttribute('data-model', 'female')
  await expect(page.locator('.form-3d')).toHaveAttribute('data-model', 'female')
  expect(
    await element!.evaluate((node) => node === document.querySelector('#model-inspector canvas')),
  ).toBe(true)
  await inspector.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(inspector.getByRole('button', { name: 'Back', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await canvas.focus()
  await page.keyboard.press('Shift+ArrowUp')
  await expect(inspector.getByRole('button', { name: 'Back', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.keyboard.press('Home')
  await expect(inspector.locator('.model-inspector__stage-note')).toContainText('100%')
  await inspector.screenshot({ path: `preview/form-studio/inspector-${info.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Context loss tears down the extra viewer while retaining a useful fallback.
  await canvas.evaluate((node) =>
    node.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
  )
  await expect(inspector.locator('canvas')).toHaveCount(0)
  await expect(inspector.getByText(/3D isn’t available in this browser/)).toBeVisible()
  expect(errors).toEqual([])
})

test('body model choice persists across guides, settings, and reloads without changing the workout', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  const guide = page.locator('.form-3d[data-ready=true]')
  await expect(guide).toHaveAttribute('data-model', 'male')
  const savedTraining = () =>
    page.evaluate(() => {
      const { active, history, profile, plan, routines } = JSON.parse(
        localStorage.getItem('form.training.v1')!,
      )
      return { active, history, profile, plan, routines }
    })
  const before = await savedTraining()
  await page
    .getByRole('group', { name: 'Body model', exact: true })
    .getByRole('button', { name: 'Female', exact: true })
    .click()
  await expect(guide).toHaveAttribute('data-model', 'female')
  expect(await savedTraining()).toEqual(before)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Female model/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.reload()
  await page.getByRole('button', { name: 'Resume workout', exact: true }).first().click()
  await expect(guide).toHaveAttribute('data-model', 'female')
  expect(await savedTraining()).toEqual(before)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Male model/ }).click()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page.getByRole('button', { name: 'View Knee push-up instructions', exact: true }).click()
  await expect(guide).toHaveAttribute('data-model', 'male')
  expect(await savedTraining()).toEqual(before)
})

test('opening and closing the integrated Knee Push-up guide releases its canvas', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'View Knee push-up instructions', exact: true }).click()
    await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()
    await page.getByRole('button', { name: 'Play animation', exact: true }).click()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.locator('canvas')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  expect(errors).toEqual([])
})

test('failed 3D initialization cleans up and leaves useful instructions', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    const tally = { lost: 0, created: 0 }
    ;(window as unknown as { guideCleanup: typeof tally }).guideCleanup = tally
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      const context = original.apply(this, args)
      if (args[0] === 'webgl2' && context) {
        tally.created++
        const extension = (context as WebGL2RenderingContext).getExtension('WEBGL_lose_context')
        if (extension) {
          const lose = extension.loseContext.bind(extension)
          extension.loseContext = () => {
            tally.lost++
            lose()
          }
        }
      }
      return context
    } as typeof original
    window.ResizeObserver = class {
      constructor() {
        throw new Error('Simulated initialization failure after WebGL allocation')
      }
    } as unknown as typeof ResizeObserver
  })
  await openStudy(page)
  await expect(
    page.getByText('3D isn’t available in this browser. You can still follow the form guide.'),
  ).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.form-3d-static li')).toHaveCount(3)
  const cleanup = await page.evaluate(
    () => (window as unknown as { guideCleanup: { lost: number; created: number } }).guideCleanup,
  )
  expect(cleanup.created).toBeGreaterThanOrEqual(1)
  expect(cleanup.lost).toBe(cleanup.created)
})

test('the 3D study works offline inside an opaque embedded preview', async ({ page, context }) => {
  await openPreviewHost(page)
  const requests: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url())
  })
  await context.setOffline(true)
  const frame = await mountSandboxedPreview(page, await study(), 'Fitt study')
  await expect(frame.locator('.form-3d[data-ready=true]')).toBeVisible()
  await frame
    .getByRole('group', { name: 'Body model', exact: true })
    .getByRole('button', { name: 'Female', exact: true })
    .click()
  await expect(frame.locator('.form-3d')).toHaveAttribute('data-model', 'female')
  await frame.getByRole('button', { name: 'Lower & pause', exact: true }).click()
  await expect(frame.getByRole('slider', { name: 'Movement progress' })).toHaveValue('54')
  await frame.locator('.form-3d').getByRole('button', { name: 'Side', exact: true }).click()
  await expect(
    frame.locator('.form-3d').getByRole('button', { name: 'Side', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(requests).toEqual([])
})
