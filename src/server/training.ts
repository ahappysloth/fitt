import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  trainingMutations,
  trainingProfiles,
  trainingRoutines,
  trainingWorkouts,
  trainingWorkoutSets,
} from '../db/training'
import {
  emptyCloudData,
  MAX_CLOUD_REVISION,
  parseCloudData,
  type CloudSnapshot,
  type SyncWrite,
} from '../lib/cloud-contract'
import type { ServerDb } from './db'

const RETAINED_MUTATION_RECEIPTS = 512
const INSERT_BATCH_SIZE = 250
type Transaction = Parameters<Parameters<ServerDb['transaction']>[0]>[0]
type Reader = Pick<Transaction, 'select'>

export class MutationReuseError extends Error {
  constructor() {
    super('This sync attempt was already used for different changes. Reload before trying again.')
    this.name = 'MutationReuseError'
  }
}

export interface TrainingWriteResult {
  kind: 'saved' | 'conflict'
  snapshot: CloudSnapshot
  /** False for conflict, a replay, and a document with no changes. */
  changed: boolean
}

async function snapshotFrom(reader: Reader, userId: string): Promise<CloudSnapshot> {
  const [profile] = await reader
    .select()
    .from(trainingProfiles)
    .where(eq(trainingProfiles.userId, userId))
    .limit(1)
  if (!profile) return { revision: 0, data: emptyCloudData() }
  const workouts = await reader
    .select({ data: trainingWorkouts.data })
    .from(trainingWorkouts)
    .where(eq(trainingWorkouts.userId, userId))
    .orderBy(asc(trainingWorkouts.completedAt), asc(trainingWorkouts.id))
  const routines = await reader
    .select({ data: trainingRoutines.data })
    .from(trainingRoutines)
    .where(eq(trainingRoutines.userId, userId))
    .orderBy(asc(trainingRoutines.position), asc(trainingRoutines.id))
  return {
    revision: profile.revision,
    data: parseCloudData({
      version: 1,
      profile: profile.profile,
      preferences: profile.preferences,
      history: workouts.map((row) => row.data),
      routines: routines.map((row) => row.data),
    }),
  }
}

export function readTraining(db: ServerDb, userId: string): Promise<CloudSnapshot> {
  // All queries must observe the same revision, including during another device's commit.
  return db.transaction((tx) => snapshotFrom(tx, userId), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
}

async function requestHash(write: SyncWrite): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      baseRevision: write.baseRevision,
      data: write.data,
    }),
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function batches<T>(rows: T[]): T[][] {
  const result: T[][] = []
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    result.push(rows.slice(start, start + INSERT_BATCH_SIZE))
  }
  return result
}

async function updateCollections(
  tx: Transaction,
  userId: string,
  before: CloudSnapshot['data'],
  after: CloudSnapshot['data'],
) {
  const previousWorkouts = new Map(
    before.history.map((workout) => [workout.id, JSON.stringify(workout)]),
  )
  const nextWorkouts = new Set(after.history.map((workout) => workout.id))
  const removedWorkouts = before.history
    .filter((workout) => !nextWorkouts.has(workout.id))
    .map((workout) => workout.id)
  if (removedWorkouts.length) {
    await tx
      .delete(trainingWorkouts)
      .where(
        and(eq(trainingWorkouts.userId, userId), inArray(trainingWorkouts.id, removedWorkouts)),
      )
  }
  const changedWorkouts = after.history.filter(
    (workout) => previousWorkouts.get(workout.id) !== JSON.stringify(workout),
  )
  for (const batch of batches(changedWorkouts)) {
    await tx
      .insert(trainingWorkouts)
      .values(
        batch.map((workout) => ({
          userId,
          id: workout.id,
          completedAt: new Date(workout.completedAt!),
          duration: workout.duration,
          data: workout,
        })),
      )
      .onConflictDoUpdate({
        target: [trainingWorkouts.userId, trainingWorkouts.id],
        set: {
          completedAt: sql`excluded.completed_at`,
          duration: sql`excluded.duration`,
          data: sql`excluded.data`,
        },
      })
    await tx.delete(trainingWorkoutSets).where(
      and(
        eq(trainingWorkoutSets.userId, userId),
        inArray(
          trainingWorkoutSets.workoutId,
          batch.map((workout) => workout.id),
        ),
      ),
    )
    const sets = batch.flatMap((workout) =>
      workout.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.sets.map((set, setIndex) => ({
          userId,
          workoutId: workout.id,
          id: set.id,
          exerciseId: exercise.exerciseId,
          exerciseIndex,
          setIndex,
          target: set.target,
          reps: set.reps,
          load: set.load,
          targetLoad: set.targetLoad,
          effort: set.effort,
          done: set.done,
        })),
      ),
    )
    for (const setBatch of batches(sets)) await tx.insert(trainingWorkoutSets).values(setBatch)
  }

  const previousRoutines = new Map(
    before.routines.map((routine, position) => [routine.id, JSON.stringify({ routine, position })]),
  )
  const nextRoutines = new Set(after.routines.map((routine) => routine.id))
  const removedRoutines = before.routines
    .filter((routine) => !nextRoutines.has(routine.id))
    .map((routine) => routine.id)
  if (removedRoutines.length) {
    await tx
      .delete(trainingRoutines)
      .where(
        and(eq(trainingRoutines.userId, userId), inArray(trainingRoutines.id, removedRoutines)),
      )
  }
  const changedRoutines = after.routines
    .map((routine, position) => ({ routine, position }))
    .filter((row) => previousRoutines.get(row.routine.id) !== JSON.stringify(row))
  if (changedRoutines.length) {
    await tx
      .insert(trainingRoutines)
      .values(
        changedRoutines.map(({ routine, position }) => ({
          userId,
          id: routine.id,
          position,
          data: routine,
        })),
      )
      .onConflictDoUpdate({
        target: [trainingRoutines.userId, trainingRoutines.id],
        set: { position: sql`excluded.position`, data: sql`excluded.data` },
      })
  }
}

export async function writeTraining(
  db: ServerDb,
  userId: string,
  write: SyncWrite,
): Promise<TrainingWriteResult> {
  const hash = await requestHash(write)
  return db.transaction(async (tx) => {
    const defaults = emptyCloudData()
    await tx
      .insert(trainingProfiles)
      .values({
        userId,
        profile: defaults.profile,
        preferences: defaults.preferences,
      })
      .onConflictDoNothing({ target: trainingProfiles.userId })
    // Lock creation + revision checking + receipts + all child rows together.
    // A competing first request waits for the insert, then locks the same row.
    await tx
      .select({ userId: trainingProfiles.userId })
      .from(trainingProfiles)
      .where(eq(trainingProfiles.userId, userId))
      .for('update')
    const current = await snapshotFrom(tx, userId)
    const [receipt] = await tx
      .select()
      .from(trainingMutations)
      .where(
        and(
          eq(trainingMutations.userId, userId),
          eq(trainingMutations.mutationId, write.mutationId),
        ),
      )
      .limit(1)
    if (receipt) {
      if (receipt.requestHash !== hash) throw new MutationReuseError()
      // A retry may arrive after other commits. Return today's authoritative
      // snapshot, never stale state and never apply the mutation a second time.
      return { kind: 'saved', snapshot: current, changed: false }
    }
    if (write.baseRevision !== current.revision) {
      return { kind: 'conflict', snapshot: current, changed: false }
    }

    const changed = JSON.stringify(current.data) !== JSON.stringify(write.data)
    const nextRevision = current.revision + (changed ? 1 : 0)
    if (nextRevision > MAX_CLOUD_REVISION) throw new Error('Training revision limit reached')
    if (changed) {
      await updateCollections(tx, userId, current.data, write.data)
      await tx
        .update(trainingProfiles)
        .set({
          revision: nextRevision,
          profile: write.data.profile,
          preferences: write.data.preferences,
          updatedAt: new Date(),
        })
        .where(eq(trainingProfiles.userId, userId))
    }
    await tx.insert(trainingMutations).values({
      userId,
      mutationId: write.mutationId,
      requestHash: hash,
      revision: nextRevision,
    })
    const obsolete = await tx
      .select({ mutationId: trainingMutations.mutationId })
      .from(trainingMutations)
      .where(eq(trainingMutations.userId, userId))
      .orderBy(desc(trainingMutations.createdAt), desc(trainingMutations.mutationId))
      .offset(RETAINED_MUTATION_RECEIPTS)
    if (obsolete.length)
      await tx.delete(trainingMutations).where(
        and(
          eq(trainingMutations.userId, userId),
          inArray(
            trainingMutations.mutationId,
            obsolete.map((row) => row.mutationId),
          ),
        ),
      )
    return {
      kind: 'saved',
      snapshot: { revision: nextRevision, data: write.data },
      changed,
    }
  })
}
