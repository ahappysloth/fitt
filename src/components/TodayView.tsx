import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Dumbbell,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react'
import type { AppState, Focus, Muscle, Profile, Workout } from '../lib/types'
import { byId, muscleNames } from '../lib/catalog'
import { doneSets, focusNames, localDay, totalSets, weekDays } from '../lib/workout'
import { getRewards } from '../lib/rewards'
import { SparkBuddy, TrophyArt } from './FittArtwork'
import { Button, IconButton, Pill, ProgressBar, SectionTitle, Select, Week, XPCard } from './ui'
import { ExerciseThumbnail } from './ExerciseGuide'
import { MuscleMap } from './Visuals'
import ActiveWorkoutNotice from './ActiveWorkoutNotice'

export default function TodayView({
  state,
  onProfile,
  onStart,
  onQuick,
  onInfo,
  onSwap,
  onSetup,
  onJourney,
  onCreate,
  onEdit,
  onRoutine,
  onDeleteRoutine,
  onRegenerate,
  onDismissWelcome,
}: {
  state: AppState
  onProfile: (profile: Profile) => void
  onStart: () => void
  onQuick: () => void
  onInfo: (id: string) => void
  onSwap: (index: number) => void
  onSetup: () => void
  onJourney: () => void
  onCreate: () => void
  onEdit: (workout: Workout) => void
  onRoutine: (workout: Workout) => void
  onDeleteRoutine: (id: string) => void
  onRegenerate: () => void
  onDismissWelcome: () => void
}) {
  const rewards = getRewards(state.history, state.profile.weeklyGoal)
  const week = rewards.currentWeek
  const plan = state.active || state.plan!
  const today = localDay(new Date())
  const [selectedDay, selectDay] = useState(today)
  const selected = week.days.find((day) => day.date === selectedDay)
  const completedToday = week.days.some((day) => day.isToday && day.done)
  const muscles = [...new Set(plan.exercises.flatMap((entry) => byId[entry.exerciseId].muscles))]
  const name = state.preferences?.displayName.trim()
  const left = Math.max(0, week.goal - week.count)
  return (
    <div className="view-today">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOU’RE IN THE RIGHT PLACE</p>
          <h1>
            {name ? `Hey, ${name}` : 'Your next chapter'}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Let’s make a little progress today.</p>
        </div>
        <Pill>
          <span className="live-dot" /> Your pace. Always.
        </Pill>
      </div>
      {!state.preferences?.onboarded && (
        <section className="welcome-note" aria-label="Welcome to Fitt">
          <Sparkles size={20} />
          <div>
            <strong>Let’s make this your space.</strong>
            <p>Choose your equipment and experience, or start with a beginner bodyweight plan.</p>
          </div>
          <Button variant="secondary" onClick={onSetup}>
            Set up my plan
          </Button>
          <Button variant="ghost" onClick={onDismissWelcome}>
            Use bodyweight
          </Button>
        </section>
      )}
      <div className="dashboard-grid">
        <div className="primary-column">
          <section className="hero-card">
            <div className="hero-copy">
              <Pill className="lime-pill">
                <Zap size={12} fill="currentColor" />
                {state.active
                  ? 'YOUR SESSION IS WAITING'
                  : completedToday
                    ? 'YOU MADE TIME FOR YOU'
                    : 'TODAY IS A GOOD DAY TO START'}
              </Pill>
              <h2>
                {state.active ? (
                  <>
                    Your next rep.
                    <br />
                    <em>Right here.</em>
                  </>
                ) : completedToday ? (
                  <>
                    You showed up.
                    <br />
                    <em>That’s a win.</em>
                  </>
                ) : (
                  <>
                    Small steps.
                    <br />
                    <em>Strong you.</em>
                  </>
                )}
              </h2>
              <p>
                {state.active
                  ? `${doneSets(state.active)} of ${totalSets(state.active)} sets logged. Pick up where you left off.`
                  : completedToday
                    ? 'Take the good feeling with you. You’ve earned your recovery.'
                    : 'You don’t need a perfect day. Just a little room to move.'}
              </p>
              <Button
                className="hero-button"
                onClick={completedToday && !state.active ? onJourney : onStart}
              >
                {state.active
                  ? 'Resume workout'
                  : completedToday
                    ? 'See your progress'
                    : 'Start my workout'}
                <span>
                  <ArrowUpRight size={19} />
                </span>
              </Button>
              <span className="hero-footnote">
                <Clock3 size={13} />
                {plan.duration} min · {plan.exercises.length} exercises · Made for you
              </span>
            </div>
            <div className="hero-character">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <SparkBuddy />
              <div className="floating-chip">
                <Sparkles size={14} />
                YOU’VE GOT THIS
              </div>
            </div>
          </section>
          {!state.active && (
            <button className="quick-start-strip" onClick={onQuick}>
              <span className="quick-start-icon">
                <Zap size={18} fill="currentColor" />
              </span>
              <span>
                <strong>Only have five minutes?</strong>
                <small>Make your next step a small one.</small>
              </span>
              <ArrowUpRight size={19} />
            </button>
          )}
          <section className="week-card panel">
            <SectionTitle
              eyebrow="MAKE ROOM FOR YOURSELF"
              title={
                week.goalReached
                  ? 'You made it happen.'
                  : week.count
                    ? 'One more little win.'
                    : 'A fresh start is a win.'
              }
              action={
                <div className="week-tally">
                  <strong>{week.count}</strong> / {week.goal}
                  <small>this week</small>
                </div>
              }
            />
            <Week
              days={weekDays()}
              completedDays={week.days.filter((day) => day.done).map((day) => day.date)}
              selected={selectedDay}
              onSelect={selectDay}
            />
            <p className="week-helper">
              <Target size={14} />
              {selected && selected.date !== today
                ? selected.done
                  ? `${selected.count} workout${selected.count === 1 ? '' : 's'} saved on ${selected.label}.`
                  : 'A day for recovery, or a fresh start.'
                : week.goalReached
                  ? 'Goal reached. Make space for recovery.'
                  : `${left} workout${left === 1 ? '' : 's'} to your weekly goal. Short sessions count, too.`}
            </p>
            <ProgressBar
              value={(week.count / week.goal) * 100}
              label={`${week.count} of ${week.goal} weekly workouts`}
            />
          </section>
          <section className="panel plan-card">
            <SectionTitle
              eyebrow="YOUR PLAN, YOUR PACE"
              title={state.active ? 'Your session in progress' : plan.title}
              action={
                <Button variant="ghost" className="equipment-link" onClick={onSetup}>
                  <Settings2 size={16} aria-hidden="true" />
                  Equipment
                </Button>
              }
            />
            <div className="plan-controls">
              <div className="focus-options" aria-label="Workout focus">
                {(['full', 'upper', 'lower', 'core'] as Focus[]).map((focus) => (
                  <button
                    key={focus}
                    aria-pressed={state.profile.focus === focus}
                    disabled={!!state.active}
                    onClick={() => onProfile({ ...state.profile, focus })}
                  >
                    {focus === 'core' ? 'Core' : focusNames[focus]}
                  </button>
                ))}
              </div>
              <label>
                <span className="sr-only">Workout duration</span>
                <Select
                  label="Workout duration"
                  value={String(state.profile.duration)}
                  disabled={!!state.active}
                  onValueChange={(value) =>
                    onProfile({
                      ...state.profile,
                      duration: Number(value) as Profile['duration'],
                    })
                  }
                  options={[20, 30, 45].map((minutes) => ({
                    value: String(minutes),
                    label: `${minutes} min`,
                  }))}
                />
              </label>
            </div>
            <div className="plan-list">
              {plan.exercises.map((entry, index) => {
                const exercise = byId[entry.exerciseId]
                return (
                  <div className="plan-row" key={`${entry.exerciseId}-${index}`}>
                    <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
                    <button
                      className="exercise-mini"
                      onClick={() => onInfo(exercise.id)}
                      aria-label={`View ${exercise.name} instructions`}
                    >
                      <ExerciseThumbnail exerciseId={exercise.id} compact />
                    </button>
                    <button className="exercise-name" onClick={() => onInfo(exercise.id)}>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exercise.muscles
                          .slice(0, 2)
                          .map((muscle) => muscleNames[muscle])
                          .join(' · ')}
                      </small>
                    </button>
                    <div className="exercise-dose">
                      {entry.sets.length} × {entry.sets[0].target}
                      <small>{exercise.unit === 'sec' ? 'seconds' : 'reps'}</small>
                    </div>
                    <IconButton
                      label={`Swap ${exercise.name}`}
                      disabled={!!state.active}
                      onClick={() => onSwap(index)}
                    >
                      <RotateCcw size={15} />
                    </IconButton>
                  </div>
                )
              })}
            </div>
            <div className="plan-footer">
              <ShieldCheck size={13} />
              Clean reps first. Adjust every set as you go.
            </div>
            <div className="plan-actions">
              <Button onClick={onStart}>
                {state.active ? 'Resume workout' : 'Start this workout'}
                <ArrowRight size={17} />
              </Button>
              <Button variant="ghost" disabled={!!state.active} onClick={onRegenerate}>
                <RotateCcw size={15} />
                Refresh plan
              </Button>
            </div>
          </section>
          <section className="routines-section">
            <SectionTitle
              eyebrow="A LITTLE MORE YOU"
              title="Your saved workouts"
              action={
                <Button variant="secondary" disabled={!!state.active} onClick={onCreate}>
                  <Plus size={16} />
                  Create workout
                </Button>
              }
            />
            {state.active && (
              <ActiveWorkoutNotice className="routine-session-notice" onGoToWorkout={onStart}>
                Finish or discard your current workout before creating or changing saved routines.
              </ActiveWorkoutNotice>
            )}
            {state.routines?.length ? (
              <div className="routine-grid">
                {state.routines.map((routine) => (
                  <article className="panel routine-card" key={routine.id}>
                    <Dumbbell size={21} />
                    <h3>{routine.title}</h3>
                    <p>
                      {routine.exercises.length} exercises · {routine.duration} min
                    </p>
                    <div className="routine-actions">
                      <Button
                        variant="secondary"
                        disabled={!!state.active}
                        onClick={() => onRoutine(routine)}
                      >
                        Start
                        <ArrowRight size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!!state.active}
                        onClick={() => onEdit(routine)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!!state.active}
                        onClick={() => onDeleteRoutine(routine.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel routine-empty">
                <Dumbbell size={25} />
                <div>
                  <strong>Make a routine you’ll look forward to.</strong>
                  <p>Choose your movements, reps, and sets. Keep your favorites here.</p>
                </div>
              </div>
            )}
          </section>
        </div>
        <aside className="secondary-column">
          <section className="athlete-card panel">
            <div className="athlete-heading">
              <span className="eyebrow">YOUR MOMENTUM</span>
              <IconButton label="See your journey" onClick={onJourney}>
                <ArrowUpRight size={18} />
              </IconButton>
            </div>
            <div className="athlete-avatar">
              <SparkBuddy small />
              <span className="avatar-level">{rewards.level}</span>
            </div>
            <h2>{rewards.sessions ? 'Keep becoming.' : 'This is your beginning.'}</h2>
            <p>Every bit of effort adds up.</p>
            <XPCard xp={rewards.xp} compact />
          </section>
          <button className="next-award-card" onClick={onJourney}>
            <div className="award-card-top">
              <Pill>
                <Trophy size={12} />
                {week.goalReached ? 'YOU EARNED THIS' : 'YOUR NEXT WIN'}
              </Pill>
              <ArrowUpRight size={18} />
            </div>
            <TrophyArt />
            <div className="award-card-copy">
              <h3>{rewards.sessions ? 'Week winner' : 'Your first move'}</h3>
              <p>
                {rewards.sessions
                  ? week.goalReached
                    ? 'A little consistency. A real achievement.'
                    : 'Your goal is closer than you think.'
                  : 'It starts with showing up for yourself.'}
              </p>
              <div className="award-progress">
                <span>
                  {rewards.sessions
                    ? `${week.count} of ${week.goal} workouts`
                    : 'Your first workout awaits'}
                </span>
                <strong>{rewards.sessions ? '+25 XP' : 'First award'}</strong>
              </div>
            </div>
          </button>
          <section className="panel today-muscles">
            <SectionTitle eyebrow="A FULL-BODY PICTURE" title="Muscles in your plan" />
            <MuscleMap muscles={muscles} small />
            <p className="muscle-map-note">
              Main and supporting muscles. Highlighted groups are in this plan.
            </p>
            <ul className="muscle-tags muscle-legend" aria-label="Muscle groups">
              {Object.entries(muscleNames).map(([muscle, label]) => {
                const active = muscles.includes(muscle as Muscle)
                return (
                  <li key={muscle}>
                    <Pill className={active ? 'is-active' : 'is-inactive'}>
                      {active && <Check size={12} aria-hidden="true" />}
                      {label}
                      <span className="sr-only">
                        {active ? ' — in this plan' : ' — not in this plan'}
                      </span>
                    </Pill>
                  </li>
                )
              })}
            </ul>
          </section>
          <div className="rest-note">
            <span>
              <Moon size={19} />
            </span>
            <p>
              <strong>Rest is part of getting stronger.</strong>Your XP and awards stay yours.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
