import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emptyCloudData,
  parseCloudSnapshot,
  type CloudSnapshot,
  type SyncWrite,
} from '../cloud-contract'
import { STORAGE_KEY } from '../storage'
import type { AppState, Session } from '../types'
import { emptyState, generateWorkout, defaultProfile } from '../workout'
import {
  ACCOUNT_POINTER_KEY,
  accountStorageKey,
  readAccountCache,
  type KeyValueStorage,
} from './cache'
import { TrainingManager, type CloudRuntime } from './manager'
import { applyCloudData, importGuestRecords, mergeCloudData } from './merge'
import type { AccountUser } from './types'
import { authCallbackURLs, parseAuthCallback } from './callback'

const userA: AccountUser = { id: 'account-a', name: 'Alex', email: 'alex@example.test' }
const userB: AccountUser = { id: 'account-b', name: 'Morgan', email: 'morgan@example.test' }
function completed(id: string): Session {
  const workout = generateWorkout(defaultProfile, [])
  return {
    ...workout,
    id,
    createdAt: '2026-01-01T10:00:00.000Z',
    startedAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:10:00.000Z',
    elapsedSeconds: 600,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set, done: true })),
    })),
    rewardContext: { version: 1, weeklyGoal: 3, localDay: '2026-01-01' },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  failWrites = false
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('Quota exceeded')
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}
class Server {
  actor: AccountUser | null = userA
  documents = new Map<string, CloudSnapshot>()
  receipts = new Set<string>()
  writes: { userId: string; body: SyncWrite }[] = []
  commits = 0
  dropAck = false
  beforePut: (() => Promise<void>) | null = null
  afterGet: (() => Promise<void>) | null = null
  get(id: string) {
    return this.documents.get(id) ?? { revision: 0, data: emptyCloudData() }
  }
  request = async (path: string, init?: RequestInit): Promise<Response> => {
    if (path === '/api/account')
      return Response.json({
        user: this.actor,
        providers: { google: true, magicLink: true },
        realtime: false,
      })
    if (path === '/api/auth/sign-out') {
      this.actor = null
      return Response.json({ success: true })
    }
    if (path !== '/api/training') return Response.json({}, { status: 404 })
    if (init?.method === 'PUT' && this.beforePut) {
      const fn = this.beforePut
      this.beforePut = null
      await fn()
    }
    if (!this.actor) return Response.json({}, { status: 401 })
    const id = this.actor.id
    if (new Headers(init?.headers).get('X-Fitt-Account') !== id)
      return Response.json({ error: 'account_changed' }, { status: 403 })
    if (init?.method !== 'PUT') {
      const response = Response.json(this.get(id))
      if (this.afterGet) {
        const fn = this.afterGet
        this.afterGet = null
        await fn()
      }
      return response
    }
    const body = JSON.parse(String(init.body)) as SyncWrite
    this.writes.push({ userId: id, body: structuredClone(body) })
    if (this.receipts.has(`${id}:${body.mutationId}`)) return Response.json(this.get(id))
    const current = this.get(id)
    if (body.baseRevision !== current.revision) return Response.json(current, { status: 409 })
    this.documents.set(id, parseCloudSnapshot({ revision: current.revision + 1, data: body.data }))
    this.receipts.add(`${id}:${body.mutationId}`)
    this.commits += 1
    if (this.dropAck) {
      this.dropAck = false
      throw new TypeError('Network interrupted after commit')
    }
    return Response.json(this.get(id))
  }
}
const managers: TrainingManager[] = []
afterEach(() => {
  managers.forEach((manager) => manager.stop())
  managers.length = 0
  vi.useRealTimers()
})
function harness(options: { storage?: MemoryStorage; server?: Server; online?: boolean } = {}) {
  const storage = options.storage ?? new MemoryStorage()
  const server = options.server ?? new Server()
  let online = options.online ?? true
  const downloads: string[] = []
  const runtime: CloudRuntime = {
    storage: () => storage,
    request: server.request,
    online: () => online,
    origin: 'https://fitt.example.test',
    redirect: () => {},
    download: (raw) => {
      downloads.push(raw)
    },
  }
  const manager = new TrainingManager()
  managers.push(manager)
  return {
    storage,
    server,
    runtime,
    manager,
    downloads,
    setOnline: (value: boolean) => {
      online = value
    },
  }
}
const start = async (fixture: ReturnType<typeof harness>) => {
  fixture.manager.start(fixture.runtime, true)
  await fixture.manager.syncNow()
}

describe('auth callback recovery', () => {
  it('keeps expired-link feedback through session checks and clears it when a retry starts', async () => {
    const fixture = harness()
    fixture.server.actor = null
    const bodies: { path: string; body: Record<string, unknown> }[] = []
    const redirect = vi.fn()
    fixture.runtime.redirect = redirect
    fixture.runtime.request = async (path, init) => {
      if (path.startsWith('/api/auth/sign-in/')) {
        bodies.push({ path, body: JSON.parse(String(init?.body)) })
        return Response.json(
          path.endsWith('social')
            ? { url: 'https://accounts.google.com/o/oauth2/auth?state=test-state' }
            : { status: true },
        )
      }
      return fixture.server.request(path, init)
    }
    fixture.manager.start(
      fixture.runtime,
      true,
      parseAuthCallback(
        'https://fitt.example.test/?error=INVALID_TOKEN&error_description=untrusted-text&token=secret',
      ),
    )
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.returnToAccount).toBe(true)
    expect(fixture.manager.getSnapshot().account.status).toBe('guest')
    expect(fixture.manager.getSnapshot().account.error).toContain('already used')
    await fixture.manager.refreshSession()
    expect(fixture.manager.getSnapshot().account.error).toContain('already used')

    expect(await fixture.manager.requestMagicLink('alex@example.test')).toBe(true)
    expect(fixture.manager.getSnapshot().account.error).toBeNull()
    expect(fixture.manager.getSnapshot().account.message).toContain('Check your inbox')
    expect(bodies[0].body).toEqual({
      email: 'alex@example.test',
      ...authCallbackURLs(fixture.runtime.origin),
    })
    expect(await fixture.manager.signInGoogle()).toBe(true)
    expect(bodies[1].body).toEqual({
      provider: 'google',
      disableRedirect: true,
      ...authCallbackURLs(fixture.runtime.origin),
    })
    expect(redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/auth?state=test-state',
    )
  })

  it('trusts the authenticated session on success and never imports guest data from URL hints', async () => {
    const fixture = harness()
    fixture.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...emptyState(), history: [completed('guest-workout')] }),
    )
    fixture.server.documents.set(userA.id, {
      revision: 1,
      data: { ...emptyCloudData(), history: [completed('account-workout')] },
    })
    fixture.manager.start(
      fixture.runtime,
      true,
      parseAuthCallback('https://fitt.example.test/?account=return&user=account-b&import=true'),
    )
    expect(fixture.manager.getSnapshot().account.user).toBeNull()
    expect(fixture.manager.getSnapshot().account.message).toBeNull()
    await fixture.manager.syncNow()
    const { state, account } = fixture.manager.getSnapshot()
    expect(account.user?.id).toBe(userA.id)
    expect(account.message).toContain('You’re signed in')
    expect(account.returnToAccount).toBe(true)
    expect(state.history.map((item) => item.id)).toEqual(['account-workout'])
    expect(account.guestWorkoutCount).toBe(1)
    expect(fixture.server.writes).toEqual([])
    expect(fixture.storage.getItem(accountStorageKey(userB.id))).toBeNull()
  })

  it('does not treat a return marker or cached account as proof that sign-in succeeded', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.manager.setState((state) => ({
      ...state,
      history: [completed('private-account-workout')],
    }))
    fixture.manager.stop()
    fixture.server.actor = null
    const restored = harness({ storage: fixture.storage, server: fixture.server })
    restored.manager.start(
      restored.runtime,
      true,
      parseAuthCallback('https://fitt.example.test/?account=return'),
    )
    await restored.manager.syncNow()
    const { account, state } = restored.manager.getSnapshot()
    expect(account.user).toBeNull()
    expect(account.message).toBeNull()
    expect(account.error).toBe('We couldn’t confirm your sign-in. Please try again below.')
    expect(state.history).toEqual([])
    expect(readAccountCache(fixture.storage, userA.id)!.state.history).toHaveLength(1)
    expect(fixture.server.writes).toEqual([])
  })

  it('keeps sync status truthful when a failed link is opened with an existing valid session', async () => {
    const fixture = harness()
    fixture.manager.start(
      fixture.runtime,
      true,
      parseAuthCallback('https://fitt.example.test/?account=return&error=INVALID_TOKEN'),
    )
    await fixture.manager.syncNow()
    const { account } = fixture.manager.getSnapshot()
    expect(account.user?.id).toBe(userA.id)
    expect(account.status).toBe('synced')
    expect(account.error).toContain('already used')
    expect(account.message).toBeNull()
    expect(account.busy).toBe(false)
    expect(account.providers).toEqual({ google: true, magicLink: true })
    expect(fixture.server.writes).toEqual([])
  })

  it('keeps standalone previews guest-only even when opened with an auth callback URL', () => {
    const fixture = harness()
    const request = vi.fn(fixture.runtime.request)
    fixture.runtime.request = request
    fixture.manager.start(
      fixture.runtime,
      false,
      parseAuthCallback('https://fitt.example.test/?account=return'),
    )
    expect(fixture.manager.getSnapshot().account.returnToAccount).toBe(false)
    expect(fixture.manager.getSnapshot().account.status).toBe('unavailable')
    expect(fixture.manager.getSnapshot().account.message).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
})

describe('three-way training reconciliation', () => {
  it('keeps independent settings and workout additions from both devices', () => {
    const base = emptyCloudData()
    const local = {
      ...base,
      profile: { ...base.profile, weeklyGoal: 4 },
      history: [completed('local-workout')],
    }
    const remote = {
      ...base,
      preferences: { ...base.preferences, displayName: 'Alex' },
      history: [completed('remote-workout')],
    }
    const merged = mergeCloudData(base, local, remote)
    expect(merged.fields).toEqual([])
    expect(merged.data.profile.weeklyGoal).toBe(4)
    expect(merged.data.preferences.displayName).toBe('Alex')
    expect(merged.data.history.map((item) => item.id)).toEqual(['local-workout', 'remote-workout'])
  })
  it('requires an explicit choice for overlapping edits, preserving independent changes', () => {
    const base = emptyCloudData()
    const local = {
      ...base,
      profile: { ...base.profile, weeklyGoal: 4 },
      preferences: { ...base.preferences, celebration: 'calm' as const },
    }
    const remote = {
      ...base,
      profile: { ...base.profile, weeklyGoal: 5 },
      history: [completed('remote')],
    }
    expect(mergeCloudData(base, local, remote).fields).toEqual(['Weekly goal'])
    const resolved = mergeCloudData(base, local, remote, 'remote')
    expect(resolved.data.profile.weeklyGoal).toBe(5)
    expect(resolved.data.preferences.celebration).toBe('calm')
    expect(resolved.data.history).toHaveLength(1)
  })
  it('detects delete-versus-edit conflicts rather than resurrecting or losing a record silently', () => {
    const session = completed('same-workout')
    const base = { ...emptyCloudData(), history: [session] }
    const local = { ...base, history: [] }
    const remote = { ...base, history: [{ ...session, title: 'Edited elsewhere' }] }
    expect(mergeCloudData(base, local, remote).fields).toHaveLength(1)
    expect(mergeCloudData(base, local, remote, 'local').data.history).toEqual([])
    expect(mergeCloudData(base, local, remote, 'remote').data.history[0].title).toBe(
      'Edited elsewhere',
    )
  })
  it('imports records once without copying guest preferences or overwriting conflicting IDs', () => {
    const session = completed('imported')
    const guest = {
      ...emptyState(),
      history: [session],
      profile: { ...defaultProfile, weeklyGoal: 7 },
    }
    const first = importGuestRecords(emptyCloudData(), guest)
    const second = importGuestRecords(first, guest)
    expect(second.history).toHaveLength(1)
    expect(second.profile.weeklyGoal).toBe(3)
    expect(() =>
      importGuestRecords(second, { ...guest, history: [{ ...session, title: 'Different' }] }),
    ).toThrow('different versions')
  })
  it('preserves a device active workout and its plan when a remote update arrives', () => {
    const state = emptyState()
    const plan = generateWorkout(state.profile, [])
    const active = { ...plan, startedAt: plan.createdAt }
    const next = applyCloudData(
      { ...state, active, plan },
      { ...emptyCloudData(), history: [completed('elsewhere')] },
    )
    expect(next.active).toBe(active)
    expect(next.plan).toBe(plan)
  })

  it('preserves a new routine at the front and merges concurrent additions deterministically', () => {
    const a = { ...generateWorkout(defaultProfile, []), id: 'a' }
    const z = { ...generateWorkout(defaultProfile, []), id: 'z' }
    const y = { ...generateWorkout(defaultProfile, []), id: 'y' }
    const base = { ...emptyCloudData(), routines: [a] }
    const local = { ...base, routines: [z, a] }
    expect(mergeCloudData(base, local, base).data.routines.map((item) => item.id)).toEqual([
      'z',
      'a',
    ])
    expect(mergeCloudData(base, base, local).data.routines.map((item) => item.id)).toEqual([
      'z',
      'a',
    ])
    const remote = { ...base, routines: [y, a] }
    expect(mergeCloudData(base, local, remote).data.routines.map((item) => item.id)).toEqual([
      'y',
      'z',
      'a',
    ])
    expect(mergeCloudData(base, remote, local).data.routines.map((item) => item.id)).toEqual([
      'y',
      'z',
      'a',
    ])
  })
})

describe('durable account queue', () => {
  it('does not upload or overwrite device history on sign-in; explicit import is repeatable', async () => {
    const fixture = harness()
    const guest: AppState = { ...emptyState(), history: [completed('guest-workout')] }
    fixture.storage.setItem(STORAGE_KEY, JSON.stringify(guest))
    await start(fixture)
    expect(fixture.manager.getSnapshot().state.history).toEqual([])
    expect(fixture.server.writes).toEqual([])
    expect(JSON.parse(fixture.storage.getItem(STORAGE_KEY)!).history).toHaveLength(1)
    await fixture.manager.importGuestData()
    await fixture.manager.importGuestData()
    expect(fixture.server.get(userA.id).data.history).toHaveLength(1)
    expect(fixture.server.commits).toBe(1)
    expect(JSON.parse(fixture.storage.getItem(STORAGE_KEY)!).history[0].id).toBe('guest-workout')
  })
  it('replays the same immutable mutation after an ambiguous acknowledgment and reload', async () => {
    const first = harness()
    await start(first)
    first.server.dropAck = true
    first.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 4 },
    }))
    await first.manager.syncNow()
    const pending = readAccountCache(first.storage, userA.id)!.pending!
    expect(pending).not.toBeNull()
    first.manager.stop()
    const second = harness({ server: first.server, storage: first.storage })
    await start(second)
    expect(second.server.writes.map((write) => write.body.mutationId)).toEqual([
      pending.mutationId,
      pending.mutationId,
    ])
    expect(second.server.commits).toBe(1)
    expect(second.manager.getSnapshot().account.pendingCount).toBe(0)
    expect(second.manager.getSnapshot().state.profile.weeklyGoal).toBe(4)
  })
  it('retains local edits made during a request and commits them under a new mutation ID', async () => {
    const fixture = harness()
    await start(fixture)
    const entered = deferred<void>()
    const release = deferred<void>()
    fixture.server.beforePut = async () => {
      entered.resolve()
      await release.promise
    }
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 4 },
    }))
    const syncing = fixture.manager.syncNow()
    await entered.promise
    fixture.manager.setState((previous) => ({
      ...previous,
      preferences: { ...previous.preferences!, celebration: 'calm' },
    }))
    release.resolve()
    await syncing
    expect(fixture.server.get(userA.id).data.preferences.celebration).toBe('calm')
    expect(fixture.server.get(userA.id).data.profile.weeklyGoal).toBe(4)
    expect(new Set(fixture.server.writes.map((write) => write.body.mutationId)).size).toBe(2)
    expect(fixture.manager.getSnapshot().account.pendingCount).toBe(0)
  })

  it('rebases a replay acknowledgment that contains a later device revision without rolling it back', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.server.dropAck = true
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 4 },
    }))
    await fixture.manager.syncNow()
    const pendingId = readAccountCache(fixture.storage, userA.id)!.pending!.mutationId
    const committed = fixture.server.get(userA.id)
    fixture.server.documents.set(userA.id, {
      revision: committed.revision + 1,
      data: {
        ...committed.data,
        history: [completed('other-device')],
        preferences: { ...committed.data.preferences, celebration: 'calm' },
      },
    })
    fixture.manager.setState((previous) => ({
      ...previous,
      preferences: { ...previous.preferences!, displayName: 'Alex' },
    }))
    await fixture.manager.syncNow()
    const current = fixture.server.get(userA.id)
    expect(current.revision).toBe(3)
    expect(current.data.history.map((item) => item.id)).toEqual(['other-device'])
    expect(current.data.preferences).toMatchObject({ displayName: 'Alex', celebration: 'calm' })
    expect(current.data.profile.weeklyGoal).toBe(4)
    expect(fixture.server.writes.slice(0, 2).map((write) => write.body.mutationId)).toEqual([
      pendingId,
      pendingId,
    ])
    expect(fixture.server.writes[2].body.mutationId).not.toBe(pendingId)
  })
  it('keeps account A outbox separate when the cookie changes to account B before PUT', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.server.beforePut = async () => {
      fixture.server.actor = userB
    }
    fixture.manager.setState((previous) => ({
      ...previous,
      history: [completed('account-a-private')],
    }))
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.status).toBe('expired')
    expect(fixture.server.get(userB.id).data.history).toEqual([])
    expect(readAccountCache(fixture.storage, userA.id)!.pending).not.toBeNull()
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.user?.id).toBe(userB.id)
    expect(fixture.manager.getSnapshot().state.history).toEqual([])
    expect(fixture.server.get(userB.id).data.history).toEqual([])
    expect(readAccountCache(fixture.storage, userA.id)!.state.history[0].id).toBe(
      'account-a-private',
    )
  })
  it('refuses uploads if durable storage fails, then recovers on a successful save', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.storage.failWrites = true
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 4 },
    }))
    await fixture.manager.syncNow()
    expect(fixture.server.writes).toEqual([])
    expect(fixture.manager.getSnapshot().storageError).toContain('could not save')
    fixture.storage.failWrites = false
    await fixture.manager.syncNow()
    expect(fixture.server.get(userA.id).data.profile.weeklyGoal).toBe(4)
    expect(fixture.manager.getSnapshot().storageError).toBeNull()
  })
  it('preserves offline account edits across reload and syncs them after reauthentication', async () => {
    const first = harness()
    await start(first)
    first.setOnline(false)
    first.manager.setState((previous) => ({ ...previous, history: [completed('offline')] }))
    first.manager.stop()
    const next = harness({ server: first.server, storage: first.storage, online: false })
    next.manager.start(next.runtime, true)
    expect(next.manager.getSnapshot().account.user?.id).toBe(userA.id)
    expect(next.manager.getSnapshot().state.history[0].id).toBe('offline')
    expect(next.manager.getSnapshot().account.status).toBe('offline')
    next.setOnline(true)
    await next.manager.syncNow()
    expect(next.server.get(userA.id).data.history[0].id).toBe('offline')
  })
  it('blocks sign-out and account switching while a workout is active', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.manager.setState((previous) => ({
      ...previous,
      active: { ...previous.plan!, startedAt: previous.plan!.createdAt },
    }))
    await fixture.manager.signOut({ keepPending: true })
    expect(fixture.manager.getSnapshot().account.error).toContain('Finish or discard')
    fixture.server.actor = userB
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.user?.id).toBe(userA.id)
    expect(fixture.manager.getSnapshot().state.active).not.toBeNull()
    expect(fixture.server.get(userB.id).data.history).toEqual([])
  })
  it('requires confirmation to retain unsynced work when signing out', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 5 },
    }))
    await fixture.manager.signOut()
    expect(fixture.manager.getSnapshot().account.user?.id).toBe(userA.id)
    expect(fixture.manager.getSnapshot().account.error).toContain('changes saved only')
    await fixture.manager.signOut({ keepPending: true })
    expect(fixture.manager.getSnapshot().account.user).toBeNull()
    expect(fixture.storage.getItem(ACCOUNT_POINTER_KEY)).toBeNull()
    expect(readAccountCache(fixture.storage, userA.id)!.state.profile.weeklyGoal).toBe(5)
  })
  it('pauses sync on an external cache change without overwriting it', async () => {
    const fixture = harness()
    await start(fixture)
    const key = accountStorageKey(userA.id)
    const other = readAccountCache(fixture.storage, userA.id)!
    other.state.profile.weeklyGoal = 6
    fixture.storage.setItem(key, JSON.stringify(other))
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 4 },
    }))
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().blocked).toBe(true)
    expect(readAccountCache(fixture.storage, userA.id)!.state.profile.weeklyGoal).toBe(6)
    expect(fixture.server.writes).toEqual([])
  })
  it('rejects old responses after an account change/unmount without cross-account persistence', async () => {
    const first = harness()
    await start(first)
    const entered = deferred<void>()
    const release = deferred<void>()
    first.server.afterGet = async () => {
      entered.resolve()
      await release.promise
    }
    const stale = first.manager.syncNow()
    await entered.promise
    first.manager.stop()
    first.server.actor = userB
    first.manager.start(first.runtime, true)
    await first.manager.syncNow()
    release.resolve()
    await stale
    expect(first.manager.getSnapshot().account.user?.id).toBe(userB.id)
    expect(first.manager.getSnapshot().state.history).toEqual([])
  })
  it('makes no account requests in a standalone preview', async () => {
    const fixture = harness()
    fixture.runtime.request = async () => {
      throw new Error('Network must not be used')
    }
    fixture.manager.start(fixture.runtime, false)
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.status).toBe('unavailable')
    expect(fixture.manager.getSnapshot().ready).toBe(true)
  })

  it('restores the account and active workout when onLine is true but internet requests fail', async () => {
    const first = harness()
    await start(first)
    first.manager.setState((previous) => ({
      ...previous,
      active: { ...previous.plan!, startedAt: previous.plan!.createdAt },
    }))
    const activeId = first.manager.getSnapshot().state.active!.id
    first.manager.stop()
    const restored = harness({ storage: first.storage, server: first.server })
    restored.runtime.request = async () => {
      throw new TypeError('Network unavailable')
    }
    await start(restored)
    expect(restored.manager.getSnapshot().account.user?.id).toBe(userA.id)
    expect(restored.manager.getSnapshot().state.active?.id).toBe(activeId)
    expect(restored.manager.getSnapshot().account.status).toBe('error')
    expect(restored.manager.getSnapshot().account.error).toContain('couldn’t reach')
  })

  it('does not restore cached private training after a successful signed-out response', async () => {
    const first = harness()
    await start(first)
    first.manager.setState((previous) => ({ ...previous, history: [completed('private')] }))
    first.manager.stop()
    first.server.actor = null
    const restored = harness({ storage: first.storage, server: first.server })
    await start(restored)
    expect(restored.manager.getSnapshot().account.user).toBeNull()
    expect(restored.manager.getSnapshot().state.history).toEqual([])
  })

  it('bounds a stalled response body and clears busy without marking the account synced', async () => {
    const fixture = harness()
    await start(fixture)
    vi.useFakeTimers()
    let cancelled = false
    fixture.runtime.request = async (path, init) =>
      path === '/api/training'
        ? new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{'))
              },
              cancel() {
                cancelled = true
              },
            }),
          )
        : fixture.server.request(path, init)
    const syncing = fixture.manager.syncNow()
    await vi.advanceTimersByTimeAsync(15_001)
    await syncing
    expect(cancelled).toBe(true)
    expect(fixture.manager.getSnapshot().account.busy).toBe(false)
    expect(fixture.manager.getSnapshot().account.status).toBe('error')
    expect(fixture.manager.getSnapshot().account.error).toContain('interrupted')
  })

  it('adopts idle sibling metadata without pausing either tab', async () => {
    const fixture = harness()
    await start(fixture)
    const key = accountStorageKey(userA.id)
    const other = readAccountCache(fixture.storage, userA.id)!
    other.lastSyncedAt = '2026-11-01T10:00:00.000Z'
    fixture.storage.setItem(key, JSON.stringify(other))
    fixture.manager.storageChanged(key)
    expect(fixture.manager.getSnapshot().blocked).toBe(false)
    expect(fixture.manager.getSnapshot().account.lastSyncedAt).toBe(other.lastSyncedAt)
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.status).toBe('synced')
  })

  it('respects Retry-After and preserves the pending mutation until a later retry', async () => {
    const fixture = harness()
    await start(fixture)
    vi.useFakeTimers()
    const request = fixture.runtime.request
    let attempts = 0
    fixture.runtime.request = async (path, init) => {
      if (init?.method === 'PUT' && attempts++ === 0)
        return Response.json({}, { status: 429, headers: { 'Retry-After': '60' } })
      return request(path, init)
    }
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 6 },
    }))
    await fixture.manager.syncNow()
    const pendingId = readAccountCache(fixture.storage, userA.id)!.pending!.mutationId
    await fixture.manager.syncNow()
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(60_001)
    await fixture.manager.syncNow()
    expect(fixture.server.writes[0].body.mutationId).toBe(pendingId)
    expect(fixture.server.get(userA.id).data.profile.weeklyGoal).toBe(6)
  })

  it('keeps the rate-limit retry when the user edits during the pause', async () => {
    const fixture = harness()
    await start(fixture)
    vi.useFakeTimers()
    const request = fixture.runtime.request
    let attempts = 0
    fixture.runtime.request = async (path, init) => {
      if (init?.method === 'PUT' && attempts++ === 0)
        return Response.json({}, { status: 429, headers: { 'Retry-After': '60' } })
      return request(path, init)
    }
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 6 },
    }))
    await fixture.manager.syncNow()
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 5 },
    }))
    await vi.advanceTimersByTimeAsync(61_000)
    expect(fixture.server.get(userA.id).data.profile.weeklyGoal).toBe(5)
  })
  it('stops retrying a write the server refuses until the next change or manual sync', async () => {
    const fixture = harness()
    await start(fixture)
    const request = fixture.runtime.request
    let refused = 0
    fixture.runtime.request = async (path, init) => {
      if (init?.method === 'PUT' && refused < 1) {
        refused += 1
        return Response.json({ error: 'invalid' }, { status: 400 })
      }
      return request(path, init)
    }
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 6 },
    }))
    await fixture.manager.syncNow()
    expect(fixture.manager.getSnapshot().account.error).toContain('couldn’t accept')
    expect(readAccountCache(fixture.storage, userA.id)!.pending).toBeNull()
    await fixture.manager.syncNow()
    expect(fixture.server.writes).toHaveLength(0)
    await fixture.manager.getSnapshot().account.syncNow()
    expect(fixture.server.get(userA.id).data.profile.weeklyGoal).toBe(6)
  })
  it('stores one copy of the history when the baseline and outbox match it', async () => {
    const fixture = harness()
    await start(fixture)
    fixture.manager.setState((previous) => ({
      ...previous,
      history: [completed('compact-1')],
    }))
    await fixture.manager.syncNow()
    const raw = fixture.storage.getItem(accountStorageKey(userA.id))!
    expect(raw.split('compact-1').length - 1).toBe(1)
    const cache = readAccountCache(fixture.storage, userA.id)!
    expect(cache.baseline!.data.history[0].id).toBe('compact-1')
  })
  it('reports an account outage as retryable instead of unavailable', async () => {
    const fixture = harness()
    fixture.runtime.request = async () => Response.json({}, { status: 503 })
    await start(fixture)
    const account = fixture.manager.getSnapshot().account
    expect(account.status).not.toBe('unavailable')
    expect(account.error).toContain('temporarily unavailable')
  })

  it('counts local edits before the first account snapshot as pending and prevents destructive sign-out', async () => {
    const fixture = harness()
    fixture.runtime.request = async (path, init) =>
      path === '/api/training'
        ? Response.json({}, { status: 500 })
        : fixture.server.request(path, init)
    await start(fixture)
    fixture.manager.setState((previous) => ({
      ...previous,
      profile: { ...previous.profile, weeklyGoal: 5 },
    }))
    expect(fixture.manager.getSnapshot().account.pendingCount).toBe(1)
    expect(await fixture.manager.signOut()).toBe(false)
    expect(fixture.manager.getSnapshot().account.user?.id).toBe(userA.id)
    expect(readAccountCache(fixture.storage, userA.id)!.state.profile.weeklyGoal).toBe(5)
  })

  it('reconnects realtime through a fresh identity check when a proxy loses the close frame', async () => {
    const fixture = harness()
    vi.useFakeTimers()
    const sockets: { close: ReturnType<typeof vi.fn>; onopen: (() => void) | null }[] = []
    fixture.runtime.request = async (path, init) =>
      path === '/api/account'
        ? Response.json({
            user: fixture.server.actor,
            providers: { google: true, magicLink: true },
            realtime: true,
          })
        : fixture.server.request(path, init)
    fixture.runtime.socket = () => {
      const socket = { close: vi.fn(), onopen: null }
      sockets.push(socket)
      return socket as unknown as WebSocket
    }
    await start(fixture)
    expect(sockets).toHaveLength(1)
    sockets[0].onopen!()
    await vi.advanceTimersByTimeAsync(55_001)
    await fixture.manager.syncNow()
    expect(sockets[0].close).toHaveBeenCalledOnce()
    expect(sockets).toHaveLength(2)
  })

  it('keeps unsupported local text exportable and pauses sync instead of breaking render', async () => {
    const fixture = harness()
    await start(fixture)
    expect(() =>
      fixture.manager.setState((previous) => ({
        ...previous,
        preferences: { ...previous.preferences!, displayName: 'Alex\u0000' },
      })),
    ).not.toThrow()
    expect(fixture.manager.getSnapshot().account.status).toBe('error')
    expect(fixture.manager.getSnapshot().account.error).toContain('unsupported text')
    expect(fixture.manager.getSnapshot().account.pendingCount).toBe(1)
    await fixture.manager.syncNow()
    expect(fixture.server.writes).toEqual([])
    fixture.manager.exportConflictBackup()
    expect(JSON.parse(fixture.downloads[0]).preferences.displayName).toBe('Alex\u0000')
    fixture.manager.setState((previous) => ({
      ...previous,
      preferences: { ...previous.preferences!, displayName: 'Alex' },
    }))
    await fixture.manager.syncNow()
    expect(fixture.server.get(userA.id).data.preferences.displayName).toBe('Alex')
    expect(fixture.manager.getSnapshot().account.status).toBe('synced')
  })
})
