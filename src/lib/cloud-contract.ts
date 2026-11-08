import { parseBackup } from './storage'
import { emptyState } from './workout'
import type { AppState, Profile, Session, UserPreferences, Workout, WorkoutSet } from './types'

export const MAX_CLOUD_BODY_BYTES = 10_000_000
export const MAX_CLOUD_REVISION = 2_147_483_646

/** Only completed training is shared. A plan and an active session belong to their device. */
export interface CloudTrainingData {
  version: 1
  profile: Profile
  preferences: UserPreferences
  history: Session[]
  routines: Workout[]
}

export interface CloudSnapshot {
  revision: number
  data: CloudTrainingData
}

export interface SyncWrite {
  mutationId: string
  baseRevision: number
  data: CloudTrainingData
}

export class CloudValidationError extends Error {
  constructor(message = 'This training data is invalid. Your saved workouts are unchanged.') {
    super(message)
    this.name = 'CloudValidationError'
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validRevision(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CLOUD_REVISION
  )
}

function cleanText(value: string): string {
  // Postgres text/JSONB reject NUL and unpaired UTF-16 surrogates. Reject them
  // before the database rather than turning a malformed client value into a 500.
  for (const character of value) {
    const point = character.codePointAt(0)!
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) throw new CloudValidationError()
  }
  return value
}

function cleanSet(set: WorkoutSet): WorkoutSet {
  return {
    id: cleanText(set.id),
    target: set.target,
    reps: set.reps,
    load: set.load,
    targetLoad: set.targetLoad,
    effort: set.effort,
    done: set.done,
    ...(set.prescription !== undefined && {
      prescription: {
        target: set.prescription.target,
        load: set.prescription.load,
        source: set.prescription.source,
      },
    }),
    ...(set.recommendationSource !== undefined && {
      recommendationSource: set.recommendationSource,
    }),
    ...(set.effortConfirmed !== undefined && { effortConfirmed: set.effortConfirmed }),
    ...(set.targetLocked !== undefined && { targetLocked: set.targetLocked }),
  }
}

function cleanWorkout(workout: Workout): Workout {
  return {
    id: cleanText(workout.id),
    title: cleanText(workout.title),
    createdAt: new Date(workout.createdAt).toISOString(),
    duration: workout.duration,
    exercises: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map(cleanSet),
      note: cleanText(exercise.note),
      ...(exercise.plannedSetCount !== undefined && {
        plannedSetCount: exercise.plannedSetCount,
      }),
    })),
  }
}

function cleanSession(session: Session): Session {
  return {
    ...cleanWorkout(session),
    startedAt: new Date(session.startedAt).toISOString(),
    completedAt: new Date(session.completedAt!).toISOString(),
    elapsedSeconds: session.elapsedSeconds!,
    rewardContext: {
      version: 1,
      weeklyGoal: session.rewardContext!.weeklyGoal,
      localDay: session.rewardContext!.localDay,
    },
  }
}

/** Validate against the app's backup rules, then rebuild only known fields. */
export function parseCloudData(raw: unknown): CloudTrainingData {
  if (
    !object(raw) ||
    raw.version !== 1 ||
    !object(raw.profile) ||
    !object(raw.preferences) ||
    !Array.isArray(raw.history) ||
    !Array.isArray(raw.routines)
  )
    throw new CloudValidationError()

  let state: AppState
  try {
    const serialized = JSON.stringify({
      version: raw.version,
      profile: raw.profile,
      preferences: raw.preferences,
      history: raw.history,
      routines: raw.routines,
      active: null,
      plan: null,
    })
    if (new TextEncoder().encode(serialized).byteLength > MAX_CLOUD_BODY_BYTES) {
      throw new CloudValidationError('This training backup is larger than the 10 MB sync limit.')
    }
    state = parseBackup(serialized)
  } catch (error) {
    if (error instanceof CloudValidationError) throw error
    throw new CloudValidationError()
  }

  const preferences = state.preferences!
  return {
    version: 1,
    profile: {
      equipment: [...new Set(state.profile.equipment)].sort(),
      level: state.profile.level,
      duration: state.profile.duration,
      focus: state.profile.focus,
      weeklyGoal: state.profile.weeklyGoal,
    },
    preferences: {
      displayName: cleanText(preferences.displayName),
      celebration: preferences.celebration,
      onboarded: preferences.onboarded,
      bodyModel: preferences.bodyModel ?? 'male',
    },
    history: state.history.map(cleanSession).sort((left, right) => {
      const a = `${left.completedAt!}\u0000${left.id}`
      const b = `${right.completedAt!}\u0000${right.id}`
      return a < b ? -1 : a > b ? 1 : 0
    }),
    routines: state.routines!.map(cleanWorkout),
  }
}

export function toCloudData(state: AppState): CloudTrainingData {
  const defaults = emptyState()
  return parseCloudData({
    version: 1,
    profile: state.profile,
    preferences: state.preferences ?? defaults.preferences,
    history: state.history,
    routines: state.routines ?? [],
  })
}

export function emptyCloudData(): CloudTrainingData {
  return toCloudData(emptyState())
}

export function parseCloudSnapshot(raw: unknown): CloudSnapshot {
  if (!object(raw) || !validRevision(raw.revision)) throw new CloudValidationError()
  return { revision: raw.revision, data: parseCloudData(raw.data) }
}

export function parseSyncWrite(raw: unknown): SyncWrite {
  if (
    !object(raw) ||
    !validRevision(raw.baseRevision) ||
    typeof raw.mutationId !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(raw.mutationId)
  )
    throw new CloudValidationError()
  return {
    mutationId: raw.mutationId,
    baseRevision: raw.baseRevision,
    data: parseCloudData(raw.data),
  }
}
