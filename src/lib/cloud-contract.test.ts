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
import { parseBackup } from './storage'
import { applyCloudData, importGuestRecords, mergeCloudData } from './cloud/merge'
import type { Session, Workout } from './types'

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

describe('cloud training evidence', () => {
  function withEvidence(workout: Workout): Workout {
    const exercise = workout.exercises[0]
    exercise.plannedSetCount = exercise.sets.length
    Object.assign(exercise.sets[0], {
      prescription: { target: 8, load: 2.5, source: 'generated' },
      recommendationSource: 'adapted',
      effortConfirmed: false,
      targetLocked: false,
      target: 6,
      targetLoad: 2,
    })
    Object.assign(exercise.sets[1], {
      prescription: { target: 6.5, load: 0, source: 'manual' },
      recommendationSource: 'prescribed',
      effortConfirmed: true,
      targetLocked: true,
    })
    return workout
  }

  it('round-trips a guest backup through import, cloud serialization, and a guest restore', () => {
    const original = emptyState()
    original.history = [session()]
    withEvidence(original.history[0])
    original.routines = [withEvidence(generateWorkout(original.profile, []))]
    const guest = parseBackup(JSON.stringify(original))
    const imported = importGuestRecords(emptyCloudData(), guest)
    const snapshot = parseCloudSnapshot(JSON.parse(JSON.stringify({ revision: 1, data: imported })))
    const restored = parseBackup(JSON.stringify(applyCloudData(emptyState(), snapshot.data)))
    expect(restored.history).toEqual(guest.history)
    expect(restored.routines).toEqual(guest.routines)
    expect(restored.history[0].exercises[0].sets[0].prescription).toEqual({
      target: 8,
      load: 2.5,
      source: 'generated',
    })
    expect(importGuestRecords(snapshot.data, guest)).toEqual(snapshot.data)
  })

  it('preserves the absence of evidence on legacy history and routines', () => {
    const raw = { ...emptyCloudData(), history: [session()], routines: [session('routine')] }
    for (const workout of [...raw.history, ...raw.routines]) {
      for (const exercise of workout.exercises) {
        delete exercise.plannedSetCount
        for (const set of exercise.sets) {
          delete set.prescription
          delete set.recommendationSource
          delete set.effortConfirmed
          delete set.targetLocked
        }
      }
    }
    const data = parseCloudData(raw)
    for (const workout of [...data.history, ...data.routines]) {
      for (const exercise of workout.exercises) {
        expect(exercise).not.toHaveProperty('plannedSetCount')
        for (const set of exercise.sets) {
          expect(set).not.toHaveProperty('prescription')
          expect(set).not.toHaveProperty('recommendationSource')
          expect(set).not.toHaveProperty('effortConfirmed')
          expect(set).not.toHaveProperty('targetLocked')
        }
      }
    }
  })

  it('rebuilds evidence in canonical field order and drops unrecognized nested fields', () => {
    const item = session()
    withEvidence(item)
    const expected = parseCloudData({ ...emptyCloudData(), history: [item] })
    const raw = JSON.parse(JSON.stringify(expected))
    raw.history[0].exercises[0].sets[0].prescription = {
      source: 'generated',
      administrator: true,
      load: 2.5,
      target: 8,
    }
    const normalized = parseCloudData(raw)
    expect(JSON.stringify(normalized)).toBe(JSON.stringify(expected))
    expect(parseCloudData(normalized)).toEqual(normalized)
    expect(normalized.history[0].exercises[0].sets[0].effortConfirmed).toBe(false)
    expect(normalized.history[0].exercises[0].sets[0].targetLocked).toBe(false)
  })

  it.each([
    { prescription: null },
    { prescription: { target: 0, load: 0, source: 'generated' } },
    { prescription: { target: 601, load: 0, source: 'generated' } },
    { prescription: { target: 8, load: -1, source: 'manual' } },
    { prescription: { target: 8, load: 301, source: 'manual' } },
    { prescription: { target: 8, load: 0, source: 'guessed' } },
    { recommendationSource: 'generated' },
    { effortConfirmed: 1 },
    { targetLocked: 'false' },
  ])('rejects malformed metadata instead of silently stripping it: %j', (metadata) => {
    const item = session()
    Object.assign(item.exercises[0].sets[0], metadata)
    expect(() => parseCloudData({ ...emptyCloudData(), history: [item] })).toThrow(
      CloudValidationError,
    )
    expect(() => parseCloudData({ ...emptyCloudData(), routines: [item] })).toThrow(
      CloudValidationError,
    )
  })

  it.each([null, 0, 11, 1.5, '3'])(
    'rejects malformed cloud planned set count %j',
    (plannedSetCount) => {
      const item = session()
      Object.assign(item.exercises[0], { plannedSetCount })
      expect(() => parseCloudData({ ...emptyCloudData(), history: [item] })).toThrow(
        CloudValidationError,
      )
    },
  )

  it('keeps metadata changes in three-way conflict decisions', () => {
    const item = session()
    withEvidence(item)
    const base = parseCloudData({ ...emptyCloudData(), history: [item] })
    const local = structuredClone(base)
    local.history[0].exercises[0].sets[0].effortConfirmed = true
    const remote = structuredClone(base)
    remote.history[0].exercises[0].sets[0].targetLocked = true
    expect(mergeCloudData(base, local, base)).toEqual({ data: local, fields: [] })
    expect(mergeCloudData(base, local, remote).fields).toHaveLength(1)
    expect(mergeCloudData(base, local, remote, 'remote').data).toEqual(remote)
    expect(() => importGuestRecords(base, { ...emptyState(), history: local.history })).toThrow(
      'different versions',
    )
  })

  it('sorts offset timestamps and ID ties canonically after timestamp corrections', () => {
    const early = { ...session('b-tie'), startedAt: '2026-10-30T12:00:00Z' }
    const raw = {
      ...emptyCloudData(),
      history: [
        { ...early, id: 'z-later', completedAt: '2026-10-31T23:30:00-02:00' },
        { ...early, id: 'b-tie', completedAt: '2026-11-01T01:00:00Z' },
        { ...early, id: 'a-tie', completedAt: '2026-10-31T20:00:00-05:00' },
      ],
    }
    const normalized = parseCloudData(raw)
    expect(normalized.history.map((workout) => workout.id)).toEqual(['a-tie', 'b-tie', 'z-later'])
    expect(parseCloudData({ ...raw, history: [...raw.history].reverse() })).toEqual(normalized)
    expect(normalized.history[0].completedAt).toBe('2026-11-01T01:00:00.000Z')
    normalized.history[0].completedAt = '2026-11-01T02:00:00Z'
    expect(parseCloudData(normalized).history.map((workout) => workout.id)).toEqual([
      'b-tie',
      'z-later',
      'a-tie',
    ])
  })
})
