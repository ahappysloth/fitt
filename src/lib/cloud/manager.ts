import type { Dispatch, SetStateAction } from 'react'
import {
  emptyCloudData,
  parseCloudSnapshot,
  toCloudData,
  type CloudSnapshot,
} from '../cloud-contract'
import { parseBackup, STORAGE_KEY } from '../storage'
import type { AppState } from '../types'
import { emptyState, generateWorkout, uid } from '../workout'
import {
  ACCOUNT_POINTER_KEY,
  accountStorageKey,
  parseAccountUser,
  readAccountCache,
  type AccountCache,
  type KeyValueStorage,
} from './cache'
import { applyCloudData, importGuestRecords, mergeCloudData, sameValue } from './merge'
import { authCallbackURLs, type AuthCallback } from './callback'
import type { AccountController, AccountResponse, AccountStatus, AccountUser } from './types'

export interface CloudRuntime {
  storage(): KeyValueStorage
  request(path: string, init?: RequestInit): Promise<Response>
  online(): boolean
  origin: string
  redirect(url: string): void
  download(raw: string, filename: string): void
  socket?(url: string): WebSocket
}
export interface TrainingSnapshot {
  state: AppState
  ready: boolean
  blocked: boolean
  storageError: string | null
  recoveryRaw: string | null
  account: AccountController
}
const CROSS_TAB_ERROR =
  'Another tab changed your training data. Saving is paused. Export this session if needed, then reload to use the latest data.'
const STORAGE_ERROR =
  'Your browser could not save this update. Export a backup now to keep your workouts. Cloud sync is paused until this device can save safely.'
const withPlan = (state: AppState): AppState => ({
  ...state,
  plan: state.plan || generateWorkout(state.profile, state.history),
})
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Owns local durability and account-bound network work outside React's render cycle. */
export class TrainingManager {
  private runtime: CloudRuntime | null = null
  private state = emptyState()
  private cache: AccountCache | null = null
  private ready = false
  private blocked = false
  private storageError: string | null = null
  private recoveryRaw: string | null = null
  private lastRaw: string | null = null
  private durable = true
  private authenticated = false
  private authExpired = false
  private available = true
  private providers = { google: false, magicLink: false }
  private realtime = false
  private status: AccountStatus = 'checking'
  private error: string | null = null
  private validationError: string | null = null
  private message: string | null = null
  private callbackError: string | null = null
  private callbackPending = false
  private returnToAccount = false
  private operation = false
  private syncing = false
  private epoch = 0
  private listeners = new Set<() => void>()
  private controllers = new Set<AbortController>()
  private identityPromise: Promise<boolean> | null = null
  private syncPromise: Promise<void> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private socketRetry: ReturnType<typeof setTimeout> | null = null
  private socketWatchdog: ReturnType<typeof setTimeout> | null = null
  private connection: WebSocket | null = null
  private socketAttempts = 0
  private retryAt = 0
  private enabled = false
  private snapshot: TrainingSnapshot

  constructor() {
    this.snapshot = this.makeSnapshot()
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  private pendingCount() {
    if (!this.cache) return 0
    try {
      if (this.cache.pending)
        return 1 + (sameValue(this.cache.pending.data, toCloudData(this.state)) ? 0 : 1)
      return !sameValue(this.cache.baseline?.data ?? emptyCloudData(), toCloudData(this.state))
        ? 1
        : 0
    } catch {
      return 1
    }
  }
  private validateSharedState() {
    this.validationError = null
    if (!this.cache) return
    try {
      toCloudData(this.state)
    } catch {
      this.validationError =
        'Some training data cannot be synced. Remove unsupported text characters or reduce the backup size. Export a device backup before making changes; cloud sync is paused.'
    }
  }
  private guestRecords() {
    try {
      const raw = this.runtime?.storage().getItem(STORAGE_KEY)
      const guest = raw ? parseBackup(raw) : emptyState()
      return { guest, workouts: guest.history.length, routines: guest.routines?.length ?? 0 }
    } catch {
      return { guest: null, workouts: 0, routines: 0 }
    }
  }
  private makeSnapshot(): TrainingSnapshot {
    const guest = this.guestRecords()
    const account: AccountController = {
      user: this.cache?.user ?? null,
      providers: this.providers,
      status: this.status,
      busy:
        this.operation || this.syncing || this.status === 'checking' || this.status === 'loading',
      online: this.runtime?.online() ?? true,
      error: this.validationError ?? this.error ?? this.callbackError,
      message: this.message,
      pendingCount: this.pendingCount(),
      lastSyncedAt: this.cache?.lastSyncedAt ?? null,
      guestWorkoutCount: guest.workouts,
      guestRoutineCount: guest.routines,
      canImport:
        !!this.cache?.baseline &&
        this.authenticated &&
        !!this.runtime?.online() &&
        !this.cache.conflict &&
        !!guest.guest &&
        !this.blocked &&
        this.durable &&
        !this.state.active &&
        guest.workouts + guest.routines > 0,
      conflict: this.cache?.conflict ? { fields: this.cache.conflict.fields } : null,
      storageAvailable: !this.storageError && !this.blocked,
      hasActiveWorkout: !!this.state.active,
      returnToAccount: this.returnToAccount,
      signInGoogle: this.signInGoogle,
      requestMagicLink: this.requestMagicLink,
      refreshSession: this.refreshSession,
      importGuestData: this.importGuestData,
      syncNow: this.syncNow,
      resolveConflict: this.resolveConflict,
      signOut: this.signOut,
      exportConflictBackup: this.exportConflictBackup,
    }
    return {
      state: this.state,
      ready: this.ready,
      blocked: this.blocked,
      storageError: this.storageError,
      recoveryRaw: this.recoveryRaw,
      account,
    }
  }
  private emit() {
    this.snapshot = this.makeSnapshot()
    this.listeners.forEach((listener) => listener())
  }
  private key() {
    return this.cache ? accountStorageKey(this.cache.user.id) : STORAGE_KEY
  }

  start(runtime: CloudRuntime, enabled: boolean, callback: AuthCallback | null = null) {
    this.stop()
    this.runtime = runtime
    this.enabled = enabled
    this.available = enabled
    this.cache = null
    this.validationError = null
    this.authenticated = false
    this.authExpired = false
    this.error = null
    this.message = null
    this.callbackError = enabled ? (callback?.error ?? null) : null
    this.callbackPending = enabled && !!callback && !callback.error
    this.returnToAccount = enabled && !!callback
    this.loadGuest()
    if (enabled && !runtime.online() && !this.blocked) {
      try {
        const pointer = runtime.storage().getItem(ACCOUNT_POINTER_KEY)
        if (pointer) this.activate(parseAccountUser(JSON.parse(pointer)))
      } catch {
        /* A bad pointer must not make guest data unusable. */
      }
    }
    this.ready = true
    this.status = !enabled ? 'unavailable' : runtime.online() ? 'checking' : 'offline'
    this.persist()
    this.emit()
    if (enabled && runtime.online()) void this.refreshSession()
  }
  stop() {
    this.epoch += 1
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
    this.identityPromise = null
    this.syncPromise = null
    this.syncing = false
    this.operation = false
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    this.closeSocket()
  }
  private loadGuest() {
    this.cache = null
    this.validationError = null
    this.blocked = false
    this.storageError = null
    this.recoveryRaw = null
    this.durable = true
    try {
      this.lastRaw = this.runtime!.storage().getItem(STORAGE_KEY)
      try {
        this.state = withPlan(this.lastRaw ? parseBackup(this.lastRaw) : emptyState())
      } catch {
        this.state = withPlan(emptyState())
        this.blocked = true
        this.recoveryRaw = this.lastRaw
        this.storageError =
          'Saved data could not be loaded. Export the existing data in My setup before resetting storage. Automatic saving is paused to protect it.'
      }
    } catch {
      this.state = withPlan(emptyState())
      this.blocked = true
      this.durable = false
      this.storageError =
        'This preview cannot save data in your browser. You can try the app here; export a backup before closing it to keep your workouts.'
    }
  }
  private persist(): boolean {
    if (!this.runtime || this.blocked) return false
    try {
      const storage = this.runtime.storage()
      if (storage.getItem(this.key()) !== this.lastRaw) {
        // A clean sibling tab may have refreshed only the acknowledged revision/time.
        if (!this.adoptExternalCache(storage)) {
          this.blocked = true
          this.storageError = CROSS_TAB_ERROR
          this.durable = false
          return false
        }
      }
      if (this.cache) this.cache = { ...this.cache, state: this.state }
      const raw = JSON.stringify(this.cache ?? this.state)
      storage.setItem(this.key(), raw)
      this.lastRaw = raw
      this.storageError = null
      this.durable = true
      return true
    } catch {
      this.storageError = STORAGE_ERROR
      this.durable = false
      return false
    }
  }
  setState: Dispatch<SetStateAction<AppState>> = (update) => {
    this.state = typeof update === 'function' ? update(this.state) : update
    if (this.cache) this.cache = { ...this.cache, state: this.state }
    this.validateSharedState()
    this.persist()
    this.updateStatus()
    this.emit()
    this.scheduleSync()
  }
  replaceState = (next: AppState) => {
    this.blocked = false
    this.recoveryRaw = null
    try {
      this.lastRaw = this.runtime!.storage().getItem(this.key())
    } catch {
      /* persist reports failure */
    }
    this.setState(withPlan(next))
  }
  storageChanged(key: string | null) {
    if (key === this.key() || key === null) {
      if (key !== null && this.cache && this.runtime) {
        try {
          if (this.adoptExternalCache(this.runtime.storage())) {
            this.updateStatus()
            this.emit()
            return
          }
        } catch {
          /* Preserve malformed external changes and pause writes below. */
        }
      }
      this.blocked = true
      this.storageError = CROSS_TAB_ERROR
      this.durable = false
      this.closeSocket()
      this.emit()
    } else if (key === ACCOUNT_POINTER_KEY) void this.refreshSession()
    else if (key === STORAGE_KEY) this.emit()
  }
  private adoptExternalCache(storage: KeyValueStorage): boolean {
    if (!this.cache) return false
    const raw = storage.getItem(this.key())
    if (raw === this.lastRaw) return true
    const other = readAccountCache(storage, this.cache.user.id)
    if (!other) return false
    const metadataOnly =
      sameValue(this.state, other.state) &&
      sameValue(this.cache.pending, other.pending) &&
      sameValue(this.cache.conflict, other.conflict)
    // Never replace a tab's in-flight workout, outbox, or unsaved edits.
    const clean =
      !this.state.active &&
      !other.state.active &&
      !this.cache.pending &&
      !this.cache.conflict &&
      this.pendingCount() === 0 &&
      this.durable &&
      !this.blocked
    if (!metadataOnly && !clean) return false
    this.cache = other
    this.state = withPlan(other.state)
    this.validateSharedState()
    this.lastRaw = raw
    return true
  }
  wake = () => {
    this.updateStatus()
    this.emit()
    if (this.runtime?.online()) void this.syncNow()
    else this.closeSocket()
  }
  private updateStatus() {
    if (!this.enabled || !this.available) this.status = 'unavailable'
    else if (this.cache?.conflict) this.status = 'conflict'
    else if (this.blocked || !this.durable || this.validationError) this.status = 'error'
    else if (!this.runtime?.online()) this.status = 'offline'
    else if (this.authExpired) this.status = 'expired'
    else if (this.error) this.status = 'error'
    else if (this.cache) this.status = this.pendingCount() ? 'pending' : 'synced'
    else this.status = 'guest'
  }
  private scheduleSync() {
    if (
      !this.cache ||
      this.blocked ||
      !this.durable ||
      this.cache.conflict ||
      !this.runtime?.online()
    )
      return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.syncNow()
    }, 700)
  }
  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController()
    this.controllers.add(controller)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          void reader?.cancel().catch(() => {})
          reject(new DOMException('The account request timed out or was cancelled.', 'AbortError'))
        },
        { once: true },
      )
    })
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const readResponse = async () => {
        const response = await this.runtime!.request(path, {
          ...init,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        controller.signal.throwIfAborted()
        if (!response.body) return response
        reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
          const chunk = await reader.read()
          controller.signal.throwIfAborted()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 12_000_000) {
            await reader.cancel()
            throw new Error('The account response was too large. Your device data is unchanged.')
          }
          chunks.push(chunk.value)
        }
        const body = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          body.set(chunk, offset)
          offset += chunk.byteLength
        }
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }
      return await Promise.race([readResponse(), aborted])
    } finally {
      clearTimeout(timer)
      this.controllers.delete(controller)
    }
  }
  private async json(response: Response): Promise<unknown> {
    const raw = await response.text()
    if (raw.length > 12_000_000)
      throw new Error('The account response was too large. Your device data is unchanged.')
    return JSON.parse(raw)
  }
  private async identity(): Promise<boolean> {
    if (this.identityPromise) return this.identityPromise
    if (!this.enabled || !this.runtime?.online()) return false
    const epoch = this.epoch
    const task = (async () => {
      try {
        const response = await this.request('/api/account')
        if (epoch !== this.epoch) return false
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            this.authenticated = false
            this.authExpired = !!this.cache
            this.closeSocket()
            this.error = 'Your sign-in expired. Sign in again to continue syncing.'
            this.updateStatus()
            return false
          }
          if (response.status === 503 || response.status === 404) {
            this.available = false
            this.providers = { google: false, magicLink: false }
            this.error = null
            this.updateStatus()
            return false
          }
          throw new Error('Account access is temporarily unavailable. Your device data is safe.')
        }
        const payload = (await this.json(response)) as AccountResponse
        if (epoch !== this.epoch) return false
        if (
          !payload ||
          typeof payload.providers?.google !== 'boolean' ||
          typeof payload.providers?.magicLink !== 'boolean'
        )
          throw new Error('The account response could not be verified.')
        this.available = true
        this.providers = payload.providers
        this.realtime = payload.realtime === true
        if (!payload.user) {
          this.authenticated = false
          this.authExpired = !!this.cache
          this.closeSocket()
          if (this.callbackPending) {
            this.callbackPending = false
            this.callbackError = 'We couldn’t confirm your sign-in. Please try again below.'
          }
          if (this.cache)
            this.error =
              'Sign in again to sync this account. Your changes remain saved on this device.'
          this.updateStatus()
          return false
        }
        const user = parseAccountUser(payload.user)
        if (this.cache?.user.id !== user.id) {
          if (this.state.active) {
            this.authenticated = false
            this.authExpired = !!this.cache
            this.closeSocket()
            this.error =
              'Finish or discard your current workout before switching accounts. Its progress stays on this device.'
            this.updateStatus()
            return false
          }
          if (!this.persist()) return false
          this.activate(user)
        } else this.cache = { ...this.cache, user }
        this.authenticated = true
        this.authExpired = false
        this.error = null
        if (this.callbackPending) {
          this.callbackPending = false
          this.message = 'You’re signed in. You can manage your account and sync here.'
        }
        const storage = this.runtime!.storage()
        const pointer = JSON.stringify(user)
        if (storage.getItem(ACCOUNT_POINTER_KEY) !== pointer)
          storage.setItem(ACCOUNT_POINTER_KEY, pointer)
        this.persist()
        this.updateStatus()
        this.openSocket()
        return !this.blocked && this.durable
      } catch {
        if (epoch !== this.epoch) return false
        this.authenticated = false
        // navigator.onLine often remains true on a network without internet.
        // Restore only after a failed request, never after an unauthenticated response.
        if (!this.cache && !this.state.active && !this.blocked) {
          try {
            const pointer = this.runtime!.storage().getItem(ACCOUNT_POINTER_KEY)
            if (pointer) this.activate(parseAccountUser(JSON.parse(pointer)))
          } catch {
            /* Keep guest data if an account cache cannot be read. */
          }
        }
        this.error =
          'We couldn’t reach your account. Your workouts remain on this device; retry when you’re online.'
        this.updateStatus()
        return false
      } finally {
        if (epoch === this.epoch) this.emit()
      }
    })()
    this.identityPromise = task
    try {
      return await task
    } finally {
      if (this.identityPromise === task) this.identityPromise = null
    }
  }
  private activate(user: AccountUser) {
    this.closeSocket()
    this.blocked = false
    this.storageError = null
    this.recoveryRaw = null
    const storage = this.runtime!.storage()
    this.lastRaw = storage.getItem(accountStorageKey(user.id))
    try {
      this.cache = readAccountCache(storage, user.id) ?? {
        version: 1,
        user,
        state: withPlan(emptyState()),
        baseline: null,
        pending: null,
        conflict: null,
        lastSyncedAt: null,
      }
      this.cache.user = user
      this.state = withPlan(this.cache.state)
      this.validateSharedState()
      this.durable = true
    } catch {
      this.cache = {
        version: 1,
        user,
        state: withPlan(emptyState()),
        baseline: null,
        pending: null,
        conflict: null,
        lastSyncedAt: null,
      }
      this.state = this.cache.state
      this.blocked = true
      this.durable = false
      this.recoveryRaw = this.lastRaw
      this.storageError =
        'Saved account data could not be loaded. Export the existing data before resetting storage. Cloud sync is paused to protect it.'
    }
  }
  refreshSession = async () => {
    await this.syncNow()
  }
  syncNow = async (): Promise<void> => {
    if (this.syncPromise) return this.syncPromise
    if (!this.enabled || !this.runtime?.online() || this.operation || Date.now() < this.retryAt) {
      this.updateStatus()
      this.emit()
      return
    }
    const task = this.sync()
    this.syncPromise = task
    try {
      await task
    } finally {
      if (this.syncPromise === task) this.syncPromise = null
    }
  }
  private async sync() {
    this.syncing = true
    this.emit()
    const epoch = this.epoch
    let userId: string | null = null
    const current = () => epoch === this.epoch && this.cache?.user.id === userId
    try {
      if (!(await this.identity())) return
      userId = this.cache!.user.id
      if (this.blocked || !this.persist() || this.cache!.conflict || this.validationError) return
      // Resolve uncertain PUTs before GET/rebase: an idempotency key cannot be replaced on timeout.
      if (!this.cache!.pending) {
        const response = await this.request('/api/training', {
          headers: { 'X-Fitt-Account': userId },
        })
        if (!current()) return
        if (!response.ok)
          throw new ApiError(
            response.status,
            'Couldn’t load your saved workouts. Your device data is unchanged.',
          )
        const remote = parseCloudSnapshot(await this.json(response))
        if (!current()) return
        this.reconcile(remote, this.cache!.baseline?.data ?? emptyCloudData())
        if (this.cache!.conflict || !this.persist()) return
      }
      for (let attempt = 0; attempt < 4 && current(); attempt += 1) {
        if (this.blocked || !this.durable || this.cache!.conflict) return
        if (!this.cache!.pending) {
          const data = toCloudData(this.state)
          if (sameValue(data, this.cache!.baseline!.data)) break
          this.cache = {
            ...this.cache!,
            pending: { mutationId: uid(), baseRevision: this.cache!.baseline!.revision, data },
          }
          if (!this.persist()) return
        }
        const pending = this.cache!.pending!
        const response = await this.request('/api/training', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Fitt-Account': userId! },
          body: JSON.stringify(pending),
        })
        if (!current()) return
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'))
          this.retryAt =
            Date.now() +
            Math.min(600, Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000
          if (this.debounce) clearTimeout(this.debounce)
          this.debounce = setTimeout(() => {
            this.debounce = null
            void this.syncNow()
          }, this.retryAt - Date.now())
          throw new ApiError(
            429,
            'Sync is taking a short break. Your changes are saved on this device and will retry automatically.',
          )
        }
        if (response.status !== 409 && !response.ok)
          throw new ApiError(
            response.status,
            'Couldn’t save your workouts yet. Your changes remain on this device.',
          )
        const remote = parseCloudSnapshot(await this.json(response))
        if (!current()) return
        this.reconcile(remote, response.ok ? pending.data : this.cache!.baseline!.data)
        if (!this.persist() || this.cache!.conflict) return
      }
      if (current()) {
        this.error = null
        this.cache = { ...this.cache!, lastSyncedAt: new Date().toISOString() }
        this.persist()
        if (this.pendingCount()) this.scheduleSync()
      }
    } catch (error) {
      if (epoch !== this.epoch) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.authenticated = false
        this.authExpired = true
        this.closeSocket()
        this.error =
          'Your sign-in changed or expired. Sign in to the same account to sync these saved changes.'
      } else
        this.error =
          error instanceof Error && error.name !== 'AbortError'
            ? error.message
            : 'Sync was interrupted. Your changes remain saved on this device.'
    } finally {
      if (epoch === this.epoch) {
        this.syncing = false
        this.updateStatus()
        this.emit()
      }
    }
  }
  private reconcile(remote: CloudSnapshot, base: CloudSnapshot['data']) {
    if (this.cache?.baseline && remote.revision < this.cache.baseline.revision)
      throw new Error(
        'The account returned an older revision. Sync is paused to protect your progress.',
      )
    const merged = mergeCloudData(base, toCloudData(this.state), remote.data)
    if (merged.fields.length) {
      this.cache = {
        ...this.cache!,
        pending: null,
        conflict: { base, remote, fields: merged.fields },
      }
      return
    }
    try {
      this.state = applyCloudData(this.state, merged.data)
    } catch {
      this.cache = {
        ...this.cache!,
        pending: null,
        conflict: { base, remote, fields: ['Current workout completed on another device'] },
      }
      return
    }
    this.cache = {
      ...this.cache!,
      state: this.state,
      baseline: remote,
      pending: null,
      conflict: null,
    }
    this.emit()
  }
  private guardAction() {
    if (!this.enabled || !this.available)
      throw new Error(
        'Accounts are unavailable in this preview. You can still train and export a backup.',
      )
    if (!this.runtime?.online()) throw new Error('Connect to the internet to use your account.')
    if (this.state.active)
      throw new Error(
        'Finish or discard your current workout before changing accounts or importing history.',
      )
    if (this.blocked || !this.persist())
      throw new Error('Resolve the device storage warning before changing accounts.')
  }
  private async authAction(action: () => Promise<void>) {
    if (this.operation || this.syncing) return false
    this.error = null
    this.message = null
    this.callbackError = null
    this.callbackPending = false
    try {
      this.guardAction()
      this.operation = true
      this.emit()
      await action()
      return true
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'This account action could not be completed.'
      return false
    } finally {
      this.operation = false
      this.updateStatus()
      this.emit()
    }
  }
  signInGoogle = async () =>
    this.authAction(async () => {
      if (!this.providers.google) throw new Error('Google sign-in is not configured yet.')
      const response = await this.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          ...authCallbackURLs(this.runtime!.origin),
          disableRedirect: true,
        }),
      })
      if (!response.ok) throw new Error('Google sign-in could not start. Please try again.')
      const payload = (await this.json(response)) as { url?: unknown }
      if (typeof payload.url !== 'string')
        throw new Error('Google sign-in returned an invalid link.')
      const url = new URL(payload.url)
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com')
        throw new Error('Google sign-in returned an unexpected destination.')
      this.runtime!.redirect(url.href)
    })
  requestMagicLink = async (email: string) =>
    this.authAction(async () => {
      if (!this.providers.magicLink) throw new Error('Email sign-in is not configured yet.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)
        throw new Error('Enter a valid email address.')
      const response = await this.request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...authCallbackURLs(this.runtime!.origin) }),
      })
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Please wait a moment before requesting another sign-in link.'
            : 'We couldn’t request your sign-in email. Please try again.',
        )
      this.message = 'Sign-in email requested. Check your inbox and spam folder for your link.'
    })
  importGuestData = async () => {
    try {
      this.guardAction()
      if (!this.cache?.baseline || !this.authenticated)
        throw new Error('Sign in and load your account before importing.')
      if (this.cache.conflict)
        throw new Error('Resolve the account versions before importing device history.')
      const guest = this.guestRecords().guest
      if (!guest)
        throw new Error('The device history could not be read. Export its backup before importing.')
      const data = importGuestRecords(toCloudData(this.state), guest)
      this.setState(applyCloudData(this.state, data))
      if (!this.durable)
        throw new Error(
          'The imported workouts could not be saved on this device. Export a backup before closing; the original device history is unchanged.',
        )
      this.message =
        'Device workouts and saved routines added to this account. The original device history is unchanged.'
      this.error = null
      this.emit()
      await this.syncNow()
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Device history could not be imported.'
      this.emit()
      return false
    }
  }
  resolveConflict = async (choice: 'local' | 'remote') => {
    if (!this.cache?.conflict || this.blocked) return false
    try {
      const { base, remote } = this.cache.conflict
      const merged = mergeCloudData(base, toCloudData(this.state), remote.data, choice)
      this.state = applyCloudData(this.state, merged.data)
      this.cache = {
        ...this.cache,
        state: this.state,
        baseline: remote,
        pending: null,
        conflict: null,
      }
      this.error = null
      this.message =
        'Your choice is saved. Changes that didn’t conflict were kept from both versions.'
      if (!this.persist())
        throw new Error(
          'Your choice could not be saved on this device. Export a backup before closing; cloud sync is paused.',
        )
      this.updateStatus()
      this.emit()
      await this.syncNow()
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'The versions could not be resolved.'
      this.emit()
      return false
    }
  }
  signOut = async (options?: { keepPending?: boolean }) =>
    this.authAction(async () => {
      if (!this.cache) return
      if ((this.pendingCount() || this.cache.conflict) && !options?.keepPending)
        throw new Error(
          'This account still has changes saved only on this device. Sync or export a backup before signing out, or explicitly keep them on this device.',
        )
      const previousId = this.cache.user.id
      const response = await this.request('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error('Sign-out could not finish. Please try again while online.')
      this.closeSocket()
      this.authenticated = false
      this.authExpired = false
      const storage = this.runtime!.storage()
      storage.removeItem(ACCOUNT_POINTER_KEY)
      if (!options?.keepPending) storage.removeItem(accountStorageKey(previousId))
      this.loadGuest()
      this.persist()
      this.message = options?.keepPending
        ? 'Signed out. Pending changes stay on this device for that account; sign in to it again to sync.'
        : 'Signed out. Your device-only workouts are ready.'
    })
  exportConflictBackup = () => {
    if (!this.runtime) return
    this.runtime.download(JSON.stringify(this.state, null, 2), 'fitt-device-version.json')
    if (this.cache?.conflict)
      this.runtime.download(
        JSON.stringify({ ...this.cache.conflict.remote.data, active: null, plan: null }, null, 2),
        'fitt-account-version.json',
      )
  }
  private closeSocket() {
    if (this.socketRetry) clearTimeout(this.socketRetry)
    if (this.socketWatchdog) clearTimeout(this.socketWatchdog)
    this.socketRetry = null
    this.socketWatchdog = null
    const socket = this.connection
    this.connection = null
    socket?.close()
  }
  private openSocket() {
    if (
      !this.realtime ||
      !this.runtime?.socket ||
      !this.authenticated ||
      !this.cache ||
      this.connection ||
      !this.runtime.online() ||
      this.blocked
    )
      return
    const userId = this.cache.user.id
    const epoch = this.epoch
    const url = new URL('/api/realtime', this.runtime.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    try {
      const socket = this.runtime.socket(url.href)
      this.connection = socket
      socket.onopen = () => {
        if (this.connection !== socket || epoch !== this.epoch || this.cache?.user.id !== userId)
          return
        this.socketAttempts = 0
        // A proxy can lose the server's close frame; never trust a socket indefinitely.
        this.socketWatchdog = setTimeout(() => {
          if (this.connection !== socket) return
          this.connection = null
          this.socketWatchdog = null
          socket.close()
          void this.syncNow()
        }, 55_000)
      }
      socket.onmessage = (event) => {
        if (
          epoch !== this.epoch ||
          this.cache?.user.id !== userId ||
          typeof event.data !== 'string' ||
          event.data.length > 1024
        )
          return
        try {
          const message = JSON.parse(event.data) as { type?: unknown; revision?: unknown }
          if (
            message.type === 'revision' &&
            Number.isSafeInteger(message.revision) &&
            (message.revision as number) > (this.cache.baseline?.revision ?? -1)
          )
            void this.syncNow()
        } catch {
          /* Hints only: HTTP remains authoritative. */
        }
      }
      socket.onclose = () => {
        if (this.connection !== socket) return
        this.connection = null
        if (this.socketWatchdog) clearTimeout(this.socketWatchdog)
        this.socketWatchdog = null
        if (epoch !== this.epoch || this.cache?.user.id !== userId || !this.authenticated) return
        this.socketRetry = setTimeout(
          () => {
            this.socketRetry = null
            void this.syncNow()
          },
          Math.min(30_000, 1000 * 2 ** Math.min(this.socketAttempts++, 5)),
        )
      }
      socket.onerror = () => socket.close()
    } catch {
      /* Polling and focus provide the fallback in ordinary Next dev. */
    }
  }
}
