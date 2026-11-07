import { continueReviewedWorkout } from './helpers/workout'
import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import { test, expect, type BrowserContext } from '@playwright/test'
import { inArray } from 'drizzle-orm'
import { createRequestDb } from '../src/server/db'
import { user, session } from '../src/db/auth'
import { emptyState, generateWorkout } from '../src/lib/workout'
import { STORAGE_KEY } from '../src/lib/storage'
import type { AppState, Session } from '../src/lib/types'
import type { CloudSnapshot } from '../src/lib/cloud-contract'

const origin = process.env.FITT_LIVE_TEST_ORIGIN
  ? new URL(process.env.FITT_LIVE_TEST_ORIGIN).origin
  : 'http://127.0.0.1:4173'
const secureOrigin = origin.startsWith('https:')
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
  const createContext = async () => {
    const context = await browser.newContext({
      viewport: testInfo.project.use.viewport,
      proxy: testInfo.project.use.proxy,
    })
    contexts.push(context)
    return context
  }
  const cookie = (value: string) => ({
    name: `${secureOrigin ? '__Secure-' : ''}better-auth.session_token`,
    value: encodeURIComponent(
      `${value}.${createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(value).digest('base64')}`,
    ),
    url: origin,
    httpOnly: true,
    secure: secureOrigin,
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
    const first = await createContext()
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
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
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

    const second = await createContext()
    await second.addCookies([cookie(token)])
    const secondPage = await second.newPage()
    const realtimeRevisions: number[] = []
    secondPage.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== '/api/realtime') return
      socket.on('framereceived', ({ payload }) => {
        try {
          const message = JSON.parse(String(payload)) as { type?: unknown; revision?: unknown }
          if (message.type === 'revision' && Number.isSafeInteger(message.revision)) {
            realtimeRevisions.push(message.revision as number)
          }
        } catch {
          // Unrelated/malformed frames cannot satisfy the expected revision.
        }
      })
    })
    await secondPage.goto(origin)
    await secondPage.getByRole('link', { name: 'Settings', exact: true }).click()
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
    const importedRevision = (await cloud()).revision
    await expect
      .poll(() => realtimeRevisions.includes(importedRevision), { timeout: 20_000 })
      .toBe(true)

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await first.setOffline(true)
    await page.getByRole('link', { name: 'Today', exact: true }).click()
    await page.getByRole('button', { name: 'Start my workout', exact: true }).click()
    await continueReviewedWorkout(page)
    await page
      .getByRole('button', { name: /^Log .* set 1$/ })
      .first()
      .click()
    await page.getByRole('button', { name: 'Save & finish workout', exact: true }).click()
    await page.getByRole('button', { name: 'Save workout', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Look at you go.' })).toBeVisible()
    await page.reload()
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.locator('.account-status')).toContainText('Offline')
    await first.setOffline(false)
    await expect.poll(async () => (await cloud()).data.history.length, { timeout: 20_000 }).toBe(2)
    const syncedRevision = (await cloud()).revision
    await expect
      .poll(() => realtimeRevisions.includes(syncedRevision), { timeout: 20_000 })
      .toBe(true)
    await expect
      .poll(
        () =>
          secondPage.evaluate(
            (id) =>
              JSON.parse(localStorage.getItem(`fitt.account.${encodeURIComponent(id)}.v1`)!).state
                .history.length,
            ids[0],
          ),
        { timeout: 20_000 },
      )
      .toBe(2)
    await page.reload()
    await expect.poll(async () => (await cloud()).data.history.length).toBe(2)

    const other = await createContext()
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

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
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
    try {
      await Promise.all(contexts.map((context) => context.close()))
    } finally {
      try {
        await resource.db.delete(user).where(inArray(user.id, ids))
      } finally {
        await resource.dispose()
      }
    }
  }
})
