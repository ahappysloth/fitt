import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, Check, Star } from 'lucide-react'

export function ProgressBar({
  value,
  label,
  className = '',
}: {
  value: number
  label: string
  className?: string
}) {
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <span style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}
export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`pill ${className}`}>{children}</span>
}
export function SectionTitle({
  eyebrow,
  title,
  action,
  level = 2,
}: {
  level?: 2 | 3
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading>{title}</Heading>
      </div>
      {action}
    </div>
  )
}
export function XPCard({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const level = Math.floor(xp / 250) + 1,
    progress = xp % 250
  return (
    <div className={`xp-card ${compact ? 'compact' : ''}`}>
      <div className="xp-heading">
        <span className="level-medallion">
          <Star size={21} fill="currentColor" />
        </span>
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h3>
            Level {level} <span>• Momentum maker</span>
          </h3>
        </div>
        <span className="xp-total">
          {xp.toLocaleString()} <small>XP</small>
        </span>
      </div>
      <ProgressBar value={(progress / 250) * 100} label={`Level ${level} progress`} />
      <div className="xp-meta">
        <span>{progress} / 250 XP</span>
        <span>
          <strong>{250 - progress} XP</strong> to level {level + 1}
          <ArrowUpRight size={12} />
        </span>
      </div>
    </div>
  )
}
export function Week({
  finished,
  selected,
  onSelect,
}: {
  finished: boolean
  selected: number
  onSelect: (day: number) => void
}) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <div className="week-strip">
      {names.map((day, i) => {
        const done = i === 0 || i === 2 || (i === 5 && finished)
        return (
          <button
            key={day}
            className={`day ${done ? 'done' : ''} ${i === 5 ? 'today' : ''} ${selected === i ? 'selected' : ''}`}
            onClick={() => onSelect(i)}
            aria-label={`${day}, ${done ? 'workout complete' : i === 5 ? 'today’s workout' : 'rest day'}`}
            aria-pressed={selected === i}
          >
            <span className="day-state">
              {done ? (
                <Check size={10} strokeWidth={4} />
              ) : i === 5 ? (
                <span className="pulse-dot" />
              ) : (
                <span className="rest-dot" />
              )}
            </span>
            <span>{day}</span>
            <strong>{26 + i > 31 ? 1 : 26 + i}</strong>
          </button>
        )
      })}
    </div>
  )
}
export function CountUp({ value, calm }: { value: number; calm: boolean }) {
  const [display, setDisplay] = useState(calm ? value : 0)
  useEffect(() => {
    if (calm || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }
    let frame = 0,
      start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / 900)
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, calm])
  return <>{display}</>
}
export function Confetti({ calm }: { calm: boolean }) {
  if (calm) return null
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 32 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${(i * 37) % 100}%`,
              '--drift': `${(i % 2 ? -1 : 1) * (30 + i * 4)}px`,
              '--delay': `${(i % 7) * 0.07}s`,
              '--turn': `${(i % 2 ? -1 : 1) * (160 + i * 29)}deg`,
              '--color': ['var(--accent)', '#edf5dc', '#7c9d4a', '#bdcbab'][i % 4],
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
