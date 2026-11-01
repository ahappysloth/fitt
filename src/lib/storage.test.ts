import { describe, expect, it } from 'vitest'
import { parseBackup } from './storage'
import { emptyState, freshWorkout, generateWorkout, localDay, quickWorkout } from './workout'
import type { AppState, Session } from './types'

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
    expect(migrated.routines).toEqual([])
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated)
  })
  it('round-trips appearance, name, saved routines and reward snapshots', () => {
    const state = savedState()
    state.preferences = { displayName: 'Alex', celebration: 'calm', onboarded: true }
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
