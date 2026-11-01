import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, count, eq, inArray } from 'drizzle-orm'
import { user } from '../db/auth'
import {
  trainingMutations,
  trainingProfiles,
  trainingWorkouts,
  trainingWorkoutSets,
} from '../db/training'
import { emptyCloudData, parseSyncWrite, type CloudTrainingData } from '../lib/cloud-contract'
import { generateWorkout } from '../lib/workout'
import { createRequestDb } from './db'
import { MutationReuseError, readTraining, writeTraining } from './training'

// Explicit opt-in only. Uses isolated random users and cascades their records
// away in teardown; never signs anybody in or sends mail.
describe.runIf(process.env.FITT_RUN_LIVE_DB_TESTS === '1')('live training persistence', () => {
  let resource: Awaited<ReturnType<typeof createRequestDb>>
  const userA = crypto.randomUUID()
  const userB = crypto.randomUUID()

  function write(baseRevision: number, data: CloudTrainingData, mutationId = crypto.randomUUID()) {
    return parseSyncWrite({ mutationId, baseRevision, data })
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is required for the opt-in live suite')
    resource = await createRequestDb(process.env.DATABASE_URL)
    await resource.db.insert(user).values(
      [userA, userB].map((id) => ({
        id,
        name: 'Fitt sync integration test',
        email: `fitt-sync-${id}@example.invalid`,
      })),
    )
  }, 30_000)

  afterAll(async () => {
    if (!resource) return
    try {
      await resource.db.delete(user).where(inArray(user.id, [userA, userB]))
    } finally {
      await resource.dispose()
    }
  }, 30_000)

  it('atomically chooses one concurrent first write and scopes both snapshots by user', async () => {
    const peer = await createRequestDb(process.env.DATABASE_URL!)
    const a = emptyCloudData()
    const b = emptyCloudData()
    a.preferences.displayName = 'First device'
    b.preferences.displayName = 'Second device'
    try {
      const results = await Promise.all([
        writeTraining(resource.db, userA, write(0, a)),
        writeTraining(peer.db, userA, write(0, b)),
      ])
      expect(results.map((result) => result.kind).sort()).toEqual(['conflict', 'saved'])
      const saved = results.find((result) => result.kind === 'saved')!
      const conflict = results.find((result) => result.kind === 'conflict')!
      expect(saved.snapshot.revision).toBe(1)
      expect(conflict.snapshot).toEqual(saved.snapshot)
      expect(await readTraining(resource.db, userA)).toEqual(saved.snapshot)
      expect(await readTraining(resource.db, userB)).toEqual({
        revision: 0,
        data: emptyCloudData(),
      })
    } finally {
      await peer.dispose()
    }
  }, 30_000)

  it('replays only the same payload, never rolls back a newer revision, and rejects changed replays', async () => {
    const before = await readTraining(resource.db, userA)
    const data = structuredClone(before.data)
    data.preferences.displayName = 'Initial commit'
    const request = write(before.revision, data)
    const first = await writeTraining(resource.db, userA, request)
    const replay = await writeTraining(resource.db, userA, request)
    expect(replay.snapshot).toEqual(first.snapshot)
    expect(replay.changed).toBe(false)
    const newer = structuredClone(data)
    newer.preferences.displayName = 'Later commit'
    const later = await writeTraining(resource.db, userA, write(first.snapshot.revision, newer))
    const delayedReplay = await writeTraining(resource.db, userA, request)
    expect(delayedReplay.snapshot).toEqual(later.snapshot)
    expect(delayedReplay.changed).toBe(false)
    await expect(
      writeTraining(resource.db, userA, write(request.baseRevision, newer, request.mutationId)),
    ).rejects.toBeInstanceOf(MutationReuseError)
    expect(await readTraining(resource.db, userA)).toEqual(later.snapshot)
  }, 30_000)

  it('persists canonical documents and normalized sets together without leaking same IDs to another user', async () => {
    const current = await readTraining(resource.db, userA)
    const data = structuredClone(current.data)
    const workout = generateWorkout(data.profile, [])
    workout.duration = 1.5
    const completed = {
      ...workout,
      startedAt: workout.createdAt,
      completedAt: new Date(Date.parse(workout.createdAt) + 90_000).toISOString(),
      elapsedSeconds: 90,
      rewardContext: { version: 1 as const, weeklyGoal: 3, localDay: '2026-11-01' },
    }
    data.history.push(completed)
    data.routines.push(workout)
    const result = await writeTraining(resource.db, userA, write(current.revision, data))
    expect(result.kind).toBe('saved')
    const [facts] = await resource.db
      .select({ count: count() })
      .from(trainingWorkoutSets)
      .where(
        and(eq(trainingWorkoutSets.userId, userA), eq(trainingWorkoutSets.workoutId, workout.id)),
      )
    expect(facts.count).toBe(
      workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    )
    expect((await readTraining(resource.db, userA)).data.history[0].duration).toBe(1.5)

    const other = emptyCloudData()
    other.history = [completed]
    await writeTraining(resource.db, userB, write(0, other))
    const cleared = structuredClone(result.snapshot.data)
    cleared.history = []
    cleared.routines = []
    await writeTraining(resource.db, userA, write(result.snapshot.revision, cleared))
    expect((await readTraining(resource.db, userA)).data.history).toEqual([])
    expect((await readTraining(resource.db, userB)).data.history).toHaveLength(1)
    const [remainingA] = await resource.db
      .select({ count: count() })
      .from(trainingWorkoutSets)
      .where(eq(trainingWorkoutSets.userId, userA))
    expect(remainingA.count).toBe(0)
  }, 30_000)

  it('a rejected transaction leaves the profile, children, and receipts untouched', async () => {
    const before = await readTraining(resource.db, userA)
    const countBefore = await resource.db
      .select({ count: count() })
      .from(trainingMutations)
      .where(eq(trainingMutations.userId, userA))
    const data = structuredClone(before.data)
    data.preferences.displayName = 'Must not survive rollback'
    // Deliberately invalid database data bypasses the HTTP parser to exercise
    // the transaction boundary itself, rather than just validation.
    const invalid = generateWorkout(data.profile, [])
    data.history = [
      {
        ...invalid,
        duration: 999,
        startedAt: invalid.createdAt,
        completedAt: invalid.createdAt,
        elapsedSeconds: 0,
        rewardContext: { version: 1, weeklyGoal: 3, localDay: '2026-11-01' },
      },
    ]
    await expect(
      writeTraining(resource.db, userA, {
        mutationId: crypto.randomUUID(),
        baseRevision: before.revision,
        data,
      }),
    ).rejects.toThrow()
    expect(await readTraining(resource.db, userA)).toEqual(before)
    expect(
      await resource.db
        .select({ count: count() })
        .from(trainingMutations)
        .where(eq(trainingMutations.userId, userA)),
    ).toEqual(countBefore)
  }, 30_000)

  it('bounds receipts without weakening stale-revision protection and deletes all account data on account deletion', async () => {
    const before = await readTraining(resource.db, userA)
    const old = write(before.revision, before.data)
    await writeTraining(resource.db, userA, old)
    const next = structuredClone(before.data)
    next.preferences.displayName = 'Receipt trimming'
    const saved = await writeTraining(resource.db, userA, write(before.revision, next))
    await resource.db.insert(trainingMutations).values(
      Array.from({ length: 513 }, (_, i) => ({
        userId: userA,
        mutationId: `fixture-${crypto.randomUUID()}`,
        requestHash: '0'.repeat(64),
        revision: saved.snapshot.revision,
        createdAt: new Date(Date.now() + i + 60_000),
      })),
    )
    await writeTraining(resource.db, userA, write(saved.snapshot.revision, saved.snapshot.data))
    const [receiptCount] = await resource.db
      .select({ count: count() })
      .from(trainingMutations)
      .where(eq(trainingMutations.userId, userA))
    expect(receiptCount.count).toBe(512)
    expect((await writeTraining(resource.db, userA, old)).kind).toBe('conflict')
    await resource.db.delete(user).where(eq(user.id, userB))
    for (const table of [
      trainingProfiles,
      trainingWorkouts,
      trainingWorkoutSets,
      trainingMutations,
    ]) {
      const [row] = await resource.db
        .select({ count: count() })
        .from(table)
        .where(eq(table.userId, userB))
      expect(row.count).toBe(0)
    }
  }, 30_000)
})
