import { describe, expect, it, vi } from 'vitest'
import { loadState, parseBackup, saveState, STORAGE_KEY } from './storage'
import { emptyState, freshWorkout, generateWorkout, localDay, quickWorkout } from './workout'
import type { AppState, Session } from './types'
import { MAX_ADDED_LOAD_KG } from './limits'

function savedState(): AppState {
  const state = emptyState()
  const plan = generateWorkout(state.profile, [])
  const session: Session = {
    ...plan,
    startedAt: '2026-10-31T12:00:00Z',
    completedAt: '2026-10-31T12:10:00Z',
    elapsedSeconds: 600,
  }
  session.exercises[0].sets[0].done = true
  return { ...state, history: [session] }
}

describe('data migration and saved routines', () => {
  it('rejects timestamps outside the range the account database stores', () => {
    for (const completedAt of [
      '0000-01-01T00:00:00Z',
      '+010000-01-01T00:00:00Z',
      '1969-12-31T00:00:00Z',
    ]) {
      const state = savedState()
      state.history[0] = { ...state.history[0], startedAt: completedAt, completedAt }
      expect(() => parseBackup(JSON.stringify(state))).toThrow()
    }
  })
  it('keeps legacy workouts and freezes their calendar/goal reward context on first migration', () => {
    const legacy = savedState()
    delete legacy.preferences
    delete legacy.routines
    const migrated = parseBackup(JSON.stringify(legacy))
    expect(migrated.history[0].exercises).toEqual(legacy.history[0].exercises)
    expect(migrated.history[0].rewardContext).toEqual({
      version: 1,
      weeklyGoal: 3,
      localDay: localDay(new Date(legacy.history[0].completedAt!)),
    })
    expect(migrated.preferences?.onboarded).toBe(true)
    expect(migrated.preferences?.bodyModel).toBe('male')
    expect(migrated.routines).toEqual([])
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated)
  })
  it('round-trips appearance, name, saved routines and reward snapshots', () => {
    const state = savedState()
    state.preferences = {
      displayName: 'Alex',
      celebration: 'calm',
      onboarded: true,
      bodyModel: 'female',
    }
    state.routines = [generateWorkout(state.profile, [])]
    state.history[0].rewardContext = { version: 1, weeklyGoal: 2, localDay: '2026-10-31' }
    expect(parseBackup(JSON.stringify(state))).toEqual(state)
  })
  it('rejects corrupt preference/context data and duplicate set or routine IDs', () => {
    const invalid = savedState()
    invalid.history[0].rewardContext = { version: 1, weeklyGoal: 3, localDay: '2026-02-31' }
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow()
    delete invalid.history[0].rewardContext
    invalid.history[0].exercises[0].sets[1].id = invalid.history[0].exercises[0].sets[0].id
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow()
    const badRoutines = savedState()
    const routine = generateWorkout(badRoutines.profile, [])
    badRoutines.routines = [routine, routine]
    expect(() => parseBackup(JSON.stringify(badRoutines))).toThrow()
    const badPrefs = savedState()
    badPrefs.preferences!.displayName = 'a'.repeat(41)
    expect(() => parseBackup(JSON.stringify(badPrefs))).toThrow()
  })
  it('starting a saved routine creates independent session/set IDs and clears completed data', () => {
    const routine = savedState().history[0]
    const first = freshWorkout(routine)
    const second = freshWorkout(routine)
    expect(first.id).not.toBe(second.id)
    expect(first.exercises[0].sets[0].id).not.toBe(second.exercises[0].sets[0].id)
    expect(first.exercises.every((e) => e.sets.every((s) => !s.done))).toBe(true)
    expect(routine.exercises[0].sets[0].done).toBe(true)
  })
  it('creates a short achievable workout using only available movements', () => {
    const state = emptyState()
    const plan = quickWorkout(state.profile, [])
    expect(plan.duration).toBe(5)
    expect(plan.exercises).toHaveLength(2)
    expect(plan.exercises.every((e) => e.sets.length === 2)).toBe(true)
  })
})

describe('body-model preferences', () => {
  it('defaults new profiles to the male model', () => {
    expect(emptyState().preferences?.bodyModel).toBe('male')
  })

  it('adds the male default to existing preferences without changing training data', () => {
    const legacy = savedState()
    legacy.preferences = { displayName: 'Sam', celebration: 'calm', onboarded: true }
    legacy.plan = generateWorkout(legacy.profile, legacy.history)
    legacy.active = { ...freshWorkout(legacy.plan), startedAt: '2026-11-01T12:00:00Z' }
    legacy.routines = [generateWorkout(legacy.profile, [])]
    const migrated = parseBackup(JSON.stringify(legacy))
    expect(migrated.preferences).toEqual({ ...legacy.preferences, bodyModel: 'male' })
    expect(migrated.profile).toEqual(legacy.profile)
    expect(migrated.plan).toEqual(legacy.plan)
    expect(migrated.active).toEqual(legacy.active)
    expect(migrated.routines).toEqual(legacy.routines)
    expect(migrated.history[0].exercises).toEqual(legacy.history[0].exercises)
    expect(legacy.preferences.bodyModel).toBeUndefined()
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated)
  })

  it.each(['male', 'female'] as const)(
    'persists and exports/imports the %s choice',
    (bodyModel) => {
      const state = parseBackup(JSON.stringify(savedState()))
      state.preferences = { ...state.preferences!, bodyModel }
      const memory = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
      })
      try {
        expect(saveState(state)).toBeNull()
        expect(JSON.parse(memory.get(STORAGE_KEY)!).preferences.bodyModel).toBe(bodyModel)
        expect(loadState()).toEqual({ state, error: null })
        expect(parseBackup(JSON.stringify(state))).toEqual(state)
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it.each(['unknown', '', null, 1, {}])('rejects invalid body-model value %j', (bodyModel) => {
    const state = savedState()
    const invalid = { ...state, preferences: { ...state.preferences, bodyModel } }
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow('appearance preferences')
  })
})

describe('training evidence backups', () => {
  it('round-trips optional evidence on history, active sessions, plans, and saved routines', () => {
    const state = parseBackup(JSON.stringify(savedState()))
    state.plan = generateWorkout(state.profile, [])
    state.active = { ...freshWorkout(state.plan), startedAt: '2026-11-01T12:00:00Z' }
    state.routines = [generateWorkout(state.profile, [])]
    for (const workout of [state.history[0], state.active, state.plan, ...state.routines]) {
      const exercise = workout.exercises[0]
      exercise.plannedSetCount = 10
      Object.assign(exercise.sets[0], {
        prescription: { target: 600, load: MAX_ADDED_LOAD_KG, source: 'generated' },
        recommendationSource: 'prescribed',
        effortConfirmed: false,
        targetLocked: true,
      })
      Object.assign(exercise.sets[1], {
        prescription: { target: 1, load: 0, source: 'manual' },
        recommendationSource: 'adapted',
        effortConfirmed: true,
        targetLocked: false,
      })
    }
    expect(parseBackup(JSON.stringify(state))).toEqual(state)
  })

  it('does not infer prescriptions, effort confirmation, or planned counts for legacy records', () => {
    const legacy = savedState()
    legacy.plan = generateWorkout(legacy.profile, [])
    legacy.active = { ...freshWorkout(legacy.plan), startedAt: '2026-11-01T12:00:00Z' }
    legacy.routines = [generateWorkout(legacy.profile, [])]
    for (const workout of [legacy.history[0], legacy.active, legacy.plan, ...legacy.routines]) {
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
    const restored = parseBackup(JSON.stringify(legacy))
    for (const workout of [
      restored.history[0],
      restored.active!,
      restored.plan!,
      ...restored.routines!,
    ]) {
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

  it.each([
    { prescription: null },
    { prescription: [] },
    { prescription: {} },
    { prescription: { target: 0, load: 0, source: 'generated' } },
    { prescription: { target: 601, load: 0, source: 'generated' } },
    { prescription: { target: '8', load: 0, source: 'generated' } },
    { prescription: { target: 8, load: -1, source: 'manual' } },
    { prescription: { target: 8, load: MAX_ADDED_LOAD_KG + 1, source: 'manual' } },
    { prescription: { target: 8, load: '0', source: 'manual' } },
    { prescription: { target: 8, load: 0, source: 'adapted' } },
    { prescription: { target: 8, load: 0 } },
    { recommendationSource: null },
    { recommendationSource: 'generated' },
    { effortConfirmed: null },
    { effortConfirmed: 'true' },
    { effortConfirmed: 1 },
    { targetLocked: null },
    { targetLocked: 'false' },
    { targetLocked: 0 },
  ])('rejects malformed set evidence %j', (metadata) => {
    const state = savedState()
    Object.assign(state.history[0].exercises[0].sets[0], metadata)
    expect(() => parseBackup(JSON.stringify(state))).toThrow('invalid workout data')
  })

  it.each([null, 0, 11, 1.5, '3', false])(
    'rejects invalid planned set count %j',
    (plannedSetCount) => {
      const state = savedState()
      Object.assign(state.history[0].exercises[0], { plannedSetCount })
      expect(() => parseBackup(JSON.stringify(state))).toThrow('invalid workout data')
    },
  )

  it('leaves saved bytes untouched when evidence cannot be loaded', () => {
    const invalid = savedState()
    Object.assign(invalid.history[0].exercises[0].sets[0], { effortConfirmed: 'yes' })
    const raw = JSON.stringify(invalid)
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem })
    try {
      expect(loadState().error).toContain('Automatic saving is paused')
      expect(setItem).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('orders imported history by actual completion time, breaks ties by ID, and reorders corrections', () => {
    const state = savedState()
    const sample = { ...state.history[0], startedAt: '2026-10-30T12:00:00Z' }
    state.history = [
      { ...sample, id: 'z-later', completedAt: '2026-10-31T23:30:00-02:00' },
      { ...sample, id: 'b-tie', completedAt: '2026-11-01T01:00:00Z' },
      { ...sample, id: 'a-tie', completedAt: '2026-10-31T20:00:00-05:00' },
    ]
    const restored = parseBackup(JSON.stringify(state))
    expect(restored.history.map((session) => session.id)).toEqual(['a-tie', 'b-tie', 'z-later'])
    expect(
      parseBackup(JSON.stringify({ ...state, history: [...state.history].reverse() })),
    ).toEqual(restored)
    restored.history[0].completedAt = '2026-11-01T02:00:00Z'
    expect(parseBackup(JSON.stringify(restored)).history.map((session) => session.id)).toEqual([
      'b-tie',
      'z-later',
      'a-tie',
    ])
  })
})
