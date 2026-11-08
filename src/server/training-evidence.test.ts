import { describe, expect, it, vi } from 'vitest'
import {
  trainingMutations,
  trainingProfiles,
  trainingRoutines,
  trainingWorkouts,
} from '../db/training'
import {
  CloudValidationError,
  emptyCloudData,
  MAX_CLOUD_BODY_BYTES,
  parseCloudData,
  type CloudTrainingData,
} from '../lib/cloud-contract'
import type { Session, Workout } from '../lib/types'
import { generateWorkout } from '../lib/workout'
import type { ServerDb } from './db'
import { MutationReuseError, writeTraining } from './training'
import { preserveTrainingEvidence } from './training-evidence'

function dataWithEvidence(): CloudTrainingData {
  const data = emptyCloudData()
  const workout = generateWorkout(data.profile, [])
  const completed: Session = {
    ...workout,
    id: 'history-workout',
    createdAt: '2026-11-01T12:00:00.000Z',
    startedAt: '2026-11-01T12:00:00.000Z',
    completedAt: '2026-11-01T12:10:00.000Z',
    elapsedSeconds: 600,
    rewardContext: { version: 1, weeklyGoal: 3, localDay: '2026-11-01' },
  }
  data.history = [completed]
  data.routines = [{ ...structuredClone(workout), id: 'saved-routine' }]
  for (const item of [...data.history, ...data.routines]) {
    const set = item.exercises[0].sets[0]
    set.prescription = { target: set.target + 1, load: 2.5, source: 'manual' }
    set.recommendationSource = 'adapted'
    set.effortConfirmed = true
    set.targetLocked = true
  }
  return parseCloudData(data)
}

function stripEvidence<T extends Workout>(workout: T): T {
  const result = structuredClone(workout)
  for (const exercise of result.exercises) {
    delete exercise.plannedSetCount
    for (const set of exercise.sets) {
      delete set.prescription
      delete set.recommendationSource
      delete set.effortConfirmed
      delete set.targetLocked
    }
  }
  return result
}

function legacyCopy(data: CloudTrainingData): CloudTrainingData {
  return {
    ...structuredClone(data),
    history: data.history.map(stripEvidence),
    routines: data.routines.map(stripEvidence),
  }
}

describe('legacy-client evidence preservation', () => {
  it('preserves existing evidence on unchanged sessions and routines during an unrelated write', () => {
    const before = dataWithEvidence()
    const incoming = legacyCopy(before)
    incoming.profile.weeklyGoal = 4
    const result = preserveTrainingEvidence(before, incoming)
    expect(result.profile.weeklyGoal).toBe(4)
    expect(result.history).toEqual(before.history)
    expect(result.routines).toEqual(before.routines)
    expect(JSON.stringify(result.history)).toBe(JSON.stringify(before.history))
    expect(JSON.stringify(result.routines)).toBe(JSON.stringify(before.routines))
  })

  it.each([
    [
      'result',
      (item: Workout) => {
        item.exercises[0].sets[0].reps += 1
      },
    ],
    [
      'target',
      (item: Workout) => {
        item.exercises[0].sets[0].target += 1
      },
    ],
    [
      'load',
      (item: Workout) => {
        item.exercises[0].sets[0].load += 1
      },
    ],
    [
      'effort',
      (item: Workout) => {
        item.exercises[0].sets[0].effort = 'hard'
      },
    ],
    [
      'set removal',
      (item: Workout) => {
        item.exercises[0].sets.pop()
      },
    ],
    [
      'title',
      (item: Workout) => {
        item.title = 'Edited routine'
      },
    ],
  ] as const)('does not restore stale evidence after a core %s change', (_name, change) => {
    const before = dataWithEvidence()
    const incoming = legacyCopy(before)
    change(incoming.history[0])
    change(incoming.routines[0])
    const result = preserveTrainingEvidence(before, incoming)
    expect(result.history).toEqual(incoming.history)
    expect(result.routines).toEqual(incoming.routines)
    expect(result.history[0].exercises[1]).not.toHaveProperty('plannedSetCount')
    expect(result.history[0].exercises[1].sets[0]).not.toHaveProperty('prescription')
  })

  it('compares the whole session, including chronology and reward context', () => {
    const before = dataWithEvidence()
    for (const change of [
      (item: Session) => {
        item.completedAt = '2026-11-01T12:11:00.000Z'
      },
      (item: Session) => {
        item.rewardContext!.weeklyGoal = 4
      },
      (item: Session) => {
        item.elapsedSeconds = 601
      },
    ]) {
      const incoming = legacyCopy(before)
      change(incoming.history[0])
      expect(preserveTrainingEvidence(before, incoming).history).toEqual(incoming.history)
    }
  })

  it('keeps explicit incoming metadata, including false, while filling only missing fields', () => {
    const before = dataWithEvidence()
    const incoming = legacyCopy(before)
    for (const item of [...incoming.history, ...incoming.routines]) {
      item.exercises[0].plannedSetCount = 2
      Object.assign(item.exercises[0].sets[0], {
        effortConfirmed: false,
        targetLocked: false,
        prescription: { target: 12, load: 0, source: 'generated' },
      })
    }
    const result = preserveTrainingEvidence(before, incoming)
    for (const item of [...result.history, ...result.routines]) {
      expect(item.exercises[0].plannedSetCount).toBe(2)
      expect(item.exercises[0].sets[0]).toMatchObject({
        effortConfirmed: false,
        targetLocked: false,
        prescription: { target: 12, load: 0, source: 'generated' },
        recommendationSource: 'adapted',
      })
    }
  })

  it('keeps record removal and resets removed, and leaves new legacy records unknown', () => {
    const before = dataWithEvidence()
    const cleared = { ...legacyCopy(before), history: [], routines: [] }
    expect(preserveTrainingEvidence(before, cleared)).toEqual(cleared)
    const incoming = legacyCopy(before)
    incoming.history[0].id = 'new-history'
    incoming.routines[0].id = 'new-routine'
    expect(preserveTrainingEvidence(before, incoming)).toEqual(incoming)
  })

  it('does not mutate either input and is idempotent after canonical JSON round trips', () => {
    const before = dataWithEvidence()
    const incoming = legacyCopy(before)
    const originalBefore = structuredClone(before)
    const originalIncoming = structuredClone(incoming)
    const once = preserveTrainingEvidence(before, incoming)
    const twice = preserveTrainingEvidence(before, parseCloudData(JSON.parse(JSON.stringify(once))))
    expect(once).toEqual(twice)
    expect(before).toEqual(originalBefore)
    expect(incoming).toEqual(originalIncoming)
  })
})

/** Exercise write ordering and returned snapshots without opening a database. */
function memoryDb(initial: CloudTrainingData) {
  let data = structuredClone(initial)
  let revision = 4
  const receipts: { requestHash: string }[] = []
  const collectionWrites = vi.fn()
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const rows =
          table === trainingProfiles
            ? [{ revision, profile: data.profile, preferences: data.preferences }]
            : table === trainingWorkouts
              ? data.history.map((item) => ({ data: item }))
              : table === trainingRoutines
                ? data.routines.map((item) => ({ data: item }))
                : receipts
        const query = Object.assign(Promise.resolve(rows), {
          where: () => query,
          for: () => Promise.resolve([]),
          limit: () => Promise.resolve(rows),
          orderBy: () => query,
          offset: () => Promise.resolve([]),
        })
        return query
      },
    }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        if (table === trainingMutations) receipts.push(value as { requestHash: string })
        else if (table !== trainingProfiles) collectionWrites(table, value)
        return Object.assign(Promise.resolve(), { onConflictDoNothing: () => Promise.resolve() })
      },
    }),
    update: () => ({
      set: (values: {
        revision: number
        profile: CloudTrainingData['profile']
        preferences: CloudTrainingData['preferences']
      }) => ({
        where: async () => {
          revision = values.revision
          data = { ...data, profile: values.profile, preferences: values.preferences }
        },
      }),
    }),
    delete: collectionWrites,
  }
  return {
    db: {
      transaction: (run: (transaction: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as ServerDb,
    collectionWrites,
  }
}

describe('training write integration', () => {
  it('returns preserved evidence, skips unchanged collection writes, and hashes the original request for retries', async () => {
    const before = dataWithEvidence()
    const fixture = memoryDb(before)
    const incoming = legacyCopy(before)
    incoming.preferences.displayName = 'Legacy client edit'
    const write = { mutationId: 'legacy-write-123', baseRevision: 4, data: incoming }
    const result = await writeTraining(fixture.db, 'account-a', write)
    expect(result).toEqual({
      kind: 'saved',
      changed: true,
      snapshot: { revision: 5, data: { ...before, preferences: incoming.preferences } },
    })
    expect(fixture.collectionWrites).not.toHaveBeenCalled()
    expect(incoming.history[0].exercises[0].sets[0]).not.toHaveProperty('prescription')
    const replay = await writeTraining(fixture.db, 'account-a', write)
    expect(replay).toEqual({ ...result, changed: false })
    await expect(
      writeTraining(fixture.db, 'account-a', {
        ...write,
        data: result.snapshot.data,
      }),
    ).rejects.toBeInstanceOf(MutationReuseError)
  })

  it('treats stripped metadata alone as a no-op without incrementing the revision', async () => {
    const before = dataWithEvidence()
    const fixture = memoryDb(before)
    const result = await writeTraining(fixture.db, 'account-a', {
      mutationId: 'legacy-no-op-123',
      baseRevision: 4,
      data: legacyCopy(before),
    })
    expect(result).toEqual({
      kind: 'saved',
      changed: false,
      snapshot: { revision: 4, data: before },
    })
    expect(fixture.collectionWrites).not.toHaveBeenCalled()
  })

  it('rejects an oversized restored snapshot before persisting an unreadable document', async () => {
    const template = dataWithEvidence().history[0]
    template.id = 'near-limit-0000'
    template.exercises = [template.exercises[0]]
    template.exercises[0].note = 'x'.repeat(2000)
    const rowBytes = JSON.stringify(template).length + 1
    const count = Math.floor((MAX_CLOUD_BODY_BYTES - 2000) / rowBytes)
    const before = parseCloudData({
      ...emptyCloudData(),
      history: Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `near-limit-${String(index).padStart(4, '0')}`,
      })),
    })
    const incoming = legacyCopy(before)
    for (let index = 0; index < 20; index++) {
      incoming.history.push({ ...stripEvidence(template), id: `new-record-${index}` })
    }
    // The original old-client request still meets the existing request limit.
    const request = parseCloudData(incoming)
    const fixture = memoryDb(before)
    await expect(
      writeTraining(fixture.db, 'account-a', {
        mutationId: 'legacy-size-limit-123',
        baseRevision: 4,
        data: request,
      }),
    ).rejects.toBeInstanceOf(CloudValidationError)
    expect(fixture.collectionWrites).not.toHaveBeenCalled()
  })
})
