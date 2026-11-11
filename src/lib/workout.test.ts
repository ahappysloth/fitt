import { describe, expect, it } from 'vitest'
import { byId, equipmentList, exercises, available } from './catalog'
import {
  completeSet,
  defaultProfile,
  emptyState,
  doneSets,
  generateWorkout,
  prescribe,
  replaceExercise,
  weekCount,
  weekDays,
  localDay,
} from './workout'
import { parseBackup } from './storage'
import { restSeconds, targetRange } from './goals'
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
  it('calibrates the next session from completed comfortable reps instead of stale targets', () => {
    const last = session('squat', 10, { reps: 12 })
    const next = prescribe(byId.squat, defaultProfile, [last])
    expect(next.sets.every((set) => set.target === 12 && set.reps === 12)).toBe(true)
    expect(last.exercises[0].sets[0]).toMatchObject({ target: 10, reps: 12 })
  })
  it('keeps calibration separate from earning progression', () => {
    const history = [session('squat', 10), session('squat', 10, { reps: 20 })]
    const high = targetRange(byId.squat, 'health')[1]
    const calibrated = prescribe(byId.squat, defaultProfile, history)
    expect(calibrated.exerciseId).toBe('squat')
    expect(calibrated.sets[0].target).toBe(high)
    const once = prescribe(byId.squat, defaultProfile, [...history, session('squat', high)])
    expect(once.exerciseId).toBe('squat')
    const progressed = prescribe(byId.squat, defaultProfile, [
      ...history,
      session('squat', high),
      session('squat', high),
    ])
    expect(progressed.exerciseId).toBe('reverse-lunge')
  })
  it('does not calibrate upward from partial or changed-load work', () => {
    const partial = session('squat', 10, { reps: 20 })
    partial.exercises[0].sets[2].done = false
    expect(prescribe(byId.squat, defaultProfile, [partial]).sets[0].target).toBe(10)
    const challenging = prescribe(byId.squat, defaultProfile, [
      session('squat', 10, { effort: 'hard' }),
    ])
    expect(challenging.sets[0].target).toBe(10)
    const weighted: Profile = { ...defaultProfile, equipment: ['vest'] }
    const changed = prescribe(byId.pushup, weighted, [
      session('pushup', 8, { reps: 10, load: 10, targetLoad: 5 }),
    ])
    expect(changed.sets[0]).toMatchObject({ target: 8, targetLoad: 10 })
    const reduced = prescribe(byId.pushup, weighted, [
      session('pushup', 8, { reps: 10, load: 5, targetLoad: 10 }),
    ])
    // The lower demonstrated load is the next load; it is not reduced again.
    expect(reduced.sets[0]).toMatchObject({ target: 8, targetLoad: 5 })
  })
  it('calibrates holds in seconds and keeps next-session targets in their prescribed range', () => {
    const calibrated = prescribe(byId.plank, defaultProfile, [session('plank', 20, { reps: 30 })])
    expect(calibrated.sets[0].target).toBe(30)
    const capped = prescribe(byId.plank, defaultProfile, [session('plank', 20, { reps: 600 })])
    expect(capped.sets[0].target).toBe(targetRange(byId.plank, 'health')[1])
    expect(() =>
      parseBackup(
        JSON.stringify({ ...emptyState(), plan: { ...session('plank'), exercises: [capped] } }),
      ),
    ).not.toThrow()
  })
  it('waits for two complete successes before increasing reps', () => {
    const knee = () => session('knee-pushup', 8)
    expect(prescribe(byId['knee-pushup'], defaultProfile, [knee()]).sets[0].target).toBe(8)
    expect(prescribe(byId['knee-pushup'], defaultProfile, [knee(), knee()]).sets[0].target).toBe(9)
  })
  it('does not progress from a partial exercise or lowered added load', () => {
    const partial = session('knee-pushup', 8)
    partial.exercises[0].sets[2].done = false
    expect(
      prescribe(byId['knee-pushup'], defaultProfile, [session('knee-pushup', 8), partial]).sets[0]
        .target,
    ).toBe(8)
    const weighted = { ...defaultProfile, equipment: ['vest'] as Profile['equipment'] }
    const reduced = session('pushup', 8, { load: 5, targetLoad: 10 })
    const next = prescribe(byId.pushup, weighted, [session('pushup', 8), reduced]).sets[0]
    expect(next).toMatchObject({ target: 8, load: 5 })
  })
  it('uses five-second increments for holds and never progresses by reps', () => {
    const entry = prescribe(byId.plank, defaultProfile, [
      session('plank', 20),
      session('plank', 20),
    ])
    expect(entry.sets[0].target).toBe(25)
  })
  it('unlocks a harder available variation only at the top of the rep range', () => {
    const top = targetRange(byId['knee-pushup'], 'health')[1]
    const below = prescribe(byId['knee-pushup'], defaultProfile, [
      session('knee-pushup', top - 1),
      session('knee-pushup', top - 1),
    ])
    expect(below.exerciseId).toBe('knee-pushup')
    const next = prescribe(byId['knee-pushup'], defaultProfile, [
      session('knee-pushup', top),
      session('knee-pushup', top),
    ])
    expect(next.exerciseId).toBe('pushup')
    expect(next.sets[0].target).toBe(targetRange(byId.pushup, 'health')[0])
    const lungeTop = targetRange(byId['reverse-lunge'], 'health')[1]
    const unavailable = prescribe(byId['reverse-lunge'], defaultProfile, [
      session('reverse-lunge', lungeTop),
      session('reverse-lunge', lungeTop),
    ])
    expect(unavailable.exerciseId).toBe('reverse-lunge')
  })
  it('keeps the load after challenging sets that hit their target', () => {
    const next = prescribe(byId.pushup, { ...defaultProfile, equipment: ['vest'] }, [
      session('pushup', 8, { load: 10, targetLoad: 10, effort: 'hard' }),
    ])
    expect(next.sets[0]).toMatchObject({ target: 8, load: 10 })
  })
  it('reduces weight before changing variation when reps fall below the range', () => {
    const next = prescribe(byId.pushup, { ...defaultProfile, equipment: ['vest'] }, [
      session('pushup', 8, { reps: 4, load: 10, targetLoad: 10 }),
    ])
    expect(next.exerciseId).toBe('pushup')
    expect(next.sets[0]).toMatchObject({ target: byId.pushup.min, load: 7.5 })
  })
  it('never prescribes below the movement minimum', () => {
    const skipped = session('squat', 8, { reps: 0 })
    skipped.exercises[0].sets[0].reps = 8
    const squat = prescribe(byId.squat, defaultProfile, [skipped])
    expect(squat.exerciseId).toBe('squat')
    expect(squat.sets[0].target).toBeGreaterThanOrEqual(byId.squat.min)
    const knee = prescribe(byId['knee-pushup'], defaultProfile, [
      session('knee-pushup', 10, { reps: 5 }),
    ])
    expect(knee.exerciseId).toBe('wall-pushup')
    expect(knee.sets[0].target).toBe(byId['wall-pushup'].min)
  })
  it('treats a session of zero-rep sets as skipped', () => {
    const next = prescribe(byId.squat, defaultProfile, [
      session('squat', 12),
      session('squat', 12, { reps: 0 }),
    ])
    expect(next.sets[0].target).toBe(12)
  })
  it('does not penalise a hard set twice', () => {
    const last = session('squat', 11)
    last.exercises[0].sets[0] = {
      ...last.exercises[0].sets[0],
      target: 12,
      reps: 12,
      effort: 'hard',
    }
    expect(prescribe(byId.squat, defaultProfile, [last]).sets[0].target).toBe(11)
    const weighted: Profile = { ...defaultProfile, equipment: ['vest'] }
    const loaded = session('pushup', 8, { load: 7.5, targetLoad: 7.5 })
    loaded.exercises[0].sets[0] = {
      ...loaded.exercises[0].sets[0],
      load: 10,
      targetLoad: 10,
      effort: 'hard',
    }
    expect(prescribe(byId.pushup, weighted, [loaded]).sets[0].load).toBe(7.5)
  })
  it('requires two successes at the same target before each increase', () => {
    const history = [session('squat', 8), session('squat', 8), session('squat', 9)]
    expect(prescribe(byId.squat, defaultProfile, history).sets[0].target).toBe(9)
    expect(
      prescribe(byId.squat, defaultProfile, [...history, session('squat', 9)]).sets[0].target,
    ).toBe(10)
  })
  it('regresses to an easier variation when the minimum target is too hard', () => {
    const next = prescribe(byId.pushup, defaultProfile, [
      session('pushup', 6, { reps: 3, effort: 'hard' }),
    ])
    expect(next.exerciseId).toBe('knee-pushup')
  })
  it('never prescribes an added load that its own backup parser cannot reload', () => {
    const exercise = byId['diamond-pushup']
    const profile: Profile = { ...defaultProfile, equipment: ['vest'], level: 'intermediate' }
    const history = [
      session(exercise.id, exercise.max, { load: 300, targetLoad: 300 }),
      session(exercise.id, exercise.max, { load: 300, targetLoad: 300 }),
    ]
    const entry = prescribe(exercise, profile, history)
    expect(entry.sets.every((set) => set.load === 300 && set.targetLoad === 300)).toBe(true)
    const plan = generateWorkout(profile, history)
    expect(() =>
      parseBackup(JSON.stringify({ version: 1, profile, history, active: null, plan })),
    ).not.toThrow()
  })
  it('adapts unlogged sets while keeping completed sets and original targets intact', () => {
    const entry = prescribe(byId.pushup, defaultProfile, [])
    entry.sets[0].reps = 4
    entry.sets[0].effort = 'hard'
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[0]).toMatchObject({ target: 6, reps: 4, done: true })
    expect(result.sets[1]).toMatchObject({ target: 4, reps: 4, done: false })
    result.sets[1].reps = 1
    const second = completeSet(result, result.sets[1].id)
    expect(second.sets[0]).toEqual(result.sets[0])
    expect(second.sets[2].target).toBe(1)
    expect(entry.sets[0].done).toBe(false)
  })
  it.each([
    ['good', 18],
    ['easy', 20],
  ] as const)('calibrates a 10-rep squat logged as 20 and %s to %i', (effort, target) => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[0].reps = 20
    entry.sets[0].effort = effort
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[0]).toMatchObject({ target: 10, reps: 20, effort, done: true })
    expect(result.sets.slice(1).every((set) => set.target === target && set.reps === target)).toBe(
      true,
    )
    expect(entry.sets[1]).toMatchObject({ target: 10, reps: 10, done: false })
  })
  it('uses the next set feedback to recalibrate remaining work without ratcheting down at target', () => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[0].reps = 20
    const first = completeSet(entry, entry.sets[0].id)
    const steady = completeSet(first, first.sets[1].id)
    expect(steady.sets[2].target).toBe(18)
    const challenging = {
      ...first,
      sets: first.sets.map((set, i) =>
        i === 1 ? { ...set, reps: 14, effort: 'hard' as const } : set,
      ),
    }
    const reduced = completeSet(challenging, challenging.sets[1].id)
    expect(reduced.sets[0]).toEqual(first.sets[0])
    expect(reduced.sets[1]).toMatchObject({ target: 18, reps: 14, effort: 'hard', done: true })
    // A missed set lowers the rest to what was done, once.
    expect(reduced.sets[2]).toMatchObject({ target: 14, reps: 14, done: false })
  })
  it.each(['good', 'hard'] as const)(
    'treats a zero-rep %s log as a skipped set and keeps later targets',
    (effort) => {
      const entry = session('squat', 10, { done: false }).exercises[0]
      entry.sets[0].reps = 0
      entry.sets[0].effort = effort
      const result = completeSet(entry, entry.sets[0].id)
      expect(result.sets[0]).toMatchObject({ target: 10, reps: 0, done: true })
      expect(result.sets[1]).toMatchObject({ target: 10, reps: 10, done: false })
    },
  )
  it('uses seconds for hold calibration and lowers holds only to what was held', () => {
    const entry = session('plank', 20, { done: false }).exercises[0]
    entry.sets[0].reps = 40
    const first = completeSet(entry, entry.sets[0].id)
    expect(first.sets[1]).toMatchObject({ target: 36, reps: 36 })
    first.sets[1].reps = 30
    first.sets[1].effort = 'hard'
    const second = completeSet(first, first.sets[1].id)
    expect(second.sets[2]).toMatchObject({ target: 30, reps: 30 })
  })
  it('bounds calibrated recommendations by the recording limit and the demonstrated result', () => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[0].reps = 600
    entry.sets[0].effort = 'easy'
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[1]).toMatchObject({ target: 600, reps: 600 })
    const state = { ...emptyState(), plan: { ...session('squat'), exercises: [result] } }
    expect(() => parseBackup(JSON.stringify(state))).not.toThrow()
  })
  it('carries demonstrated weighted load forward and keeps it after a challenging set', () => {
    const entry = session('pushup', 6, { done: false, load: 10, targetLoad: 10 }).exercises[0]
    entry.sets[0].load = 15
    const first = completeSet(entry, entry.sets[0].id)
    expect(first.sets[0]).toMatchObject({ targetLoad: 10, load: 15 })
    expect(first.sets[1]).toMatchObject({ target: 6, targetLoad: 15, load: 15 })
    first.sets[1].effort = 'hard'
    const second = completeSet(first, first.sets[1].id)
    expect(second.sets[2]).toMatchObject({ target: 6, targetLoad: 15, load: 15 })
  })
  it('does not increase reps when achieving extra reps at a reduced load', () => {
    const entry = session('pushup', 6, { done: false, load: 10, targetLoad: 10 }).exercises[0]
    entry.sets[0].load = 5
    entry.sets[0].reps = 12
    const result = completeSet(entry, entry.sets[0].id)
    expect(result.sets[1]).toMatchObject({ target: 6, reps: 6, targetLoad: 5, load: 5 })
  })
  it.each([{ reps: 9 }, { load: 5 }, { effort: 'easy' as const }])(
    'preserves manual upcoming input %j while adapting other sets',
    (patch) => {
      const entry = session('squat', 10, { done: false }).exercises[0]
      entry.sets[0].reps = 20
      Object.assign(entry.sets[1], patch)
      const result = completeSet(entry, entry.sets[0].id)
      expect(result.sets[1]).toEqual(entry.sets[1])
      expect(result.sets[2]).toMatchObject({ target: 18, reps: 18 })
    },
  )
  it('adapts only later pending sets when logging out of order', () => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[1].reps = 20
    const result = completeSet(entry, entry.sets[1].id)
    expect(result.sets[0]).toEqual(entry.sets[0])
    expect(result.sets[1]).toMatchObject({ target: 10, reps: 20, done: true })
    expect(result.sets[2]).toMatchObject({ target: 18, reps: 18 })
  })
  it('allows undo and corrected logging to recalibrate later recommendations', () => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[0].reps = 20
    const logged = completeSet(entry, entry.sets[0].id)
    const undone = completeSet(logged, logged.sets[0].id)
    expect(undone.sets[0]).toMatchObject({ target: 10, reps: 20, done: false })
    expect(undone.sets[1]).toEqual(logged.sets[1])
    undone.sets[0].reps = 5
    undone.sets[0].effort = 'hard'
    const corrected = completeSet(undone, undone.sets[0].id)
    expect(corrected.sets[0]).toMatchObject({ target: 10, reps: 5, done: true })
    expect(corrected.sets[1]).toMatchObject({ target: 5, reps: 5 })
  })
  it('preserves recommendations based on a later completed set when correcting an older one', () => {
    const entry = session('squat', 10, { done: false }).exercises[0]
    entry.sets[0].reps = 20
    const first = completeSet(entry, entry.sets[0].id)
    first.sets[1].reps = 14
    first.sets[1].effort = 'hard'
    const second = completeSet(first, first.sets[1].id)
    const undone = completeSet(second, second.sets[0].id)
    undone.sets[0].reps = 30
    const corrected = completeSet(undone, undone.sets[0].id)
    expect(corrected.sets[0]).toMatchObject({ target: 10, reps: 30, done: true })
    expect(corrected.sets[1]).toEqual(second.sets[1])
    expect(corrected.sets[2]).toMatchObject({ target: 14, reps: 14 })
    expect(corrected.note).toBe(second.note)
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

describe('training goals', () => {
  const muscle: Profile = { ...defaultProfile, goal: 'muscle' }
  it('progresses by effort when the goal does not require steady progression', () => {
    expect(prescribe(byId.squat, muscle, [session('squat', 10)]).sets[0].target).toBe(11)
    expect(
      prescribe(byId.squat, muscle, [session('squat', 10, { effort: 'easy' })]).sets[0].target,
    ).toBe(12)
    const challenging = () => session('squat', 10, { effort: 'hard' })
    expect(prescribe(byId.squat, muscle, [challenging()]).sets[0].target).toBe(10)
    expect(prescribe(byId.squat, muscle, [challenging(), challenging()]).sets[0].target).toBe(11)
  })
  it('keeps steady progression for the health goal', () => {
    expect(prescribe(byId.squat, defaultProfile, [session('squat', 10)]).sets[0].target).toBe(10)
  })
  it('keeps each movement floor and applies the goal ceiling', () => {
    expect(targetRange(byId.squat, 'muscle')).toEqual([8, 20])
    expect(targetRange(byId.squat, 'health')).toEqual([8, 15])
    expect(targetRange(byId.squat, 'strength')).toEqual([8, 8])
    expect(targetRange(byId.pushup, 'strength')).toEqual([6, 8])
    expect(targetRange(byId.plank, 'strength')).toEqual([20, 30])
    // Negatives stay short whatever the goal.
    expect(targetRange(byId['negative-pullup'], 'muscle')).toEqual([3, 6])
  })
  it('moves strength work to the next variation at the top of its short range', () => {
    const strength: Profile = { ...defaultProfile, goal: 'strength', level: 'intermediate' }
    const next = prescribe(byId.pushup, strength, [session('pushup', 8)])
    expect(next.exerciseId).toBe('diamond-pushup')
  })
  it('adds a larger vest step for legs and keeps most of the rep range', () => {
    // Split squats end their ladder, so progress continues with added load.
    const vest: Profile = { ...muscle, equipment: ['vest', 'bench'], level: 'intermediate' }
    const next = prescribe(byId['split-squat'], vest, [session('split-squat', 15)])
    expect(next.sets[0]).toMatchObject({ target: 12, load: 5 })
  })
  it('sizes sessions and rest for the goal', () => {
    const strength = generateWorkout({ ...defaultProfile, goal: 'strength', duration: 30 }, [])
    expect(strength.exercises).toHaveLength(3)
    expect(strength.exercises.every((entry) => entry.sets.length === 3)).toBe(true)
    const fit = generateWorkout({ ...defaultProfile, goal: 'fit', duration: 45 }, [])
    expect(fit.exercises).toHaveLength(6)
    expect(fit.exercises.every((entry) => entry.sets.length === 4)).toBe(true)
    expect(restSeconds(byId.squat, 'strength')).toBe(150)
    expect(restSeconds(byId.squat, 'fit')).toBe(55)
  })
  it('rotates patterns that do not fit in a short session', () => {
    const profile: Profile = { ...defaultProfile, goal: 'strength', duration: 20 }
    const first = generateWorkout(profile, [])
    const patterns = (workout: { exercises: WorkoutExercise[] }) =>
      workout.exercises.map((entry) => byId[entry.exerciseId].pattern)
    expect(patterns(first)).toEqual(['push', 'pull'])
    const done: Session = {
      ...first,
      startedAt: first.createdAt,
      completedAt: first.createdAt,
      elapsedSeconds: 600,
      exercises: first.exercises.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set, done: true })),
      })),
    }
    expect(patterns(generateWorkout(profile, [done]))).toEqual(['squat', 'core'])
  })
  it('defaults older backups by level and rejects unknown goals', () => {
    const state = emptyState()
    delete state.profile.goal
    expect(parseBackup(JSON.stringify(state)).profile.goal).toBe('health')
    state.profile.level = 'intermediate'
    expect(parseBackup(JSON.stringify(state)).profile.goal).toBe('muscle')
    expect(() =>
      parseBackup(JSON.stringify({ ...state, profile: { ...state.profile, goal: 'bulk' } })),
    ).toThrow()
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
    const migrated = parseBackup(JSON.stringify(original))
    expect(migrated).toMatchObject(original)
    expect(parseBackup(JSON.stringify(migrated))).toEqual(migrated)
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
