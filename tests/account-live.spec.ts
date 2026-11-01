import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import { test, expect, type BrowserContext } from '@playwright/test'
import { inArray } from 'drizzle-orm'
import { createRequestDb } from '../src/server/db'
import { user, session } from '../src/db/auth'
import { emptyState, generateWorkout } from '../src/lib/workout'
import { STORAGE_KEY } from '../src/lib/storage'
import type { AppState, Session } from '../src/lib/types'
import type { CloudSnapshot } from '../src/lib/cloud-contract'

const origin = 'http://127.0.0.1:4173'
test.skip(
  !process.env.FITT_RUN_LIVE_DB_TESTS,
  'Enable explicitly with a migrated Fitt development database.',
)

function guestHistory(): AppState {
  const state = emptyState()
  const plan = generateWorkout(state.profile, [])
  const completed: Session = {
    ...plan,
    id: randomUUID(),
    startedAt: '2026-10-30T14:00:00.000Z',
    completedAt: '2026-10-30T14:20:00.000Z',
    createdAt: '2026-10-30T13:59:00.000Z',
    elapsedSeconds: 1200,
    exercises: plan.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, reps: set.target, done: true })),
    })),
  }
  return { ...state, history: [completed], plan: generateWorkout(state.profile, [completed]) }
}

test('real account restores imported history on another device and syncs an offline workout once', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const resource = await createRequestDb(process.env.DATABASE_URL!)
  const ids = [randomUUID(), randomUUID()]
  const token = randomBytes(32).toString('hex')
  const otherToken = randomBytes(32).toString('hex')
  const contexts: BrowserContext[] = []
  const cookie = (value: string) => ({
    name: 'better-auth.session_token',
    value: encodeURIComponent(
      `${value}.${createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(value).digest('base64')}`,
    ),
    url: origin,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  })
  try {
    await resource.db.insert(user).values(
      ids.map((id) => ({
        id,
        name: 'Fitt test member',
        email: `fitt-browser-${id}@example.invalid`,
        emailVerified: true,
      })),
    )
    await resource.db.insert(session).values(
      ids.map((userId, index) => ({
        id: randomUUID(),
        userId,
        token: index ? otherToken : token,
        expiresAt: new Date(Date.now() + 600_000),
      })),
    )
    const first = await browser.newContext({ viewport: testInfo.project.use.viewport })
    contexts.push(first)
    const guest = guestHistory()
    const page = await first.newPage()
    await page.goto(origin)
    await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible()
    await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), {
      key: STORAGE_KEY,
      state: guest,
    })
    await first.addCookies([cookie(token)])
    await page.reload()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(
      page.getByText(`fitt-browser-${ids[0]}@example.invalid`, { exact: true }).first(),
    ).toBeVisible()
    const cloud = async (context = first, id = ids[0]) => {
      const response = await context.request.get(`${origin}/api/training`, {
        headers: { 'X-Fitt-Account': id },
      })
      expect(response.status()).toBe(200)
      expect(response.headers()['cache-control']).toContain('no-store')
      return response.json() as Promise<CloudSnapshot>
    }
    expect((await cloud()).data.history).toHaveLength(0)
    await page.getByRole('button', { name: 'Import device progress' }).click()
    await page.getByRole('button', { name: 'Not now', exact: true }).click()
    expect((await cloud()).data.history).toHaveLength(0)
    await page.getByRole('button', { name: 'Import device progress' }).click()
    await page.getByRole('button', { name: 'Add to my account', exact: true }).click()
    await expect.poll(async () => (await cloud()).data.history.length).toBe(1)
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).history.length,
        STORAGE_KEY,
      ),
    ).toBe(1)

    const second = await browser.newContext({ viewport: testInfo.project.use.viewport })
    contexts.push(second)
    await second.addCookies([cookie(token)])
    const secondPage = await second.newPage()
    await secondPage.goto(origin)
    await secondPage.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(
      secondPage.getByText(`fitt-browser-${ids[0]}@example.invalid`, { exact: true }).first(),
    ).toBeVisible()
    await expect
      .poll(() =>
        secondPage.evaluate((id) => {
          const cache = localStorage.getItem(`fitt.account.${encodeURIComponent(id)}.v1`)
          return cache ? JSON.parse(cache).state.history.length : -1
        }, ids[0]),
      )
      .toBe(1)

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await first.setOffline(true)
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
    await page
      .getByRole('button', { name: /^Log .* set 1$/ })
      .first()
      .click()
    await page.getByRole('button', { name: 'Save & finish workout', exact: true }).click()
    await page.getByRole('button', { name: 'Save workout', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.locator('.account-status')).toContainText('Offline')
    await first.setOffline(false)
    await expect.poll(async () => (await cloud()).data.history.length, { timeout: 20_000 }).toBe(2)
    await secondPage.getByRole('button', { name: 'Sync now', exact: true }).click()
    await expect
      .poll(() =>
        secondPage.evaluate(
          (id) =>
            JSON.parse(localStorage.getItem(`fitt.account.${encodeURIComponent(id)}.v1`)!).state
              .history.length,
          ids[0],
        ),
      )
      .toBe(2)
    await page.reload()
    await expect.poll(async () => (await cloud()).data.history.length).toBe(2)

    const other = await browser.newContext()
    contexts.push(other)
    await other.addCookies([cookie(otherToken)])
    expect((await cloud(other, ids[1])).data.history).toHaveLength(0)
    const forbidden = await other.request.put(`${origin}/api/training`, {
      headers: { Origin: origin, 'X-Fitt-Account': ids[0] },
      data: { mutationId: randomUUID(), baseRevision: 0, data: (await cloud()).data },
    })
    expect(forbidden.status()).toBe(403)
    expect((await cloud(other, ids[1])).data.history).toHaveLength(0)
    const crossOrigin = await first.request.put(`${origin}/api/training`, {
      headers: { Origin: 'https://untrusted.example', 'X-Fitt-Account': ids[0] },
      data: { mutationId: randomUUID(), baseRevision: 0, data: (await cloud()).data },
    })
    expect(crossOrigin.status()).toBe(403)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Continue with Google', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).history.length,
        STORAGE_KEY,
      ),
    ).toBe(1)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    try {
      await resource.db.delete(user).where(inArray(user.id, ids))
    } finally {
      await resource.dispose()
    }
  }
})
