import { available, byId, exercises } from './catalog'
import { MAX_ADDED_LOAD_KG } from './limits'
import { goalParams, profileGoal, targetRange } from './goals'
import {
  comfortable,
  comparableExposures,
  completeWork,
  hasReportedEffort,
  orderedHistory,
  originalLoad,
  originalTarget,
} from './training-evidence'
import type {
  AppState,
  Exercise,
  Goal,
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
  // Legacy backups can contain fractional values; new session recommendations
  // must still be usable by the whole-rep/second logger. Keep history unchanged.
  target = Math.max(1, Math.min(600, Math.round(target)))
  return Array.from({ length: count }, (_, index) => ({
    id: uid(),
    target,
    reps: target,
    load,
    targetLoad: load,
    effort: 'good',
    done: false,
    prescription: { target, load, source: 'generated' },
    recommendationSource: 'prescribed',
    effortConfirmed: false,
    targetLocked: false,
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
const step = (exercise: Exercise) => (exercise.unit === 'sec' ? 5 : 1)
const loadStep = (exercise: Exercise) =>
  exercise.pattern === 'squat' || exercise.pattern === 'hinge' ? 5 : 2.5
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
export const setsPerExercise = (profile: Profile) =>
  goalParams[profileGoal(profile)].sets[profile.duration]

export function prescribe(
  exercise: Exercise,
  profile: Profile,
  history: Session[],
): WorkoutExercise {
  const desiredSets = setsPerExercise(profile)
  // The goal sets the ceiling; each movement keeps its own floor.
  const high = targetRange(exercise, profileGoal(profile))[1]
  const previous = orderedHistory(history).flatMap(
    (h) =>
      // One exercise exposure per session, even if imported entries repeat.
      h.exercises.find((e) => e.exerciseId === exercise.id && worked(e).length > 0) ?? [],
  )
  let target = exercise.min
  let load = 0
  let selected = exercise
  let note = 'Start controlled. Leave a couple of good reps in reserve.'
  const last = previous[0]
  if (last) {
    const done = completed(last)
    const effective = worked(last)
    // The original prescription survives in-session suggestions. For legacy
    // entries use all available targets, including skipped work, conservatively.
    const plannedTarget = Math.min(high, Math.max(1, Math.min(...last.sets.map(originalTarget))))
    target = plannedTarget
    const consistentLoad = done.every((s) => s.load === done[0].load)
    const canUseLoad = exercise.weighted && profile.equipment.includes('vest')
    load = canUseLoad
      ? Math.min(
          MAX_ADDED_LOAD_KG,
          Math.max(0, consistentLoad ? done[0].load : Math.min(...done.map(originalLoad))),
        )
      : 0
    const full =
      completeWork(last, desiredSets) &&
      effective.length === done.length &&
      consistentLoad &&
      done.every((s) => !(hasReportedEffort(s) && s.effort === 'hard'))
    const changedLoad = done.some((s) => s.load !== originalLoad(s))
    const canCalibrate = full && !changedLoad && done.every((s) => s.reps >= originalTarget(s))
    if (canCalibrate) {
      target = Math.min(high, Math.max(plannedTarget, Math.min(...done.map((s) => s.reps))))
    } else if (full && changedLoad && canUseLoad) {
      // A new load is a different task. Preserve demonstrated work at that load;
      // reduced-load extra reps do not earn a higher repetition prescription.
      target = Math.min(plannedTarget, Math.max(1, Math.min(...done.map((s) => s.reps))))
    }
    const struggled = effective.some(
      (s) =>
        (hasReportedEffort(s) && s.effort === 'hard') ||
        (s.load === originalLoad(s) && s.reps < originalTarget(s)),
    )
    if (struggled) {
      const easier = nextAvailable(exercise, 'easier', profile)
      if (load > 0) {
        load = Math.max(0, load - loadStep(exercise))
        note = 'Lighter added load after a challenging session.'
      } else if (target <= exercise.min && easier) {
        selected = easier
        target = selected.min
        note = 'An easier variation to rebuild clean, confident reps.'
      } else {
        target = Math.max(
          1,
          Math.min(target - step(exercise), Math.min(...effective.map((s) => s.reps))),
        )
        note = 'Target adjusted down to match your last session.'
        // Never prescribe below the movement's own range.
        if (target < exercise.min) {
          if (easier) {
            selected = easier
            target = selected.min
            note = 'An easier variation to rebuild clean, confident reps.'
          } else {
            target = exercise.min
            note = 'Start at the bottom of the range. Rest longer between sets if you need to.'
          }
        }
      }
    } else if (
      done[0]?.calibration &&
      calibratedLevel(exercise, done[0].reps) > high &&
      nextAvailable(exercise, 'harder', profile)
    ) {
      // The level set showed this variation is already too easy for the range.
      selected = nextAvailable(exercise, 'harder', profile)!
      target = selected.min
      load = 0
      note = 'Your level is above this range, so you start the next variation.'
    } else if (target > plannedTarget) {
      // Calibrating an underestimated target is separate from earning a new
      // variation or added load through the existing two-session progression.
      note = 'Target calibrated to your completed sets. Build consistency here.'
    } else if (previous.length > 1 && comparableExposures(last, previous[1], desiredSets)) {
      if (target >= high) {
        const harder = nextAvailable(exercise, 'harder', profile)
        if (harder) {
          selected = harder
          target = harder.min
          load = 0
          note = 'Two strong sessions. You’ve earned the next variation.'
        } else if (exercise.weighted && profile.equipment.includes('vest')) {
          if (load >= MAX_ADDED_LOAD_KG) {
            note = 'You’ve reached the added-load recording limit. Keep this target controlled.'
          } else {
            const increase = Math.min(loadStep(exercise), MAX_ADDED_LOAD_KG - load)
            load += increase
            // A small load step costs a few reps, not the whole range.
            target = Math.max(exercise.min, high - 3 * step(exercise))
            note = `Two strong sessions. Add ${increase} kg and build your reps again.`
          }
        } else {
          note = 'You’ve reached this rep range. Keep each rep controlled.'
        }
      } else {
        target = Math.min(high, target + step(exercise))
        note = `Two strong sessions. ${exercise.unit === 'sec' ? 'Five more seconds' : 'One more rep'} per set.`
      }
    } else {
      note =
        full && changedLoad
          ? 'Keep the demonstrated load and build consistency at this target.'
          : 'Build consistency at this target before progressing.'
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
    plannedSetCount: desiredSets,
    sets: makeSets(selected, desiredSets, target, load, firstTime),
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
  const recent = orderedHistory(history)
  const sessionsSince = (pattern: Pattern) => {
    const index = recent.findIndex((session) =>
      session.exercises.some(
        (e) => byId[e.exerciseId].pattern === pattern && completed(e).length > 0,
      ),
    )
    return index === -1 ? Infinity : index
  }
  const chosen = new Set(
    group
      .map((pattern, order) => ({ pattern, order, since: sessionsSince(pattern) }))
      .sort((a, b) => b.since - a.since || a.order - b.order)
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
    const last = orderedHistory(history)
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
      plannedSetCount: entry.sets.length,
      sets: entry.sets.map((set) => ({
        ...set,
        id: uid(),
        done: false,
        reps: set.target,
        load: set.targetLoad,
        effort: 'good',
        prescription: {
          target: set.target,
          load: set.targetLoad,
          source: set.prescription?.source ?? 'manual',
        },
        recommendationSource: 'prescribed',
        effortConfirmed: false,
        targetLocked: false,
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
    plannedSetCount: entry.sets.length,
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
  const reportedHard = hasReportedEffort(set) && set.effort === 'hard'
  const struggled = set.reps < set.target || reportedHard || set.load < set.targetLoad
  const high = targetRange(exercise, goal)[1]
  const levelAbove = !!set.calibration && calibratedLevel(exercise, set.reps) > high
  // A level set ends about two reps short; the working sets follow from it.
  // Otherwise comfortable extra reps calibrate an underestimated target, with
  // headroom for fatigue after a "good" set; an easy set can repeat its result.
  const target = set.calibration
    ? Math.min(high, calibratedLevel(exercise, set.reps))
    : Math.min(
        600,
        Math.max(
          1,
          struggled
            ? Math.min(
                set.target,
                set.reps - (reportedHard ? (exercise.unit === 'sec' ? 5 : 1) : 0),
              )
            : comfortable(set)
              ? Math.max(set.target, set.effort === 'easy' ? set.reps : Math.round(set.reps * 0.9))
              : set.target,
        ),
      )
  const load = exercise.weighted
    ? Math.min(MAX_ADDED_LOAD_KG, Math.max(0, set.load - (reportedHard && set.load > 0 ? 2.5 : 0)))
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
      s.targetLocked ||
      s.reps !== s.target ||
      s.load !== s.targetLoad ||
      (s.targetLocked === undefined && hasReportedEffort(s) && s.effort !== 'good') ||
      (s.target === target && s.targetLoad === load)
    )
      return s
    adjusted = true
    return {
      ...s,
      target,
      reps: target,
      load,
      targetLoad: load,
      recommendationSource: 'adapted' as const,
    }
  })
  return {
    ...entry,
    note: levelAbove
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
