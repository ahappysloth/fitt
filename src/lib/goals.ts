import type { Exercise, Goal, Level, Profile } from './types'

export interface GoalInfo {
  id: Goal
  name: string
  description: string
}

/** User-facing goals, in the order Settings shows them. */
export const goals: readonly GoalInfo[] = [
  { id: 'muscle', name: 'Build muscle', description: 'More sets, taken close to your limit.' },
  {
    id: 'strength',
    name: 'Get stronger',
    description: 'Harder variations, fewer reps, longer rests.',
  },
  {
    id: 'fit',
    name: 'Lose fat & get fit',
    description: 'Keeps your muscle while you get leaner, with faster-paced sessions.',
  },
  {
    id: 'health',
    name: 'Stay healthy',
    description: 'Balanced, sustainable training that’s easy to keep up.',
  },
]
export const goalIds = goals.map((goal) => goal.id)
export const goalNames = Object.fromEntries(goals.map((goal) => [goal.id, goal.name])) as Record<
  Goal,
  string
>

export interface GoalParams {
  /** Highest reps before a harder variation or added load, capped by the movement. */
  repCeiling: number
  /** Highest seconds for holds before progressing the variation. */
  holdCeiling: number
  /** Movements per session for 20, 30 and 45 minutes. */
  exercises: Record<Profile['duration'], number>
  /** Sets per movement for 20, 30 and 45 minutes. */
  sets: Record<Profile['duration'], number>
  /** Multiplies each movement's base rest. */
  restMultiplier: number
  /** Every increase waits for two successful sessions at the same target. */
  steadyProgression: boolean
}

/*
 * Ceilings and set counts follow the evidence summary in docs/training-goals.md:
 * hypertrophy is similar across roughly 6–20+ reps near failure, strength favours
 * harder variations at lower reps with longer rests, and conditioning trades rest
 * for density. Session sizes keep each goal near its chosen duration.
 */
export const goalParams: Record<Goal, GoalParams> = {
  muscle: {
    repCeiling: 20,
    holdCeiling: 60,
    exercises: { 20: 3, 30: 5, 45: 6 },
    sets: { 20: 3, 30: 3, 45: 3 },
    restMultiplier: 1.2,
    steadyProgression: false,
  },
  strength: {
    repCeiling: 8,
    holdCeiling: 30,
    exercises: { 20: 2, 30: 3, 45: 4 },
    sets: { 20: 3, 30: 3, 45: 3 },
    restMultiplier: 2,
    steadyProgression: false,
  },
  fit: {
    repCeiling: 15,
    holdCeiling: 45,
    exercises: { 20: 4, 30: 5, 45: 6 },
    sets: { 20: 3, 30: 3, 45: 4 },
    restMultiplier: 0.75,
    steadyProgression: false,
  },
  health: {
    repCeiling: 15,
    holdCeiling: 45,
    exercises: { 20: 4, 30: 5, 45: 6 },
    sets: { 20: 2, 30: 3, 45: 3 },
    restMultiplier: 1,
    steadyProgression: true,
  },
}

/** Existing profiles without a goal keep a conservative default for their level. */
export const defaultGoal = (level: Level): Goal => (level === 'intermediate' ? 'muscle' : 'health')
export const profileGoal = (profile: Pick<Profile, 'goal' | 'level'>): Goal =>
  profile.goal ?? defaultGoal(profile.level)

/**
 * The movement's own floor, with the goal's ceiling. Goals never raise a
 * movement's starting point; they decide where the next variation takes over.
 */
export function targetRange(exercise: Exercise, goal: Goal): [number, number] {
  const ceiling =
    exercise.unit === 'sec' ? goalParams[goal].holdCeiling : goalParams[goal].repCeiling
  return [exercise.min, Math.max(exercise.min, Math.min(exercise.max, ceiling))]
}

/** Rest between sets for this goal, rounded to five seconds. */
export function restSeconds(exercise: Exercise, goal: Goal): number {
  const seconds = exercise.rest * goalParams[goal].restMultiplier
  return Math.min(240, Math.max(30, Math.round(seconds / 5) * 5))
}
