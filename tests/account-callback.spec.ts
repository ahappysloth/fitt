import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: { user: null, providers: { google: true, magicLink: true }, realtime: false },
    }),
  )
})

test('an expired link opens Settings, cleans the URL, and allows a fresh sign-in request', async ({
  page,
}, info) => {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/auth/sign-in/magic-link', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { status: true } })
  })
  await page.goto('/?theme=lime&error=INVALID_TOKEN&token=private-fixture#details')
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page.locator('.account-panel [role="alert"]')).toContainText(
    'This sign-in link expired, was already used, or is invalid.',
  )
  await expect(page).toHaveURL('http://127.0.0.1:4173/?theme=lime#details')
  await page.getByLabel('Email address').fill('athlete@example.test')
  await page.getByRole('button', { name: 'Send a sign-in link', exact: true }).click()
  await expect(page.locator('.account-success')).toContainText('Sign-in email requested.')
  await expect(page.locator('.account-panel [role="alert"]')).toHaveCount(0)
  expect(requests).toEqual([
    {
      email: 'athlete@example.test',
      callbackURL: 'http://127.0.0.1:4173/?account=return',
      newUserCallbackURL: 'http://127.0.0.1:4173/?account=return',
      errorCallbackURL: 'http://127.0.0.1:4173/?account=return',
    },
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.account-panel').screenshot({
    path: `preview/account-callback-${info.project.name}.png`,
  })
})

test('a cancelled Google callback offers sign-in again without exposing provider query text', async ({
  page,
}) => {
  await page.goto(
    '/?account=return&error=access_denied&error_description=untrusted-provider-message&code=private-fixture',
  )
  await expect(page.getByRole('heading', { name: 'Your space. Your pace.' })).toBeVisible()
  await expect(page.locator('.account-panel [role="alert"]')).toHaveText(
    'Google sign-in was cancelled. Try again whenever you’re ready.',
  )
  await expect(
    page.getByRole('button', { name: 'Continue with Google', exact: true }),
  ).toBeEnabled()
  await expect(page.getByText('untrusted-provider-message')).toHaveCount(0)
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
})
