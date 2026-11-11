import { useRef, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Check,
  Download,
  Dumbbell,
  HelpCircle,
  Moon,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react'
import type { Profile, UserPreferences } from '../lib/types'
import { equipmentList } from '../lib/catalog'
import { goals, profileGoal } from '../lib/goals'
import { focusNames } from '../lib/workout'
import { Select } from './ui'
import TrainingLockNote from './TrainingLockNote'
import './preferences.css'

export interface SetupViewProps {
  accountPanel?: ReactNode
  accountMode?: boolean
  profile: Profile
  active: boolean
  preferences?: UserPreferences
  onChange: (profile: Profile) => void
  onPreferences?: (preferences: UserPreferences) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  onInstall: () => void
  onHelp?: () => void
}

export default function SetupView({
  accountPanel,
  accountMode = false,
  profile,
  active,
  preferences,
  onChange,
  onPreferences,
  onExport,
  onImport,
  onReset,
  onInstall,
  onHelp,
}: SetupViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const currentGoal = profileGoal(profile)
  const personal = preferences ?? {
    displayName: '',
    celebration: 'playful' as const,
    onboarded: false,
    bodyModel: 'male' as const,
  }
  return (
    <div className="pref-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT YOUR OWN</p>
          <h1>
            Your space. Your pace<span className="greeting-dot">.</span>
          </h1>
          <p>A good plan fits the life you actually live.</p>
        </div>
        <span className="pref-heading-icon" aria-hidden="true">
          <Dumbbell size={25} />
        </span>
      </div>
      {accountPanel}
      <div className="pref-layout">
        <div className="pref-main">
          <section className="panel pref-panel">
            <div className="pref-section-heading">
              <div>
                <p className="eyebrow">01 / YOUR EQUIPMENT</p>
                <h2>Start with what you have.</h2>
                <p>Choose the equipment you can use. Bodyweight is always included.</p>
              </div>
            </div>
            {active && (
              <TrainingLockNote id="training-preferences-locked">
                Finish or discard your workout to change equipment and training preferences.
              </TrainingLockNote>
            )}
            <div className="pref-bodyweight">
              <span className="pref-check">
                <Check size={16} />
              </span>
              <div>
                <strong>Your bodyweight</strong>
                <small>Enough to take your first step.</small>
              </div>
              <span className="pill">Included</span>
            </div>
            <div
              className="pref-equipment-grid"
              aria-describedby={active ? 'training-preferences-locked' : undefined}
            >
              {equipmentList.map((item) => {
                const selected = profile.equipment.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={active}
                    className={`pref-equipment ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() =>
                      onChange({
                        ...profile,
                        equipment: selected
                          ? profile.equipment.filter((id) => id !== item.id)
                          : [...profile.equipment, item.id],
                      })
                    }
                  >
                    <span className="pref-equipment-icon">
                      <EquipmentGlyph id={item.id} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className="pref-check">
                      {selected ? <Check size={14} /> : <Plus size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="pref-caption">
              Use equipment that is secure and stable. A bar, rings, or bands unlock stronger
              pulling options; floor exercises focus on back control.
            </p>
          </section>
          <section className="panel pref-panel">
            <div className="pref-section-heading">
              <div>
                <p className="eyebrow">02 / YOUR RHYTHM</p>
                <h2>Make room for progress.</h2>
                <p>Choose a starting point. You can adjust it as you grow.</p>
              </div>
            </div>
            <fieldset
              className="pref-fieldset"
              disabled={active}
              aria-describedby={active ? 'training-preferences-locked' : undefined}
            >
              <legend>Training goal</legend>
              <div className="pref-levels pref-goals">
                {goals.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    className={currentGoal === goal.id ? 'is-selected' : ''}
                    aria-pressed={currentGoal === goal.id}
                    onClick={() => onChange({ ...profile, goal: goal.id })}
                  >
                    <strong>{goal.name}</strong>
                    <small>{goal.description}</small>
                    {currentGoal === goal.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              {currentGoal === 'fit' && (
                <p className="pref-caption pref-goal-note">
                  Fat loss comes mainly from what you eat. Training keeps your muscle and fitness
                  while you do it.
                </p>
              )}
              {currentGoal === 'strength' &&
                !profile.equipment.some(
                  (item) => item === 'bar' || item === 'rings' || item === 'vest',
                ) && (
                  <p className="pref-caption pref-goal-note">
                    Without a bar, rings or a vest, strength progresses through harder variations in
                    bigger jumps. A pull-up bar is the most useful addition.
                  </p>
                )}
              <p className="pref-subheading">Experience</p>
              <div className="pref-levels">
                {(['beginner', 'intermediate'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={profile.level === level ? 'is-selected' : ''}
                    aria-pressed={profile.level === level}
                    onClick={() => onChange({ ...profile, level })}
                  >
                    <strong>
                      {level === 'beginner' ? 'Building a foundation' : 'Finding my next level'}
                    </strong>
                    <small>
                      {level === 'beginner'
                        ? 'Beginner · accessible variations'
                        : 'Intermediate · more demanding exercises'}
                    </small>
                    {profile.level === level && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="pref-fields">
                <label>
                  Session length
                  <Select
                    label="Session length"
                    disabled={active}
                    value={String(profile.duration)}
                    onValueChange={(value) =>
                      onChange({
                        ...profile,
                        duration: Number(value) as Profile['duration'],
                      })
                    }
                    options={[20, 30, 45].map((n) => ({
                      value: String(n),
                      label: `${n} minutes`,
                    }))}
                  />
                </label>
                <label>
                  Default focus
                  <Select
                    label="Default focus"
                    disabled={active}
                    value={profile.focus}
                    onValueChange={(value) =>
                      onChange({ ...profile, focus: value as Profile['focus'] })
                    }
                    options={Object.entries(focusNames).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                </label>
                <label>
                  Weekly goal
                  <Select
                    label="Weekly goal"
                    disabled={active}
                    value={String(profile.weeklyGoal)}
                    onValueChange={(value) => onChange({ ...profile, weeklyGoal: Number(value) })}
                    options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                      value: String(n),
                      label: `${n} ${n === 1 ? 'session' : 'sessions'} / week`,
                    }))}
                  />
                </label>
              </div>
            </fieldset>
            <p className="pref-caption">
              Session times include rest and are estimates. Leave recovery days between demanding
              sessions. After your first workout of the week, a changed weekly goal takes effect
              next week.
            </p>
          </section>
          <section className="panel pref-panel">
            <div className="pref-section-heading">
              <div>
                <p className="eyebrow">03 / YOUR PERSONALITY</p>
                <h2>Make it feel like you.</h2>
              </div>
              <UserRound size={21} />
            </div>
            <label className="pref-name">
              What should we call you?
              <input
                type="text"
                name="displayName"
                autoComplete="given-name"
                maxLength={40}
                placeholder="Your first name (optional)"
                value={personal.displayName}
                disabled={!onPreferences}
                onChange={(event) =>
                  onPreferences?.({ ...personal, displayName: event.target.value })
                }
              />
            </label>
            <fieldset className="pref-fieldset" disabled={!onPreferences}>
              <legend>Exercise guide body model</legend>
              <div className="pref-levels">
                {(['male', 'female'] as const).map((bodyModel) => (
                  <button
                    key={bodyModel}
                    type="button"
                    aria-pressed={(personal.bodyModel ?? 'male') === bodyModel}
                    className={(personal.bodyModel ?? 'male') === bodyModel ? 'is-selected' : ''}
                    onClick={() => onPreferences?.({ ...personal, bodyModel })}
                  >
                    <strong>{bodyModel === 'male' ? 'Male model' : 'Female model'}</strong>
                    <small>
                      {bodyModel === 'male'
                        ? 'Default guide appearance'
                        : 'Alternative guide appearance'}
                    </small>
                    {(personal.bodyModel ?? 'male') === bodyModel && <Check size={16} />}
                  </button>
                ))}
              </div>
              <p className="pref-caption">Used wherever a 3D guide is available.</p>
            </fieldset>
            <fieldset className="pref-fieldset" disabled={!onPreferences}>
              <legend>Celebration style</legend>
              <div className="pref-celebrations">
                {(['playful', 'calm'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={personal.celebration === style}
                    className={personal.celebration === style ? 'is-selected' : ''}
                    onClick={() => onPreferences?.({ ...personal, celebration: style })}
                  >
                    {style === 'playful' ? <Sparkles size={22} /> : <Moon size={22} />}
                    <span>
                      <strong>
                        {style === 'playful' ? 'A little celebration' : 'Keep it calm'}
                      </strong>
                      <small>
                        {style === 'playful'
                          ? 'Confetti and a moment to enjoy the win.'
                          : 'The same progress, with quieter feedback.'}
                      </small>
                    </span>
                    {personal.celebration === style && <Check size={16} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="pref-caption">
              Your device’s reduced-motion preference is always respected.
            </p>
          </section>
        </div>
        <aside className="pref-aside">
          <section className="panel pref-panel pref-data">
            <span className="pref-feature-icon">
              <ShieldCheck size={25} />
            </span>
            <h2>Your progress stays yours.</h2>
            <p>
              {accountMode
                ? 'Your completed workouts and routines sync with your account. Workouts in progress stay on this device.'
                : 'Your workouts and routines are saved in this browser, on this device.'}
            </p>
            <p className="pref-caption">
              {accountMode
                ? 'Export a backup before replacing your data. Importing a backup replaces your current training data after confirmation and syncs those changes to your account.'
                : 'Export a backup before clearing browser data or moving to another device. Importing a backup replaces your current data after confirmation.'}
            </p>
            <button type="button" className="secondary-button pref-full" onClick={onExport}>
              <Download size={17} />
              Export backup
            </button>
            <button
              type="button"
              className="pref-text-button"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={17} />
              Import a backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              aria-label="Import Fitt backup"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImport(file)
                event.target.value = ''
              }}
            />
          </section>
          <section className="panel pref-panel pref-install">
            <Smartphone size={25} />
            <h2>A little closer to your next rep.</h2>
            <p>
              Add Fitt to your home screen. Once the app is ready offline, your workouts and guides
              travel with you.
            </p>
            <button type="button" className="pref-text-button" onClick={onInstall}>
              Install the app
              <ArrowUpRight size={17} />
            </button>
          </section>
          {onHelp && (
            <button type="button" className="pref-help" onClick={onHelp}>
              <HelpCircle size={19} />
              <span>How Fitt adapts your workouts</span>
              <ArrowUpRight size={17} />
            </button>
          )}
          <button type="button" className="pref-reset" onClick={onReset}>
            {accountMode ? 'Reset account training data' : 'Reset all local data'}
          </button>
        </aside>
      </div>
    </div>
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
