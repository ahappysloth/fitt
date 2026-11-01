import { byId, equipmentList } from './catalog'
import { emptyState } from './workout'
import type { AppState } from './types'

export const STORAGE_KEY = 'form.training.v1'
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x)
const numberIn = (n: unknown, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
const date = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s))
function workout(x: unknown, session = false, finished = false): boolean {
  if (
    !object(x) ||
    typeof x.id !== 'string' ||
    typeof x.title !== 'string' ||
    !date(x.createdAt) ||
    !numberIn(x.duration, 1, 180)
  )
    return false
  if (session && !date(x.startedAt)) return false
  if (finished && (!date(x.completedAt) || !numberIn(x.elapsedSeconds, 0, 604800))) return false
  if (!Array.isArray(x.exercises) || !x.exercises.length || x.exercises.length > 30) return false
  return x.exercises.every(
    (e) =>
      object(e) &&
      typeof e.exerciseId === 'string' &&
      Object.hasOwn(byId, e.exerciseId) &&
      typeof e.note === 'string' &&
      Array.isArray(e.sets) &&
      e.sets.length > 0 &&
      e.sets.length <= 10 &&
      e.sets.every(
        (s) =>
          object(s) &&
          typeof s.id === 'string' &&
          numberIn(s.target, 1, 600) &&
          numberIn(s.reps, 0, 600) &&
          numberIn(s.load, 0, 300) &&
          numberIn(s.targetLoad, 0, 300) &&
          ['easy', 'good', 'hard'].includes(s.effort as string) &&
          typeof s.done === 'boolean',
      ),
  )
}
export function parseBackup(raw: string): AppState {
  if (raw.length > 10_000_000)
    throw new Error('This backup is too large. Choose a Fitt backup under 10 MB.')
  let x: unknown
  try {
    x = JSON.parse(raw)
  } catch {
    throw new Error('This file isn’t valid JSON. Choose a Fitt backup.')
  }
  if (!object(x) || x.version !== 1 || !object(x.profile))
    throw new Error('This isn’t a supported Fitt backup.')
  const p = x.profile
  if (
    !Array.isArray(p.equipment) ||
    !p.equipment.every((e) => equipmentList.some((v) => v.id === e)) ||
    !['beginner', 'intermediate'].includes(p.level as string) ||
    ![20, 30, 45].includes(p.duration as number) ||
    !['full', 'upper', 'lower', 'core'].includes(p.focus as string) ||
    !numberIn(p.weeklyGoal, 1, 7) ||
    !Number.isInteger(p.weeklyGoal)
  )
    throw new Error('The training preferences in this backup are invalid.')
  if (
    !Array.isArray(x.history) ||
    x.history.length > 10000 ||
    !x.history.every((s) => workout(s, true, true)) ||
    (x.active !== null && !workout(x.active, true)) ||
    (x.plan !== null && !workout(x.plan))
  )
    throw new Error('This backup contains invalid workout data. Your current data is unchanged.')
  const ids = x.history.map((s: { id: string }) => s.id)
  if (new Set(ids).size !== ids.length || (object(x.active) && ids.includes(x.active.id as string)))
    throw new Error('This backup contains duplicate workouts.')
  return x as unknown as AppState
}
export function loadState(): { state: AppState; error: string | null } {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return {
      state: emptyState(),
      error:
        'This preview cannot save data in your browser. You can try the app here; export a backup before closing it to keep your workouts.',
    }
  }
  try {
    return { state: raw ? parseBackup(raw) : emptyState(), error: null }
  } catch {
    return {
      state: emptyState(),
      error:
        'Saved data could not be loaded. Export the existing data in My setup before resetting storage. Automatic saving is paused to protect it.',
    }
  }
}
export function saveState(state: AppState): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return null
  } catch {
    return 'Your browser could not save this update. Export a backup now to keep your workouts.'
  }
}
