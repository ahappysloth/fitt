import { available, byId, exercises } from './catalog'
import type {
  AppState,
  Exercise,
  Focus,
  Pattern,
  Profile,
  Session,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './types'

export const defaultProfile: Profile = {
  equipment: [],
  level: 'beginner',
  duration: 30,
  focus: 'full',
  weeklyGoal: 3,
}
export const emptyState = (): AppState => ({
  version: 1,
  profile: { ...defaultProfile, equipment: [] },
  history: [],
  active: null,
  plan: null,
})
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID requires a secure context; getRandomValues also works in file
  // previews and HTTP frames. These IDs identify local workouts, not credentials.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const focusNames: Record<Focus, string> = {
  full: 'Full body',
  upper: 'Upper body',
  lower: 'Lower body',
  core: 'Core & control',
}

function makeSets(exercise: Exercise, count: number, target: number, load = 0): WorkoutSet[] {
  return Array.from({ length: count }, () => ({
    id: uid(),
    target,
    reps: target,
    load,
    targetLoad: load,
    effort: 'good',
    done: false,
  }))
}
const completed = (entry: WorkoutExercise) => entry.sets.filter((s) => s.done)
const successful = (entry: WorkoutExercise) =>
  entry.sets.length > 0 &&
  entry.sets.every(
    (s) => s.done && s.reps >= s.target && s.load >= s.targetLoad && s.effort !== 'hard',
  )

export function prescribe(
  exercise: Exercise,
  profile: Profile,
  history: Session[],
): WorkoutExercise {
  const previous = [...history]
    .reverse()
    .flatMap((h) =>
      h.exercises.filter((e) => e.exerciseId === exercise.id && completed(e).length > 0),
    )
  let target = exercise.min
  let load = 0
  let selected = exercise
  let note = 'Start controlled. Leave a couple of good reps in reserve.'
  const last = previous[0]
  if (last) {
    const done = completed(last)
    target = Math.min(
      exercise.max,
      Math.max(1, Math.round(done.reduce((n, s) => n + s.target, 0) / done.length)),
    )
    load =
      exercise.weighted && profile.equipment.includes('vest')
        ? Math.min(...done.map((s) => s.load))
        : 0
    const struggled = done.some(
      (s) => s.reps < s.target || s.load < s.targetLoad || s.effort === 'hard',
    )
    if (struggled) {
      if (load > 0) {
        load = Math.max(0, load - 2.5)
        note = 'Lighter added load after a challenging session.'
      } else if (
        target <= exercise.min &&
        exercise.easier &&
        available(byId[exercise.easier], profile.equipment)
      ) {
        selected = byId[exercise.easier]
        target = selected.min
        note = 'An easier variation to rebuild clean, confident reps.'
      } else {
        target = Math.max(
          1,
          Math.min(
            target - (exercise.unit === 'sec' ? 5 : 1),
            Math.min(...done.map((s) => s.reps)) || 1,
          ),
        )
        note = 'Target adjusted down to match your last session.'
      }
    } else if (previous.length > 1 && successful(last) && successful(previous[1])) {
      if (target >= exercise.max) {
        const harder = exercise.harder && byId[exercise.harder]
        if (harder && available(harder, profile.equipment)) {
          selected = harder
          target = harder.min
          load = 0
          note = 'Two strong sessions. You’ve earned the next variation.'
        } else if (exercise.weighted && profile.equipment.includes('vest')) {
          load += 2.5
          target = exercise.min
          note = 'Two strong sessions. Add 2.5 kg and build your reps again.'
        } else {
          note = 'You’ve reached this rep range. Keep each rep controlled.'
        }
      } else {
        target = Math.min(exercise.max, target + (exercise.unit === 'sec' ? 5 : 1))
        note = `Two strong sessions. ${exercise.unit === 'sec' ? 'Five more seconds' : 'One more rep'} per set.`
      }
    } else {
      note = 'Build consistency at this target before progressing.'
    }
  }
  return {
    exerciseId: selected.id,
    sets: makeSets(selected, profile.duration === 20 ? 2 : 3, target, load),
    note,
  }
}

export function generateWorkout(profile: Profile, history: Session[], seed = 0): Workout {
  const groups: Record<Focus, Pattern[]> = {
    full: ['push', 'pull', 'squat', 'core', 'hinge', 'shoulder'],
    upper: ['push', 'pull', 'shoulder', 'core'],
    lower: ['squat', 'hinge', 'core'],
    core: ['core', 'hinge', 'shoulder'],
  }
  const patterns = groups[profile.focus].slice(
    0,
    profile.duration === 20 ? 4 : profile.duration === 30 ? 5 : 6,
  )
  const selected = patterns.map((pattern) => {
    const pool = exercises.filter(
      (e) =>
        e.pattern === pattern &&
        available(e, profile.equipment) &&
        e.level <= (profile.level === 'beginner' ? 1 : 2),
    )
    pool.sort((a, b) => b.level - a.level || b.equipment.length - a.equipment.length)
    // Keep the most recent variation so progress is earned over consecutive sessions.
    const last = [...history]
      .reverse()
      .flatMap((h) => h.exercises)
      .find(
        (e) =>
          byId[e.exerciseId].pattern === pattern &&
          completed(e).length > 0 &&
          available(byId[e.exerciseId], profile.equipment),
      )
    const bestLevel = pool[0]?.level
    const alternatives = pool.filter((e) => e.level === bestLevel)
    const exercise =
      seed === 0 && last
        ? byId[last.exerciseId]
        : alternatives[seed % alternatives.length] || pool[0]
    return prescribe(exercise, profile, history)
  })
  return {
    id: uid(),
    title: `${focusNames[profile.focus]} foundations`,
    createdAt: new Date().toISOString(),
    duration: profile.duration,
    exercises: selected,
  }
}

export function alternativesFor(entry: WorkoutExercise, profile: Profile) {
  return exercises
    .filter(
      (e) =>
        e.id !== entry.exerciseId &&
        e.pattern === byId[entry.exerciseId].pattern &&
        available(e, profile.equipment),
    )
    .sort((a, b) => a.level - b.level)
}

export function replaceExercise(entry: WorkoutExercise, exercise: Exercise): WorkoutExercise {
  return {
    exerciseId: exercise.id,
    sets: makeSets(exercise, entry.sets.length, exercise.min),
    note: 'Variation changed. Start with a controlled set and adjust as needed.',
  }
}

export function completeSet(entry: WorkoutExercise, id: string): WorkoutExercise {
  const set = entry.sets.find((s) => s.id === id)!
  if (set.done)
    return { ...entry, sets: entry.sets.map((s) => (s.id === id ? { ...s, done: false } : s)) }
  const exercise = byId[entry.exerciseId]
  const needsAdjustment =
    set.reps < set.target || set.effort === 'hard' || set.load < set.targetLoad
  const target = Math.max(
    1,
    Math.min(
      set.target,
      set.reps - (set.effort === 'hard' && set.reps > 1 ? (exercise.unit === 'sec' ? 5 : 1) : 0),
    ),
  )
  const load = Math.max(0, set.load - (set.effort === 'hard' && set.load > 0 ? 2.5 : 0))
  return {
    ...entry,
    note: needsAdjustment
      ? `Remaining sets adjusted to ${target} ${exercise.unit}${load > 0 ? ` + ${load} kg` : ''}. Quality comes first.`
      : entry.note,
    sets: entry.sets.map((s) =>
      s.id === id
        ? { ...s, done: true }
        : !s.done && needsAdjustment
          ? { ...s, target, reps: target, load, targetLoad: load }
          : s,
    ),
  }
}

export const totalSets = (workout: Workout) =>
  workout.exercises.reduce((n, e) => n + e.sets.length, 0)
export const doneSets = (workout: Workout) =>
  workout.exercises.reduce((n, e) => n + completed(e).length, 0)
export const sessionReps = (session: Session) =>
  session.exercises.reduce(
    (n, e) =>
      n + (byId[e.exerciseId].unit === 'reps' ? completed(e).reduce((r, s) => r + s.reps, 0) : 0),
    0,
  )
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function weekDays(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}
export function weekCount(history: Session[], now = new Date()) {
  const days = new Set(weekDays(now).map(localDay))
  return history.filter((s) => s.completedAt && days.has(localDay(new Date(s.completedAt)))).length
}
