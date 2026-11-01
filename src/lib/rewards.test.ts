import { describe, expect, it } from 'vitest'
import type { Session, WorkoutExercise, WorkoutSet } from './types'
import {
  createRewardContext,
  getLevel,
  getRewards,
  getSessionReward,
  rewardWeekKey,
  type RewardContext,
} from './rewards'

type RewardSession = Session & { rewardContext?: RewardContext }
const now = new Date(2026, 10, 1, 15)

function session(
  id: string,
  day = '2026-10-26',
  options: {
    exerciseId?: string
    reps?: number[]
    load?: number
    weeklyGoal?: number
    extra?: Partial<RewardSession>
  } = {},
): RewardSession {
  const { exerciseId = 'knee-pushup', reps = [6, 6, 6], load = 0, weeklyGoal = 3 } = options
  return {
    id,
    title: 'Full body',
    duration: 30,
    createdAt: `${day}T10:00:00.000Z`,
    startedAt: `${day}T10:00:00.000Z`,
    completedAt: `${day}T10:30:00.000Z`,
    elapsedSeconds: 1800,
    rewardContext: { version: 1, weeklyGoal, localDay: day },
    exercises: [
      {
        exerciseId,
        note: '',
        sets: reps.map((value, index) => ({
          id: `${id}-set-${index}`,
          target: 6,
          reps: value,
          targetLoad: load,
          load,
          effort: 'good',
          done: true,
        })),
      },
    ],
    ...options.extra,
  }
}

function extraExercise(
  sessionId: string,
  exerciseId: string,
  reps: number,
  overrides: Partial<WorkoutSet> = {},
): WorkoutExercise {
  return {
    exerciseId,
    note: '',
    sets: [
      {
        id: `${sessionId}-${exerciseId}`,
        target: reps,
        reps,
        load: 0,
        targetLoad: 0,
        effort: 'good',
        done: true,
        ...overrides,
      },
    ],
  }
}

describe('earned XP and level boundaries', () => {
  it('starts honestly at zero with locked awards and the current empty-week goal', () => {
    const result = getRewards([], 4, now)
    expect(result).toMatchObject({
      xp: 0,
      level: 1,
      levelProgress: 0,
      xpToNextLevel: 250,
      sessions: 0,
      completedSets: 0,
      weeksTrained: 0,
      currentWeek: { key: '2026-10-26', goal: 4, count: 0, goalLocked: false },
    })
    expect(result.awards.every((award) => !award.earned)).toBe(true)
    expect(result.records).toEqual([])
  })

  it('awards five XP per logged set and a save bonus, including short and partial workouts', () => {
    const partial = session('partial')
    partial.exercises[0].sets[1].done = false
    partial.exercises[0].sets[2].done = false
    partial.duration = 5
    const result = getRewards([partial], 3, now)
    expect(result.xp).toBe(40)
    expect(result.summaries[0]).toMatchObject({
      completedSets: 1,
      setXP: 5,
      workoutXP: 35,
      personalBestXP: 0,
      weeklyGoalXP: 0,
      totalReps: 6,
      firstOfWeek: true,
      awards: ['first-move', 'fresh-start'],
    })
  })

  it('does not reward unfinished, empty, invalid-date, or reversed-time sessions', () => {
    const unfinished = session('unfinished', undefined, { extra: { completedAt: undefined } })
    const empty = session('empty', undefined, { reps: [] })
    const unlogged = session('unlogged')
    unlogged.exercises[0].sets.forEach((set) => (set.done = false))
    const invalid = session('invalid', undefined, { extra: { completedAt: 'not-a-date' } })
    const reversed = session('reversed', undefined, {
      extra: { startedAt: '2026-11-20T10:00:00Z' },
    })
    expect(getRewards([unfinished, empty, unlogged, invalid, reversed], 3, now).xp).toBe(0)
  })

  it('counts honest logged attempts without inventing a record for zero repetitions', () => {
    const result = getRewards([session('attempt', undefined, { reps: [0] })], 3, now)
    expect(result.xp).toBe(40)
    expect(result.records).toEqual([])
    expect(result.totalReps).toBe(0)
  })

  it('moves levels exactly at 250 XP and handles invalid or fractional inputs safely', () => {
    expect(getLevel(249)).toMatchObject({ level: 1, progress: 249, remaining: 1 })
    expect(getLevel(250)).toEqual({
      level: 2,
      progress: 0,
      remaining: 250,
      threshold: 250,
      percent: 0,
    })
    expect(getLevel(501.8)).toMatchObject({ level: 3, progress: 1, remaining: 249 })
    for (const value of [-5, NaN, Infinity]) expect(getLevel(value).level).toBe(1)
  })

  it('does not lose XP or previously earned badges through rest days and new weeks', () => {
    const history = [session('one'), session('two', '2026-10-28'), session('three', '2026-10-30')]
    const current = getRewards(history, 3, now)
    const later = getRewards(history, 3, new Date(2027, 0, 20))
    expect(current.xp).toBe(175)
    expect(later.xp).toBe(current.xp)
    expect(later.awards.map((award) => [award.id, award.earned])).toEqual(
      current.awards.map((award) => [award.id, award.earned]),
    )
    expect(later.currentWeek.count).toBe(0)
  })
})

describe('idempotent event projection', () => {
  it('deduplicates replayed sessions and repeated sets without mutating history', () => {
    const one = session('one')
    const duplicateSet = structuredClone(one)
    duplicateSet.exercises[0].sets.push(structuredClone(duplicateSet.exercises[0].sets[0]))
    const history = [duplicateSet, structuredClone(duplicateSet)]
    const before = structuredClone(history)
    const result = getRewards(history, 3, now)
    expect(result).toMatchObject({ sessions: 1, completedSets: 3, xp: 50 })
    expect(history).toEqual(before)
    expect(getRewards([one], 3, now)).toEqual(result)
  })

  it('uses chronological and deterministic ordering for replayed or shuffled history', () => {
    const one = session('one')
    const two = session('two', '2026-10-28', { reps: [7, 8] })
    const three = session('three', '2026-10-30')
    expect(getRewards([three, two, one, structuredClone(two)], 3, now)).toEqual(
      getRewards([one, two, three], 3, now),
    )
    const conflicting = session('two', '2026-10-28', { reps: [4] })
    expect(getRewards([two, one, conflicting], 3, now)).toEqual(
      getRewards([conflicting, one, two], 3, now),
    )
  })

  it('ignores unknown movements and invalid numeric set data instead of creating rewards', () => {
    const bad = session('bad')
    bad.exercises[0].exerciseId = '__proto__'
    bad.exercises.push(extraExercise('bad', 'plank', Infinity))
    bad.exercises.push(extraExercise('bad', 'squat', 5, { load: -1 }))
    expect(getRewards([bad], 3, now).xp).toBe(0)
  })
})

describe('comparable personal records', () => {
  it('establishes a first-session baseline and compares later session bests only once', () => {
    const first = session('one', '2026-10-26', { reps: [6, 8, 7] })
    const next = session('two', '2026-10-28', { reps: [9, 10, 11] })
    const result = getRewards([first, next], 3, now)
    expect(result.summaries[0].personalBests).toEqual([])
    expect(result.summaries[1].personalBests).toHaveLength(1)
    expect(result.summaries[1].personalBests[0]).toMatchObject({ value: 11, previous: 8 })
    expect(result.summaries[1].personalBestXP).toBe(15)
    expect(result.records[0]).toMatchObject({ exerciseId: 'knee-pushup', value: 11, unit: 'reps' })
  })

  it('keeps exercise variants and exact added-load baselines separate', () => {
    const history = [
      session('one', '2026-10-26', { exerciseId: 'pushup', reps: [6], load: 0 }),
      session('two', '2026-10-27', { exerciseId: 'pushup', reps: [8], load: 5 }),
      session('three', '2026-10-28', { exerciseId: 'knee-pushup', reps: [12] }),
      session('four', '2026-10-29', { exerciseId: 'pushup', reps: [7], load: 0 }),
      session('five', '2026-10-30', { exerciseId: 'pushup', reps: [9], load: 5 }),
      session('six', '2026-10-31', { exerciseId: 'pushup', reps: [10], load: 2.5 }),
    ]
    const result = getRewards(history, 3, now)
    expect(result.summaries.map((entry) => entry.personalBestXP)).toEqual([0, 0, 0, 15, 15, 0])
    expect(result.records).toHaveLength(4)
  })

  it('keeps hold seconds separate from reps and caps the PB bonus at once per session', () => {
    const first = session('one')
    first.exercises.push(extraExercise('one', 'plank', 20))
    const next = session('two', '2026-10-28', { reps: [7] })
    next.exercises.push(extraExercise('two', 'plank', 25))
    const result = getRewards([first, next], 3, now)
    expect(result.totalReps).toBe(25)
    expect(result.totalHoldSeconds).toBe(45)
    expect(result.summaries[1].personalBests).toHaveLength(2)
    expect(result.summaries[1].personalBestXP).toBe(15)
    expect(result.records.find((record) => record.exerciseId === 'plank')).toMatchObject({
      value: 25,
      unit: 'sec',
      load: 0,
    })
  })

  it('does not award equal records or count unfinished sets as records', () => {
    const one = session('one', undefined, { reps: [8] })
    const two = session('two', '2026-10-28', { reps: [8, 20] })
    two.exercises[0].sets[1].done = false
    const result = getRewards([one, two], 3, now)
    expect(result.summaries[1].personalBestXP).toBe(0)
    expect(result.records[0].sessionId).toBe('one')
  })
})

describe('calendar weeks and stable reward snapshots', () => {
  it('uses Monday civil weeks across month, year, and daylight-saving boundaries', () => {
    expect(rewardWeekKey('2026-11-01')).toBe('2026-10-26')
    expect(rewardWeekKey('2027-01-01')).toBe('2026-12-28')
    expect(rewardWeekKey('2026-03-08')).toBe('2026-03-02')
    expect(() => rewardWeekKey('2026-02-30')).toThrow()
    expect(createRewardContext(4, new Date(2026, 9, 31, 23, 59))).toEqual({
      version: 1,
      weeklyGoal: 4,
      localDay: '2026-10-31',
    })
    expect(createRewardContext(0, now).weeklyGoal).toBe(3)
  })

  it('awards the weekly bonus only once and freezes the first saved workout goal', () => {
    const history = [
      session('one', '2026-10-26', { weeklyGoal: 3 }),
      session('two', '2026-10-28', { weeklyGoal: 1 }),
      session('three', '2026-10-30', { weeklyGoal: 7 }),
      session('four', '2026-11-01', { weeklyGoal: 7 }),
    ]
    const result = getRewards(history, 1, now)
    expect(result.currentWeek).toMatchObject({
      goal: 3,
      count: 4,
      goalReached: true,
      goalLocked: true,
    })
    expect(result.summaries.map((entry) => entry.weeklyGoalXP)).toEqual([0, 0, 25, 0])
    expect(getRewards(history, 7, now).xp).toBe(result.xp)
    expect(getRewards(history, 7, new Date(2026, 10, 2)).currentWeek).toMatchObject({
      goal: 7,
      count: 0,
      goalLocked: false,
    })
  })

  it('honors stored local days even when UTC timestamps fall in another calendar week', () => {
    const entry = session('late-sunday', '2026-11-01', {
      extra: {
        completedAt: '2026-11-02T00:30:00Z',
        rewardContext: { version: 1, weeklyGoal: 1, localDay: '2026-11-01' },
      },
    })
    const result = getRewards([entry], 3, now)
    expect(result.currentWeek).toMatchObject({
      key: '2026-10-26',
      count: 1,
      goal: 1,
      goalReached: true,
    })
    expect(result.currentWeek.days[6]).toMatchObject({ date: '2026-11-01', count: 1, done: true })
    expect(result.summaries[0].weeklyGoalXP).toBe(25)
  })

  it('uses a stable legacy goal and treats first-of-week badges as recurring without extra XP', () => {
    const legacy = session('legacy')
    delete legacy.rewardContext
    const nextWeek = session('new-week', '2026-11-02')
    const result = getRewards([legacy, nextWeek], 1, new Date(2026, 10, 3))
    expect(result.xp).toBe(100)
    expect(result.weeklyHistory[0].goal).toBe(3)
    expect(result.summaries[1].awards).toContain('fresh-start')
    expect(result.summaries[1].unlockedAwards).not.toContain('fresh-start')
    expect(getRewards([legacy, nextWeek], 7, now).xp).toBe(result.xp)
  })
})

describe('achievement events and completion summaries', () => {
  it('recognizes a return after seven calendar days and unlocks ten sessions only once', () => {
    const history = Array.from({ length: 11 }, (_, index) =>
      session(`session-${index}`, `2026-10-${String(index + 1).padStart(2, '0')}`),
    )
    history.push(session('return', '2026-10-18'))
    const result = getRewards(history, 3, now)
    expect(result.awards.find((award) => award.id === 'ten-club')).toMatchObject({
      earned: true,
      progress: 10,
      target: 10,
    })
    expect(result.summaries.filter((summary) => summary.awards.includes('ten-club'))).toHaveLength(
      1,
    )
    expect(result.summaries.at(-1)?.unlockedAwards).toContain('back-at-it')
    expect(result.awards.find((award) => award.id === 'back-at-it')?.earned).toBe(true)
  })

  it('provides the saved workout delta and level transition without applying it a second time', () => {
    const history = Array.from({ length: 5 }, (_, index) =>
      session(`session-${index}`, `2026-10-${String(26 + index).padStart(2, '0')}`),
    )
    const summary = getSessionReward(history, 'session-4', 3, now)
    expect(summary).toMatchObject({ xp: 50, totalXP: 275, levelBefore: 1, levelAfter: 2 })
    expect(getSessionReward([...history, history[4]], 'session-4', 3, now)).toEqual(summary)
    expect(getSessionReward(history, 'missing', 3, now)).toBeUndefined()
  })
})
