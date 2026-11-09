import { ArrowLeft, ArrowRight, Bookmark, Check, Clock3 } from 'lucide-react'
import { byId } from '../lib/catalog'
import { totalSets } from '../lib/workout'
import type { Workout } from '../lib/types'

export default function WorkoutReview({
  workout,
  saved,
  onEdit,
  onStart,
  onSave,
  onInfo,
}: {
  workout: Workout
  saved: boolean
  onEdit: () => void
  onStart: () => void
  onSave: () => void
  onInfo: (id: string) => void
}) {
  return (
    <div className="workout-review">
      <button className="builder-back" onClick={onEdit}>
        <ArrowLeft size={16} /> Edit workout
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PLAN IS READY</p>
          <h1>
            Make it a good one<span className="greeting-dot">.</span>
          </h1>
          <p>Check your lineup. Your timer starts when you continue.</p>
        </div>
      </div>
      <section className="panel workout-review__plan" aria-label="Workout review">
        <h2>{workout.title}</h2>
        <p className="workout-review__meta">
          <Clock3 size={15} /> About {workout.duration} min · {workout.exercises.length}{' '}
          {workout.exercises.length === 1 ? 'exercise' : 'exercises'} · {totalSets(workout)} sets
        </p>
        <ol>
          {workout.exercises.map((entry, index) => {
            const exercise = byId[entry.exerciseId]
            const first = entry.sets[0]
            return (
              <li key={`${entry.exerciseId}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{exercise.name}</strong>
                  <small>
                    {entry.sets.length} sets · {first.target} {exercise.unit}
                    {first.targetLoad > 0 ? ` + ${first.targetLoad} kg` : ''} · {exercise.rest}s
                    rest
                  </small>
                </div>
                <button
                  className="text-button"
                  onClick={() => onInfo(exercise.id)}
                  aria-label={`Review ${exercise.name} form`}
                >
                  Form
                </button>
              </li>
            )
          })}
        </ol>
        <div className="workout-review__actions">
          <button className="primary-button" onClick={onStart}>
            Continue to workout <ArrowRight size={17} />
          </button>
          <button className="secondary-button" disabled={saved} onClick={onSave}>
            {saved ? <Check size={16} /> : <Bookmark size={16} />}
            {saved ? 'Routine saved' : 'Save routine'}
          </button>
        </div>
        <p className="workout-review__note">
          You can change your reps, edit logged sets, and add more as you go.
        </p>
      </section>
    </div>
  )
}
