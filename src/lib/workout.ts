import { available, byId, exercises } from './catalog'
import { MAX_ADDED_LOAD_KG } from './limits'
import { goalParams, profileGoal, targetRange } from './goals'
import type {
  AppState,
  Effort,
  Goal,
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
  goal: 'health',
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

function makeSets(
  _exercise: Exercise,
  count: number,
  target: number,
  load = 0,
  calibrate = false,
): WorkoutSet[] {
  return Array.from({ length: count }, (_, index) => ({
    id: uid(),
    target,
    reps: target,
    load,
    targetLoad: load,
    effort: 'good' as const,
    done: false,
    ...(calibrate && index === 0 ? { calibration: true as const } : {}),
  }))
}
/** Sustainable working sets after a "find your level" set stopped about two reps short. */
const CALIBRATION_FACTOR = 0.85
function calibratedLevel(exercise: Exercise, reps: number) {
  const level = reps * CALIBRATION_FACTOR
  return Math.max(1, exercise.unit === 'sec' ? Math.round(level / 5) * 5 : Math.round(level))
}
const completed = (entry: WorkoutExercise) => entry.sets.filter((s) => s.done)
// A set logged at zero is a skipped set, not evidence about the right target.
const worked = (entry: WorkoutExercise) => entry.sets.filter((s) => s.done && s.reps > 0)
const missedSet = (s: WorkoutSet) => s.reps < s.target || s.load < s.targetLoad
/** Every set was completed at its target. "Challenging" (0–1 reps left) still counts. */
const successful = (entry: WorkoutExercise) =>
  entry.sets.length > 0 && entry.sets.every((s) => s.done && !missedSet(s))
const missed = (entry: WorkoutExercise) =>
  completed(entry).length < entry.sets.length ||
  worked(entry).length < completed(entry).length ||
  worked(entry).some(missedSet)
const average = (values: number[]) => values.reduce((n, v) => n + v, 0) / values.length
const step = (exercise: Exercise) => (exercise.unit === 'sec' ? 5 : 1)
const loadStep = (exercise: Exercise) =>
  exercise.pattern === 'squat' || exercise.pattern === 'hinge' ? 5 : 2.5
/** The hardest-rated set decides how the exercise felt overall. */
function overallEffort(sets: WorkoutSet[]): Effort {
  if (sets.some((s) => s.effort === 'hard')) return 'hard'
  return sets.every((s) => s.effort === 'easy') ? 'easy' : 'good'
}
/** Follow a variation ladder past rungs that need equipment the user lacks. */
function nextAvailable(exercise: Exercise, direction: 'easier' | 'harder', profile: Profile) {
  const seen = new Set<string>()
  let id = exercise[direction]
  while (id && !seen.has(id)) {
    seen.add(id)
    const candidate = byId[id]
    if (available(candidate, profile.equipment)) return candidate
    id = candidate[direction]
  }
  return undefined
}

/** Both sessions were prescribed the same target and added load. */
function sameWork(a: WorkoutExercise, b: WorkoutExercise) {
  const targets = (e: WorkoutExercise) => Math.round(average(e.sets.map((s) => s.target)))
  const loads = (e: WorkoutExercise) => Math.min(...e.sets.map((s) => s.targetLoad))
  return targets(a) === targets(b) && loads(a) === loads(b)
}

export const setsPerExercise = (profile: Profile) =>
  goalParams[profileGoal(profile)].sets[profile.duration]

export function prescribe(
  exercise: Exercise,
  profile: Profile,
  history: Session[],
): WorkoutExercise {
  const goal = profileGoal(profile)
  const [low, high] = targetRange(exercise, goal)
  const previous = [...history]
    .reverse()
    .flatMap((h) => h.exercises.filter((e) => e.exerciseId === exercise.id && worked(e).length > 0))
  let target = low
  let load = 0
  let selected = exercise
  let note = 'Start controlled. Stop each set with two or three good reps left.'
  const last = previous[0]
  if (last) {
    const done = worked(last)
    const planned = Math.min(high, Math.max(low, Math.round(average(done.map((s) => s.target)))))
    const achieved = Math.round(average(done.map((s) => s.reps)))
    const vest = exercise.weighted && profile.equipment.includes('vest')
    load = vest ? Math.min(...done.map((s) => s.load)) : 0
    if (missed(last)) {
      // In-session logging already lowered the sets after a missed set, so
      // start from what was actually demonstrated rather than reducing again.
      target = Math.min(high, Math.max(1, Math.min(planned, achieved)))
      note = 'Target adjusted to match your last session.'
      if (target < low) {
        const easier = nextAvailable(exercise, 'easier', profile)
        if (load > 0) {
          load = Math.max(0, load - loadStep(exercise))
          target = low
          note = 'Lighter added load so you can work in your rep range.'
        } else if (easier) {
          selected = easier
          target = targetRange(easier, goal)[0]
          note = 'An easier variation to rebuild clean, confident reps.'
        } else {
          target = low
          note = 'Start at the bottom of the range. Rest longer between sets if you need to.'
        }
      }
    } else if (
      done[0]?.calibration &&
      calibratedLevel(exercise, done[0].reps) > high &&
      nextAvailable(exercise, 'harder', profile)
    ) {
      // The level set showed this variation is already too easy for the range.
      selected = nextAvailable(exercise, 'harder', profile)!
      target = targetRange(selected, goal)[0]
      load = 0
      note = 'Your level is above this range, so you start the next variation.'
    } else {
      const effort = overallEffort(done)
      // Extra comfortable reps at the planned load reveal an underestimated target.
      const steadyLoad = done.every((s) => s.load === load && s.load === s.targetLoad)
      const demonstrated = steadyLoad ? Math.min(high, achieved) : planned
      const repeated = previous.length > 1 && successful(previous[1]) && sameWork(previous[1], last)
      // Easy (4+ reps left) earns two steps and Just right one. Challenging work
      // holds until it has been done twice; steady goals always wait for two.
      let steps = effort === 'easy' ? 2 : effort === 'good' ? 1 : repeated ? 1 : 0
      if (goalParams[goal].steadyProgression && !repeated) steps = 0
      if (demonstrated > planned) {
        target = demonstrated
        note = 'Target calibrated to your completed sets. Build consistency here.'
      } else if (steps === 0) {
        target = planned
        note =
          effort === 'hard'
            ? 'Strong, honest work. Repeat this target until it feels a little easier.'
            : 'Build consistency at this target before progressing.'
      } else if (planned >= high) {
        target = planned
        const harder = nextAvailable(exercise, 'harder', profile)
        if (harder) {
          selected = harder
          target = targetRange(harder, goal)[0]
          load = 0
          note = 'You’ve earned the next variation.'
        } else if (vest) {
          if (load >= MAX_ADDED_LOAD_KG) {
            note = 'You’ve reached the added-load recording limit. Keep this target controlled.'
          } else {
            const increase = Math.min(loadStep(exercise), MAX_ADDED_LOAD_KG - load)
            load += increase
            // A small load step costs a few reps, not the whole range.
            target = Math.max(low, high - 3 * step(exercise))
            note = `Add ${increase} kg and build your reps again.`
          }
        } else {
          note =
            'You’ve reached this range. Slow the lowering to three seconds to keep progressing.'
        }
      } else {
        const increase = steps * step(exercise)
        target = Math.min(high, planned + increase)
        note =
          exercise.unit === 'sec'
            ? `${increase} more seconds per set.`
            : `${increase === 1 ? 'One more rep' : `${increase} more reps`} per set.`
      }
    }
  }
  // The first time a movement appears, set 1 finds the right working target.
  const firstTime = !history.some((h) =>
    h.exercises.some((e) => e.exerciseId === selected.id && worked(e).length > 0),
  )
  if (firstTime)
    note =
      selected.unit === 'sec'
        ? 'Find your level: hold set 1 until you could hold about five more seconds.'
        : 'Find your level: on set 1, stop when you could do about two more reps.'
  return {
    exerciseId: selected.id,
    sets: makeSets(selected, setsPerExercise(profile), target, load, firstTime),
    note,
  }
}

const focusPatterns: Record<Focus, Pattern[]> = {
  full: ['push', 'pull', 'squat', 'core', 'hinge', 'shoulder'],
  upper: ['push', 'pull', 'shoulder', 'core'],
  lower: ['squat', 'hinge', 'core'],
  core: ['core', 'hinge', 'shoulder'],
}

/** When a session has room for fewer patterns than the focus covers, train the stalest ones. */
function sessionPatterns(profile: Profile, history: Session[]): Pattern[] {
  const group = focusPatterns[profile.focus]
  const count = Math.min(group.length, goalParams[profileGoal(profile)].exercises[profile.duration])
  if (count >= group.length) return group
  const lastTrained = (pattern: Pattern) => {
    for (let index = history.length - 1; index >= 0; index -= 1)
      if (
        history[index].exercises.some(
          (e) => byId[e.exerciseId].pattern === pattern && completed(e).length > 0,
        )
      )
        return index
    return -1
  }
  const chosen = new Set(
    group
      .map((pattern, order) => ({ pattern, order, seen: lastTrained(pattern) }))
      .sort((a, b) => a.seen - b.seen || a.order - b.order)
      .slice(0, count)
      .map((item) => item.pattern),
  )
  return group.filter((pattern) => chosen.has(pattern))
}

export function generateWorkout(profile: Profile, history: Session[], seed = 0): Workout {
  const selected = sessionPatterns(profile, history).map((pattern) => {
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

export function completeSet(
  entry: WorkoutExercise,
  id: string,
  goal: Goal = 'health',
): WorkoutExercise {
  const index = entry.sets.findIndex((s) => s.id === id)
  const set = entry.sets[index]
  if (!set) return entry
  if (set.done)
    return { ...entry, sets: entry.sets.map((s) => (s.id === id ? { ...s, done: false } : s)) }
  // A zero-rep log is a skipped set; keep the remaining recommendations.
  if (set.reps === 0)
    return { ...entry, sets: entry.sets.map((s) => (s.id === id ? { ...s, done: true } : s)) }
  const exercise = byId[entry.exerciseId]
  // Only a missed target lowers the remaining sets. "Challenging" means 0–1 reps
  // were left, which is productive work, not a reason to cut the next set.
  const missedTarget = missedSet(set)
  const high = targetRange(exercise, goal)[1]
  // A level set ends about two reps short; the working sets follow from it.
  const target = set.calibration
    ? Math.min(high, calibratedLevel(exercise, set.reps))
    : Math.min(
        600,
        Math.max(
          1,
          missedTarget
            ? Math.min(set.target, set.reps)
            : Math.max(
                set.target,
                // Leave headroom for fatigue; an easy set can repeat its result.
                set.effort === 'easy'
                  ? set.reps
                  : Math.round(set.reps * (set.effort === 'hard' ? 0.8 : 0.9)),
              ),
        ),
      )
  const load = exercise.weighted ? Math.min(MAX_ADDED_LOAD_KG, Math.max(0, set.load)) : 0
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
  const aboveRange = set.calibration && calibratedLevel(exercise, set.reps) > high
  return {
    ...entry,
    note: aboveRange
      ? `Strong start. Today’s sets stay at the top of the range, ${target} ${exercise.unit}; next time moves you on.`
      : adjusted
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
