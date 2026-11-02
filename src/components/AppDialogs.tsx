import {
  ArrowRight,
  Check,
  Clock3,
  Dumbbell,
  Flame,
  Heart,
  Medal,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import type { AppState, Exercise, Session } from '../lib/types'
import { alternativesFor, doneSets, totalSets } from '../lib/workout'
import { byId, equipmentList, muscleNames } from '../lib/catalog'
import { getRewards, getSessionReward } from '../lib/rewards'
import Modal from './Modal'
import ExerciseGuide from './ExerciseGuide'
import { MuscleMap } from './Visuals'
import { TrophyArt } from './FittArtwork'
import { Button, Confetti, CountUp, Pill, ProgressBar } from './ui'
import { InstallHelp, ProgressHelp } from './HelpDialogs'

export type AppDialog =
  | { type: 'exercise'; id: string }
  | { type: 'swap'; index: number; active: boolean }
  | { type: 'finish' | 'discard' | 'reset' | 'install' | 'how' | 'leave-builder' }
  | { type: 'import'; state: AppState }
  | { type: 'summary'; session: Session; celebrate?: boolean }
  | { type: 'award'; id: string }
  | { type: 'delete-routine'; id: string }

const awardIcons = {
  'first-move': Zap,
  'fresh-start': Flame,
  'back-at-it': Heart,
  'new-territory': TrendingUp,
  'week-winner': Trophy,
  'ten-club': Medal,
}

export default function AppDialogs({
  dialog,
  state,
  storageError,
  accountMode = false,
  onClose,
  onSwap,
  onFinish,
  onDiscard,
  onReset,
  onRestore,
  onDeleteRoutine,
  onLeaveBuilder,
  onJourney,
  onExport,
}: {
  dialog: AppDialog | null
  state: AppState
  storageError: string | null
  accountMode?: boolean
  onClose: () => void
  onSwap: (exercise: Exercise) => void
  onFinish: () => void
  onDiscard: () => void
  onReset: () => void
  onRestore: (state: AppState) => void
  onDeleteRoutine: (id: string) => void
  onLeaveBuilder: () => void
  onJourney: () => void
  onExport: () => void
}) {
  if (!dialog) return null
  const rewards = getRewards(state.history, state.profile.weeklyGoal)
  const title =
    dialog.type === 'exercise'
      ? byId[dialog.id].name
      : dialog.type === 'swap'
        ? 'Find your variation'
        : dialog.type === 'finish'
          ? 'Finish where you are?'
          : dialog.type === 'discard'
            ? 'Discard this session?'
            : dialog.type === 'reset'
              ? 'Reset your training space?'
              : dialog.type === 'import'
                ? 'Restore your backup?'
                : dialog.type === 'summary'
                  ? dialog.celebrate
                    ? 'Your effort, celebrated'
                    : 'Your workout, remembered'
                  : dialog.type === 'award'
                    ? 'A milestone that matters'
                    : dialog.type === 'delete-routine'
                      ? 'Delete this saved workout?'
                      : dialog.type === 'leave-builder'
                        ? 'Leave without saving?'
                        : dialog.type === 'install'
                          ? 'Take Fitt with you'
                          : 'Progress, at your pace'
  const entry =
    dialog.type === 'swap'
      ? (dialog.active ? state.active : state.plan)?.exercises[dialog.index]
      : null
  const award =
    dialog.type === 'award' ? rewards.awards.find((item) => item.id === dialog.id) : undefined
  const AwardIcon = award ? awardIcons[award.id] : Trophy
  return (
    <Modal title={title} onClose={onClose} wide={dialog.type === 'exercise'}>
      {dialog.type === 'exercise' && <ExerciseDetail exercise={byId[dialog.id]} />}
      {dialog.type === 'swap' && entry && (
        <div className="swap-dialog">
          <p className="dialog-copy">
            Choose a variation of {byId[entry.exerciseId].name.toLowerCase()} using your equipment.
            Targets reset for the new movement.
          </p>
          <div className="swap-list">
            {alternativesFor(entry, state.profile).map((exercise) => (
              <button key={exercise.id} onClick={() => onSwap(exercise)}>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>
                    {exercise.level <= 1
                      ? 'Foundation'
                      : exercise.level === 2
                        ? 'Intermediate'
                        : 'Advanced variation'}{' '}
                    · {exercise.min}–{exercise.max} {exercise.unit}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          {!alternativesFor(entry, state.profile).length && (
            <p className="dialog-copy">
              This is the available variation for your equipment. You can adjust your reps, hold
              time, and effort during the workout.
            </p>
          )}
        </div>
      )}
      {dialog.type === 'finish' && (
        <>
          <p className="dialog-copy">
            You’ve logged {state.active ? doneSets(state.active) : 0} of{' '}
            {state.active ? totalSets(state.active) : 0} sets. Save the work you did; a shorter
            workout still counts.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Keep going
            </Button>
            <Button onClick={onFinish}>
              Save workout
              <Check size={16} />
            </Button>
          </div>
        </>
      )}
      {dialog.type === 'discard' && (
        <>
          <p className="dialog-copy">
            This removes your current session and its unsaved sets. Your saved workouts, XP, and
            awards stay safe.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Keep training
            </Button>
            <Button variant="danger" onClick={onDiscard}>
              Discard session
            </Button>
          </div>
        </>
      )}
      {dialog.type === 'reset' && (
        <>
          <p className="dialog-copy">
            {accountMode
              ? 'This deletes your account’s workout history, saved routines, progress, and preferences. The deletion will sync to your other devices. Your separate guest history stays unchanged. Export a backup first if you want to keep your account data.'
              : 'This deletes workout history, saved routines, progress, and preferences from this device. Export a backup first if you want to keep them.'}
          </p>
          <Button variant="secondary" onClick={onExport}>
            Export backup
          </Button>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Keep my data
            </Button>
            <Button variant="danger" onClick={onReset}>
              Reset all data
            </Button>
          </div>
        </>
      )}
      {dialog.type === 'import' && (
        <>
          <p className="dialog-copy">
            Restore {dialog.state.history.length} completed workout
            {dialog.state.history.length === 1 ? '' : 's'} and {dialog.state.routines?.length || 0}{' '}
            saved routines.{' '}
            {accountMode
              ? 'This replaces your account’s training data and will sync to your other devices. It also replaces the active workout on this device. Your separate guest history stays unchanged.'
              : 'This replaces your current data on this device, including any active workout.'}
          </p>
          <Button variant="secondary" onClick={onExport}>
            Export current data first
          </Button>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onRestore(dialog.state)}>Restore backup</Button>
          </div>
        </>
      )}
      {dialog.type === 'delete-routine' && (
        <>
          <p className="dialog-copy">
            Remove “{state.routines?.find((routine) => routine.id === dialog.id)?.title}” from your
            saved workouts? Completed sessions and earned progress stay in your history.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Keep workout
            </Button>
            <Button variant="danger" onClick={() => onDeleteRoutine(dialog.id)}>
              Delete saved workout
            </Button>
          </div>
        </>
      )}
      {dialog.type === 'leave-builder' && (
        <>
          <p className="dialog-copy">Your changes to this workout haven’t been saved.</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onLeaveBuilder}>
              Leave without saving
            </Button>
          </div>
        </>
      )}
      {dialog.type === 'summary' && (
        <SessionSummary
          session={dialog.session}
          state={state}
          celebrate={!!dialog.celebrate}
          storageError={storageError}
          onJourney={onJourney}
          onExport={onExport}
        />
      )}
      {dialog.type === 'award' && award && (
        <div className="award-detail">
          <span className={`award-seal ${award.earned ? '' : 'locked'}`}>
            <AwardIcon size={36} />
          </span>
          <p className="eyebrow">{award.earned ? 'YOU EARNED THIS' : 'YOUR NEXT CHAPTER'}</p>
          <h3>{award.title}</h3>
          <p>{award.description}</p>
          <p className="dialog-copy">{award.detail}</p>
          <ProgressBar
            value={(award.progress / award.target) * 100}
            label={`${award.progress} of ${award.target} towards ${award.title}`}
          />
          {award.earnedAt && (
            <small>
              First earned{' '}
              {new Date(award.earnedAt).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </small>
          )}
          <Button variant="secondary" onClick={onClose}>
            Keep becoming
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
      {dialog.type === 'install' && <InstallHelp accountMode={accountMode} onClose={onClose} />}
      {dialog.type === 'how' && <ProgressHelp onClose={onClose} />}
    </Modal>
  )
}

function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  return (
    <div className="guide-modal exercise-detail">
      <Pill>
        {exercise.level <= 1 ? 'Foundation' : exercise.level === 2 ? 'Intermediate' : 'Progression'}
      </Pill>
      <p className="dialog-copy">{exercise.cue}</p>
      <ExerciseGuide exercise={exercise} />
      <div className="guide-modal-muscles">
        <MuscleMap muscles={exercise.muscles} small />
        <div>
          <p className="eyebrow">KNOW YOUR MOVEMENT</p>
          <h3>Muscles at work</h3>
          <div className="muscle-tags">
            {exercise.muscles.map((muscle) => (
              <Pill key={muscle}>{muscleNames[muscle]}</Pill>
            ))}
          </div>
        </div>
      </div>
      <h3>Make every rep a good rep.</h3>
      <ol className="form-steps">
        {exercise.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <div className="detail-facts">
        <span>
          <Dumbbell size={15} />
          {exercise.equipment.length
            ? exercise.equipment
                .map((id) => equipmentList.find((equipment) => equipment.id === id)!.name)
                .join(' + ')
            : 'Bodyweight'}
        </span>
        <span>
          <Clock3 size={15} />
          {exercise.rest}s rest
        </span>
      </div>
    </div>
  )
}

function SessionSummary({
  session,
  state,
  celebrate,
  storageError,
  onJourney,
  onExport,
}: {
  session: Session
  state: AppState
  celebrate: boolean
  storageError: string | null
  onJourney: () => void
  onExport: () => void
}) {
  const reward = getSessionReward(state.history, session.id, state.profile.weeklyGoal)
  const calm = state.preferences?.celebration === 'calm' || !celebrate
  if (!reward) return <p className="dialog-copy">This workout is saved in your training history.</p>
  return (
    <div className="celebration-content">
      {celebrate && <Confetti calm={calm} />}
      <Pill className="lime-pill">
        <Check size={12} />
        WORKOUT SAVED
      </Pill>
      {celebrate && (
        <div className="celebration-trophy">
          <TrophyArt />
        </div>
      )}
      <p className="eyebrow">
        {celebrate
          ? 'YOU SHOWED UP FOR YOURSELF'
          : new Date(session.completedAt!).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
      </p>
      <h2>{celebrate ? 'Look at you go.' : session.title}</h2>
      <p>
        {celebrate
          ? 'A little stronger. A little more you.'
          : 'The effort you made, exactly as you logged it.'}
      </p>
      <div className="earned-xp">
        <Zap size={26} fill="currentColor" />+<CountUp value={reward.xp} calm={calm} />
        <span>XP</span>
      </div>
      <div className="celebration-stats">
        <span>
          <strong>{reward.completedSets}</strong>sets logged
        </span>
        <span>
          <strong>{reward.totalReps}</strong>reps
        </span>
        <span>
          <strong>{reward.totalHoldSeconds}</strong>hold seconds
        </span>
      </div>
      {reward.levelAfter > reward.levelBefore && (
        <div className="level-up-banner">
          <span>
            <Star size={23} fill="currentColor" />
          </span>
          <div>
            <p>LEVEL UP</p>
            <strong>Hello, level {reward.levelAfter}.</strong>
          </div>
          <span className="level-number">{String(reward.levelAfter).padStart(2, '0')}</span>
        </div>
      )}
      <div className="unlocked-rewards">
        {reward.firstOfWeek && (
          <span>
            <Flame size={17} />
            First workout of the week
            <Check size={16} />
          </span>
        )}
        {reward.reachedWeeklyGoal && (
          <span>
            <Trophy size={17} />
            Week winner<strong>+25 XP</strong>
          </span>
        )}
        {reward.personalBests.length > 0 && (
          <span>
            <TrendingUp size={17} />
            {reward.personalBests.length === 1
              ? 'A new personal best'
              : `${reward.personalBests.length} new personal bests`}
            <strong>+15 XP</strong>
          </span>
        )}
        {reward.unlockedAwards.includes('first-move') && (
          <span>
            <Medal size={17} />
            Your first move
            <Check size={16} />
          </span>
        )}
      </div>
      {storageError && (
        <div className="state-banner" role="alert">
          <p>Export a backup to keep this workout before closing the app.</p>
          <Button variant="secondary" onClick={onExport}>
            Export backup
          </Button>
        </div>
      )}
      <Button onClick={onJourney}>
        See my journey
        <ArrowRight size={17} />
      </Button>
      {!celebrate && (
        <div className="session-receipt">
          {session.exercises
            .filter((entry) => entry.sets.some((set) => set.done))
            .map((entry, index) => (
              <section key={index}>
                <h3>{byId[entry.exerciseId].name}</h3>
                <p>
                  {entry.sets
                    .filter((set) => set.done)
                    .map(
                      (set) =>
                        `${set.reps} ${byId[entry.exerciseId].unit}${set.load ? ` + ${set.load} kg` : ''} (${set.effort === 'good' ? 'just right' : set.effort})`,
                    )
                    .join(' · ')}
                </p>
              </section>
            ))}
        </div>
      )}
      <p className="celebration-close">
        Take the good feeling with you <Heart size={13} />
      </p>
    </div>
  )
}
