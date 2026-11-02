'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Heart,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react'
import { byId, muscleNames } from '../lib/catalog'
import type { Effort, Profile, Session, WorkoutExercise, WorkoutSet } from '../lib/types'
import { completeSet, doneSets, totalSets, uid } from '../lib/workout'
import ExerciseGuide from './ExerciseGuide'
import { MuscleMap } from './Visuals'
import { Tooltip } from './ui'
import './session.css'

interface SessionViewProps {
  session: Session
  profile: Profile
  onChange: (session: Session) => void
  onBack: () => void
  onFinish: () => void
  onDiscard: () => void
  onSwap: (index: number) => void
  onInfo: (id: string) => void
  onDirtyChange: (dirty: boolean) => void
}
interface TimerState {
  restEnd: number | null
  holdEnd: number | null
  loggedIds: string[]
}
interface Draft {
  reps: string
  load: string
  effort: Effort
}
interface Feedback {
  id: number
  message: string
  reward: boolean
}
const emptyTimers: TimerState = { restEnd: null, holdEnd: null, loggedIds: [] }
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
const timerKey = (sessionId: string) => `fitt.session-ui.${sessionId}`

function restoredTimers(session: Session): TimerState {
  const loggedIds = session.exercises.flatMap((entry) =>
    entry.sets.filter((set) => set.done).map((set) => set.id),
  )
  if (typeof window === 'undefined') return { ...emptyTimers, loggedIds }
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(timerKey(session.id)) || 'null')
    if (!value || typeof value !== 'object') return { ...emptyTimers, loggedIds }
    const data = value as Partial<TimerState>
    const now = Date.now()
    const deadline = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > now && value < now + 900_000
        ? value
        : null
    const validIds = new Set(session.exercises.flatMap((entry) => entry.sets.map((set) => set.id)))
    return {
      restEnd: deadline(data.restEnd),
      holdEnd: deadline(data.holdEnd),
      loggedIds: [
        ...new Set([
          ...loggedIds,
          ...(Array.isArray(data.loggedIds)
            ? data.loggedIds.filter(
                (id): id is string => typeof id === 'string' && validIds.has(id),
              )
            : []),
        ]),
      ],
    }
  } catch {
    // Storage restrictions must never prevent a workout from being logged.
    return { ...emptyTimers, loggedIds }
  }
}
const draftFor = (set?: WorkoutSet): Draft => ({
  reps: String(set?.reps ?? 0),
  load: String(set?.load ?? 0),
  effort: set?.effort ?? 'good',
})
const validNumber = (raw: string, max: number, integer = false) => {
  if (raw.trim() === '') return false
  const value = Number(raw)
  return (
    Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isInteger(value))
  )
}

export default function SessionView(props: SessionViewProps) {
  return <SessionContent key={props.session.id} {...props} />
}

function SessionContent({
  session,
  profile,
  onChange,
  onBack,
  onFinish,
  onDiscard,
  onSwap,
  onInfo,
  onDirtyChange,
}: SessionViewProps) {
  const [exerciseIndex, setExerciseIndex] = useState(() =>
    Math.max(
      0,
      session.exercises.findIndex((entry) => entry.sets.some((set) => !set.done)),
    ),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [artView, setArtView] = useState<'movement' | 'muscles'>('movement')
  const [timers, setTimers] = useState(() => restoredTimers(session))
  const [now, setNow] = useState(() => Date.now())
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const loggedIds = useRef(new Set(timers.loggedIds))
  const lastSubmitted = useRef<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputId = useId()
  const entry = session.exercises[Math.min(exerciseIndex, session.exercises.length - 1)]
  const exercise = byId[entry.exerciseId]
  const editing = entry.sets.find((set) => set.id === editingId && set.done)
  const current = editing || entry.sets.find((set) => !set.done)
  const selectionKey = `${entry.exerciseId}:${current?.id || 'complete'}:${editing ? 'edit' : 'new'}`
  const [draftState, setDraftState] = useState(() => ({
    key: selectionKey,
    value: draftFor(current),
  }))
  const draft = draftState.key === selectionKey ? draftState.value : draftFor(current)
  const count = doneSets(session)
  const total = totalSets(session)
  const exerciseDone = entry.sets.filter((set) => set.done).length
  const currentNumber = current ? entry.sets.findIndex((set) => set.id === current.id) + 1 : 0
  const allDone = total > 0 && count === total
  const weighted =
    !!exercise.weighted &&
    (profile.equipment.includes('vest') || entry.sets.some((set) => set.load > 0))
  const rest = timers.restEnd ? Math.max(0, Math.ceil((timers.restEnd - now) / 1000)) : null
  const hold = timers.holdEnd ? Math.max(0, Math.ceil((timers.holdEnd - now) / 1000)) : null
  const elapsed = Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 1000))
  const validReps = validNumber(draft.reps, 600, true)
  const validLoad = !weighted || validNumber(draft.load, 300)
  // Valid pending inputs are persisted immediately. Corrections to logged sets
  // and incomplete numeric inputs stay local until the user saves or fixes them.
  const dirty =
    !!current &&
    (!validReps ||
      !validLoad ||
      (!!editing &&
        (Number(draft.reps) !== current.reps ||
          (weighted && Number(draft.load) !== current.load) ||
          draft.effort !== current.effort)))
  const isFirstLog = !!current && !loggedIds.current.has(current.id)
  const nextIndex = session.exercises.findIndex(
    (item, index) => index > exerciseIndex && item.sets.some((set) => !set.done),
  )
  const nextUnfinished =
    nextIndex >= 0
      ? nextIndex
      : session.exercises.findIndex((item) => item.sets.some((set) => !set.done))

  useEffect(() => {
    lastSubmitted.current = null
  }, [selectionKey])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const interval = window.setInterval(refresh, 500)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        timerKey(session.id),
        JSON.stringify({ ...timers, loggedIds: [...loggedIds.current] }),
      )
    } catch {
      // Absolute deadlines continue to work even when session storage is unavailable.
    }
  }, [session.id, timers])

  const restFinished = rest === 0
  const holdFinished = hold === 0
  useEffect(() => {
    if (holdFinished)
      setFeedback({
        id: Date.now(),
        message: 'Timer complete. Log what you held when you’re ready.',
        reward: false,
      })
    else if (restFinished)
      setFeedback({
        id: Date.now(),
        message: 'Rest complete. Your next set is here when you’re ready.',
        reward: false,
      })
  }, [restFinished, holdFinished])

  useEffect(() => {
    if (!feedback) return
    const timeout = setTimeout(() => setFeedback(null), 5500)
    return () => clearTimeout(timeout)
  }, [feedback])

  function replaceEntry(updated: WorkoutExercise) {
    onChange({
      ...session,
      exercises: session.exercises.map((item, index) => (index === exerciseIndex ? updated : item)),
    })
  }
  function updatePending(patch: Partial<WorkoutSet>) {
    if (!current || editing) return
    replaceEntry({
      ...entry,
      sets: entry.sets.map((set) => (set.id === current.id ? { ...set, ...patch } : set)),
    })
  }
  function changeReps(raw: string) {
    setDraftState({ key: selectionKey, value: { ...draft, reps: raw } })
    if (validNumber(raw, 600, true)) updatePending({ reps: Number(raw) })
  }
  function changeLoad(raw: string) {
    setDraftState({ key: selectionKey, value: { ...draft, load: raw } })
    if (validNumber(raw, 300)) updatePending({ load: Number(raw) })
  }
  function changeEffort(effort: Effort) {
    setDraftState({ key: selectionKey, value: { ...draft, effort } })
    updatePending({ effort })
  }
  function selectExercise(index: number) {
    setExerciseIndex(index)
    setEditingId(null)
    setTimers((value) => ({ ...value, holdEnd: null }))
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
  }
  function submitSet() {
    if (!current || !validReps || !validLoad || lastSubmitted.current === selectionKey) return
    lastSubmitted.current = selectionKey
    const corrected: WorkoutExercise = {
      ...entry,
      sets: entry.sets.map((set) =>
        set.id === current.id
          ? {
              ...set,
              reps: Number(draft.reps),
              load: weighted ? Number(draft.load) : set.load,
              effort: draft.effort,
              done: false,
            }
          : set,
      ),
    }
    const result = completeSet(corrected, current.id)
    const firstLog = !loggedIds.current.has(current.id)
    loggedIds.current.add(current.id)
    replaceEntry(result)
    setEditingId(null)
    const timestamp = Date.now()
    setNow(timestamp)
    if (!editing)
      setTimers({
        restEnd: timestamp + exercise.rest * 1000,
        holdEnd: null,
        loggedIds: [...loggedIds.current],
      })
    const adjusted = result.note !== entry.note
    setFeedback({
      id: timestamp,
      message: editing
        ? `Set updated.${adjusted ? ' Remaining targets adjusted.' : ' Your log reflects what happened.'}`
        : `${firstLog ? '+5 XP · ' : ''}Set logged. ${adjusted ? 'Remaining targets adjusted to your effort.' : 'One step stronger.'}`,
      reward: firstLog && !editing,
    })
  }
  function undoSet() {
    if (!editing) return
    replaceEntry({
      ...entry,
      sets: entry.sets.map((set) => (set.id === editing.id ? { ...set, done: false } : set)),
    })
    setEditingId(null)
    setTimers((value) => ({ ...value, restEnd: null, holdEnd: null }))
    setFeedback({
      id: Date.now(),
      message: 'Log removed. You can adjust and log this set again.',
      reward: false,
    })
  }
  function addSet() {
    if (entry.sets.length >= 6) return
    const previous = entry.sets[entry.sets.length - 1]
    replaceEntry({ ...entry, sets: [...entry.sets, { ...previous, id: uid(), done: false }] })
    setEditingId(null)
  }
  function removeLastSet() {
    const last = entry.sets[entry.sets.length - 1]
    if (entry.sets.length <= 1 || last.done) return
    replaceEntry({ ...entry, sets: entry.sets.slice(0, -1) })
  }

  return (
    <div className="workout-session">
      <div className="page-heading workout-session__heading">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={16} /> Back to today
          </button>
          <h1>{session.duration <= 5 ? 'A five-minute win.' : 'Let’s get into it.'}</h1>
          <p>{session.title} · One set at a time. You set the pace.</p>
        </div>
        <span className="workout-session__clock" aria-label={`Workout elapsed ${clock(elapsed)}`}>
          <Timer size={17} />
          <span>{clock(elapsed)}</span>
        </span>
      </div>

      <section className="panel workout-session__progress" aria-label="Workout progress">
        <div>
          <span className="eyebrow">YOUR SESSION</span>
          <strong>
            {count}
            <small> / {total} sets</small>
          </strong>
        </div>
        <div
          className="workout-session__track"
          role="progressbar"
          aria-label="Workout sets complete"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={count}
        >
          <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </div>
        <span className="workout-session__xp">
          <Zap size={16} fill="currentColor" />+{count * 5} XP<small>on save</small>
        </span>
      </section>

      <nav className="workout-session__exercise-nav" aria-label="Workout exercises">
        {session.exercises.map((item, index) => {
          const completed = item.sets.filter((set) => set.done).length
          return (
            <button
              key={`${item.exerciseId}-${index}`}
              aria-current={index === exerciseIndex ? 'step' : undefined}
              className={index === exerciseIndex ? 'active' : ''}
              onClick={() => selectExercise(index)}
            >
              <span className={completed === item.sets.length ? 'done' : ''}>
                {completed === item.sets.length ? (
                  <Check size={13} />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <span>
                <strong>{byId[item.exerciseId].name}</strong>
                <small>
                  {completed} / {item.sets.length} sets
                </small>
              </span>
            </button>
          )
        })}
      </nav>

      <div
        className="workout-session__feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback && (
          <span key={feedback.id} className={feedback.reward ? 'reward' : ''}>
            <CheckCircle2 size={16} />
            {feedback.message}
          </span>
        )}
      </div>

      <div className="workout-session__grid">
        <section className="panel workout-session__movement">
          <div className="workout-session__movement-top">
            <span className="pill">
              {String(exerciseIndex + 1).padStart(2, '0')} /{' '}
              {String(session.exercises.length).padStart(2, '0')}
            </span>
            <div className="workout-session__segments" role="group" aria-label="Exercise view">
              <button
                aria-pressed={artView === 'movement'}
                className={artView === 'movement' ? 'active' : ''}
                onClick={() => setArtView('movement')}
              >
                Movement
              </button>
              <button
                aria-pressed={artView === 'muscles'}
                className={artView === 'muscles' ? 'active' : ''}
                onClick={() => setArtView('muscles')}
              >
                Muscles
              </button>
            </div>
          </div>
          <h2 ref={headingRef} tabIndex={-1}>
            {exercise.name}
          </h2>
          <p className="workout-session__cue">{exercise.cue}</p>
          {artView === 'movement' ? (
            <ExerciseGuide key={exercise.id} exercise={exercise} />
          ) : (
            <div className="workout-session__muscles">
              <MuscleMap muscles={exercise.muscles} />
              <div>
                {exercise.muscles.map((muscle) => (
                  <span className="pill" key={muscle}>
                    {muscleNames[muscle]}
                  </span>
                ))}
              </div>
              <p>Highlighted muscles work together in this movement.</p>
            </div>
          )}
          <div className="workout-session__technique">
            <h3 className="eyebrow">MAKE THIS REP YOURS</h3>
            <ol>
              {exercise.steps.slice(0, 2).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button className="workout-session__text-button" onClick={() => onInfo(exercise.id)}>
              All form instructions <ArrowRight size={15} />
            </button>
          </div>
          <div className="workout-session__movement-footer">
            <span>
              <Clock3 size={15} />
              {exercise.rest}s rest between sets
            </span>
            <Tooltip
              content={
                exerciseDone > 0
                  ? 'Keep logged sets intact. Swap before logging this movement.'
                  : 'Choose another variation'
              }
            >
              <button
                className="workout-session__text-button"
                aria-label="Swap exercise"
                disabled={exerciseDone > 0}
                onClick={() => onSwap(exerciseIndex)}
              >
                <RotateCcw size={14} />
                Swap exercise
              </button>
            </Tooltip>
          </div>
        </section>

        <aside className="workout-session__side" aria-label="Set logging">
          <section className="panel workout-session__logger">
            {current ? (
              <>
                <div className="workout-session__log-heading">
                  <h3>
                    {editing ? 'Edit' : 'Set'} {currentNumber} of {entry.sets.length}
                  </h3>
                  <span
                    className="workout-session__set-dots"
                    aria-label={`${exerciseDone} sets logged`}
                  >
                    {entry.sets.map((set, index) => (
                      <i
                        key={set.id}
                        className={set.done ? 'done' : set.id === current.id ? 'current' : ''}
                      >
                        {set.done ? <Check size={10} /> : index + 1}
                      </i>
                    ))}
                  </span>
                </div>
                {editing && (
                  <p className="workout-session__edit-note">
                    <Pencil size={14} />
                    Correct your log. XP is counted once per set.
                  </p>
                )}
                <label className="eyebrow" htmlFor={`${inputId}-reps`}>
                  {exercise.unit === 'sec' ? 'YOUR HOLD · SECONDS' : 'YOUR REPS'}
                </label>
                <div className="workout-session__stepper">
                  <button
                    aria-label={`Decrease ${exercise.unit === 'sec' ? 'seconds' : 'reps'}`}
                    disabled={Number(draft.reps) <= 0}
                    onClick={() =>
                      changeReps(
                        String(
                          Math.max(
                            0,
                            (Number(draft.reps) || 0) - (exercise.unit === 'sec' ? 5 : 1),
                          ),
                        ),
                      )
                    }
                  >
                    <Minus size={21} />
                  </button>
                  <input
                    id={`${inputId}-reps`}
                    aria-label={`${exercise.name} set ${currentNumber} ${exercise.unit}`}
                    aria-describedby={`${inputId}-target`}
                    aria-invalid={!validReps}
                    type="number"
                    min={0}
                    max={600}
                    step={1}
                    inputMode="numeric"
                    value={draft.reps}
                    onChange={(event) => changeReps(event.target.value)}
                  />
                  <button
                    aria-label={`Increase ${exercise.unit === 'sec' ? 'seconds' : 'reps'}`}
                    disabled={Number(draft.reps) >= 600}
                    onClick={() =>
                      changeReps(
                        String(
                          Math.min(
                            600,
                            (Number(draft.reps) || 0) + (exercise.unit === 'sec' ? 5 : 1),
                          ),
                        ),
                      )
                    }
                  >
                    <Plus size={21} />
                  </button>
                </div>
                <p id={`${inputId}-target`} className="workout-session__target">
                  Suggested {current.target} {exercise.unit}
                  {current.targetLoad > 0 ? ` + ${current.targetLoad} kg` : ''}. Log what you
                  actually did.
                </p>
                {!validReps && (
                  <p className="workout-session__error">Enter a whole number from 0 to 600.</p>
                )}
                {weighted && (
                  <div className="workout-session__load-field">
                    <label htmlFor={`${inputId}-load`}>
                      Added weight <span>kg</span>
                    </label>
                    <div>
                      <button
                        aria-label="Decrease added weight"
                        disabled={Number(draft.load) <= 0}
                        onClick={() =>
                          changeLoad(String(Math.max(0, (Number(draft.load) || 0) - 0.5)))
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        id={`${inputId}-load`}
                        type="number"
                        min={0}
                        max={300}
                        step={0.5}
                        inputMode="decimal"
                        aria-invalid={!validLoad}
                        aria-label={`${exercise.name} set ${currentNumber} added kg`}
                        value={draft.load}
                        onChange={(event) => changeLoad(event.target.value)}
                      />
                      <button
                        aria-label="Increase added weight"
                        disabled={Number(draft.load) >= 300}
                        onClick={() =>
                          changeLoad(String(Math.min(300, (Number(draft.load) || 0) + 0.5)))
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {!validLoad && (
                      <p className="workout-session__error">Enter a weight from 0 to 300 kg.</p>
                    )}
                  </div>
                )}
                {exercise.unit === 'sec' && !editing && (
                  <div className="workout-session__hold">
                    <button
                      className="secondary-button"
                      disabled={!validReps || Number(draft.reps) === 0}
                      onClick={() => {
                        const timestamp = Date.now()
                        setNow(timestamp)
                        setTimers((value) => ({
                          ...value,
                          holdEnd: timestamp + Number(draft.reps) * 1000,
                          restEnd: null,
                        }))
                      }}
                    >
                      <Play size={14} />
                      {hold === null ? 'Start hold timer' : 'Restart hold timer'}
                    </button>
                    {hold !== null && (
                      <span role="timer" aria-live="off">
                        {hold > 0 ? clock(hold) : 'Hold timer complete'}
                      </span>
                    )}
                  </div>
                )}
                <fieldset className="workout-session__effort">
                  <legend className="eyebrow">HOW DID THAT FEEL?</legend>
                  <div>
                    {(
                      [
                        ['easy', 'Easy'],
                        ['good', 'Just right'],
                        ['hard', 'Challenging'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={draft.effort === value}
                        className={draft.effort === value ? 'active' : ''}
                        onClick={() => changeEffort(value)}
                      >
                        {draft.effort === value && <Check size={12} />}
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button
                  className="primary-button workout-session__log-button"
                  disabled={!validReps || !validLoad}
                  aria-label={`${editing ? 'Save changes to' : 'Log'} ${exercise.name} set ${currentNumber}`}
                  onClick={submitSet}
                >
                  <Check size={18} />
                  {editing ? 'Save changes' : 'Log this set'}
                  {!editing && isFirstLog && <span>+5 XP</span>}
                </button>
                {editing ? (
                  <div className="workout-session__edit-actions">
                    <button
                      className="workout-session__text-button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel edit
                    </button>
                    <button className="workout-session__text-button" onClick={undoSet}>
                      Remove log
                    </button>
                  </div>
                ) : (
                  <p className="workout-session__kind-note">
                    <Heart size={12} />
                    Honest effort is always a win.
                  </p>
                )}
              </>
            ) : (
              <div className="workout-session__movement-done">
                <span>
                  <CheckCircle2 size={30} />
                </span>
                <h3>{allDone ? 'You did the work.' : 'Movement complete.'}</h3>
                <p>
                  {allDone
                    ? 'Save your session and take that good feeling with you.'
                    : `${exerciseDone} sets logged. Take a breath before the next movement.`}
                </p>
                <button
                  className="primary-button"
                  onClick={allDone ? onFinish : () => selectExercise(nextUnfinished)}
                >
                  {allDone ? 'Finish workout' : 'Next exercise'}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
          </section>

          {rest !== null && (
            <section className="panel workout-session__rest">
              <div>
                <span className="eyebrow">
                  {rest > 0 ? 'TAKE A BREATHER' : 'YOUR PACE, ALWAYS'}
                </span>
                <strong role="timer" aria-live="off">
                  {rest > 0 ? clock(rest) : 'Ready when you are'}
                </strong>
              </div>
              <button
                className="secondary-button"
                onClick={() => setTimers((value) => ({ ...value, restEnd: null }))}
              >
                {rest > 0 ? 'Skip rest' : 'Let’s go'}
                <ArrowRight size={15} />
              </button>
            </section>
          )}

          <section className="panel workout-session__sets" aria-label={`${exercise.name} sets`}>
            <div className="workout-session__sets-heading">
              <h3>Your sets</h3>
              <div>
                <button
                  aria-label={`Remove last set of ${exercise.name}`}
                  disabled={entry.sets.length <= 1 || entry.sets[entry.sets.length - 1].done}
                  onClick={removeLastSet}
                >
                  <Minus size={16} />
                </button>
                <button
                  aria-label={`Add set to ${exercise.name}`}
                  disabled={entry.sets.length >= 6}
                  onClick={addSet}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <ol>
              {entry.sets.map((set, index) => (
                <li key={set.id} className={set.done ? 'logged' : ''}>
                  <span>{set.done ? <Check size={13} /> : index + 1}</span>
                  <div>
                    <strong>
                      {set.done ? set.reps : set.target} {exercise.unit}
                      {set.load > 0 ? ` + ${set.load} kg` : ''}
                    </strong>
                    <small>
                      {set.done
                        ? set.effort === 'easy'
                          ? 'Easy'
                          : set.effort === 'hard'
                            ? 'Challenging'
                            : 'Just right'
                        : 'Suggested target'}
                    </small>
                  </div>
                  {set.done ? (
                    <button
                      aria-label={`Edit ${exercise.name} set ${index + 1}`}
                      onClick={() => {
                        setEditingId(set.id)
                        setTimers((value) => ({ ...value, holdEnd: null }))
                      }}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                  ) : (
                    <span className="workout-session__pending">
                      {current?.id === set.id ? 'Up next' : 'To come'}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="workout-session__adaptation">
              <Sparkles size={14} />
              {entry.note}
            </p>
          </section>
          {!allDone && nextUnfinished >= 0 && nextUnfinished !== exerciseIndex && (
            <div className="workout-session__next">
              <span className="eyebrow">COMING UP</span>
              <strong>{byId[session.exercises[nextUnfinished].exerciseId].name}</strong>
            </div>
          )}
          <button className="workout-session__finish" disabled={count === 0} onClick={onFinish}>
            Save & finish workout <ArrowRight size={16} />
          </button>
        </aside>
      </div>

      <div className="workout-session__footer">
        <span>
          <Heart size={15} />
          Finish with a little recovery.
        </span>
        <button type="button" className="workout-session__discard" onClick={onDiscard}>
          <Trash2 size={16} aria-hidden="true" />
          Discard session
        </button>
      </div>
    </div>
  )
}
