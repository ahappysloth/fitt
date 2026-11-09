import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  Info,
  Plus,
  ArrowRight,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { available, byId, exercises, muscleNames } from '../lib/catalog'
import { MAX_ADDED_LOAD_KG } from '../lib/limits'
import type {
  Focus,
  Muscle,
  Pattern,
  Profile,
  Session,
  Workout,
  WorkoutExercise,
} from '../lib/types'
import { focusNames, generateWorkout, prescribe, uid } from '../lib/workout'
import { ExerciseThumbnail } from './ExerciseGuide'
import Modal from './Modal'
import { Select, Tooltip } from './ui'
import './builder.css'

export interface WorkoutBuilderProps {
  profile: Profile
  history: Session[]
  initial?: Workout
  initialFocus?: Focus
  onFocusChange?: (focus: Focus) => void
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
  initialFocus = profile.focus,
  onFocusChange,
  onSave,
  onCancel,
  onInfo,
  onDirtyChange,
}: WorkoutBuilderProps) {
  const [suggestion] = useState(() => initial ?? generateWorkout(profile, history))
  const [title, setTitle] = useState(suggestion.title)
  const [focus, setFocus] = useState<Focus>(initialFocus)
  const [pickerFocus, setPickerFocus] = useState<Focus | 'all'>(initialFocus)
  const [category, setCategory] = useState<Pattern | 'all'>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapKey, setSwapKey] = useState<string | null>(null)
  const [duration, setDuration] = useState(String(initial?.duration ?? profile.duration))
  const [entries, setEntries] = useState<DraftEntry[]>(() => suggestion.exercises.map(toDraft))
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [dirty, setDirty] = useState(false)
  const [pendingPreset, setPendingPreset] = useState<Focus | 'empty' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [notice, setNotice] = useState('')
  const [attemptedReview, setAttemptedReview] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const validationId = useId()
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
      (pickerFocus === 'all' ||
        pickerFocus === 'full' ||
        (pickerFocus === 'upper' &&
          exercise.muscles.some((id) =>
            ['chest', 'upper-back', 'shoulders', 'biceps', 'triceps', 'forearms'].includes(id),
          )) ||
        (pickerFocus === 'lower' &&
          exercise.muscles.some((id) =>
            ['quads', 'glutes', 'hamstrings', 'calves'].includes(id),
          )) ||
        (pickerFocus === 'core' && exercise.muscles.includes('core'))) &&
      (category === 'all' || exercise.pattern === category) &&
      (muscle === 'all' || exercise.muscles.includes(muscle)) &&
      (!query ||
        `${exercise.name} ${exercise.muscles.map((id) => muscleNames[id]).join(' ')}`
          .toLocaleLowerCase()
          .includes(query)),
  )
  const errors = entries.map((entry) => {
    const exercise = byId[entry.exerciseId]
    if (!available(exercise, profile.equipment))
      return 'This exercise needs equipment that is no longer selected. Remove it or update your equipment.'
    if (!validNumber(entry.count, 1, 6)) return 'Choose between 1 and 6 whole sets.'
    if (!validNumber(entry.target, 1, exercise.unit === 'sec' ? 600 : 100))
      return `Choose a whole target from 1 to ${exercise.unit === 'sec' ? 600 : 100} ${exercise.unit === 'sec' ? 'seconds' : 'reps'}.`
    if (!validNumber(entry.load, 0, MAX_ADDED_LOAD_KG, false))
      return `Choose an added load from 0 to ${MAX_ADDED_LOAD_KG} kg.`
    if ((!exercise.weighted || !hasVest) && (Number(entry.load) > 0 || entry.recordedLoad > 0))
      return exercise.weighted
        ? 'A weighted vest is not selected. Switch this exercise to bodyweight, or add a vest in Settings.'
        : 'This exercise uses bodyweight. Remove the saved added load before saving.'
    return null
  })
  const titleError = !title.trim()
    ? 'Give your routine a name.'
    : title.trim().length > 60
      ? 'Use a routine name of 60 characters or fewer.'
      : null
  const durationError = validNumber(duration, 1, 180)
    ? null
    : 'Choose a whole number of minutes from 1 to 180.'
  const firstExerciseError = errors.findIndex(Boolean)
  const reviewError = !entries.length
    ? 'Add an exercise to get started.'
    : titleError ||
      durationError ||
      (entries.length > limit
        ? `Keep your workout to ${limit} exercises or fewer.`
        : firstExerciseError >= 0
          ? `${byId[entries[firstExerciseError].exerciseId].name}: ${errors[firstExerciseError]}`
          : null)
  const ready = !reviewError
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
    if (selected.has(exerciseId) || (!swapKey && entries.length >= limit)) return
    const prescribed = prescribe(byId[exerciseId], profile, history)
    // The selected exercise stays the user's choice; prescribe may recommend a different variation.
    const entry =
      prescribed.exerciseId === exerciseId
        ? prescribed
        : {
            exerciseId,
            note: '',
            plannedSetCount: 1,
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
    setEntries((current) =>
      swapKey ? current.map((item) => (item.key === swapKey ? draft : item)) : [...current, draft],
    )
    setDirty(true)
    setNotice(`${byId[exerciseId].name} ${swapKey ? 'swapped into' : 'added to'} your routine.`)
    if (swapKey) setPickerOpen(false)
    setSwapKey(null)
  }
  function choosePreset(nextFocus: Focus) {
    const next = generateWorkout({ ...profile, focus: nextFocus }, history)
    setFocus(nextFocus)
    onFocusChange?.(nextFocus)
    setPickerFocus(nextFocus)
    setTitle(next.title)
    setEntries(next.exercises.map(toDraft))
    setDirty(true)
    setNotice(`${focusNames[nextFocus]} preset selected. You can edit every target.`)
  }
  function requestPreset(next: Focus | 'empty') {
    if (dirty && entries.length > 0) {
      setPendingPreset(next)
      return
    }
    applyPreset(next)
  }
  function applyPreset(next: Focus | 'empty') {
    if (next === 'empty') {
      setEntries([])
      setTitle('My workout')
      setDirty(true)
    } else choosePreset(next)
    setPendingPreset(null)
  }
  function openPicker(key: string | null = null) {
    setSwapKey(key)
    setPickerFocus(focus)
    setCategory('all')
    setMuscle('all')
    setSearch('')
    setPickerOpen(true)
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
    if (!ready) {
      setAttemptedReview(true)
      const selector = !entries.length
        ? '.builder-add-link'
        : titleError
          ? '[name="routine-name"]'
          : durationError
            ? '[role="combobox"]'
            : entries.length > limit
              ? '.builder-remove'
              : '[aria-invalid="true"]'
      const control =
        formRef.current?.querySelector<HTMLElement>(selector) ||
        formRef.current?.querySelector<HTMLElement>('.builder-field-error')
      control?.focus({ preventScroll: true })
      control?.scrollIntoView({ block: 'center', behavior: 'instant' })
      return
    }
    setAttemptedReview(false)
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
          plannedSetCount: Number(entry.count),
          sets: Array.from({ length: Number(entry.count) }, () => ({
            id: uid(),
            target: Number(entry.target),
            reps: Number(entry.target),
            load,
            targetLoad: load,
            effort: 'good' as const,
            done: false,
            prescription: { target: Number(entry.target), load, source: 'manual' as const },
            recommendationSource: 'prescribed' as const,
            effortConfirmed: false,
            targetLocked: false,
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
            Your workout. Your way
            <span className="greeting-dot">.</span>
          </h1>
          <p>Pick your exercises, set your targets, and make it yours.</p>
        </div>
        <span className="pill">
          {entries.length} / {limit} exercises
        </span>
      </div>
      <div className="builder-presets" role="group" aria-label="Suggested workout presets">
        {(['full', 'upper', 'lower', 'core'] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={focus === id}
            onClick={() => requestPreset(id)}
          >
            <strong>{id === 'lower' ? 'Legs' : id === 'core' ? 'Core' : focusNames[id]}</strong>
            <small>
              {id === 'full'
                ? 'A little of everything'
                : id === 'upper'
                  ? 'Push, pull & shoulders'
                  : id === 'lower'
                    ? 'Legs, glutes & balance'
                    : 'Stability & control'}
            </small>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={entries.length === 0}
          onClick={() => requestPreset('empty')}
        >
          <strong>Start empty</strong>
          <small>Build from scratch</small>
        </button>
      </div>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {mixedInitialTargets && (
          <p className="builder-import-note">
            This routine has different targets between sets. The builder uses one target per
            exercise; saving applies the targets shown below to every set.
          </p>
        )}
        <section className="panel builder-basics">
          <label>
            Routine name
            <input
              name="routine-name"
              aria-label="Routine name"
              type="text"
              maxLength={60}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setDirty(true)
              }}
              placeholder="e.g. My full-body reset"
              aria-invalid={!!titleError}
              aria-describedby={titleError ? `${validationId}-name` : undefined}
              required
            />
            {titleError && (
              <span className="builder-field-error" id={`${validationId}-name`}>
                {titleError}
              </span>
            )}
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
            {durationError && <span className="builder-field-error">{durationError}</span>}
          </label>
        </section>
        <div className="builder-layout">
          <section className="builder-plan" aria-labelledby="builder-plan-heading">
            <div className="builder-section-heading">
              <div>
                <p className="eyebrow">YOUR LINEUP</p>
                <h2 id="builder-plan-heading">Your exercises.</h2>
              </div>
              <button type="button" className="builder-add-link" onClick={() => openPicker()}>
                <Plus size={16} />
                Add exercise
              </button>
            </div>
            {!entries.length && (
              <div className="panel builder-empty">
                <span>
                  <Plus size={25} />
                </span>
                <h3>Start with one exercise.</h3>
                <p>
                  Add an exercise from your equipment-matched library. You can change the order and
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
                        <Tooltip content="Swap exercise">
                          <button
                            type="button"
                            aria-label={`Swap ${exercise.name}`}
                            onClick={() => openPicker(entry.key)}
                          >
                            <RotateCcw size={16} />
                          </button>
                        </Tooltip>
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
                        <Tooltip content="Remove exercise">
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
                              : 'This exercise uses bodyweight.'}
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
                      <p className="builder-field-error" role="status" tabIndex={-1}>
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
                  {entries.length === 1 ? 'exercise' : 'exercises'}
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
        </div>
        <div className="builder-save-bar">
          <div>
            <strong>{ready ? 'Ready for a quick review?' : 'Let’s finish your plan.'}</strong>
            <p id={validationId} role={attemptedReview && reviewError ? 'alert' : undefined}>
              {reviewError || 'Review your plan next. Your timer has not started.'}
            </p>
          </div>
          <div>
            <button type="button" className="secondary-button" onClick={requestCancel}>
              Cancel
            </button>
            <button type="submit" className="primary-button" aria-describedby={validationId}>
              Review workout
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      {pickerOpen && (
        <Modal
          title={swapKey ? 'Swap exercise' : 'Add exercises'}
          onClose={() => setPickerOpen(false)}
          wide
        >
          <div className="builder-picker" aria-labelledby="builder-picker-heading">
            <div className="builder-picker-heading">
              <p className="eyebrow">YOUR EXERCISE LIBRARY</p>
              <h2 id="builder-picker-heading">Find your next exercise.</h2>
              <p>Choose any exercise available with your equipment.</p>
            </div>
            <label className="builder-search">
              <Search size={17} />
              <input
                type="search"
                aria-label="Find an exercise for your routine"
                placeholder="Search exercises…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear exercise search"
                  onClick={() => setSearch('')}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <div className="builder-picker-filters">
              <Select
                label="Filter exercises by workout focus"
                value={pickerFocus}
                onValueChange={(value) => setPickerFocus(value as Focus | 'all')}
                options={[
                  { value: 'all', label: 'Any focus' },
                  ...Object.entries(focusNames).map(([value, label]) => ({ value, label })),
                ]}
              />
              <Select
                label="Filter exercises by category"
                value={category}
                onValueChange={(value) => setCategory(value as Pattern | 'all')}
                options={[
                  { value: 'all', label: 'All categories' },
                  { value: 'push', label: 'Push' },
                  { value: 'pull', label: 'Pull' },
                  { value: 'squat', label: 'Squat & lunge' },
                  { value: 'hinge', label: 'Hinge & glutes' },
                  { value: 'core', label: 'Core' },
                  { value: 'shoulder', label: 'Shoulders' },
                ]}
              />
              <Select
                className="builder-muscle-filter"
                label="Filter routine exercises by muscle"
                value={muscle}
                onValueChange={(value) => setMuscle(value as Muscle | 'all')}
                options={[
                  { value: 'all', label: 'All muscle groups' },
                  ...Object.entries(muscleNames).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
            <p className="builder-picker-note">
              {swapKey
                ? 'Choose a replacement exercise.'
                : `${choices.length} exercises · choose Any focus to explore outside your preset.`}
            </p>
            <div className="builder-choices">
              {choices.map((exercise) => (
                <div className="builder-choice-row" key={exercise.id}>
                  <button
                    type="button"
                    className={`builder-choice ${selected.has(exercise.id) ? 'is-added' : ''}`}
                    aria-label={`${selected.has(exercise.id) ? 'Added' : 'Add'} ${exercise.name}`}
                    disabled={selected.has(exercise.id) || (!swapKey && entries.length >= limit)}
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
                      onClick={() => {
                        setPickerOpen(false)
                        onInfo(exercise.id)
                      }}
                    >
                      <Info size={17} />
                    </button>
                  </Tooltip>
                </div>
              ))}
              {!choices.length && (
                <div className="builder-no-results">
                  <p>No matching exercises.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setMuscle('all')
                      setPickerFocus('all')
                      setCategory('all')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
            {entries.length >= limit && (
              <p className="builder-picker-note">
                Your routine has {limit} exercises. Remove one to make room for another.
              </p>
            )}
          </div>
        </Modal>
      )}
      {pendingPreset && (
        <Modal title="Replace your lineup?" onClose={() => setPendingPreset(null)}>
          <p className="modal-description">
            Your current exercises and targets will be replaced. You can edit the new lineup before
            starting.
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setPendingPreset(null)}>
              Keep my lineup
            </button>
            <button className="primary-button" onClick={() => applyPreset(pendingPreset)}>
              Replace lineup
            </button>
          </div>
        </Modal>
      )}
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
