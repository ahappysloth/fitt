import {
  ArrowRight,
  Check,
  Dumbbell,
  Layers3,
  Moon,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { SparkBuddy, TrophyArt } from '../FittArtwork'
import { Pill, SectionTitle, XPCard } from './studio-primitives'
import './component-studio.css'

interface ComponentShowcaseProps {
  accent: 'lime' | 'mint'
  xp: number
  calm: boolean
  onCalmChange: (calm: boolean) => void
  onLogSet: () => void
  onQuickWorkout: () => void
  onCelebrate: () => void
  embedded?: boolean
  feedback?: string
}

export default function ComponentShowcase({
  accent,
  xp,
  calm,
  onCalmChange,
  onLogSet,
  onQuickWorkout,
  onCelebrate,
  embedded = false,
  feedback,
}: ComponentShowcaseProps) {
  const Heading = embedded ? 'h2' : 'h1'
  return (
    <div className="component-studio">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DIRECTION 01 / MOMENTUM</p>
          <Heading>
            The little things, considered<span className="greeting-dot">.</span>
          </Heading>
          <p>A component playground. Try the states and tune the personality.</p>
        </div>
        <Pill>
          <Layers3 size={14} />
          Design lab
        </Pill>
      </div>
      <div className="lab-grid">
        <section className="panel lab-section">
          <SectionTitle
            level={embedded ? 3 : 2}
            eyebrow="01 / FEEL"
            title="Electric, with a human side"
          />
          <p className="lab-copy">
            Deep charcoal, warm type, an unmistakable lime. A friendly little spark adds personality
            when it matters.
          </p>
          <div className="swatch-row">
            {[
              ['Canvas', '#101010'],
              ['Surface', '#151515'],
              ['Accent', 'var(--accent)'],
              ['Type', '#f4f4ef'],
            ].map(([name, color]) => (
              <div key={name}>
                <span style={{ background: color }} />
                <strong>{name}</strong>
                <small>
                  {color === 'var(--accent)'
                    ? accent === 'lime'
                      ? '#C7FA53'
                      : '#8FEDB1'
                    : color.toUpperCase()}
                </small>
              </div>
            ))}
          </div>
          <div className="lab-personality">
            <SparkBuddy />
            <TrophyArt />
            <TrophyArt medal />
          </div>
        </section>
        <section className="panel lab-section">
          <SectionTitle
            level={embedded ? 3 : 2}
            eyebrow="02 / PROGRESS"
            title="A little more, every time"
          />
          <XPCard xp={xp} />
          <div className="reward-rule">
            <span>
              <Check size={16} />
              Log a set
            </span>
            <strong>+5 XP</strong>
          </div>
          <div className="reward-rule">
            <span>
              <Dumbbell size={16} />
              Save your workout
            </span>
            <strong>+35 XP</strong>
          </div>
          <div className="reward-rule">
            <span>
              <Trophy size={16} />
              Reach your weekly goal
            </span>
            <strong>+25 XP</strong>
          </div>
          <div className="reward-rule">
            <span>
              <TrendingUp size={16} />
              Set a personal best
            </span>
            <strong>+15 XP</strong>
          </div>
          <p className="lab-note">
            Proposed reward values. A smaller workout counts, earned XP stays yours, and the weekly
            goal leaves room for recovery.
          </p>
        </section>
        <section className="panel lab-section">
          <SectionTitle
            level={embedded ? 3 : 2}
            eyebrow="03 / INTERACTION"
            title="A satisfying little yes"
          />
          <div className="button-samples">
            <button type="button" className="primary-button" onClick={onLogSet}>
              <Check size={17} />
              Log this set <span>+5 XP</span>
            </button>
            <button type="button" className="secondary-button" onClick={onQuickWorkout}>
              I have five minutes <ArrowRight size={15} />
            </button>
            <button type="button" className="secondary-button" disabled>
              Workout saved <Check size={15} />
            </button>
          </div>
          {feedback && (
            <p className="admin-sample-feedback" role="status" aria-live="polite">
              {feedback}
            </p>
          )}
          <div className="sample-pills">
            <Pill className="lime-pill">
              <TrendingUp size={12} />
              NEW PERSONAL BEST
            </Pill>
            <Pill>
              <Moon size={12} />
              Recovery day
            </Pill>
            <Pill>
              <Check size={12} />
              Saved on this device
            </Pill>
          </div>
          <p className="lab-note">
            44 px touch targets, visible keyboard focus, short labels, and clear feedback.
          </p>
        </section>
        <section className="panel lab-section celebration-sample">
          <SectionTitle
            level={embedded ? 3 : 2}
            eyebrow="04 / REWARD"
            title="Make the finish feel good"
          />
          <TrophyArt />
          <p>A bright little moment. A new milestone. A reason to feel proud of showing up.</p>
          <div className="segmented large">
            <button
              type="button"
              className={!calm ? 'active' : ''}
              aria-pressed={!calm}
              onClick={() => onCalmChange(false)}
            >
              A little celebration
            </button>
            <button
              type="button"
              className={calm ? 'active' : ''}
              aria-pressed={calm}
              onClick={() => onCalmChange(true)}
            >
              Keep it calm
            </button>
          </div>
          <button type="button" className="primary-button" onClick={onCelebrate}>
            Play the celebration <Sparkles size={17} />
          </button>
          <span className="lab-note">System reduced-motion preferences are respected.</span>
        </section>
      </div>
    </div>
  )
}
