import { useState } from 'react'
import { ArrowUpRight, Check, CirclePlay, Move3D, ShieldCheck } from 'lucide-react'
import { FormGuide } from './FormGuide'
import { guideMotions } from './motions'
import { byId, equipmentList } from '../../lib/catalog'
import { Select } from '../ui'
import ModelInspector from './ModelInspector'
import { BodyModelPreferenceProvider } from '../BodyModelPreference'
import type { BodyModel, Muscle } from '../../lib/types'
import { kneePushupMuscles } from './muscle-regions'
import '../../form-preview/preview.css'

/** Shared studio content. The local provider keeps model experiments out of account preferences. */
export default function FormStudioContent({ embedded = false }: { embedded?: boolean }) {
  const motions = Object.values(guideMotions)
  const [exerciseId, setExerciseId] = useState('knee-pushup')
  const motion = motions.find((item) => item.id === exerciseId)!
  const exercise = byId[exerciseId]
  const [bodyModel, setBodyModel] = useState<BodyModel>('male')
  const [previewEnabled, setPreviewEnabled] = useState(false)
  const [previewRegions, setPreviewRegions] = useState<readonly Muscle[]>(kneePushupMuscles)
  const Heading = embedded ? 'h2' : 'h1'
  const MovementHeading = embedded ? 'h3' : 'h2'
  return (
    <>
      <section id="movement" className="form-study__main">
        <div className="form-study__intro">
          <p className="eyebrow">A LITTLE CLARITY. A BETTER REP.</p>
          <Heading className="form-study__headline">
            Good form.
            <br />
            <span>From every angle.</span>
          </Heading>
          <p className="form-study__lead">
            A quiet space to understand the exercise. Take it slowly, find your angle, and make the
            next rep yours.
          </p>
          <div className="form-study__exercise-picker">
            <label htmlFor="studio-exercise">Preview exercise</label>
            <Select
              id="studio-exercise"
              label="Preview exercise"
              value={exerciseId}
              onValueChange={setExerciseId}
              options={motions.map((item) => ({ value: item.id, label: item.name }))}
            />
          </div>
          <div className="form-study__movement">
            <span>{String(motions.indexOf(motion) + 1).padStart(2, '0')}</span>
            <div>
              <MovementHeading>{motion.name}</MovementHeading>
              <p>
                {exercise.level <= 1 ? 'Foundation' : 'Progression'} ·{' '}
                {exercise.equipment.length
                  ? exercise.equipment
                      .map((id) => equipmentList.find((item) => item.id === id)!.name)
                      .join(', ')
                  : 'Bodyweight'}
              </p>
            </div>
          </div>
          <ol className="form-study__cues">
            {motion.steps.map((step) => (
              <li key={step}>
                <Check size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="form-study__hint">
            <Move3D size={19} />
            <p>Rotate the model or try a side view. Scrub through a rep to see what changes.</p>
          </div>
          <div className="form-study__status">
            <ShieldCheck size={14} />
            <span>Local assets. Ready to explore offline.</span>
          </div>
        </div>
        <div className="form-study__viewer">
          <BodyModelPreferenceProvider value={{ bodyModel, onBodyModelChange: setBodyModel }}>
            <FormGuide
              key={motion.id}
              motion={motion}
              inspectionControls
              previewMuscles={previewEnabled ? previewRegions : undefined}
            />
          </BodyModelPreferenceProvider>
        </div>
      </section>
      <ModelInspector
        bodyModel={bodyModel}
        onBodyModelChange={setBodyModel}
        musclePreview={{
          enabled: previewEnabled,
          regions: previewRegions,
          onEnabledChange: setPreviewEnabled,
          onRegionsChange: setPreviewRegions,
        }}
      />
      <section id="the-system" className="form-study__system">
        <div className="form-study__section-title">
          <div>
            <p className="eyebrow">THE FOUNDATION</p>
            <h2>Your model. A consistent way to learn.</h2>
          </div>
          <span>
            EXERCISE PREVIEWS <ArrowUpRight size={14} />
          </span>
        </div>
        <div className="form-study__principles">
          <article>
            <Move3D size={20} />
            <h3>Explore the form</h3>
            <p>
              Choose a male or female model with the same guided exercise and useful camera angles.
              Rotate when it helps; use the side view to check the body line.
            </p>
          </article>
          <article>
            <CirclePlay size={20} />
            <h3>Learn at your pace</h3>
            <p>
              One controlled rep. Slow playback, a brief pause at the bottom, and a scrubber that
              lets you inspect any point in the movement.
            </p>
          </article>
          <article>
            <ShieldCheck size={20} />
            <h3>Build on one system</h3>
            <p>
              The body, animation, and viewer are separate. A more detailed anatomy model and new
              exercises can share the same controls and visual language.
            </p>
          </article>
        </div>
        <p className="form-study__footnote">
          Knee Push-up, Bodyweight Squat, and Pull-up are available for review here. Inspect each
          setup, lower position, and return from the front and side. Muscle highlights indicate
          approximate regions.
        </p>
      </section>
    </>
  )
}
