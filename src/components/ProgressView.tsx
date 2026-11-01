import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  TrendingUp,
} from 'lucide-react'
import { byId } from '../lib/catalog'
import type { Session } from '../lib/types'
import { doneSets, localDay, sessionReps, totalSets, weekDays } from '../lib/workout'
import { ExerciseThumbnail } from './ExerciseGuide'

export default function ProgressView({
  history,
  onTrain,
}: {
  history: Session[]
  onTrain: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const logged = [
    ...new Set(
      history.flatMap((s) =>
        s.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => e.exerciseId),
      ),
    ),
  ]
  const [selected, setSelected] = useState('')
  const selectedId = logged.includes(selected) ? selected : logged[0]
  const days = weekDays()
  const activity = days.map((d) =>
    history
      .filter((s) => localDay(new Date(s.completedAt!)) === localDay(d))
      .reduce((n, s) => n + doneSets(s), 0),
  )
  const max = Math.max(6, ...activity)
  const trend = history
    .flatMap((s) =>
      s.exercises
        .filter((e) => e.exerciseId === selectedId && e.sets.some((s) => s.done))
        .map((e) => ({
          date: s.completedAt!,
          set: e.sets.filter((s) => s.done).reduce((best, s) => (s.reps > best.reps ? s : best)),
        })),
    )
    .slice(-6)
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SMALL STEPS. REAL STRENGTH.</p>
          <h1>
            Look how far you’ve come<span>.</span>
          </h1>
          <p className="subtitle">Every rep is a little more than yesterday.</p>
        </div>
        <span className="heading-symbol">
          <TrendingUp size={28} />
        </span>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <span>WORKOUTS</span>
          <strong>
            {history.length}
            <small>sessions completed</small>
          </strong>
          <Flag size={20} />
        </div>
        <div className="stat-card">
          <span>WORKING SETS</span>
          <strong>
            {history.reduce((n, s) => n + doneSets(s), 0)}
            <small>logged with intention</small>
          </strong>
          <Check size={20} />
        </div>
        <div className="stat-card">
          <span>TOTAL REPS</span>
          <strong>
            {history.reduce((n, s) => n + sessionReps(s), 0).toLocaleString()}
            <small>timed holds tracked separately</small>
          </strong>
          <ArrowUpRight size={20} />
        </div>
      </div>
      <div className="progress-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>A week of showing up</h2>
            <span className="tag">Working sets</span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={days
              .map(
                (d, i) =>
                  `${d.toLocaleDateString(undefined, { weekday: 'long' })}: ${activity[i]} sets`,
              )
              .join(', ')}
          >
            {days.map((d, i) => (
              <div
                className={`chart-column ${localDay(d) === localDay(new Date()) ? 'today' : ''}`}
                key={i}
              >
                <span>{activity[i] || '–'}</span>
                <div className="bar-track">
                  <i
                    style={{
                      height: activity[i] ? `${Math.max(8, (activity[i] / max) * 100)}%` : '3px',
                    }}
                  />
                </div>
                <small>{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Your rep progression</h2>
            <TrendingUp size={18} />
          </div>
          {logged.length ? (
            <>
              <label className="field-label" htmlFor="trend-exercise">
                Exercise
              </label>
              <select
                id="trend-exercise"
                className="full-select"
                value={selectedId}
                onChange={(e) => setSelected(e.target.value)}
              >
                {logged.map((id) => (
                  <option key={id} value={id}>
                    {byId[id].name}
                  </option>
                ))}
              </select>
              <div className="trend-list">
                {trend.map((point, i) => (
                  <div key={i}>
                    <span>
                      {new Date(point.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${(point.set.reps / Math.max(1, ...trend.map((p) => p.set.reps))) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {point.set.reps}{' '}
                      <small>
                        {byId[selectedId].unit}
                        {point.set.load > 0 ? ` + ${point.set.load} kg` : ''}
                      </small>
                    </strong>
                  </div>
                ))}
              </div>
              <p className="caption">
                Best completed set each session. Compare added load as well as reps.
              </p>
            </>
          ) : (
            <div className="empty-small">
              <span className="empty-icon">
                <TrendingUp size={25} />
              </span>
              <h3>A stronger you, in the making.</h3>
              <p>Log your first workout to start seeing your progress here.</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel history-panel">
        <div className="panel-heading">
          <h2>Your training journal</h2>
          <span className="tag">{history.length} sessions</span>
        </div>
        {history.length ? (
          <div className="history-list">
            {[...history].reverse().map((session) => (
              <div key={session.id} className="history-item">
                <button
                  className="history-toggle"
                  aria-expanded={expanded === session.id}
                  onClick={() => setExpanded(expanded === session.id ? null : session.id)}
                >
                  <span className="history-date">
                    <strong>{new Date(session.completedAt!).getDate()}</strong>
                    <small>
                      {new Date(session.completedAt!).toLocaleDateString(undefined, {
                        month: 'short',
                      })}
                    </small>
                  </span>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {doneSets(session)} / {totalSets(session)} sets ·{' '}
                      {Math.max(1, Math.round((session.elapsedSeconds || 0) / 60))} min ·{' '}
                      {sessionReps(session)} reps
                    </small>
                  </span>
                  <span className="tag">
                    {doneSets(session) === totalSets(session) ? 'Complete' : 'Partial'}
                  </span>
                  {expanded === session.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                {expanded === session.id && (
                  <div className="history-details">
                    {session.exercises.map((e, i) => (
                      <div key={i}>
                        <span className="movement-icon mini">
                          <ExerciseThumbnail exerciseId={e.exerciseId} compact />
                        </span>
                        <div>
                          <strong>{byId[e.exerciseId].name}</strong>
                          <p>
                            {e.sets
                              .filter((s) => s.done)
                              .map(
                                (s) =>
                                  `${s.reps} ${byId[e.exerciseId].unit}${s.load ? ` + ${s.load} kg` : ''} (${s.effort})`,
                              )
                              .join(' · ') || 'Not completed'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            <div className="journal-art">
              <CalendarDays size={38} />
              <span>
                <Check size={15} />
              </span>
            </div>
            <div>
              <h3>The first page is yours.</h3>
              <p>Your completed workouts, adjustments, and milestones will live here.</p>
            </div>
            <button className="primary-button" onClick={onTrain}>
              Find your first workout <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
