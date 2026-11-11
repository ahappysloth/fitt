'use client'

import { useState } from 'react'
import {
  Check,
  Layers3,
  Monitor,
  Move3D,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { Button, Pill } from '../ui'
import Modal from '../Modal'
import FormStudioContent from '../form-guide/FormStudioContent'
import ComponentShowcase from './ComponentShowcase'
import CelebrationPreview from './CelebrationPreview'
import './admin.css'

export type AdminStudio = 'form' | 'components'
interface AdminViewProps {
  userId: string
  studio?: AdminStudio
  onStudioChange?: (studio: AdminStudio) => void
}

/** A different account always starts a fresh, memory-only playground. */
export default function AdminView(props: AdminViewProps) {
  return <AdminPlayground key={props.userId} {...props} />
}

function AdminPlayground({ studio: controlledStudio, onStudioChange }: AdminViewProps) {
  const [localStudio, setLocalStudio] = useState<AdminStudio>('form')
  const [mobile, setMobile] = useState(false)
  const [accent, setAccent] = useState<'lime' | 'mint'>('lime')
  const [calm, setCalm] = useState(false)
  const [tuning, setTuning] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [sampleWorkout, setSampleWorkout] = useState(false)
  const [sampleSets, setSampleSets] = useState(0)
  const [sampleXP, setSampleXP] = useState(1430)
  const [feedback, setFeedback] = useState('')
  const studio = controlledStudio ?? localStudio
  const selectStudio = (next: AdminStudio) => {
    setLocalStudio(next)
    onStudioChange?.(next)
  }
  const logSampleSet = () => {
    setSampleXP((xp) => xp + 5)
    setFeedback('+5 sample XP · Nice work. Every set adds up.')
  }
  return (
    <div className="admin-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN / THE WORKSHOP</p>
          <h1>
            A space to fine-tune Fitt<span className="greeting-dot">.</span>
          </h1>
          <p>Explore the exercises. Try the details. Make it feel right.</p>
        </div>
        <Pill>
          <ShieldCheck size={14} aria-hidden="true" />
          Private studio
        </Pill>
      </div>
      <div className="admin-toolbar panel">
        <div className="admin-studios" role="group" aria-label="Admin studio">
          <button
            type="button"
            aria-pressed={studio === 'form'}
            onClick={() => selectStudio('form')}
          >
            <Move3D size={17} aria-hidden="true" />
            Form studio
          </button>
          <button
            type="button"
            aria-pressed={studio === 'components'}
            onClick={() => selectStudio('components')}
          >
            <Layers3 size={17} aria-hidden="true" />
            Components
          </button>
        </div>
        <div className="admin-preview-actions">
          {studio === 'components' && (
            <>
              <Button variant="secondary" onClick={() => setTuning(true)}>
                <Settings2 size={16} aria-hidden="true" />
                Tune the feel
              </Button>
              <Button variant="secondary" onClick={() => setCelebrate(true)}>
                <Sparkles size={16} aria-hidden="true" />
                Test celebration
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            aria-pressed={mobile}
            onClick={() => setMobile((value) => !value)}
          >
            {mobile ? (
              <Monitor size={16} aria-hidden="true" />
            ) : (
              <Smartphone size={16} aria-hidden="true" />
            )}
            {mobile ? 'Desktop preview' : 'Preview mobile'}
          </Button>
        </div>
      </div>
      <p className="admin-demo-note">
        <ShieldCheck size={15} aria-hidden="true" />
        Sample data, real components. Your workouts and preferences stay yours.
      </p>
      <div
        className="admin-demo-theme"
        data-accent={accent}
        data-mobile={mobile}
        data-motion={calm ? 'calm' : 'playful'}
      >
        <section
          className={`admin-studio-content ${mobile ? 'is-mobile' : ''}`}
          aria-label={studio === 'form' ? 'Form studio preview' : 'Component playground preview'}
        >
          {studio === 'form' ? (
            <div className="form-study form-study--native">
              <FormStudioContent embedded />
            </div>
          ) : (
            <>
              <ComponentShowcase
                embedded
                accent={accent}
                xp={sampleXP}
                calm={calm}
                onCalmChange={setCalm}
                onLogSet={logSampleSet}
                feedback={feedback}
                onQuickWorkout={() => {
                  setSampleSets(0)
                  setSampleWorkout(true)
                }}
                onCelebrate={() => setCelebrate(true)}
              />
            </>
          )}
        </section>
        {tuning && (
          <Modal title="Tune the feel" onClose={() => setTuning(false)}>
            <div className="admin-tune-dialog">
              <p>Try a variation in this studio. Your app settings won’t change.</p>
              <h3>Accent color</h3>
              <div className="admin-accent-options" role="group" aria-label="Sample accent color">
                <button
                  type="button"
                  aria-pressed={accent === 'lime'}
                  onClick={() => setAccent('lime')}
                >
                  <i style={{ background: '#c7fa53' }} aria-hidden="true" />
                  Electric lime
                  {accent === 'lime' && <Check size={16} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  aria-pressed={accent === 'mint'}
                  onClick={() => setAccent('mint')}
                >
                  <i style={{ background: '#8fedb1' }} aria-hidden="true" />
                  Fresh mint
                  {accent === 'mint' && <Check size={16} aria-hidden="true" />}
                </button>
              </div>
              <h3>Celebration style</h3>
              <div className="segmented large" role="group" aria-label="Sample celebration style">
                <button
                  type="button"
                  className={!calm ? 'active' : ''}
                  aria-pressed={!calm}
                  onClick={() => setCalm(false)}
                >
                  Playful
                </button>
                <button
                  type="button"
                  className={calm ? 'active' : ''}
                  aria-pressed={calm}
                  onClick={() => setCalm(true)}
                >
                  Calm
                </button>
              </div>
              <p>
                Calm removes decorative motion and confetti. System reduced-motion preferences also
                apply.
              </p>
              <Button
                onClick={() => {
                  setTuning(false)
                  setCelebrate(true)
                }}
              >
                Try this celebration
                <Sparkles size={16} aria-hidden="true" />
              </Button>
            </div>
          </Modal>
        )}
        {sampleWorkout && (
          <Modal title="Five-minute sample" onClose={() => setSampleWorkout(false)}>
            <div className="admin-sample-workout">
              <Pill>
                <ShieldCheck size={14} aria-hidden="true" />
                Sample session
              </Pill>
              <h3>Knee push-up</h3>
              <p>
                8 reps · 3 sets. Hands just wider than your shoulders. Move your knees, hips, and
                head together.
              </p>
              <p role="status">{sampleSets} of 3 sample sets logged</p>
              <Button
                disabled={sampleSets === 3}
                onClick={() => {
                  setSampleSets((sets) => sets + 1)
                  logSampleSet()
                }}
              >
                <Check size={16} aria-hidden="true" />
                Log sample set<span>+5 XP</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSampleWorkout(false)
                  if (sampleSets > 0) setCelebrate(true)
                }}
              >
                {sampleSets > 0 ? 'Preview the finish' : 'Back to components'}
              </Button>
            </div>
          </Modal>
        )}
        {celebrate && (
          <Modal title="Your effort, celebrated" onClose={() => setCelebrate(false)}>
            <CelebrationPreview
              sample
              calm={calm}
              complete
              setsLogged={15}
              earnedXP={150}
              best
              level={7}
              primaryLabel="Back to components"
              onPrimaryAction={() => setCelebrate(false)}
              onClose={() => setCelebrate(false)}
            />
          </Modal>
        )}
      </div>
    </div>
  )
}
