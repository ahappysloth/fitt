import {
  parseCloudSnapshot,
  parseSyncWrite,
  toCloudData,
  type CloudSnapshot,
  type SyncWrite,
  type CloudTrainingData,
} from '../cloud-contract'
import { parseBackup } from '../storage'
import type { AppState } from '../types'
import type { AccountUser } from './types'
import { sameValue } from './merge'

/**
 * Stored in place of a baseline or queued write whose data matches the visible
 * state, so the usual cache holds one copy of the history instead of three.
 */
const SAME_AS_STATE = '$state'

export const ACCOUNT_POINTER_KEY = 'fitt.account.current.v1'
export const accountStorageKey = (id: string) => `fitt.account.${encodeURIComponent(id)}.v1`

export interface AccountCache {
  version: 1
  user: AccountUser
  state: AppState
  baseline: CloudSnapshot | null
  pending: SyncWrite | null
  conflict: { base: CloudTrainingData; remote: CloudSnapshot; fields: string[] } | null
  lastSyncedAt: string | null
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function parseAccountUser(value: unknown): AccountUser {
  if (!value || typeof value !== 'object') throw new Error('Invalid account')
  const user = value as Record<string, unknown>
  if (
    typeof user.id !== 'string' ||
    !user.id ||
    user.id.length > 128 ||
    typeof user.name !== 'string' ||
    user.name.length > 200 ||
    typeof user.email !== 'string' ||
    user.email.length > 320
  )
    throw new Error('Invalid account')
  return { id: user.id, name: user.name, email: user.email }
}

export function readAccountCache(storage: KeyValueStorage, userId: string): AccountCache | null {
  const raw = storage.getItem(accountStorageKey(userId))
  if (!raw) return null
  if (raw.length > 50_000_000) throw new Error('The saved account cache is too large.')
  const parsed = JSON.parse(raw) as AccountCache
  if (parsed.version !== 1 || parsed.user?.id !== userId) throw new Error('Invalid account cache')
  const user = parseAccountUser(parsed.user)
  const state = parseBackup(JSON.stringify(parsed.state))
  let stateData: CloudTrainingData | undefined
  const expand = <T extends { data: unknown }>(value: T | null): T | null =>
    value && value.data === SAME_AS_STATE
      ? { ...value, data: (stateData ??= toCloudData(state)) }
      : value
  const baseline = parsed.baseline === null ? null : parseCloudSnapshot(expand(parsed.baseline))
  const pending = parsed.pending === null ? null : parseSyncWrite(expand(parsed.pending))
  if (pending && (!baseline || pending.baseRevision !== baseline.revision)) {
    throw new Error('The saved sync queue does not match its account revision.')
  }
  let conflict: AccountCache['conflict'] = null
  if (parsed.conflict) {
    if (
      !Array.isArray(parsed.conflict.fields) ||
      !parsed.conflict.fields.every((field) => typeof field === 'string')
    ) {
      throw new Error('Invalid sync conflict')
    }
    conflict = {
      base: parseCloudSnapshot({ revision: 0, data: parsed.conflict.base }).data,
      remote: parseCloudSnapshot(parsed.conflict.remote),
      fields: parsed.conflict.fields,
    }
  }
  return {
    version: 1,
    user,
    state,
    baseline,
    pending,
    conflict,
    lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
  }
}

/** Serialises a cache, replacing data that duplicates the visible state with a reference. */
export function serializeAccountCache(cache: AccountCache): string {
  let stateData: CloudTrainingData | null = null
  try {
    stateData = toCloudData(cache.state)
  } catch {
    /* Unsyncable state: keep every copy in full. */
  }
  const compact = <T extends { data: CloudTrainingData }>(value: T | null) =>
    value && stateData && sameValue(value.data, stateData)
      ? { ...value, data: SAME_AS_STATE }
      : value
  return JSON.stringify({
    ...cache,
    baseline: compact(cache.baseline),
    pending: compact(cache.pending),
  })
}

/** One atomic write persists the visible data and immutable outbox together. */
export function writeAccountCache(storage: KeyValueStorage, cache: AccountCache) {
  storage.setItem(accountStorageKey(cache.user.id), serializeAccountCache(cache))
}
