import { continueReviewedWorkout } from './helpers/workout'
import { test, expect, type Page } from '@playwright/test'
import { build } from 'esbuild'

let fixtureHTML: Promise<string> | undefined
function fixture() {
  fixtureHTML ??= build({
    entryPoints: ['tests/fixtures/ui-controls.tsx'],
    bundle: true,
    write: false,
    outdir: '/tmp/fitt-ui-control-fixture',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  }).then(({ outputFiles }) => {
    const script = outputFiles.find((file) => file.path.endsWith('.js'))!.text
    const styles = outputFiles.find((file) => file.path.endsWith('.css'))!.text
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  })
  return fixtureHTML
}

async function openFixture(page: Page) {
  await page.route('**/ui-controls-fixture', (route) =>
    fixture().then((body) => route.fulfill({ body, contentType: 'text/html' })),
  )
  await page.goto('/ui-controls-fixture')
  await expect(page.getByRole('heading', { name: 'Shared controls' })).toBeVisible()
}

test('shared controls support keyboard selection, typeahead, Escape, and Tab', async ({ page }) => {
  await openFixture(page)
  const select = page.getByRole('combobox', { name: 'Fixture duration' })
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Home')
  await expect(page.getByRole('option', { name: '20 minutes' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: '45 minutes' })).toBeFocused()
  await expect(page.getByRole('option', { name: '60 minutes' })).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(select).toHaveText('45 minutes')
  await expect(select).toBeFocused()
  await select.press('Enter')
  await page.keyboard.press('2')
  await expect(page.getByRole('option', { name: '20 minutes' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(select).toHaveText('45 minutes')
  await expect(select).toBeFocused()
  await select.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'After duration' })).toBeFocused()
  await select.focus()
  await select.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Before duration' })).toBeFocused()
})

test('shared controls keep popups inside native dialogs and dismiss only the top control', async ({
  page,
}) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Open training dialog' }).click()
  const dialog = page.getByRole('dialog', { name: 'Training controls' })
  const select = dialog.getByRole('combobox', { name: 'Dialog duration' })
  await select.click()
  const menu = dialog.getByRole('listbox')
  await expect(menu).toBeVisible()
  const bounds = await menu.boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
  await page.getByRole('option', { name: '45 minutes' }).click()
  await expect(select).toHaveText('45 minutes')
  await select.click()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(dialog).toBeVisible()
  const help = dialog.getByRole('button', { name: 'Dialog help' })
  await help.focus()
  await expect(dialog.getByRole('tooltip')).toHaveText('This stays above the dialog')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open training dialog' })).toBeFocused()
})

test('shared controls provide branded hover and focus tooltips without title attributes', async ({
  page,
}, info) => {
  await openFixture(page)
  const swap = page.getByRole('button', { name: 'Fixture swap' })
  await expect(swap).not.toHaveAttribute('title')
  if (!info.project.use.isMobile) {
    await swap.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Choose another variation')
    await page.mouse.move(0, 0, { steps: 8 })
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  }
  await swap.focus()
  await expect(page.getByRole('tooltip')).toHaveText('Choose another variation')
  await expect(swap).toHaveAttribute('aria-describedby', /.+/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(swap).toBeFocused()
  const unavailable = page.getByRole('group', { name: 'Unavailable swap' })
  await unavailable.focus()
  await expect(page.getByRole('tooltip')).toContainText('Keep your logged sets.')
  await expect(page.getByRole('button', { name: 'Unavailable swap' })).toBeDisabled()
})

test('app dropdowns save preferences and close on an outside pointer press', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const duration = page.getByRole('combobox', { name: 'Session length' })
  await duration.click()
  await page.getByRole('option', { name: '20 minutes' }).click()
  await expect(duration).toHaveText('20 minutes')
  await duration.click()
  const menu = page.getByRole('listbox')
  await expect(menu).toBeVisible()
  // Opening can scroll the taller settings page; act once the menu has settled.
  await expect
    .poll(async () => {
      const before = JSON.stringify(await menu.boundingBox())
      await page.waitForTimeout(100)
      return before === JSON.stringify(await menu.boundingBox())
    })
    .toBe(true)
  const bounds = (await menu.boundingBox())!
  const viewport = page.viewportSize()!
  const outsidePoint = [
    { x: 4, y: 4 },
    { x: viewport.width - 4, y: 4 },
    { x: 4, y: viewport.height - 4 },
    { x: viewport.width - 4, y: viewport.height - 4 },
  ].find(
    ({ x, y }) =>
      x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height,
  )
  // The open select intentionally hides the background from accessibility queries.
  expect(outsidePoint, 'A viewport point outside the dropdown should be available').toBeDefined()
  await page.mouse.click(outsidePoint!.x, outsidePoint!.y)
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.reload()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Session length' })).toHaveText('20 minutes')
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Workout duration' })).toHaveText('20 min')
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await continueReviewedWorkout(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Session length' })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Default focus' })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Weekly goal' })).toBeDisabled()
})

test('the library filter highlights and opens from its whole surface', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  const filter = page.locator('.library-muscle-filter')
  const select = page.getByRole('combobox', { name: 'Filter muscle group' })
  if (!info.project.use.isMobile) {
    const idleBackground = await filter.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await filter.hover()
    await expect
      .poll(() => filter.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(idleBackground)
  }
  const bounds = (await filter.boundingBox())!
  // The left padding and decorative icon are part of the same interactive surface.
  await filter.click({ position: { x: 8, y: bounds.height / 2 } })
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: 'Forearms', exact: true }).click()
  await expect(select).toHaveText('Forearms')
  await select.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(select).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
