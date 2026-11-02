import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  Info,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { available, byId, exercises, muscleNames } from '../lib/catalog'
import { MAX_ADDED_LOAD_KG } from '../lib/limits'
import type { Muscle, Profile, Session, Workout, WorkoutExercise } from '../lib/types'
import { prescribe, uid } from '../lib/workout'
import { ExerciseThumbnail } from './ExerciseGuide'
import Modal from './Modal'
import { Select, Tooltip } from './ui'
import './builder.css'

export interface WorkoutBuilderProps {
  profile: Profile
  history: Session[]
  initial?: Workout
  onSave: (workout: Workout) => void
  onCancel: () => void
  onInfo: (exerciseId: string) => void
  onDirtyChange?: (dirty: boolean) => void
}
interface DraftEntry {
  key: string
  exerciseId: string
  count: string
  target: string
  load: string
  recordedLoad: number
}
function toDraft(entry: WorkoutExercise): DraftEntry {
  const first = entry.sets[0]
  return {
    key: uid(),
    exerciseId: entry.exerciseId,
    count: String(entry.sets.length),
    target: String(first?.target ?? byId[entry.exerciseId].min),
    load: String(first?.targetLoad ?? 0),
    recordedLoad: Math.max(0, ...entry.sets.map((set) => set.targetLoad)),
  }
}
function validNumber(raw: string, min: number, max: number, integer = true) {
  const value = Number(raw)
  return (
    raw.trim() !== '' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  )
}

export default function WorkoutBuilder({
  profile,
  history,
  initial,
  onSave,
  onCancel,
  onInfo,
  onDirtyChange,
}: WorkoutBuilderProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [duration, setDuration] = useState(String(initial?.duration ?? profile.duration))
  const [entries, setEntries] = useState<DraftEntry[]>(() => initial?.exercises.map(toDraft) ?? [])
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [dirty, setDirty] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLDivElement>(null)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [dirty])
  const limit = 12
  const hasVest = profile.equipment.includes('vest')
  const selected = new Set(entries.map((entry) => entry.exerciseId))
  const query = search.trim().toLocaleLowerCase()
  const choices = exercises.filter(
    (exercise) =>
      available(exercise, profile.equipment) &&
      (muscle === 'all' || exercise.muscles.includes(muscle)) &&
      (!query ||
        `${exercise.name} ${exercise.muscles.map((id) => muscleNames[id]).join(' ')}`
          .toLocaleLowerCase()
          .includes(query)),
  )
  const errors = entries.map((entry) => {
    const exercise = byId[entry.exerciseId]
    if (!available(exercise, profile.equipment))
      return 'This movement needs equipment that is no longer selected. Remove it or update your equipment.'
    if (!validNumber(entry.count, 1, 6)) return 'Choose between 1 and 6 whole sets.'
    if (!validNumber(entry.target, 1, exercise.unit === 'sec' ? 600 : 100))
      return `Choose a whole target from 1 to ${exercise.unit === 'sec' ? 600 : 100} ${exercise.unit === 'sec' ? 'seconds' : 'reps'}.`
    if (!validNumber(entry.load, 0, MAX_ADDED_LOAD_KG, false))
      return `Choose an added load from 0 to ${MAX_ADDED_LOAD_KG} kg.`
    if ((!exercise.weighted || !hasVest) && (Number(entry.load) > 0 || entry.recordedLoad > 0))
      return exercise.weighted
        ? 'A weighted vest is not selected. Switch this movement to bodyweight, or add a vest in Settings.'
        : 'This movement uses bodyweight. Remove the saved added load before saving.'
    return null
  })
  const ready =
    !!title.trim() &&
    title.trim().length <= 60 &&
    entries.length > 0 &&
    entries.length <= limit &&
    errors.every((error) => !error) &&
    validNumber(duration, 1, 180)
  const totalSets = entries.reduce(
    (sum, entry) => sum + (validNumber(entry.count, 1, 6) ? Number(entry.count) : 0),
    0,
  )
  const muscleGroups = [...new Set(entries.flatMap((entry) => byId[entry.exerciseId].muscles))]
  const mixedInitialTargets = initial?.exercises.some((entry) =>
    entry.sets.some(
      (set) => set.target !== entry.sets[0].target || set.targetLoad !== entry.sets[0].targetLoad,
    ),
  )
  const edit = (key: string, changes: Partial<DraftEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    )
    setDirty(true)
  }
  function add(exerciseId: string) {
    if (selected.has(exerciseId) || entries.length >= limit) return
    const prescribed = prescribe(byId[exerciseId], profile, history)
    // The selected movement stays the user's choice; prescribe may recommend a different variation.
    const entry =
      prescribed.exerciseId === exerciseId
        ? prescribed
        : {
            exerciseId,
            note: '',
            sets: [
              {
                id: uid(),
                target: byId[exerciseId].min,
                reps: byId[exerciseId].min,
                load: 0,
                targetLoad: 0,
                effort: 'good' as const,
                done: false,
              },
            ],
          }
    const draft = toDraft(entry)
    if (prescribed.exerciseId !== exerciseId) draft.count = profile.duration === 20 ? '2' : '3'
    setEntries((current) => [...current, draft])
    setDirty(true)
    setNotice(`${byId[exerciseId].name} added to your routine.`)
  }
  function move(index: number, direction: -1 | 1) {
    const destination = index + direction
    if (destination < 0 || destination >= entries.length) return
    setEntries((current) => {
      const next = [...current]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
    setDirty(true)
    setNotice(`${byId[entries[index].exerciseId].name} moved to position ${destination + 1}.`)
  }
  function save() {
    if (!ready) return
    const workout: Workout = {
      id: initial?.id ?? uid(),
      title: title.trim(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      duration: Number(duration),
      exercises: entries.map((entry) => {
        const exercise = byId[entry.exerciseId]
        const load = Number(entry.load)
        return {
          exerciseId: exercise.id,
          note: 'Your routine. Adjust each set to match how you feel.',
          sets: Array.from({ length: Number(entry.count) }, () => ({
            id: uid(),
            target: Number(entry.target),
            reps: Number(entry.target),
            load,
            targetLoad: load,
            effort: 'good' as const,
            done: false,
          })),
        }
      }),
    }
    onSave(workout)
  }
  const requestCancel = () => (dirty ? setConfirmCancel(true) : onCancel())
  const durations = [
    ...new Set([5, 10, 15, 20, 30, 45, 60, 90, Number(initial?.duration ?? profile.duration)]),
  ].sort((a, b) => a - b)
  return (
    <div className="builder-view">
      <button type="button" className="builder-back" onClick={requestCancel}>
        <ArrowLeft size={16} />
        Back to workouts
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE A PLAN THAT FEELS LIKE YOU</p>
          <h1>
            {initial ? 'Refine your routine' : 'Your workout. Your way'}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Pick your movements, set your targets, and make it yours.</p>
        </div>
        <span className="pill">
          {entries.length} / {limit} movements
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {mixedInitialTargets && (
          <p className="builder-import-note">
            This routine has different targets between sets. The builder uses one target per
            movement; saving applies the targets shown below to every set.
          </p>
        )}
        <section className="panel builder-basics">
          <label>
            Routine name
            <input
              autoFocus
              type="text"
              maxLength={60}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setDirty(true)
              }}
              placeholder="e.g. My full-body reset"
              required
            />
          </label>
          <label>
            <span>
              <Clock3 size={14} />
              Time to set aside
            </span>
            <Select
              label="Time to set aside"
              value={duration}
              onValueChange={(value) => {
                setDuration(value)
                setDirty(true)
              }}
              options={durations.map((n) => ({ value: String(n), label: `${n} minutes` }))}
            />
          </label>
        </section>
        <div className="builder-layout">
          <section className="builder-plan" aria-labelledby="builder-plan-heading">
            <div className="builder-section-heading">
              <div>
                <p className="eyebrow">YOUR LINEUP</p>
                <h2 id="builder-plan-heading">One movement at a time.</h2>
              </div>
              <button
                type="button"
                className="builder-add-link"
                onClick={() => {
                  picker.current?.scrollIntoView({
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'instant'
                      : 'smooth',
                    block: 'start',
                  })
                  picker.current
                    ?.querySelector<HTMLInputElement>('input')
                    ?.focus({ preventScroll: true })
                }}
              >
                <Plus size={16} />
                Add movement
              </button>
            </div>
            {!entries.length && (
              <div className="panel builder-empty">
                <span>
                  <Plus size={25} />
                </span>
                <h3>Start with one good move.</h3>
                <p>
                  Add a movement from your equipment-matched library. You can change the order and
                  targets anytime.
                </p>
              </div>
            )}
            <ol className="builder-entries">
              {entries.map((entry, index) => {
                const exercise = byId[entry.exerciseId]
                const canLoad = !!exercise.weighted && hasVest
                const showLoad =
                  !!exercise.weighted || Number(entry.load) !== 0 || entry.recordedLoad > 0
                const needsBodyweightChoice =
                  !canLoad && (Number(entry.load) > 0 || entry.recordedLoad > 0)
                const loadValid =
                  validNumber(entry.load, 0, MAX_ADDED_LOAD_KG, false) && !needsBodyweightChoice
                const countValid = validNumber(entry.count, 1, 6)
                const targetValid = validNumber(
                  entry.target,
                  1,
                  exercise.unit === 'sec' ? 600 : 100,
                )
                return (
                  <li key={entry.key} className="panel builder-entry">
                    <div className="builder-entry-heading">
                      <span className="builder-entry-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <button
                        className="builder-entry-name"
                        type="button"
                        onClick={() => onInfo(exercise.id)}
                      >
                        <strong>{exercise.name}</strong>
                        <small>{exercise.muscles.map((id) => muscleNames[id]).join(' · ')}</small>
                      </button>
                      <div className="builder-entry-actions">
                        <Tooltip content="Move up">
                          <button
                            type="button"
                            aria-label={`Move ${exercise.name} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={16} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Move down">
                          <button
                            type="button"
                            aria-label={`Move ${exercise.name} down`}
                            disabled={index === entries.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={16} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Remove movement">
                          <button
                            type="button"
                            className="builder-remove"
                            aria-label={`Remove ${exercise.name}`}
                            onClick={() => {
                              setEntries((current) =>
                                current.filter((item) => item.key !== entry.key),
                              )
                              setDirty(true)
                              setNotice(`${exercise.name} removed.`)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    <div className={`builder-entry-fields ${showLoad ? 'with-load' : ''}`}>
                      <label>
                        Sets
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={6}
                          step={1}
                          aria-label={`${exercise.name} sets`}
                          aria-invalid={!countValid}
                          value={entry.count}
                          onChange={(event) => edit(entry.key, { count: event.target.value })}
                        />
                      </label>
                      <label>
                        {exercise.unit === 'sec' ? 'Seconds per set' : 'Reps per set'}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={exercise.unit === 'sec' ? 600 : 100}
                          step={1}
                          aria-label={`${exercise.name} target ${exercise.unit}`}
                          aria-invalid={!targetValid}
                          value={entry.target}
                          onChange={(event) => edit(entry.key, { target: event.target.value })}
                        />
                      </label>
                      {showLoad && (
                        <label>
                          Added load · kg
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={MAX_ADDED_LOAD_KG}
                            step="any"
                            aria-label={`${exercise.name} added load`}
                            aria-invalid={!loadValid}
                            aria-describedby={!canLoad ? `load-note-${entry.key}` : undefined}
                            readOnly={!canLoad}
                            value={entry.load}
                            onChange={(event) => edit(entry.key, { load: event.target.value })}
                          />
                        </label>
                      )}
                    </div>
                    {showLoad && !canLoad && (
                      <div className="builder-load-note" id={`load-note-${entry.key}`}>
                        <p>
                          {needsBodyweightChoice
                            ? `Your saved targets include ${Math.max(entry.recordedLoad, Number(entry.load) || 0)} kg of added load. Choose bodyweight to change those targets to 0 kg.`
                            : exercise.weighted
                              ? 'Bodyweight selected. Add a weighted vest in Settings to set added load.'
                              : 'This movement uses bodyweight.'}
                        </p>
                        {needsBodyweightChoice && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              edit(entry.key, { load: '0', recordedLoad: 0 })
                              setNotice(
                                `${exercise.name} changed to bodyweight. Added load is now 0 kg.`,
                              )
                            }}
                          >
                            Use bodyweight
                          </button>
                        )}
                      </div>
                    )}
                    {errors[index] ? (
                      <p className="builder-field-error" role="status">
                        {errors[index]}
                      </p>
                    ) : (
                      <p className="builder-entry-note">
                        <Clock3 size={12} />
                        {exercise.rest}s suggested rest<span>·</span>
                        <button type="button" onClick={() => onInfo(exercise.id)}>
                          Review form
                          <ArrowUpRightIcon />
                        </button>
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
            {entries.length > 0 && (
              <div className="builder-summary">
                <span>
                  <strong>{entries.length}</strong>{' '}
                  {entries.length === 1 ? 'movement' : 'movements'}
                </span>
                <span>
                  <strong>{totalSets}</strong> sets
                </span>
                <span>
                  <strong>{muscleGroups.length}</strong> muscle groups
                </span>
              </div>
            )}
          </section>
          <aside
            className="panel builder-picker"
            ref={picker}
            aria-labelledby="builder-picker-heading"
          >
            <div className="builder-picker-heading">
              <p className="eyebrow">YOUR MOVEMENT LIBRARY</p>
              <h2 id="builder-picker-heading">Find your next move.</h2>
              <p>Available with your selected equipment.</p>
            </div>
            <label className="builder-search">
              <Search size={17} />
              <input
                type="search"
                aria-label="Find a movement for your routine"
                placeholder="Search movements…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear movement search"
                  onClick={() => setSearch('')}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <Select
              className="builder-muscle-filter"
              label="Filter routine movements by muscle"
              value={muscle}
              onValueChange={(value) => setMuscle(value as Muscle | 'all')}
              options={[
                { value: 'all', label: 'All muscle groups' },
                ...Object.entries(muscleNames).map(([value, label]) => ({ value, label })),
              ]}
            />
            <div className="builder-choices">
              {choices.map((exercise) => (
                <div className="builder-choice-row" key={exercise.id}>
                  <button
                    type="button"
                    className={`builder-choice ${selected.has(exercise.id) ? 'is-added' : ''}`}
                    aria-label={`${selected.has(exercise.id) ? 'Added' : 'Add'} ${exercise.name}`}
                    disabled={selected.has(exercise.id) || entries.length >= limit}
                    onClick={() => add(exercise.id)}
                  >
                    <span className="builder-choice-art">
                      <ExerciseThumbnail exerciseId={exercise.id} compact />
                    </span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exercise.unit === 'sec'
                          ? 'Timed hold'
                          : exercise.level <= 1
                            ? 'Foundation'
                            : 'Progression'}
                        {selected.has(exercise.id) ? ' · Added' : ''}
                      </small>
                    </span>
                    {selected.has(exercise.id) ? <Check size={15} /> : <Plus size={17} />}
                  </button>
                  <Tooltip content="View instructions">
                    <button
                      type="button"
                      className="builder-info"
                      aria-label={`View ${exercise.name} instructions`}
                      onClick={() => onInfo(exercise.id)}
                    >
                      <Info size={17} />
                    </button>
                  </Tooltip>
                </div>
              ))}
              {!choices.length && (
                <div className="builder-no-results">
                  <p>No matching movements.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setMuscle('all')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
            {entries.length >= limit && (
              <p className="builder-picker-note">
                Your routine has {limit} movements. Remove one to make room for another.
              </p>
            )}
          </aside>
        </div>
        <div className="builder-save-bar">
          <div>
            <strong>
              {initial ? 'Ready to save your changes?' : 'A plan you can look forward to.'}
            </strong>
            <p>
              {!entries.length
                ? 'Add a movement to get started.'
                : !title.trim()
                  ? 'Give your routine a name.'
                  : errors.some(Boolean)
                    ? 'Review the highlighted targets before saving.'
                    : 'Your routine will be saved on this device.'}
            </p>
          </div>
          <div>
            <button type="button" className="secondary-button" onClick={requestCancel}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!ready}>
              <Save size={16} />
              Save routine
            </button>
          </div>
        </div>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      {confirmCancel && (
        <Modal title="Leave this routine?" onClose={() => setConfirmCancel(false)}>
          <p className="modal-description">
            Your unsaved changes will be lost. Your saved workouts and other routines will stay as
            they are.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setConfirmCancel(false)}
            >
              Keep editing
            </button>
            <button className="danger-button" type="button" onClick={onCancel}>
              Discard changes
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ArrowUpRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M5 19 19 5M5 5h14v14" />
    </svg>
  )
}
