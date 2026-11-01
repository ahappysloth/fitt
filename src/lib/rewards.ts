import { byId } from './catalog'
import type { Session, WorkoutSet } from './types'

export const XP_PER_LEVEL = 250
export const REWARD_XP = {
  set: 5,
  workout: 35,
  personalBest: 15,
  weeklyGoal: 25,
} as const

/** Stored with a finished workout so later preferences/timezone changes cannot move its rewards. */
export interface RewardContext {
  version: 1
  weeklyGoal: number
  localDay: string
}

type RewardSession = Session & { rewardContext?: RewardContext }
export type AwardId =
  'first-move' | 'fresh-start' | 'back-at-it' | 'new-territory' | 'week-winner' | 'ten-club'

export interface PersonalRecord {
  key: string
  exerciseId: string
  unit: 'reps' | 'sec'
  load: number
  value: number
  achievedAt: string
  sessionId: string
}

export interface PersonalBest extends PersonalRecord {
  previous: number
}

export interface SessionReward {
  sessionId: string
  completedAt: string
  localDay: string
  weekStart: string
  completedSets: number
  totalReps: number
  totalHoldSeconds: number
  elapsedSeconds: number
  xp: number
  setXP: number
  workoutXP: number
  personalBestXP: number
  weeklyGoalXP: number
  totalXP: number
  levelBefore: number
  levelAfter: number
  personalBests: PersonalBest[]
  /** Includes recurring first-of-week, weekly-goal and personal-best celebrations. */
  awards: AwardId[]
  /** A badge's first lifetime unlock, separate from its recurring celebrations. */
  unlockedAwards: AwardId[]
  firstOfWeek: boolean
  reachedWeeklyGoal: boolean
}

export interface Achievement {
  id: AwardId
  title: string
  description: string
  earned: boolean
  earnedAt?: string
  latestEarnedAt?: string
  progress: number
  target: number
  detail: string
}

export interface WeekSummary {
  key: string
  goal: number
  count: number
  goalReached: boolean
}

export interface TrainingDay {
  date: string
  label: string
  count: number
  done: boolean
  isToday: boolean
}

export interface Rewards {
  xp: number
  level: number
  levelProgress: number
  xpToNextLevel: number
  sessions: number
  completedSets: number
  totalReps: number
  totalHoldSeconds: number
  elapsedSeconds: number
  weeksTrained: number
  currentWeek: WeekSummary & { goalLocked: boolean; days: TrainingDay[] }
  weeklyHistory: WeekSummary[]
  awards: Achievement[]
  records: PersonalRecord[]
  summaries: SessionReward[]
}

const LEGACY_WEEKLY_GOAL = 3
const DAY_MS = 86_400_000
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const validGoal = (value: number) => Number.isInteger(value) && value >= 1 && value <= 7
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function dayOf(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('A valid calendar date is required.')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Civil dates use UTC solely for calendar arithmetic, never for assigning a workout's local day.
// This keeps a week seven calendar days across daylight-saving changes.
function dayTimestamp(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN
  const timestamp = Date.parse(`${day}T12:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day
    ? timestamp
    : NaN
}

function addDays(day: string, count: number): string {
  return new Date(dayTimestamp(day) + count * DAY_MS).toISOString().slice(0, 10)
}

export function rewardWeekKey(localDay: string): string {
  const timestamp = dayTimestamp(localDay)
  if (!Number.isFinite(timestamp)) throw new RangeError('A valid YYYY-MM-DD date is required.')
  const weekday = new Date(timestamp).getUTCDay()
  return addDays(localDay, -((weekday + 6) % 7))
}

export function createRewardContext(weeklyGoal: number, completedAt = new Date()): RewardContext {
  return {
    version: 1,
    weeklyGoal: validGoal(weeklyGoal) ? weeklyGoal : LEGACY_WEEKLY_GOAL,
    localDay: dayOf(completedAt),
  }
}

export function getLevel(xp: number) {
  const total = Number.isFinite(xp)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(xp)))
    : 0
  const progress = total % XP_PER_LEVEL
  return {
    level: Math.floor(total / XP_PER_LEVEL) + 1,
    progress,
    remaining: XP_PER_LEVEL - progress,
    threshold: XP_PER_LEVEL,
    percent: (progress / XP_PER_LEVEL) * 100,
  }
}

interface LoggedSet {
  exerciseId: string
  unit: 'reps' | 'sec'
  id: string
  reps: number
  load: number
}

interface FinishedSession {
  id: string
  completedAt: string
  timestamp: number
  localDay: string
  weeklyGoal: number
  elapsedSeconds: number
  sets: LoggedSet[]
  fingerprint: string
}

function validLoggedSet(set: WorkoutSet): boolean {
  return (
    set.done === true &&
    typeof set.id === 'string' &&
    set.id.length > 0 &&
    Number.isFinite(set.reps) &&
    set.reps >= 0 &&
    set.reps <= 600 &&
    Number.isFinite(set.load) &&
    set.load >= 0 &&
    set.load <= 300
  )
}

function normalizeSession(session: RewardSession): FinishedSession | null {
  const timestamp = Date.parse(session.completedAt || '')
  const startedAt = Date.parse(session.startedAt)
  if (
    !session.id ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(startedAt) ||
    timestamp < startedAt
  )
    return null

  const logged = session.exercises.flatMap((entry): LoggedSet[] => {
    if (!Object.hasOwn(byId, entry.exerciseId)) return []
    const exercise = byId[entry.exerciseId]
    return entry.sets.filter(validLoggedSet).map((set) => ({
      id: set.id,
      exerciseId: entry.exerciseId,
      unit: exercise.unit,
      reps: set.reps,
      // Added load only compares like-for-like. Ignore stray loads on movements that do not use it.
      load: exercise.weighted ? set.load : 0,
    }))
  })
  // Imported or replayed copies of a set cannot produce extra set XP. A deterministic ordering
  // also makes malformed, conflicting duplicates independent of history/array arrival order.
  logged.sort(
    (a, b) =>
      compare(a.id, b.id) ||
      compare(a.exerciseId, b.exerciseId) ||
      a.reps - b.reps ||
      a.load - b.load,
  )
  const ids = new Set<string>()
  const sets = logged.filter((set) => {
    if (ids.has(set.id)) return false
    ids.add(set.id)
    return true
  })
  if (!sets.length) return null

  const context = session.rewardContext
  const hasContext =
    context?.version === 1 &&
    validGoal(context.weeklyGoal) &&
    Number.isFinite(dayTimestamp(context.localDay))
  const localDay = hasContext ? context.localDay : dayOf(new Date(timestamp))
  const weeklyGoal = hasContext ? context.weeklyGoal : LEGACY_WEEKLY_GOAL
  const elapsedSeconds = Number.isFinite(session.elapsedSeconds)
    ? Math.min(604800, Math.max(0, Math.floor(session.elapsedSeconds!)))
    : 0
  return {
    id: session.id,
    completedAt: new Date(timestamp).toISOString(),
    timestamp,
    localDay,
    weeklyGoal,
    elapsedSeconds,
    sets,
    fingerprint: JSON.stringify([localDay, weeklyGoal, elapsedSeconds, sets]),
  }
}

function finishedSessions(history: readonly RewardSession[]): FinishedSession[] {
  const sessions = history
    .map(normalizeSession)
    .filter((session): session is FinishedSession => session !== null)
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp || compare(a.id, b.id) || compare(a.fingerprint, b.fingerprint),
    )
  const ids = new Set<string>()
  return sessions.filter((session) => {
    if (ids.has(session.id)) return false
    ids.add(session.id)
    return true
  })
}

/**
 * A local projection of finished workout events, with no persisted/cumulative XP counter to drift.
 * Only a saved session earns durable XP; undoing an active set or abandoning it earns nothing.
 * A future synced implementation must validate these same events on the server.
 */
export function getRewards(
  history: readonly RewardSession[],
  currentWeeklyGoal = LEGACY_WEEKLY_GOAL,
  now = new Date(),
): Rewards {
  const today = dayOf(now)
  const currentKey = rewardWeekKey(today)
  const sessions = finishedSessions(history)
  const weeks = new Map<string, WeekSummary>()
  const records = new Map<string, PersonalRecord>()
  const earned = new Map<AwardId, { first: string; latest: string }>()
  const summaries: SessionReward[] = []
  let xp = 0
  let completedSets = 0
  let totalReps = 0
  let totalHoldSeconds = 0
  let elapsedSeconds = 0

  for (const [index, session] of sessions.entries()) {
    const weekStart = rewardWeekKey(session.localDay)
    // The first saved workout fixes this week's goal; changing preferences is prospective.
    const week = weeks.get(weekStart) || {
      key: weekStart,
      goal: session.weeklyGoal,
      count: 0,
      goalReached: false,
    }
    const firstOfWeek = week.count === 0
    week.count += 1
    const reachedWeeklyGoal = !week.goalReached && week.count >= week.goal
    week.goalReached ||= reachedWeeklyGoal
    weeks.set(weekStart, week)

    const sessionBests = new Map<string, PersonalRecord>()
    let reps = 0
    let holds = 0
    for (const set of session.sets) {
      if (set.unit === 'sec') holds += set.reps
      else reps += set.reps
      if (set.reps <= 0) continue
      const key = `${set.exerciseId}:${set.unit}:${set.load}`
      if ((sessionBests.get(key)?.value || 0) >= set.reps) continue
      sessionBests.set(key, {
        key,
        exerciseId: set.exerciseId,
        unit: set.unit,
        load: set.load,
        value: set.reps,
        achievedAt: session.completedAt,
        sessionId: session.id,
      })
    }
    const personalBests: PersonalBest[] = []
    for (const [key, best] of sessionBests) {
      const previous = records.get(key)
      // The first exposure (including the first set at a new load) establishes a baseline.
      // All sets in this session compare to earlier sessions, never to each other.
      if (previous && best.value > previous.value)
        personalBests.push({ ...best, previous: previous.value })
      if (!previous || best.value > previous.value) records.set(key, best)
    }
    personalBests.sort((a, b) => compare(a.exerciseId, b.exerciseId) || a.load - b.load)

    const awards: AwardId[] = []
    if (index === 0) awards.push('first-move')
    if (firstOfWeek) awards.push('fresh-start')
    if (
      index > 0 &&
      dayTimestamp(session.localDay) - dayTimestamp(sessions[index - 1].localDay) >= 7 * DAY_MS
    )
      awards.push('back-at-it')
    if (personalBests.length) awards.push('new-territory')
    if (reachedWeeklyGoal) awards.push('week-winner')
    if (index === 9) awards.push('ten-club')
    const unlockedAwards = awards.filter((id) => !earned.has(id))
    for (const id of awards)
      earned.set(id, {
        first: earned.get(id)?.first || session.completedAt,
        latest: session.completedAt,
      })

    const setXP = session.sets.length * REWARD_XP.set
    const workoutXP = REWARD_XP.workout
    const personalBestXP = personalBests.length ? REWARD_XP.personalBest : 0
    const weeklyGoalXP = reachedWeeklyGoal ? REWARD_XP.weeklyGoal : 0
    const sessionXP = setXP + workoutXP + personalBestXP + weeklyGoalXP
    const levelBefore = getLevel(xp).level
    xp += sessionXP
    completedSets += session.sets.length
    totalReps += reps
    totalHoldSeconds += holds
    elapsedSeconds += session.elapsedSeconds
    summaries.push({
      sessionId: session.id,
      completedAt: session.completedAt,
      localDay: session.localDay,
      weekStart,
      completedSets: session.sets.length,
      totalReps: reps,
      totalHoldSeconds: holds,
      elapsedSeconds: session.elapsedSeconds,
      xp: sessionXP,
      setXP,
      workoutXP,
      personalBestXP,
      weeklyGoalXP,
      totalXP: xp,
      levelBefore,
      levelAfter: getLevel(xp).level,
      personalBests,
      awards,
      unlockedAwards,
      firstOfWeek,
      reachedWeeklyGoal,
    })
  }

  const week = weeks.get(currentKey)
  const currentWeek: Rewards['currentWeek'] = {
    ...(week || {
      key: currentKey,
      goal: validGoal(currentWeeklyGoal) ? currentWeeklyGoal : LEGACY_WEEKLY_GOAL,
      count: 0,
      goalReached: false,
    }),
    goalLocked: !!week,
    days: weekdayLabels.map((label, index) => {
      const date = addDays(currentKey, index)
      const count = sessions.filter((session) => session.localDay === date).length
      return { date, label, count, done: count > 0, isToday: date === today }
    }),
  }
  const bestCount = summaries.reduce((count, summary) => count + summary.personalBests.length, 0)
  const badge = (
    id: AwardId,
    title: string,
    description: string,
    progress: number,
    target: number,
    detail: string,
  ): Achievement => ({
    id,
    title,
    description,
    earned: earned.has(id),
    ...(earned.has(id)
      ? { earnedAt: earned.get(id)!.first, latestEarnedAt: earned.get(id)!.latest }
      : {}),
    progress: Math.min(target, progress),
    target,
    detail,
  })
  const awards: Achievement[] = [
    badge(
      'first-move',
      'First move',
      'Your very first saved workout.',
      sessions.length,
      1,
      sessions.length ? 'The start of something' : 'Start with one set',
    ),
    badge(
      'fresh-start',
      'Fresh start',
      'The first workout of a new week.',
      sessions.length,
      1,
      currentWeek.count ? 'Earned this week' : 'A fresh start awaits this week',
    ),
    badge(
      'back-at-it',
      'Back at it',
      'Return after a week away.',
      earned.has('back-at-it') ? 1 : 0,
      1,
      earned.has('back-at-it') ? 'Every return counts' : 'Your progress will wait for you',
    ),
    badge(
      'new-territory',
      'New territory',
      'Beat a previous best at the same movement and load.',
      bestCount,
      1,
      bestCount
        ? `${bestCount} personal ${bestCount === 1 ? 'best' : 'bests'} set`
        : 'Build your baseline first',
    ),
    badge(
      'week-winner',
      'Week winner',
      'Reach your weekly workout goal.',
      earned.has('week-winner') ? currentWeek.goal : currentWeek.count,
      currentWeek.goal,
      currentWeek.goalReached
        ? 'Weekly goal reached'
        : `${currentWeek.count} of ${currentWeek.goal} this week`,
    ),
    badge(
      'ten-club',
      'The ten club',
      'Ten workouts. All you.',
      sessions.length,
      10,
      sessions.length >= 10 ? 'Ten workouts in the books' : `${sessions.length} of 10 workouts`,
    ),
  ]
  const level = getLevel(xp)
  return {
    xp,
    level: level.level,
    levelProgress: level.progress,
    xpToNextLevel: level.remaining,
    sessions: sessions.length,
    completedSets,
    totalReps,
    totalHoldSeconds,
    elapsedSeconds,
    weeksTrained: weeks.size,
    currentWeek,
    weeklyHistory: [...weeks.values()].sort((a, b) => compare(a.key, b.key)),
    awards,
    records: [...records.values()].sort(
      (a, b) => compare(b.achievedAt, a.achievedAt) || compare(a.key, b.key),
    ),
    summaries,
  }
}

export function getSessionReward(
  history: readonly RewardSession[],
  sessionId: string,
  currentWeeklyGoal = LEGACY_WEEKLY_GOAL,
  now = new Date(),
): SessionReward | undefined {
  return getRewards(history, currentWeeklyGoal, now).summaries.find(
    (summary) => summary.sessionId === sessionId,
  )
}
