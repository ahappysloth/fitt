import { describe, expect, it } from 'vitest'
import {
  CloudValidationError,
  emptyCloudData,
  MAX_CLOUD_REVISION,
  parseCloudData,
  parseCloudSnapshot,
  parseSyncWrite,
  toCloudData,
} from './cloud-contract'
import { emptyState, generateWorkout } from './workout'
import type { Session } from './types'

function session(id = 'workout-a', completedAt = '2026-11-01T12:10:00.000Z'): Session {
  const state = emptyState()
  return {
    ...generateWorkout(state.profile, []),
    id,
    createdAt: '2026-11-01T12:00:00.000Z',
    startedAt: '2026-11-01T12:00:00.000Z',
    completedAt,
    elapsedSeconds: 600,
    rewardContext: { version: 1, weeklyGoal: 3, localDay: '2026-11-01' },
  }
}

describe('cloud training contract', () => {
  it('shares completed training while keeping active workouts and plans local', () => {
    const state = emptyState()
    state.plan = generateWorkout(state.profile, [])
    state.active = { ...state.plan, startedAt: '2026-11-01T12:00:00.000Z' }
    state.history = [session()]
    const data = toCloudData(state)
    expect(data.history).toHaveLength(1)
    expect(data).not.toHaveProperty('active')
    expect(data).not.toHaveProperty('plan')
    expect(state.active).not.toBeNull()
  })

  it('rebuilds nested records and discards injected ownership, rewards, and prototype keys', () => {
    const raw = JSON.parse(JSON.stringify({ ...emptyCloudData(), history: [session()] }))
    raw.userId = 'another-account'
    raw.xp = 999999
    raw.profile.admin = true
    raw.preferences = JSON.parse(
      JSON.stringify(raw.preferences).replace('{', '{"__proto__":{"polluted":true},'),
    )
    raw.history[0].userId = 'another-account'
    raw.history[0].exercises[0].sets[0].isAdmin = true
    const data = parseCloudData(raw)
    expect(data).not.toHaveProperty('userId')
    expect(data).not.toHaveProperty('xp')
    expect(data.profile).not.toHaveProperty('admin')
    expect(Object.hasOwn(data.preferences, '__proto__')).toBe(false)
    expect(data.history[0]).not.toHaveProperty('userId')
    expect(data.history[0].exercises[0].sets[0]).not.toHaveProperty('isAdmin')
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('normalizes equipment, timestamps, and chronological history deterministically', () => {
    const raw = emptyCloudData()
    raw.profile.equipment = ['rings', 'bar', 'rings']
    raw.history = [session('later', '2026-11-01T12:12:00Z'), session('earlier')]
    const normalized = parseCloudData(raw)
    expect(normalized.profile.equipment).toEqual(['bar', 'rings'])
    expect(normalized.history.map((item) => item.id)).toEqual(['earlier', 'later'])
    expect(normalized.history[1].completedAt).toBe('2026-11-01T12:12:00.000Z')
    expect(parseCloudData(normalized)).toEqual(normalized)
  })

  it('preserves fractional durations accepted by existing backups', () => {
    const item = session()
    item.duration = 1.5
    expect(parseCloudData({ ...emptyCloudData(), history: [item] }).history[0].duration).toBe(1.5)
  })

  it('rejects unfinished histories, duplicate IDs, invalid exercise references and bad numbers', () => {
    const valid = session()
    expect(() =>
      parseCloudData({ ...emptyCloudData(), history: [{ ...valid, completedAt: undefined }] }),
    ).toThrow(CloudValidationError)
    expect(() => parseCloudData({ ...emptyCloudData(), history: [valid, valid] })).toThrow(
      CloudValidationError,
    )
    const badExercise = structuredClone(valid)
    badExercise.exercises[0].exerciseId = 'not-in-catalog'
    expect(() => parseCloudData({ ...emptyCloudData(), history: [badExercise] })).toThrow(
      CloudValidationError,
    )
    const badNumber = structuredClone(valid)
    badNumber.exercises[0].sets[0].reps = Infinity
    expect(() => parseCloudData({ ...emptyCloudData(), history: [badNumber] })).toThrow(
      CloudValidationError,
    )
  })

  it('rejects text that Postgres cannot store while retaining valid Unicode', () => {
    for (const displayName of ['a\u0000b', 'a\ud800b']) {
      const data = emptyCloudData()
      data.preferences.displayName = displayName
      expect(() => parseCloudData(data)).toThrow(CloudValidationError)
    }
    const data = emptyCloudData()
    data.preferences.displayName = 'Alex 💪'
    expect(parseCloudData(data).preferences.displayName).toBe('Alex 💪')
  })

  it('validates revisions and bounded mutation identifiers before accepting a write', () => {
    const data = emptyCloudData()
    const write = { mutationId: 'change-123', baseRevision: 0, data }
    expect(parseSyncWrite(write)).toEqual(write)
    for (const baseRevision of [-1, 0.5, MAX_CLOUD_REVISION + 1, NaN]) {
      expect(() => parseSyncWrite({ ...write, baseRevision })).toThrow(CloudValidationError)
    }
    for (const mutationId of ['', 'short', 'x'.repeat(129), 'change\n123']) {
      expect(() => parseSyncWrite({ ...write, mutationId })).toThrow(CloudValidationError)
    }
    expect(parseCloudSnapshot({ revision: 0, data })).toEqual({ revision: 0, data })
    expect(() => parseCloudSnapshot({ revision: -1, data })).toThrow(CloudValidationError)
  })
})
