import type { Session } from './types'

/** Wall-clock training time excludes all pauses, including a pause still in progress. */
export function sessionElapsedSeconds(session: Session, now = Date.now()): number {
  if (session.completedAt && session.elapsedSeconds !== undefined) return session.elapsedSeconds
  const end = session.completedAt
    ? Date.parse(session.completedAt)
    : session.pausedAt
      ? Date.parse(session.pausedAt)
      : now
  return Math.min(
    604800,
    Math.max(
      0,
      Math.floor((end - Date.parse(session.startedAt)) / 1000 - (session.pausedSeconds || 0)),
    ),
  )
}

export function toggleSessionPause(session: Session, now = Date.now()): Session {
  if (session.completedAt) return session
  if (!session.pausedAt) return { ...session, pausedAt: new Date(now).toISOString() }
  const pausedSeconds =
    (session.pausedSeconds || 0) + Math.max(0, (now - Date.parse(session.pausedAt)) / 1000)
  return { ...session, pausedAt: undefined, pausedSeconds }
}
