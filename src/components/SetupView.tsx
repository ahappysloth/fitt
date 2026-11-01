import { useRef } from 'react'
import {
  Check,
  Download,
  Dumbbell,
  HardDrive,
  Plus,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react'
import type { Profile } from '../lib/types'
import { equipmentList } from '../lib/catalog'

export default function SetupView({
  profile,
  active,
  onChange,
  onExport,
  onImport,
  onReset,
  onInstall,
}: {
  profile: Profile
  active: boolean
  onChange: (p: Profile) => void
  onExport: () => void
  onImport: (f: File) => void
  onReset: () => void
  onInstall: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT YOUR OWN</p>
          <h1>
            Your space. Your pace<span>.</span>
          </h1>
          <p className="subtitle">A good plan fits the life you actually live.</p>
        </div>
        <span className="heading-symbol">
          <Dumbbell size={28} />
        </span>
      </div>
      {active && (
        <div className="notice">
          Your session is in progress. Finish or discard it before changing training preferences.
        </div>
      )}
      <div className="setup-layout">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>What are you working with?</h2>
                <p>Pick your equipment. We’ll take care of the workout.</p>
              </div>
              <span className="step-label">01</span>
            </div>
            <div className="bodyweight-option">
              <span className="equipment-check">
                <Check size={16} />
              </span>
              <div>
                <strong>Your bodyweight</strong>
                <small>Always with you. Always enough to begin.</small>
              </div>
              <span className="tag">Included</span>
            </div>
            <div className="equipment-grid">
              {equipmentList.map((item) => (
                <button
                  key={item.id}
                  disabled={active}
                  className={`equipment-option ${profile.equipment.includes(item.id) ? 'selected' : ''}`}
                  aria-pressed={profile.equipment.includes(item.id)}
                  onClick={() =>
                    onChange({
                      ...profile,
                      equipment: profile.equipment.includes(item.id)
                        ? profile.equipment.filter((e) => e !== item.id)
                        : [...profile.equipment, item.id],
                    })
                  }
                >
                  <span className="equipment-symbol">
                    <EquipmentGlyph id={item.id} />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="equipment-check">
                    {profile.equipment.includes(item.id) ? <Check size={14} /> : <Plus size={14} />}
                  </span>
                </button>
              ))}
            </div>
            <p className="caption">
              Choose only equipment you can use securely. Floor back exercises offer light control
              work; a bar, rings, or bands unlock stronger pulling options.
            </p>
          </section>
          <section className="panel preferences">
            <div className="panel-heading">
              <div>
                <h2>A rhythm that works for you</h2>
                <p>Start where you are. Build from there.</p>
              </div>
              <span className="step-label">02</span>
            </div>
            <fieldset disabled={active}>
              <legend>Experience</legend>
              <div className="level-options">
                {(['beginner', 'intermediate'] as const).map((level) => (
                  <button
                    key={level}
                    className={profile.level === level ? 'selected' : ''}
                    aria-pressed={profile.level === level}
                    onClick={() => onChange({ ...profile, level })}
                  >
                    <strong>
                      {level === 'beginner' ? 'Building a foundation' : 'Finding my next level'}
                    </strong>
                    <small>
                      {level === 'beginner'
                        ? 'Beginner · accessible variations'
                        : 'Intermediate · more demanding movements'}
                    </small>
                    {profile.level === level && <Check size={17} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="preference-row">
              <label>
                Session length
                <select
                  disabled={active}
                  value={profile.duration}
                  onChange={(e) =>
                    onChange({
                      ...profile,
                      duration: Number(e.target.value) as Profile['duration'],
                    })
                  }
                >
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                </select>
              </label>
              <label>
                Weekly goal
                <select
                  disabled={active}
                  value={profile.weeklyGoal}
                  onChange={(e) => onChange({ ...profile, weeklyGoal: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'session' : 'sessions'} / week
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="caption">
              Session times are estimates including rest. Schedule rest days between demanding
              sessions. Changing level changes new plans; logged exercise progress stays with you.
            </p>
          </section>
        </div>
        <aside className="setup-aside">
          <section className="panel privacy-card">
            <ShieldCheck size={30} />
            <h2>Yours. And only yours.</h2>
            <p>Your workouts stay in this browser on this device. No account, no ads, no upload.</p>
            <div className="local-storage-note">
              <HardDrive size={16} />
              <span>
                Clearing browser data removes your history. Keep a backup to move devices or stay
                protected.
              </span>
            </div>
            <button className="secondary-button full" onClick={onExport}>
              <Download size={16} /> Export backup
            </button>
            <button className="text-button full" onClick={() => input.current?.click()}>
              <Upload size={16} /> Import a backup
            </button>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import Fitt backup"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
          </section>
          <section className="install-card">
            <Smartphone size={26} />
            <h3>A little closer to your next rep.</h3>
            <p>Add Fitt to your home screen. Train offline after your first visit.</p>
            <button className="text-button" onClick={onInstall}>
              Install the app <ArrowUpRightIcon />
            </button>
          </section>
          <button className="text-button danger reset-button" onClick={onReset}>
            Reset all local data
          </button>
        </aside>
      </div>
    </div>
  )
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 19 19 5M5 5h14v14" />
    </svg>
  )
}
function EquipmentGlyph({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {id === 'bar' ? (
        <>
          <path d="M5 9h22M7 9v17m18-17v17M4 26h6m12 0h6" />
        </>
      ) : id === 'rings' ? (
        <>
          <path d="M9 3v13m14-13v13" />
          <ellipse cx="9" cy="22" rx="5" ry="7" />
          <ellipse cx="23" cy="22" rx="5" ry="7" />
        </>
      ) : id === 'bands' ? (
        <>
          <path d="M11 5c-8 1-9 17 0 22 10 6 17-6 15-15-2-9-11-12-15-7zM13 8c-5 1-7 13-1 16 6 4 12-4 11-12-1-6-7-7-10-4z" />
        </>
      ) : id === 'bench' ? (
        <>
          <path d="M3 15h26v5H3zM7 20v7m18-7v7M5 27h4m14 0h4" />
        </>
      ) : id === 'vest' ? (
        <>
          <path d="m10 4-5 5v19h22V9l-5-5c0 8-12 8-12 0zM10 14v9m6-9v9m6-9v9" />
        </>
      ) : (
        <>
          <path d="M4 24V12h10v12M18 24V12h10v12M2 24h5m5 0h5m-1 0h5m5 0h5" />
        </>
      )}
    </svg>
  )
}
