import type { Session, WorkoutExercise, WorkoutSet } from './types'

/** Completion order is authoritative, including for imported backups. Last copy wins
 * for the same ID and timestamp; a duplicated session never supplies two exposures. */
export function orderedHistory(history: Session[]): Session[] {
  const sorted = history
    .map((session, index) => ({ session, index, time: Date.parse(session.completedAt || '') }))
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (a, b) =>
        b.time - a.time ||
        (a.session.id < b.session.id ? 1 : a.session.id > b.session.id ? -1 : 0) ||
        b.index - a.index,
    )
  const seen = new Set<string>()
  return sorted
    .filter(({ session }) => {
      if (seen.has(session.id)) return false
      seen.add(session.id)
      return true
    })
    .map(({ session }) => session)
}

/** Easy/hard were intentional choices even in the legacy UI. Its default good
 * rating, however, cannot establish that the user reported comfortable work. */
export const hasReportedEffort = (set: Pick<WorkoutSet, 'effort' | 'effortConfirmed'>) =>
  set.effortConfirmed ?? set.effort !== 'good'
export const comfortable = (set: WorkoutSet) => hasReportedEffort(set) && set.effort !== 'hard'
export const originalTarget = (set: WorkoutSet) => set.prescription?.target ?? set.target
export const originalLoad = (set: WorkoutSet) => set.prescription?.load ?? set.targetLoad

/** Missing provenance or removed/extra work cannot manufacture a complete dose.
 * Legacy sessions remain useful for baseline selection, outside this predicate. */
export function completeWork(entry: WorkoutExercise, desiredSets: number): boolean {
  return (
    entry.plannedSetCount !== undefined &&
    entry.plannedSetCount >= desiredSets &&
    entry.sets.length === entry.plannedSetCount &&
    entry.sets.every((set) => set.done && !!set.prescription)
  )
}

export function completeEvidence(entry: WorkoutExercise, desiredSets: number): boolean {
  return completeWork(entry, desiredSets) && entry.sets.every(comfortable)
}

export function successfulExposure(entry: WorkoutExercise, desiredSets: number): boolean {
  return (
    completeEvidence(entry, desiredSets) &&
    entry.sets.every((set) => set.reps >= originalTarget(set) && set.load === originalLoad(set)) &&
    entry.sets.every((set) => set.load === entry.sets[0].load)
  )
}

/** Complete work that met every original target at one consistent original load. */
export function metTargets(entry: WorkoutExercise, desiredSets: number): boolean {
  return (
    completeWork(entry, desiredSets) &&
    entry.sets.every(
      (set) => set.reps > 0 && set.reps >= originalTarget(set) && set.load === originalLoad(set),
    ) &&
    entry.sets.every((set) => set.load === entry.sets[0].load)
  )
}

const sameTargets = (a: WorkoutExercise, b: WorkoutExercise) =>
  a.sets.length === b.sets.length &&
  a.sets.every(
    (set, index) =>
      originalTarget(set) === originalTarget(b.sets[index]) &&
      originalLoad(set) === originalLoad(b.sets[index]),
  )

/**
 * Several sessions met the same targets, but missing comfortable ratings kept
 * them from counting as progression evidence. Newest exposure first.
 */
export function stalledWithoutRatings(
  exposures: WorkoutExercise[],
  desiredSets: number,
  sessions = 3,
): boolean {
  const recent = exposures.slice(0, sessions)
  return (
    recent.length === sessions &&
    recent.every((entry) => metTargets(entry, desiredSets) && sameTargets(entry, recent[0])) &&
    recent.some((entry) => !completeEvidence(entry, desiredSets))
  )
}

export function comparableExposures(
  latest: WorkoutExercise,
  previous: WorkoutExercise,
  desiredSets: number,
): boolean {
  return (
    successfulExposure(latest, desiredSets) &&
    successfulExposure(previous, desiredSets) &&
    latest.sets.length === previous.sets.length &&
    latest.sets.every(
      (set, index) =>
        originalTarget(set) === originalTarget(previous.sets[index]) &&
        originalLoad(set) === originalLoad(previous.sets[index]),
    )
  )
}
