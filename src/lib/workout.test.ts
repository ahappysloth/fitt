import { describe, expect, it } from 'vitest'
import { byId, equipmentList, exercises, available } from './catalog'
import {
  completeSet,
  defaultProfile,
  doneSets,
  generateWorkout,
  prescribe,
  replaceExercise,
  weekCount,
  weekDays,
  localDay,
} from './workout'
import { parseBackup } from './storage'
import { demos } from '../components/ExerciseGuide'
import type { AppState, Profile, Session, WorkoutExercise } from './types'

function session(
  exerciseId = 'knee-pushup',
  target = 6,
  overrides: Partial<WorkoutExercise['sets'][number]> = {},
): Session {
  return {
    id: crypto.randomUUID(),
    title: 'Test workout',
    duration: 30,
    createdAt: '2026-10-01T12:00:00.000Z',
    startedAt: '2026-10-01T12:00:00.000Z',
    completedAt: '2026-10-01T12:30:00.000Z',
    elapsedSeconds: 1800,
    exercises: [
      {
        exerciseId,
        note: 'test',
        sets: Array.from({ length: 3 }, () => ({
          id: crypto.randomUUID(),
          target,
          reps: target,
          load: 0,
          targetLoad: 0,
          effort: 'good' as const,
          done: true,
          ...overrides,
        })),
      },
    ],
  }
}

describe('equipment-aware plans', () => {
  it('builds valid plans for every equipment, level, duration, and focus combination', () => {
    for (let mask = 0; mask < 64; mask++)
      for (const level of ['beginner', 'intermediate'] as const)
        for (const duration of [20, 30, 45] as const)
          for (const focus of ['full', 'upper', 'lower', 'core'] as const) {
            const profile: Profile = {
              ...defaultProfile,
              equipment: equipmentList.filter((_, i) => mask & (1 << i)).map((e) => e.id),
              level,
              duration,
              focus,
            }
            const workout = generateWorkout(profile, [])
            expect(workout.exercises.length).toBeGreaterThan(0)
            expect(new Set(workout.exercises.map((e) => e.exerciseId)).size).toBe(
              workout.exercises.length,
            )
            for (const entry of workout.exercises) {
              const e = byId[entry.exerciseId]
              expect(available(e, profile.equipment)).toBe(true)
              expect(e.level).toBeLessThanOrEqual(level === 'beginner' ? 1 : 2)
              expect(entry.sets).toHaveLength(duration === 20 ? 2 : 3)
              expect(
                entry.sets.every((s) => s.target >= e.min && s.target <= e.max && !s.done),
              ).toBe(true)
            }
          }
  })
  it('does not reintroduce equipment removed since the previous session', () => {
    const plan = generateWorkout(defaultProfile, [session('pullup', 5)])
    expect(plan.exercises.every((e) => byId[e.exerciseId].equipment.length === 0)).toBe(true)
  })
  it('ships a unique movement guide and valid regression links for every exercise', () => {
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length)
    for (const e of exercises) {
      expect(demos[e.id]).toBeDefined()
      expect(e.steps.length).toBeGreaterThanOrEqual(3)
      if (e.harder) {
        expect(byId[e.harder].level).toBeGreaterThan(e.level)
        expect(byId[e.harder].pattern).toBe(e.pattern)
      }
      if (e.easier) expect(byId[e.easier].level).toBeLessThan(e.level)
    }
  })
})

describe('progression responds to actual performance', () => {
  it('waits for two complete successes before increasing reps', () => {
    expect(prescribe(byId['knee-pushup'], defaultProfile, [session()]).sets[0].target).toBe(6)
    expect(
      prescribe(byId['knee-pushup'], defaultProfile, [session(), session()]).sets[0].target,
    ).toBe(7)
  })
  it('does not progress from a partial exercise or lowered added load', () => {
    const partial = session()
    partial.exercises[0].sets[2].done = false
    expect(
      prescribe(byId['knee-pushup'], defaultProfile, [session(), partial]).sets[0].target,
    ).toBe(6)
    const weighted = { ...defaultProfile, equipment: ['vest'] as Profile['equipment'] }
    const reduced = session('pushup', 8, { load: 5, targetLoad: 10 })
    expect(
      prescribe(byId.pushup, weighted, [session('pushup', 8), reduced]).sets[0].load,
    ).toBeLessThan(5)
  })
  it('uses five-second increments for holds and never progresses by reps', () => {
    const entry = prescribe(byId.plank, defaultProfile, [
      session('plank', 20),
      session('plank', 20),
    ])
    expect(entry.sets[0].target).toBe(25)
  })
  it('unlocks a harder available variation only at the top of the rep range', () => {
    const next = prescribe(byId['knee-pushup'], defaultProfile, [
      session('knee-pushup', 12),
      session('knee-pushup', 12),
    ])
    expect(next.exerciseId).toBe('pushup')
    expect(next.sets[0].target).toBe(6)
    const unavailable = prescribe(byId['reverse-lunge'], defaultProfile, [
      session('reverse-lunge', 12),
      session('reverse-lunge', 12),
    ])
    expect(unavailable.exerciseId).toBe('reverse-lunge')
  })
  it('reduces weight before changing variation after a hard session', () => {
    const next = prescribe(byId.pushup, { ...defaultProfile, equipment: ['vest'] }, [
      session('pushup', 6, { load: 10, targetLoad: 10, effort: 'hard' }),
    ])
    expect(next.exerciseId).toBe('pushup')
    expect(next.sets[0].load).toBe(7.5)
  })
  it('regresses to an easier variation when the minimum target is too hard', () => {
    const next = prescribe(byId.pushup, defaultProfile, [
      session('pushup', 6, { reps: 3, effort: 'hard' }),
    ])
    expect(next.exerciseId).toBe('knee-pushup')
  })
  it('adapts unlogged sets while keeping completed sets and original targets intact', () => {
    const entry = prescribe(byId.pushup, defaultProfile, [])
    entry.sets[0].reps = 4
    entry.sets[0].effort = 'hard'
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[0]).toMatchObject({ target: 6, reps: 4, done: true })
    expect(result.sets[1]).toMatchObject({ target: 3, reps: 3, done: false })
    result.sets[1].reps = 1
    const second = completeSet(result, result.sets[1].id)
    expect(second.sets[0]).toEqual(result.sets[0])
    expect(second.sets[2].target).toBe(1)
    expect(entry.sets[0].done).toBe(false)
  })
  it('undoes a logged set without deleting the workout', () => {
    const entry = session().exercises[0]
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[0].done).toBe(false)
    expect(result.sets[1].done).toBe(true)
  })
  it('resets units and load when swapping to a timed hold', () => {
    const entry = session('deadbug', 8, { load: 5 }).exercises[0]
    const result = replaceExercise(entry, byId.plank)
    expect(result.sets[0]).toMatchObject({ target: 20, reps: 20, load: 0, done: false })
  })
})

describe('history and backups', () => {
  const state = (): AppState => ({
    version: 1,
    profile: defaultProfile,
    history: [session()],
    active: null,
    plan: generateWorkout(defaultProfile, []),
  })
  it('round-trips a complete backup with an active session', () => {
    const original = state()
    original.active = {
      ...generateWorkout(defaultProfile, []),
      startedAt: new Date().toISOString(),
    }
    expect(parseBackup(JSON.stringify(original))).toEqual(original)
  })
  it('rejects corrupt, unknown-version and invalid exercise data', () => {
    expect(() => parseBackup('broken')).toThrow()
    expect(() => parseBackup('{"version":2}')).toThrow()
    const bad = state()
    bad.history[0].exercises[0].exerciseId = 'nonexistent'
    expect(() => parseBackup(JSON.stringify(bad))).toThrow()
    bad.history[0].exercises[0].exerciseId = '__proto__'
    expect(() => parseBackup(JSON.stringify(bad))).toThrow()
  })
  it('rejects duplicate sessions and invalid numeric set values', () => {
    const bad = state()
    bad.history.push(bad.history[0])
    expect(() => parseBackup(JSON.stringify(bad))).toThrow()
    const badNumber = state()
    badNumber.history[0].exercises[0].sets[0].load = -1
    expect(() => parseBackup(JSON.stringify(badNumber))).toThrow()
  })
  it('counts completed sets only', () => {
    const s = session()
    s.exercises[0].sets[0].done = false
    expect(doneSets(s)).toBe(2)
  })
  it('uses Monday-based calendar weeks and handles month boundaries', () => {
    const now = new Date(2026, 9, 31, 15)
    expect(weekDays(now).map(localDay)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    const inWeek = session()
    inWeek.completedAt = new Date(2026, 9, 30, 15).toISOString()
    expect(weekCount([session(), inWeek], now)).toBe(1)
  })
})
