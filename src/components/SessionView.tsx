import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Timer,
  X,
} from 'lucide-react'
import { byId, muscleNames } from '../lib/catalog'
import type { Profile, Session, WorkoutSet } from '../lib/types'
import { completeSet, doneSets, totalSets, uid } from '../lib/workout'
import { ExerciseThumbnail } from './ExerciseGuide'

export default function SessionView({
  session,
  profile,
  onChange,
  onBack,
  onFinish,
  onDiscard,
  onSwap,
  onInfo,
}: {
  session: Session
  profile: Profile
  onChange: (s: Session) => void
  onBack: () => void
  onFinish: () => void
  onDiscard: () => void
  onSwap: (index: number) => void
  onInfo: (id: string) => void
}) {
  const [open, setOpen] = useState(() =>
    Math.max(
      0,
      session.exercises.findIndex((e) => e.sets.some((s) => !s.done)),
    ),
  )
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [holdEnd, setHoldEnd] = useState<number | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 1000))
  const rest = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0
  const hold = holdEnd ? Math.max(0, Math.ceil((holdEnd - now) / 1000)) : null
  const count = doneSets(session)
  function updateSet(index: number, id: string, patch: Partial<WorkoutSet>) {
    onChange({
      ...session,
      exercises: session.exercises.map((e, i) =>
        i === index ? { ...e, sets: e.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : e,
      ),
    })
  }
  function log(index: number, id: string) {
    const before = session.exercises[index]
    const entry = completeSet(before, id)
    onChange({ ...session, exercises: session.exercises.map((e, i) => (i === index ? entry : e)) })
    if (!before.sets.find((s) => s.id === id)!.done) {
      setRestEnd(Date.now() + byId[entry.exerciseId].rest * 1000)
      setHoldEnd(null)
    }
  }
  return (
    <div className="session-page page-enter">
      <button className="text-button back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to overview{' '}
        <span className="muted">· session in progress</span>
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR TIME. YOUR PRACTICE.</p>
          <h1>
            Let’s put in the work<span>.</span>
          </h1>
          <p className="subtitle">{session.title} · Adjust any set to match how you feel.</p>
        </div>
        <div className="session-clock">
          <Timer size={18} />
          {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
          {String(elapsed % 60).padStart(2, '0')}
        </div>
      </div>
      <div className="session-progress">
        <span>
          {count} of {totalSets(session)} sets complete
        </span>
        <strong>{Math.round((count / totalSets(session)) * 100)}%</strong>
        <div>
          <i style={{ width: `${(count / totalSets(session)) * 100}%` }} />
        </div>
      </div>
      <div className="warmup">
        <span className="warmup-icon">
          <RotateCcw size={19} />
        </span>
        <div>
          <strong>Take a moment to warm up</strong>
          <p>
            3–5 minutes of easy movement, shoulder circles, and comfortable squats. Stop any
            movement that causes pain.
          </p>
        </div>
      </div>
      <div className="session-exercises">
        {session.exercises.map((entry, index) => {
          const exercise = byId[entry.exerciseId]
          const done = entry.sets.filter((s) => s.done).length
          const weighted =
            exercise.weighted &&
            (profile.equipment.includes('vest') || entry.sets.some((s) => s.load > 0))
          return (
            <section
              key={entry.exerciseId + index}
              className={`session-exercise ${open === index ? 'expanded' : ''}`}
            >
              <button
                className="session-exercise-title"
                aria-expanded={open === index}
                onClick={() => setOpen(open === index ? -1 : index)}
              >
                <span className={`movement-icon ${exercise.pattern}`}>
                  <ExerciseThumbnail exerciseId={exercise.id} compact />
                </span>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.muscles.map((m) => muscleNames[m]).join(' · ')}</small>
                </span>
                <span className={`set-count ${done === entry.sets.length ? 'all-done' : ''}`}>
                  {done === entry.sets.length ? (
                    <Check size={17} />
                  ) : (
                    `${done}/${entry.sets.length}`
                  )}
                </span>
                <ChevronDown size={18} />
              </button>
              {open === index && (
                <div className="exercise-log">
                  <div className="exercise-actions">
                    <button className="text-button" onClick={() => onInfo(exercise.id)}>
                      Form & instructions <ArrowRight size={14} />
                    </button>
                    <button
                      className="text-button"
                      disabled={done > 0}
                      title={
                        done > 0
                          ? 'Keep logged sets intact; swap before logging this exercise.'
                          : 'Choose a different variation'
                      }
                      onClick={() => onSwap(index)}
                    >
                      Swap exercise <RotateCcw size={14} />
                    </button>
                  </div>
                  <div className="set-table" role="group" aria-label={`${exercise.name} sets`}>
                    <div className={`set-head ${weighted ? 'with-load' : ''}`}>
                      <span>SET</span>
                      <span>{exercise.unit === 'sec' ? 'SECONDS' : 'REPS'}</span>
                      {weighted && <span>ADDED KG</span>}
                      <span>EFFORT</span>
                      <span>LOG</span>
                    </div>
                    {entry.sets.map((set, i) => (
                      <div
                        key={set.id}
                        className={`set-row ${weighted ? 'with-load' : ''} ${set.done ? 'logged' : ''}`}
                      >
                        <span className="set-number">{String(i + 1).padStart(2, '0')}</span>
                        <label className="number-field">
                          <span className="sr-only">
                            {exercise.name} set {i + 1} {exercise.unit}
                          </span>
                          <input
                            aria-label={`${exercise.name} set ${i + 1} ${exercise.unit}`}
                            aria-describedby={`target-${set.id}`}
                            type="number"
                            min="0"
                            max="600"
                            inputMode="numeric"
                            value={set.reps}
                            disabled={set.done}
                            onChange={(e) =>
                              updateSet(index, set.id, {
                                reps: Math.max(
                                  0,
                                  Math.min(600, Math.floor(Number(e.target.value) || 0)),
                                ),
                              })
                            }
                          />
                          <small id={`target-${set.id}`}>aim {set.target}</small>
                        </label>
                        {weighted && (
                          <label className="number-field">
                            <span className="sr-only">
                              {exercise.name} set {i + 1} added kg
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="300"
                              step="0.5"
                              inputMode="decimal"
                              value={set.load}
                              disabled={set.done}
                              onChange={(e) =>
                                updateSet(index, set.id, {
                                  load: Math.max(0, Math.min(300, Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </label>
                        )}
                        <select
                          aria-label={`${exercise.name} set ${i + 1} effort`}
                          value={set.effort}
                          disabled={set.done}
                          onChange={(e) =>
                            updateSet(index, set.id, {
                              effort: e.target.value as WorkoutSet['effort'],
                            })
                          }
                        >
                          <option value="easy">Easy</option>
                          <option value="good">Good</option>
                          <option value="hard">Hard</option>
                        </select>
                        <button
                          className={`log-set ${set.done ? 'is-done' : ''}`}
                          aria-label={`${set.done ? 'Undo' : 'Log'} ${exercise.name} set ${i + 1}`}
                          aria-pressed={set.done}
                          onClick={() => log(index, set.id)}
                        >
                          <Check size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {exercise.unit === 'sec' && (
                    <div className="hold-timer">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setHoldEnd(
                            Date.now() +
                              (entry.sets.find((s) => !s.done)?.reps || exercise.min) * 1000,
                          )
                          setRestEnd(null)
                        }}
                      >
                        <Play size={14} /> {hold === null ? 'Start hold timer' : 'Restart timer'}
                      </button>
                      {hold !== null && (
                        <strong role="timer">
                          {hold > 0 ? `${hold}s` : 'Hold complete — log your set'}
                        </strong>
                      )}
                    </div>
                  )}
                  <p className="adaptation-note">
                    <span className="tiny-spark">✧</span>
                    {entry.note}
                  </p>
                  <div className="set-footer">
                    <span>
                      <Clock3 size={14} /> {exercise.rest}s rest between sets
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label={`Remove last set of ${exercise.name}`}
                        disabled={entry.sets.length <= 1 || entry.sets[entry.sets.length - 1].done}
                        onClick={() =>
                          onChange({
                            ...session,
                            exercises: session.exercises.map((e, i) =>
                              i === index ? { ...e, sets: e.sets.slice(0, -1) } : e,
                            ),
                          })
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Add set to ${exercise.name}`}
                        disabled={entry.sets.length >= 6}
                        onClick={() =>
                          onChange({
                            ...session,
                            exercises: session.exercises.map((e, i) =>
                              i === index
                                ? {
                                    ...e,
                                    sets: [
                                      ...e.sets,
                                      {
                                        ...e.sets[e.sets.length - 1],
                                        id: uid(),
                                        done: false,
                                      },
                                    ],
                                  }
                                : e,
                            ),
                          })
                        }
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  {done === entry.sets.length && index < session.exercises.length - 1 && (
                    <button
                      className="primary-button next-exercise"
                      onClick={() => setOpen(index + 1)}
                    >
                      Next exercise <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
      <div className="session-bottom">
        <button className="text-button danger" onClick={onDiscard}>
          Discard session
        </button>
        <button className="primary-button" disabled={count === 0} onClick={onFinish}>
          Finish workout <Check size={18} />
        </button>
      </div>
      {rest > 0 && (
        <div className="rest-timer" role="status">
          <div>
            <Timer size={20} />
            <span>
              REST & RESET{' '}
              <strong>
                {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}
              </strong>
            </span>
          </div>
          <button onClick={() => setRestEnd(null)} aria-label="Skip rest timer">
            Skip <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
