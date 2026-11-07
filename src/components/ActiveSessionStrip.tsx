import { ArrowRight, Pause, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Session } from '../lib/types'
import { doneSets, totalSets } from '../lib/workout'
import { sessionElapsedSeconds } from '../lib/session-clock'

export default function ActiveSessionStrip({
  session,
  onResume,
}: {
  session: Session
  onResume: () => void
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = sessionElapsedSeconds(session, now)
  return (
    <button
      className="active-session-strip"
      onClick={onResume}
      aria-label={`Return to ${session.pausedAt ? 'paused' : 'active'} workout: ${session.title}`}
    >
      <span className="active-session-strip__icon">
        {session.pausedAt ? <Pause size={18} /> : <Timer size={18} />}
      </span>
      <span className="active-session-strip__title">
        <strong>{session.title}</strong>
        <small>
          {session.pausedAt ? 'Paused' : 'In progress'} · {doneSets(session)}/{totalSets(session)}{' '}
          sets · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </small>
      </span>
      <span className="active-session-strip__resume">
        Return <ArrowRight size={16} />
      </span>
    </button>
  )
}
