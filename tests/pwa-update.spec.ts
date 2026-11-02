import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test as base, expect, type Page } from '@playwright/test'
import type { AppState } from '../src/lib/types'

const storageKey = 'form.training.v1'
const readState = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as AppState, storageKey)

interface ReleaseFixture {
  origin: string
  publish(page: Page): Promise<void>
}

// Keep the actual built app and service-worker lifecycle, but publish distinct
// worker versions on an isolated origin without rebuilding between test steps.
const test = base.extend<{ release: ReleaseFixture }>({
  release: async ({ baseURL }, use) => {
    let version = 0
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || '/', 'http://fixture.local')
        if (url.pathname.startsWith('/api/')) {
          const account = url.pathname === '/api/account'
          const admin = url.pathname === '/api/admin/access'
          response.writeHead(account || admin ? 200 : 401, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          response.end(
            JSON.stringify(
              account
                ? { user: null, providers: { google: false, magicLink: false }, realtime: false }
                : admin
                  ? { allowed: false }
                  : { error: 'Guest-only update fixture' },
            ),
          )
          return
        }
        const upstream = await fetch(new URL(url.pathname + url.search, baseURL), {
          redirect: 'manual',
        })
        const headers = Object.fromEntries(upstream.headers)
        // fetch decodes transport compression; recompute the length below.
        for (const name of [
          'content-length',
          'content-encoding',
          'transfer-encoding',
          'connection',
        ])
          delete headers[name]
        let body: Buffer
        if (url.pathname === '/sw.js') {
          const source = await upstream.text()
          const worker = source.replace(
            /const CACHE_NAME = (`[^`]+`)/,
            (_, name: string) => `const CACHE_NAME = ${name} + '-update-test-${version}'`,
          )
          if (worker === source) throw new Error('The built service-worker cache name is missing')
          body = Buffer.from(worker)
          headers['cache-control'] = 'no-store'
        } else body = Buffer.from(await upstream.arrayBuffer())
        response.writeHead(upstream.status, { ...headers, 'content-length': body.byteLength })
        response.end(body)
      } catch {
        response.writeHead(502, { 'content-type': 'text/plain' })
        response.end('The update fixture could not load the built application')
      }
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      await use({
        origin,
        async publish(page) {
          version += 1
          await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready
            await registration.update()
          })
          await expect
            .poll(
              () =>
                page.evaluate(
                  async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
                ),
              { timeout: 20_000 },
            )
            .toBe(true)
        },
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    }
  },
})

async function boot(page: Page, origin: string) {
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

async function updateAndReload(page: Page) {
  const update = page.getByRole('button', { name: 'Update app', exact: true })
  await expect(update).toBeEnabled()
  await Promise.all([page.waitForEvent('load'), update.click()])
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
  await expect(update).toHaveCount(0)
}

test('updates a saved active workout and preserves pending inputs and its rest deadline', async ({
  page,
  context,
  release,
}) => {
  await boot(page, release.origin)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }).fill('4')
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }).fill('6')
  await page.getByRole('button', { name: 'Challenging', exact: true }).click()
  const before = (await readState(page)).active!
  const timerKey = `fitt.session-ui.${before.id}`
  const restEnd = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!).restEnd as number,
    timerKey,
  )
  expect(restEnd).toBeGreaterThan(Date.now())

  await release.publish(page)
  await expect(
    page.getByText('Your workout is saved. Resume it after updating.', { exact: false }),
  ).toBeVisible()
  await updateAndReload(page)
  await page.getByRole('button', { name: 'Resume workout', exact: true }).first().click()
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('6')
  await expect(page.getByRole('button', { name: 'Challenging', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect((await readState(page)).active).toEqual(before)
  expect(
    await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).restEnd, timerKey),
  ).toBe(restEnd)
  await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Resume workout', exact: true }).first().click()
  expect((await readState(page)).active).toEqual(before)
  await expect(
    page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true }),
  ).toHaveValue('6')
})

test('explains and protects unsaved workout edits and storage failures until resolved', async ({
  page,
  release,
}) => {
  await boot(page, release.origin)
  await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log Knee push-up set 1', exact: true }).click()
  const originalReps = (await readState(page)).active!.exercises[0].sets[0].reps
  await release.publish(page)
  const update = page.getByRole('button', { name: 'Update app', exact: true })
  await expect(update).toBeEnabled()

  await page.getByRole('button', { name: 'Edit Knee push-up set 1', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Knee push-up set 1 reps', exact: true }).fill('3')
  await expect(update).toBeDisabled()
  await expect(
    page.getByText('Save or cancel your workout edits before updating.', { exact: false }),
  ).toBeVisible()
  expect((await readState(page)).active!.exercises[0].sets[0].reps).toBe(originalReps)
  await page
    .getByRole('button', { name: 'Save changes to Knee push-up set 1', exact: true })
    .click()
  await expect(update).toBeEnabled()
  expect((await readState(page)).active!.exercises[0].sets[0].reps).toBe(3)

  const pendingReps = page.getByRole('spinbutton', { name: 'Knee push-up set 2 reps', exact: true })
  await pendingReps.fill('')
  await expect(update).toBeDisabled()
  await expect(
    page.getByText('Save or cancel your workout edits before updating.', { exact: false }),
  ).toBeVisible()
  await pendingReps.fill('5')
  await expect(update).toBeEnabled()

  await page.evaluate(() => {
    const native = Storage.prototype.setItem
    ;(window as unknown as { blockWrites: boolean }).blockWrites = true
    Storage.prototype.setItem = function (key, value) {
      if (key === 'form.training.v1' && (window as unknown as { blockWrites: boolean }).blockWrites)
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return native.call(this, key, value)
    }
  })
  await pendingReps.fill('6')
  await expect(update).toBeDisabled()
  await expect(
    page.getByText('Back up your progress and resolve the storage warning before updating.', {
      exact: false,
    }),
  ).toBeVisible()
  expect((await readState(page)).active!.exercises[0].sets[1].reps).toBe(5)
  await page.evaluate(() => {
    ;(window as unknown as { blockWrites: boolean }).blockWrites = false
  })
  await pendingReps.fill('7')
  await expect(update).toBeEnabled()
  expect((await readState(page)).active!.exercises[0].sets[1].reps).toBe(7)
})

test('another tab can activate an update without reloading a dirty routine, then its stale prompt works', async ({
  page,
  context,
  release,
}) => {
  await boot(page, release.origin)
  await page.getByRole('button', { name: 'Create workout', exact: true }).click()
  await page.getByRole('textbox', { name: 'Routine name' }).fill('Keep this routine')
  await page.getByRole('button', { name: 'Add Knee push-up', exact: true }).click()
  const other = await context.newPage()
  await boot(other, release.origin)
  await release.publish(other)
  const update = page.getByRole('button', { name: 'Update app', exact: true })
  await expect(update).toBeDisabled()
  await expect(
    page.getByText('Save or leave your routine before updating.', { exact: false }),
  ).toBeVisible()
  let firstLoads = 0
  page.on('load', () => {
    firstLoads += 1
  })
  const firstDocumentStarted = await page.evaluate(() => performance.timeOrigin)
  const firstController = await page.evaluateHandle(() => navigator.serviceWorker.controller)

  await updateAndReload(other)
  await expect
    .poll(() =>
      firstController.evaluate((controller) => navigator.serviceWorker.controller !== controller),
    )
    .toBe(true)
  await firstController.dispose()
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    )
    .toBe(false)
  await expect(page.getByRole('textbox', { name: 'Routine name' })).toHaveValue('Keep this routine')
  expect(firstLoads).toBe(0)
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(firstDocumentStarted)
  await expect(update).toBeDisabled()

  await page.getByRole('button', { name: 'Save routine', exact: true }).click()
  await expect(update).toBeEnabled()
  await updateAndReload(page)
  expect(firstLoads).toBe(1)
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(firstDocumentStarted)
  await expect(
    page.getByRole('article').getByRole('heading', { name: 'Keep this routine', exact: true }),
  ).toBeVisible()
  expect((await readState(page)).routines?.map((routine) => routine.title)).toContain(
    'Keep this routine',
  )
})
