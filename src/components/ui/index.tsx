'use client'

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { ArrowUpRight, Check, Star } from 'lucide-react'
import { getLevel } from '../../lib/rewards'
import { localDay } from '../../lib/workout'
import { Tooltip } from './Tooltip'

export { Select } from './Select'
export { Tooltip } from './Tooltip'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const style =
    variant === 'ghost'
      ? 'text-button'
      : variant === 'danger'
        ? 'danger-button'
        : `${variant}-button`
  return <button type={type} className={`${style} ${className}`} {...props} />
}

export function IconButton({
  label,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip content={label}>
      <button type={type} aria-label={label} className={`icon-button ${className}`} {...props} />
    </Tooltip>
  )
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`pill ${className}`}>{children}</span>
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function ProgressBar({
  value,
  label,
  className = '',
}: {
  value: number
  label: string
  className?: string
}) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}

export function XPCard({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const { level, progress, remaining, threshold, percent } = getLevel(xp)
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0
  return (
    <div className={`xp-card ${compact ? 'compact' : ''}`}>
      <div className="xp-heading">
        <span className="level-medallion">
          <Star size={21} fill="currentColor" aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h3>Level {level}</h3>
        </div>
        <span className="xp-total">
          {total.toLocaleString()} <small>XP</small>
        </span>
      </div>
      <ProgressBar
        value={percent}
        label={`Level ${level} progress: ${progress} of ${threshold} XP`}
      />
      <div className="xp-meta">
        <span>
          {progress} / {threshold} XP
        </span>
        <span>
          <strong>{remaining} XP</strong> to level {level + 1}
          <ArrowUpRight size={12} aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}

export function Week({
  days,
  completedDays,
  selected,
  onSelect,
  today = new Date(),
}: {
  days: readonly Date[]
  completedDays: ReadonlySet<string> | readonly string[]
  selected?: string
  onSelect?: (key: string, date: Date) => void
  today?: Date
}) {
  const completed = new Set(completedDays)
  const todayKey = localDay(today)
  return (
    <div className="week-strip">
      {days.map((date) => {
        const key = localDay(date),
          done = completed.has(key),
          isToday = key === todayKey
        const className = `day ${done ? 'done' : ''} ${isToday ? 'today' : ''} ${selected === key ? 'selected' : ''}`
        const label = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, ${done ? 'workout complete' : isToday ? 'today' : date > today ? 'upcoming day' : 'no workout logged'}`
        const children = (
          <>
            <span className="day-state" aria-hidden="true">
              {done ? (
                <Check size={10} strokeWidth={4} />
              ) : isToday ? (
                <span className="pulse-dot" />
              ) : (
                <span className="rest-dot" />
              )}
            </span>
            <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <strong>{date.getDate()}</strong>
          </>
        )
        return onSelect ? (
          <button
            key={key}
            type="button"
            className={className}
            onClick={() => onSelect(key, date)}
            aria-label={label}
            aria-pressed={selected === key}
            aria-current={isToday ? 'date' : undefined}
          >
            {children}
          </button>
        ) : (
          <div key={key} className={className} role="img" aria-label={label}>
            {children}
          </div>
        )
      })}
    </div>
  )
}

export function CountUp({ value, calm = false }: { value: number; calm?: boolean }) {
  const [display, setDisplay] = useState(calm ? value : 0)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const stop = () => {
      cancelAnimationFrame(frame)
      setDisplay(value)
    }
    if (calm || media.matches) {
      stop()
      return
    }
    let start: number | null = null
    setDisplay(0)
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / 900)
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    const onMotion = () => {
      if (media.matches) stop()
    }
    frame = requestAnimationFrame(tick)
    media.addEventListener('change', onMotion)
    return () => {
      cancelAnimationFrame(frame)
      media.removeEventListener('change', onMotion)
    }
  }, [value, calm])
  return <>{display}</>
}

export function Confetti({ calm = false }: { calm?: boolean }) {
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
