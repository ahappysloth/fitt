import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ArrowDown, ArrowUpRight, Check, CirclePlay, Move3D, ShieldCheck } from 'lucide-react'
import { FMark } from '../components/FittArtwork'
import KneePushupGuide from '../components/form-guide/KneePushupGuide'
import ModelInspector from '../components/form-guide/ModelInspector'
import { BodyModelPreferenceProvider } from '../components/BodyModelPreference'
import type { BodyModel } from '../lib/types'
import '../app/globals.css'
import '../styles.css'
import './preview.css'

function FormStudioPreview() {
  const [bodyModel, setBodyModel] = useState<BodyModel>('male')
  return (
    <div className="form-study">
      <header className="form-study__header">
        <a href="#movement" aria-label="Fitt form studio" className="form-study__brand">
          <FMark />
          <span>
            fitt<span>.</span>
          </span>
        </a>
        <span className="form-study__edition">
          FORM STUDIO <i /> MOVEMENT 01
        </span>
        <a href="#the-system" className="form-study__about">
          The approach <ArrowDown size={14} />
        </a>
      </header>
      <main id="movement" className="form-study__main">
        <div className="form-study__intro">
          <p className="eyebrow">A LITTLE CLARITY. A BETTER REP.</p>
          <h1>
            Good form.
            <br />
            <span>From every angle.</span>
          </h1>
          <p className="form-study__lead">
            A quiet space to understand the movement. Take it slowly, find your angle, and make the
            next rep yours.
          </p>
          <div className="form-study__movement">
            <span>01</span>
            <div>
              <h2>Knee push-up</h2>
              <p>Foundation · Bodyweight · Push</p>
            </div>
          </div>
          <ol className="form-study__cues">
            <li>
              <Check size={16} />
              <span>Hands just wider than your shoulders.</span>
            </li>
            <li>
              <Check size={16} />
              <span>Knees, hips, and head move together.</span>
            </li>
            <li>
              <Check size={16} />
              <span>Elbows travel back as you lower.</span>
            </li>
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
            <KneePushupGuide />
          </BodyModelPreferenceProvider>
        </div>
      </main>
      <ModelInspector bodyModel={bodyModel} onBodyModelChange={setBodyModel} />
      <section id="the-system" className="form-study__system">
        <div className="form-study__section-title">
          <div>
            <p className="eyebrow">THE FOUNDATION</p>
            <h2>Your model. A consistent way to learn.</h2>
          </div>
          <span>
            FIRST MOVEMENT STUDY <ArrowUpRight size={14} />
          </span>
        </div>
        <div className="form-study__principles">
          <article>
            <Move3D size={20} />
            <h3>Explore the form</h3>
            <p>
              Choose a male or female model with the same guided movement and useful camera angles.
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
              movements can share the same controls and visual language.
            </p>
          </article>
        </div>
        <p className="form-study__footnote">
          Knee Push-up is the first prototype. Surface highlights indicate approximate muscle
          regions. Detailed anatomical layers and the remaining movements come after this foundation
          is approved.
        </p>
      </section>
      <footer className="form-study__footer">
        <span>Fitt · Your pace. Your progress.</span>
        <span>Form studio / Design preview</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<FormStudioPreview />)
