import { expect, test, type Page } from '@playwright/test'
import { continueReviewedWorkout, openWorkoutFormGuide } from './helpers/workout'

// The CSP is report-only (src/server/security-headers.ts), so a missing
// source blocks nothing and breaks no other test. This test is what shows the
// policy already covers the app: the views below must not report a violation.
async function watchCspViolations(page: Page) {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content[- ]Security[- ]Policy|csp-violation/i.test(message.text()))
      violations.push(message.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) =>
      console.warn(`csp-violation ${event.effectiveDirective} ${event.blockedURI}`),
    )
  })
  return violations
}

test('the app, its 3D guides, and the service worker run without CSP violations', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const violations = await watchCspViolations(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const response = await page.goto('/')
  const headers = response!.headers()
  expect(headers['content-security-policy']).toBeUndefined()
  expect(headers['content-security-policy-report-only']).toContain('report-uri /api/csp-report')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')

  // The integrated 3D guide: Three.js, WebGL, and its fonts and styles.
  await page.getByRole('button', { name: 'View Knee push-up instructions', exact: true }).click()
  await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()
  await page.getByRole('button', { name: 'Play animation', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()

  // The workout page's guide.
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await continueReviewedWorkout(page)
  await openWorkoutFormGuide(page)

  // The service worker is fetched and started under the policy.
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBe(true)

  for (const path of ['/library', '/journey', '/builder', '/settings']) {
    await page.goto(path)
    await expect(page.locator('#main-content')).toBeVisible()
  }
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'View Pull-up instructions', exact: true }).click()
  await expect(page.locator('.form-3d[data-ready=true]')).toBeVisible()

  expect(errors).toEqual([])
  expect(violations).toEqual([])
})

test('other sites cannot frame the app', async ({ page, baseURL }) => {
  await page.setContent(`<iframe src="${baseURL}/" title="framed"></iframe>`)
  const frame = page.frames()[1]
  await expect.poll(() => frame.url()).not.toBe('about:blank')
  // Chromium replaces a frame refused by X-Frame-Options with its error page.
  expect(frame.url()).toMatch(/^chrome-error:/)
})
