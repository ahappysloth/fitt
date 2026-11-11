import { available, byId, exercises } from './catalog'
import { MAX_ADDED_LOAD_KG } from './limits'
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
  preferences: { displayName: '', celebration: 'playful', onboarded: false, bodyModel: 'male' },
  routines: [],
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

function makeSets(_exercise: Exercise, count: number, target: number, load = 0): WorkoutSet[] {
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
// A set logged at zero is a skipped set, not evidence about the right target.
const worked = (entry: WorkoutExercise) => entry.sets.filter((s) => s.done && s.reps > 0)
const successful = (entry: WorkoutExercise) =>
  entry.sets.length > 0 &&
  entry.sets.every(
    (s) => s.done && s.reps >= s.target && s.load >= s.targetLoad && s.effort !== 'hard',
  )
const average = (values: number[]) => values.reduce((n, v) => n + v, 0) / values.length
const step = (exercise: Exercise) => (exercise.unit === 'sec' ? 5 : 1)
const LOAD_STEP_KG = 2.5

/** Both sessions were prescribed the same target and added load. */
function sameWork(a: WorkoutExercise, b: WorkoutExercise) {
  const targets = (e: WorkoutExercise) => Math.round(average(e.sets.map((s) => s.target)))
  const loads = (e: WorkoutExercise) => Math.min(...e.sets.map((s) => s.targetLoad))
  return targets(a) === targets(b) && loads(a) === loads(b)
}

export function prescribe(
  exercise: Exercise,
  profile: Profile,
  history: Session[],
): WorkoutExercise {
  const previous = [...history]
    .reverse()
    .flatMap((h) => h.exercises.filter((e) => e.exerciseId === exercise.id && worked(e).length > 0))
  let target = exercise.min
  let load = 0
  let selected = exercise
  let note = 'Start controlled. Leave a couple of good reps in reserve.'
  const last = previous[0]
  if (last) {
    const done = worked(last)
    const plannedTarget = Math.min(
      exercise.max,
      Math.max(exercise.min, Math.round(average(done.map((s) => s.target)))),
    )
    const achieved = Math.round(average(done.map((s) => s.reps)))
    const vest = exercise.weighted && profile.equipment.includes('vest')
    load = vest ? Math.min(...done.map((s) => s.load)) : 0
    // A full, comfortable exercise can reveal that the original target was too
    // low. Keep partial work and changed loads from inflating the next plan.
    const canCalibrate =
      successful(last) && done.every((s) => s.load === load && s.load === s.targetLoad)
    target = canCalibrate
      ? Math.min(exercise.max, Math.max(plannedTarget, achieved))
      : plannedTarget
    const struggled =
      completed(last).length < last.sets.length ||
      done.length < completed(last).length ||
      done.some((s) => s.reps < s.target || s.load < s.targetLoad || s.effort === 'hard')
    if (struggled) {
      // In-session logging already lowered the sets after a hard or missed set,
      // so start from what was actually demonstrated. Only a hard final set has
      // not been absorbed by those in-session adjustments yet.
      const finalHard = done[done.length - 1].effort === 'hard'
      target = Math.min(exercise.max, Math.max(1, Math.min(plannedTarget, achieved)))
      if (finalHard && load > 0) {
        load = Math.max(0, load - LOAD_STEP_KG)
        note = 'Lighter added load after a challenging session.'
      } else {
        if (finalHard) target -= step(exercise)
        note = 'Target adjusted to match your last session.'
      }
      if (target < exercise.min) {
        if (load > 0) {
          load = Math.max(0, load - LOAD_STEP_KG)
          target = exercise.min
          note = 'Lighter added load so you can work in your rep range.'
        } else if (exercise.easier && available(byId[exercise.easier], profile.equipment)) {
          selected = byId[exercise.easier]
          target = selected.min
          load = 0
          note = 'An easier variation to rebuild clean, confident reps.'
        } else {
          target = exercise.min
          note = 'Start at the bottom of the range. Rest longer between sets if you need to.'
        }
      }
    } else if (target > plannedTarget) {
      // Calibrating an underestimated target is separate from earning a new
      // variation or added load through the existing two-session progression.
      note = 'Target calibrated to your completed sets. Build consistency here.'
    } else if (previous.length > 1 && successful(previous[1]) && sameWork(previous[1], last)) {
      if (target >= exercise.max) {
        const harder = exercise.harder && byId[exercise.harder]
        if (harder && available(harder, profile.equipment)) {
          selected = harder
          target = harder.min
          load = 0
          note = 'Two strong sessions. You’ve earned the next variation.'
        } else if (vest) {
          if (load >= MAX_ADDED_LOAD_KG) {
            note = 'You’ve reached the added-load recording limit. Keep this target controlled.'
          } else {
            const increase = Math.min(LOAD_STEP_KG, MAX_ADDED_LOAD_KG - load)
            load += increase
            target = exercise.min
            note = `Two strong sessions. Add ${increase} kg and build your reps again.`
          }
        } else {
          note = 'You’ve reached this rep range. Keep each rep controlled.'
        }
      } else {
        target = Math.min(exercise.max, target + step(exercise))
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

export function freshWorkout(workout: Workout): Workout {
  return {
    id: uid(),
    title: workout.title,
    duration: workout.duration,
    createdAt: new Date().toISOString(),
    exercises: workout.exercises.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({
        ...set,
        id: uid(),
        done: false,
        reps: set.target,
        load: set.targetLoad,
        effort: 'good',
      })),
    })),
  }
}

export function quickWorkout(profile: Profile, history: Session[]): Workout {
  const plan = generateWorkout({ ...profile, duration: 20 }, history)
  const first = plan.exercises[0]
  const second =
    plan.exercises.find(
      (entry) => entry !== first && ['core', 'squat'].includes(byId[entry.exerciseId].pattern),
    ) || plan.exercises[1]
  return {
    ...plan,
    title: 'A five-minute win',
    duration: 5,
    exercises: [first, second].filter(Boolean),
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
  const index = entry.sets.findIndex((s) => s.id === id)
  const set = entry.sets[index]
  if (!set) return entry
  if (set.done)
    return { ...entry, sets: entry.sets.map((s) => (s.id === id ? { ...s, done: false } : s)) }
  // A zero-rep log is a skipped set; keep the remaining recommendations.
  if (set.reps === 0)
    return { ...entry, sets: entry.sets.map((s) => (s.id === id ? { ...s, done: true } : s)) }
  const exercise = byId[entry.exerciseId]
  const struggled = set.reps < set.target || set.effort === 'hard' || set.load < set.targetLoad
  // Comfortable extra reps calibrate an underestimated target. Leave some
  // headroom for fatigue after a "good" set; an easy set can repeat its result.
  const target = Math.min(
    600,
    Math.max(
      1,
      struggled
        ? Math.min(
            set.target,
            set.reps - (set.effort === 'hard' ? (exercise.unit === 'sec' ? 5 : 1) : 0),
          )
        : Math.max(set.target, set.effort === 'easy' ? set.reps : Math.round(set.reps * 0.9)),
    ),
  )
  const load = exercise.weighted
    ? Math.min(
        MAX_ADDED_LOAD_KG,
        Math.max(0, set.load - (set.effort === 'hard' && set.load > 0 ? 2.5 : 0)),
      )
    : 0
  const nextCompleted = entry.sets.findIndex((s, i) => i > index && s.done)
  let adjusted = false
  const sets = entry.sets.map((s, i) => {
    if (i === index) return { ...s, done: true }
    // Only later, untouched sets are recommendations. Preserve manual input,
    // completed work, and earlier sets when a user logs out of order.
    if (
      i < index ||
      (nextCompleted !== -1 && i > nextCompleted) ||
      s.done ||
      s.reps !== s.target ||
      s.load !== s.targetLoad ||
      s.effort !== 'good' ||
      (s.target === target && s.targetLoad === load)
    )
      return s
    adjusted = true
    return { ...s, target, reps: target, load, targetLoad: load }
  })
  return {
    ...entry,
    note: adjusted
      ? `Next suggested target: ${target} ${exercise.unit}${load > 0 ? ` + ${load} kg` : ''}. Quality comes first.`
      : entry.note,
    sets,
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
