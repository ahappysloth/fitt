import { parseCloudData, toCloudData, type CloudTrainingData } from '../cloud-contract'
import type { AppState, Session, Workout } from '../types'
import { generateWorkout } from '../workout'

export const sameValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

const profileLabels = {
  equipment: 'Equipment',
  level: 'Training level',
  duration: 'Workout length',
  focus: 'Training focus',
  weeklyGoal: 'Weekly goal',
  goal: 'Training goal',
} as const
const preferenceLabels = {
  displayName: 'Display name',
  celebration: 'Celebrations',
  onboarded: 'Welcome preferences',
  bodyModel: 'Guide body model',
} as const

/** Three-way merge: independent edits survive; overlapping edits require a choice. */
export function mergeCloudData(
  base: CloudTrainingData,
  local: CloudTrainingData,
  remote: CloudTrainingData,
  choice?: 'local' | 'remote',
): { data: CloudTrainingData; fields: string[] } {
  const fields: string[] = []
  function select<T>(before: T, ours: T, theirs: T, label: string): T {
    if (sameValue(ours, theirs) || sameValue(before, theirs)) return ours
    if (sameValue(before, ours)) return theirs
    fields.push(label)
    return choice === 'remote' ? theirs : ours
  }
  function records<T extends Workout>(
    before: T[],
    ours: T[],
    theirs: T[],
    kind: string,
    preserveOrder = false,
  ): T[] {
    const previous = new Map(before.map((item) => [item.id, item]))
    const left = new Map(ours.map((item) => [item.id, item]))
    const right = new Map(theirs.map((item) => [item.id, item]))
    const ids = [...new Set([...previous.keys(), ...left.keys(), ...right.keys()])].sort()
    const merged = new Map<string, T>()
    for (const id of ids) {
      const title = left.get(id)?.title ?? right.get(id)?.title ?? previous.get(id)?.title ?? id
      const value = select(previous.get(id), left.get(id), right.get(id), `${kind}: ${title}`)
      if (value) merged.set(id, value)
    }
    if (!preserveOrder) return [...merged.values()]
    const order = (items: T[]) => items.map((item) => item.id).filter((id) => merged.has(id))
    const baseOrder = order(before)
    const localOrder = order(ours)
    const remoteOrder = order(theirs)
    let chosen: string[]
    if (sameValue(localOrder, remoteOrder) || sameValue(remoteOrder, baseOrder)) chosen = localOrder
    else if (sameValue(localOrder, baseOrder)) chosen = remoteOrder
    else {
      const common = new Set(baseOrder.filter((id) => left.has(id) && right.has(id)))
      const existing = select(
        baseOrder.filter((id) => common.has(id)),
        localOrder.filter((id) => common.has(id)),
        remoteOrder.filter((id) => common.has(id)),
        'Saved routine order',
      )
      const additions = ids.filter((id) => merged.has(id) && !previous.has(id))
      chosen = [...additions, ...existing]
    }
    const complete = [...new Set([...chosen, ...baseOrder, ...localOrder, ...remoteOrder])]
    return complete.flatMap((id) => (merged.has(id) ? [merged.get(id)!] : []))
  }
  const profile = { ...remote.profile }
  for (const key of Object.keys(profileLabels) as (keyof typeof profileLabels)[]) {
    // Each key retains its declared property type; values never cross keys.
    Object.assign(profile, {
      [key]: select(base.profile[key], local.profile[key], remote.profile[key], profileLabels[key]),
    })
  }
  const preferences = { ...remote.preferences }
  for (const key of Object.keys(preferenceLabels) as (keyof typeof preferenceLabels)[]) {
    Object.assign(preferences, {
      [key]: select(
        base.preferences[key],
        local.preferences[key],
        remote.preferences[key],
        preferenceLabels[key],
      ),
    })
  }
  return {
    data: parseCloudData({
      version: 1,
      profile,
      preferences,
      history: records<Session>(base.history, local.history, remote.history, 'Workout'),
      routines: records<Workout>(
        base.routines,
        local.routines,
        remote.routines,
        'Saved routine',
        true,
      ),
    }),
    fields,
  }
}

/** Explicit imports append records only. Account preferences always win. */
export function importGuestRecords(current: CloudTrainingData, guest: AppState): CloudTrainingData {
  const source = toCloudData(guest)
  const union = <T extends Workout>(existing: T[], incoming: T[]) => {
    const records = new Map(existing.map((item) => [item.id, item]))
    for (const item of incoming) {
      const previous = records.get(item.id)
      if (previous && !sameValue(previous, item)) {
        throw new Error(
          'A workout or saved routine has different versions on this device and in your account. Export both backups before importing; neither version was overwritten.',
        )
      }
      records.set(item.id, item)
    }
    return [...records.values()]
  }
  return parseCloudData({
    ...current,
    history: union(current.history, source.history),
    routines: union(current.routines, source.routines),
  })
}

export function applyCloudData(state: AppState, data: CloudTrainingData): AppState {
  if (state.active && data.history.some((session) => session.id === state.active?.id)) {
    throw new Error(
      'This workout was completed on another device. Finish or discard the current session before resolving the account versions.',
    )
  }
  const changedPlan =
    !sameValue(state.profile, data.profile) || !sameValue(state.history, data.history)
  return {
    ...state,
    ...data,
    active: state.active,
    plan: state.active || !changedPlan ? state.plan : generateWorkout(data.profile, data.history),
  }
}
