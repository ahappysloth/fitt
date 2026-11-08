import type { CloudTrainingData } from '../lib/cloud-contract'
import type { Workout, WorkoutSet } from '../lib/types'

function legacyCore(workout: Workout) {
  return {
    ...workout,
    exercises: workout.exercises.map(({ plannedSetCount: _planned, ...exercise }) => ({
      ...exercise,
      sets: exercise.sets.map(
        ({
          prescription: _prescription,
          recommendationSource: _recommendation,
          effortConfirmed: _effort,
          targetLocked: _locked,
          ...set
        }) => set,
      ),
    })),
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    )
  }
  return value
}

function preserveSet(before: WorkoutSet, incoming: WorkoutSet): WorkoutSet {
  const { prescription, recommendationSource, effortConfirmed, targetLocked, ...core } = incoming
  const original = prescription ?? before.prescription
  const recommendation = recommendationSource ?? before.recommendationSource
  const effort = effortConfirmed ?? before.effortConfirmed
  const locked = targetLocked ?? before.targetLocked
  // Keep the cloud contract's field order, so metadata restoration alone does
  // not turn an otherwise identical snapshot into a new revision.
  return {
    ...core,
    ...(original !== undefined && { prescription: { ...original } }),
    ...(recommendation !== undefined && { recommendationSource: recommendation }),
    ...(effort !== undefined && { effortConfirmed: effort }),
    ...(locked !== undefined && { targetLocked: locked }),
  }
}

function preserveRecords<T extends Workout>(before: T[], incoming: T[]): T[] {
  const previous = new Map(before.map((workout) => [workout.id, workout]))
  return incoming.map((workout) => {
    const existing = previous.get(workout.id)
    if (
      !existing ||
      JSON.stringify(canonical(legacyCore(existing))) !==
        JSON.stringify(canonical(legacyCore(workout)))
    )
      return workout
    return {
      ...workout,
      exercises: workout.exercises.map(({ plannedSetCount, ...exercise }, index) => {
        const original = existing.exercises[index]
        const planned = plannedSetCount ?? original.plannedSetCount
        return {
          ...exercise,
          sets: exercise.sets.map((set, setIndex) => preserveSet(original.sets[setIndex], set)),
          ...(planned !== undefined && { plannedSetCount: planned }),
        }
      }),
    }
  })
}

/** Older clients omit the optional evidence fields from full-snapshot writes.
 * Preserve only evidence already stored for an otherwise unchanged record.
 * Any core edit invalidates this fallback for the entire workout/session. */
export function preserveTrainingEvidence(
  before: CloudTrainingData,
  incoming: CloudTrainingData,
): CloudTrainingData {
  return {
    ...incoming,
    history: preserveRecords(before.history, incoming.history),
    routines: preserveRecords(before.routines, incoming.routines),
  }
}
