import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Heart,
  House,
  Layers3,
  Leaf,
  LockKeyhole,
  Maximize2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import ExerciseGuide, { ExerciseThumbnail } from '../src/components/ExerciseGuide'
import { MuscleMap } from '../src/components/Visuals'
import Modal from '../src/components/Modal'
import { byId } from '../src/lib/catalog'
import { FMark, SparkBuddy, TrophyArt } from './Artwork'
import { CountUp, Confetti, Pill, ProgressBar, SectionTitle, Week, XPCard } from './components'
import { BASE_XP, exercises } from './demo-data'
import './styles.css'

type View = 'today' | 'workout' | 'journey' | 'components'
type LoggedSet = { exerciseId: string; reps: number }
const nav = [
  { id: 'today' as View, label: 'Today', icon: House },
  { id: 'workout' as View, label: 'Workout', icon: Dumbbell },
  { id: 'journey' as View, label: 'Your journey', icon: TrendingUp },
]

function App() {
  const [view, setView] = useState<View>('today')
  const [mobile, setMobile] = useState(false)
  const [accent, setAccent] = useState<'lime' | 'mint'>('lime')
  const [calm, setCalm] = useState(false)
  const [logs, setLogs] = useState<LoggedSet[]>([])
  const [finished, setFinished] = useState(false)
  const [quick, setQuick] = useState(false)
  const [reps, setReps] = useState(8)
  const [effort, setEffort] = useState('good')
  const [rest, setRest] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const [guide, setGuide] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [toast, setToast] = useState('')
  const [setPulse, setSetPulse] = useState(0)
  const [selectedDay, setSelectedDay] = useState(5)
  const [artView, setArtView] = useState<'movement' | 'muscles'>('movement')
  const queue = quick ? exercises.slice(0, 1) : exercises
  const total = queue.length * 3
  const current = queue[Math.min(Math.floor(logs.length / 3), queue.length - 1)]
  const best = logs.some((s) => s.exerciseId === 'knee-pushup' && s.reps > 7)
  const completionXP = finished ? 60 + (best ? 15 : 0) : 0
  const earnedXP = logs.length * 5 + completionXP
  const xp = BASE_XP + earnedXP
  const level = Math.floor(xp / 250) + 1
  const weekly = finished ? 3 : 2
  useEffect(() => setReps(current.reps), [current.id, quick])
  useEffect(() => {
    if (!rest) return
    const t = setTimeout(() => setRest(rest - 1), 1000)
    return () => clearTimeout(t)
  }, [rest])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    document.documentElement.dataset.accent = accent
    document.documentElement.dataset.motion = calm ? 'calm' : 'playful'
  }, [accent, calm])
  const navigate = (next: View) => {
    setView(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function reset() {
    setLogs([])
    setFinished(false)
    setQuick(false)
    setRest(0)
    setReps(8)
    setCelebrate(false)
    setToast('')
    setSelectedDay(5)
    setView('today')
  }
  function start(isQuick = false) {
    if (finished || isQuick !== quick) {
      setLogs([])
      setFinished(false)
      setRest(0)
      setReps(8)
    }
    setQuick(isQuick)
    setView('workout')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function saveWorkout() {
    if (!logs.length) return
    setRest(0)
    setFinished(true)
    setCelebrate(true)
  }
  function demoFinish() {
    setQuick(false)
    setLogs(
      exercises.flatMap((e) =>
        Array.from({ length: 3 }, () => ({ exerciseId: e.id, reps: e.reps })),
      ),
    )
    setFinished(true)
    setRest(0)
    setCelebrate(true)
  }
  function logSet() {
    if (finished || logs.length >= total) return
    const next = [...logs, { exerciseId: current.id, reps }]
    setLogs(next)
    setSetPulse((v) => v + 1)
    setToast('+5 XP · One set closer. You’ve got this.')
    if (next.length === total) {
      setFinished(true)
      setRest(0)
      setCelebrate(true)
    } else setRest(60)
  }
  const controls = (
    <>
      <span className="review-divider" />
      <button
        className={`review-button ${mobile ? 'active' : ''}`}
        onClick={() => setMobile(!mobile)}
        aria-pressed={mobile}
      >
        {mobile ? <Maximize2 size={15} /> : <Smartphone size={15} />}
        <span>{mobile ? 'Expand' : 'Mobile'}</span>
      </button>
      <button
        className="review-button review-tune"
        onClick={() => setSettings(true)}
        aria-label="Tune the feel"
        title="Tune the feel"
      >
        <Settings2 size={15} />
        <span>Tune the feel</span>
      </button>
      <button className="review-button reset-demo" onClick={reset} aria-label="Reset demo">
        <RotateCcw size={14} />
        <span>Reset demo</span>
      </button>
    </>
  )

  return (
    <>
      <div className="review-bar">
        <div className="study-label">
          <span className="study-dot" />
          <strong>FITT / MOMENTUM</strong>
          <span className="study-meta">Interactive design study · Sample data</span>
        </div>
        <div className="review-actions">
          <button
            className={`review-button ${view === 'components' ? 'active' : ''}`}
            onClick={() => navigate(view === 'components' ? 'today' : 'components')}
          >
            <Layers3 size={15} />
            <span>{view === 'components' ? 'Back to app' : 'Components'}</span>
          </button>
          <button
            className="review-button celebration-trigger"
            onClick={demoFinish}
            aria-label="Try the celebration"
          >
            <Sparkles size={15} />
            Try the celebration
          </button>
          {controls}
        </div>
      </div>
      <div className={`preview-stage ${mobile ? 'mobile-frame' : ''}`}>
        <div className="app-shell">
          <aside className="sidebar">
            <button className="brand" onClick={() => navigate('today')} aria-label="Fitt home">
              <FMark />
              <span>
                fitt<span className="brand-dot">.</span>
              </span>
            </button>
            <div className="workspace-label">A LITTLE STRONGER, EVERY DAY</div>
            <nav aria-label="Main navigation">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={`nav-item ${view === n.id ? 'active' : ''}`}
                  onClick={() => (n.id === 'workout' ? start(quick) : navigate(n.id))}
                  aria-current={view === n.id ? 'page' : undefined}
                >
                  <n.icon size={20} />
                  <span>{n.label}</span>
                  {view === n.id && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
            <button className="sidebar-challenge" onClick={() => start(true)}>
              <span className="challenge-symbol">
                <Zap size={19} fill="currentColor" />
              </span>
              <strong>
                Five minutes.
                <br />
                That’s a start.
              </strong>
              <span>A small win for a low-energy day.</span>
              <span className="text-link">
                Try a quick win <ArrowUpRight size={15} />
              </span>
            </button>
            <div className="sidebar-bottom">
              <span className="on-device">
                <ShieldCheck size={14} />
                Your pace. Your progress.
              </span>
              <button className="profile-button" onClick={() => navigate('journey')}>
                <span className="tiny-avatar">
                  <SparkBuddy small />
                </span>
                <span>
                  <strong>Alex</strong>
                  <small>Level {level} · Building momentum</small>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          </aside>
          <div className="app-main">
            <header className="app-topbar">
              <button
                className="brand mobile-brand"
                onClick={() => navigate('today')}
                aria-label="Fitt home"
              >
                <FMark />
                <span>
                  fitt<span className="brand-dot">.</span>
                </span>
              </button>
              <div className="breadcrumbs">
                <span>Your training space</span>
                <ChevronRight size={13} />
                <strong>
                  {view === 'today'
                    ? 'Today'
                    : view === 'workout'
                      ? 'Your workout'
                      : view === 'journey'
                        ? 'Your journey'
                        : 'Component lab'}
                </strong>
              </div>
              <div className="topbar-right">
                <span className="xp-chip">
                  <Zap size={14} fill="currentColor" />
                  {xp.toLocaleString()} XP
                </span>
                <button
                  className="avatar-button"
                  onClick={() => navigate('journey')}
                  aria-label="Open your journey"
                >
                  <SparkBuddy small />
                </button>
              </div>
            </header>
            <main className={`main-content view-${view}`}>
              {view === 'today' && (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">YOU’RE IN THE RIGHT PLACE</p>
                      <h1>
                        Hey, Alex<span className="greeting-dot">.</span>
                      </h1>
                      <p>Let’s make a little progress today.</p>
                    </div>
                    <Pill>
                      <span className="live-dot" />
                      Your pace. Always.
                    </Pill>
                  </div>
                  <div className="dashboard-grid">
                    <div className="primary-column">
                      <section className="hero-card">
                        <div className="hero-copy">
                          <Pill className="lime-pill">
                            <Zap size={12} fill="currentColor" />
                            {finished ? 'YOUR WIN IS IN THE BOOKS' : 'TODAY IS A GOOD DAY TO START'}
                          </Pill>
                          <h2>
                            {finished ? (
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
                            {finished
                              ? 'Take the good feeling with you. You’ve earned your recovery.'
                              : 'You don’t need a perfect day. Just a little room to move.'}
                          </p>
                          <button
                            className="primary-button hero-button"
                            onClick={() => (finished ? navigate('journey') : start())}
                          >
                            {finished ? 'See your progress' : 'Start my workout'}
                            <span>
                              <ArrowUpRight size={19} />
                            </span>
                          </button>
                          <span className="hero-footnote">
                            <Clock3 size={13} />
                            {finished
                              ? `${earnedXP} XP earned today · Nicely done.`
                              : '20 min · Bodyweight · Made for you'}
                          </span>
                        </div>
                        <div className="hero-character">
                          <div className="orbit orbit-one" />
                          <div className="orbit orbit-two" />
                          <SparkBuddy />
                          <div className="floating-chip">
                            <Sparkles size={14} />
                            {finished ? `+${earnedXP} XP` : 'YOU’VE GOT THIS'}
                          </div>
                        </div>
                      </section>
                      {!finished && (
                        <button className="quick-start-strip" onClick={() => start(true)}>
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
                          title={finished ? 'Your week. Won.' : 'One more little win.'}
                          action={
                            <span className="week-tally">
                              <strong>{weekly}</strong> / 3 <small>this week</small>
                            </span>
                          }
                        />
                        <Week
                          finished={finished}
                          selected={selectedDay}
                          onSelect={setSelectedDay}
                        />
                        <div className="week-helper">
                          {selectedDay === 0 ||
                          selectedDay === 2 ||
                          (selectedDay === 5 && finished) ? (
                            <>
                              <Check size={13} />
                              <span>Showed up. Put in the work. Progress made.</span>
                            </>
                          ) : selectedDay === 5 ? (
                            <>
                              <Target size={13} />
                              <span>Your next workout completes your weekly goal.</span>
                            </>
                          ) : (
                            <>
                              <Moon size={13} />
                              <span>A little recovery keeps the good days coming.</span>
                            </>
                          )}
                        </div>
                        <ProgressBar value={(weekly / 3) * 100} label="Weekly workout goal" />
                      </section>
                      <section className="plan-card panel">
                        <SectionTitle title="Your daily lineup" action={<Pill>Full body</Pill>} />
                        <div className="plan-list">
                          {exercises.map((e, i) => (
                            <button key={e.id} className="plan-row" onClick={() => setGuide(e.id)}>
                              <span className="row-number">0{i + 1}</span>
                              <span className="exercise-mini">
                                <ExerciseThumbnail exerciseId={e.id} compact />
                              </span>
                              <span className="exercise-name">
                                <strong>{byId[e.id].name}</strong>
                                <small>{e.note}</small>
                              </span>
                              <span className="exercise-dose">
                                3 <span>×</span> {e.reps}
                                <small>reps{e.id === 'deadbug' ? ' / side' : ''}</small>
                              </span>
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                        </div>
                        <div className="plan-footer">
                          <ShieldCheck size={14} />
                          Built around what you have. Adjust every set.
                        </div>
                      </section>
                    </div>
                    <aside className="secondary-column">
                      <section className="athlete-card panel">
                        <div className="athlete-heading">
                          <span className="eyebrow">YOUR MOMENTUM</span>
                          <button
                            className="icon-button"
                            onClick={() => navigate('journey')}
                            aria-label="View all progress"
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </div>
                        <div className="athlete-avatar">
                          <SparkBuddy small />
                          <span className="avatar-level">{level}</span>
                        </div>
                        <h2>Keep becoming.</h2>
                        <p>Every bit of effort adds up.</p>
                        <XPCard xp={xp} compact />
                      </section>
                      <button
                        className={`next-award-card ${finished ? 'earned' : ''}`}
                        onClick={() => navigate('journey')}
                      >
                        <div className="award-card-top">
                          <Pill>
                            <Trophy size={12} />
                            {finished ? 'JUST UNLOCKED' : 'YOUR NEXT WIN'}
                          </Pill>
                          <ArrowUpRight size={18} />
                        </div>
                        <TrophyArt />
                        <div className="award-card-copy">
                          <h3>Week winner</h3>
                          <p>
                            {finished
                              ? 'Three sessions. One promise kept.'
                              : 'Your goal is closer than you think.'}
                          </p>
                          <span className="award-progress">
                            {finished ? (
                              <Check size={12} />
                            ) : (
                              <span className="three-dots">
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                            {weekly} of 3 workouts <strong>+25 XP</strong>
                          </span>
                        </div>
                      </button>
                      <div className="rest-note">
                        <span>
                          <Moon size={19} />
                        </span>
                        <p>
                          <strong>Rest is part of getting stronger.</strong> Your XP and awards stay
                          yours.
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}

              {view === 'workout' && (
                <>
                  <div className="page-heading workout-heading">
                    <div>
                      <button className="back-link" onClick={() => navigate('today')}>
                        <ArrowLeft size={14} />
                        Back to today
                      </button>
                      <h1>{quick ? 'A five-minute win.' : 'Let’s get into it.'}</h1>
                      <p>
                        {quick
                          ? 'A little effort is a lot better than waiting for the perfect day.'
                          : 'One set at a time. You set the pace.'}
                      </p>
                    </div>
                    <Pill>
                      <Clock3 size={14} />
                      {quick ? '5' : '20'} min · {queue.length}{' '}
                      {queue.length === 1 ? 'exercise' : 'exercises'}
                    </Pill>
                  </div>
                  <div className="session-progress panel">
                    <div>
                      <span className="eyebrow">YOUR SESSION</span>
                      <strong>
                        {logs.length}
                        <span> / {total} sets</span>
                      </strong>
                    </div>
                    <ProgressBar
                      value={(logs.length / total) * 100}
                      label="Workout sets complete"
                    />
                    <span className="set-xp">
                      <Zap size={16} fill="currentColor" />+{logs.length * 5} XP
                    </span>
                  </div>
                  {finished ? (
                    <div className="finished-panel panel">
                      <TrophyArt />
                      <Pill>
                        <Check size={14} />
                        WORKOUT SAVED
                      </Pill>
                      <h2>You did a good thing for yourself.</h2>
                      <p>
                        {logs.length} sets logged. {earnedXP} XP earned. That effort is yours to
                        keep.
                      </p>
                      <button className="primary-button" onClick={() => setCelebrate(true)}>
                        See your celebration <Sparkles size={16} />
                      </button>
                      <button className="text-button" onClick={() => navigate('journey')}>
                        Explore your journey <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="workout-grid">
                      <section className="movement-card panel">
                        <div className="movement-heading">
                          <Pill>
                            0{Math.min(Math.floor(logs.length / 3) + 1, queue.length)} / 0
                            {queue.length}
                          </Pill>
                          <div className="segmented">
                            <button
                              className={artView === 'movement' ? 'active' : ''}
                              onClick={() => setArtView('movement')}
                            >
                              Movement
                            </button>
                            <button
                              className={artView === 'muscles' ? 'active' : ''}
                              onClick={() => setArtView('muscles')}
                            >
                              Muscles
                            </button>
                          </div>
                        </div>
                        <h2>{byId[current.id].name}</h2>
                        <p>{byId[current.id].cue}</p>
                        {artView === 'movement' ? (
                          <ExerciseGuide key={current.id} exercise={byId[current.id]} />
                        ) : (
                          <div className="session-muscles">
                            <MuscleMap muscles={byId[current.id].muscles} />
                            <p>Highlighted muscles work together in this movement.</p>
                          </div>
                        )}
                        <div className="technique-notes">
                          <span className="eyebrow">MAKE THIS REP YOURS</span>
                          {byId[current.id].steps.slice(0, 2).map((step, i) => (
                            <p key={step}>
                              <span>{i + 1}</span>
                              {step}
                            </p>
                          ))}
                        </div>
                      </section>
                      <div className="workout-side">
                        <section className="log-card panel">
                          <div className="log-heading">
                            <h3>Set {(logs.length % 3) + 1} of 3</h3>
                            <span className="mini-set-dots">
                              {[0, 1, 2].map((i) => (
                                <i
                                  key={i}
                                  className={
                                    i < logs.length % 3
                                      ? 'done'
                                      : i === logs.length % 3
                                        ? 'current'
                                        : ''
                                  }
                                >
                                  {i < logs.length % 3 ? <Check size={11} /> : i + 1}
                                </i>
                              ))}
                            </span>
                          </div>
                          <label className="eyebrow" htmlFor="rep-count">
                            YOUR REPS{current.id === 'deadbug' ? ' · PER SIDE' : ''}
                          </label>
                          <div className="rep-stepper">
                            <button
                              onClick={() => setReps(Math.max(1, reps - 1))}
                              aria-label="Decrease reps"
                            >
                              <Minus size={21} />
                            </button>
                            <input
                              id="rep-count"
                              type="number"
                              min="1"
                              max="99"
                              value={reps}
                              onChange={(e) =>
                                setReps(Math.min(99, Math.max(1, Number(e.target.value) || 1)))
                              }
                            />
                            <button
                              onClick={() => setReps(Math.min(99, reps + 1))}
                              aria-label="Increase reps"
                            >
                              <Plus size={21} />
                            </button>
                          </div>
                          <p className="rep-target">
                            Suggested {current.reps}. Adjust to what feels right.
                          </p>
                          <span className="eyebrow">HOW DID THAT FEEL?</span>
                          <div className="effort-options" role="group" aria-label="Set effort">
                            {[
                              ['easy', 'Easy'],
                              ['good', 'Just right'],
                              ['hard', 'Challenging'],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                aria-pressed={effort === value}
                                className={effort === value ? 'active' : ''}
                                onClick={() => setEffort(value)}
                              >
                                {effort === value && <Check size={12} />} {label}
                              </button>
                            ))}
                          </div>
                          <button
                            key={setPulse}
                            className="primary-button log-button"
                            onClick={logSet}
                          >
                            <Check size={18} />
                            {rest ? 'Log next set' : 'Log this set'}
                            <span>+5 XP</span>
                          </button>
                          <p className="log-footnote">
                            <Heart size={12} />
                            Honest effort is always a win.
                          </p>
                        </section>
                        {rest > 0 && (
                          <section className="rest-timer panel" aria-live="off">
                            <div>
                              <span className="eyebrow">TAKE A BREATHER</span>
                              <strong>0:{String(rest).padStart(2, '0')}</strong>
                            </div>
                            <button className="secondary-button" onClick={() => setRest(0)}>
                              Ready to go <ArrowRight size={14} />
                            </button>
                          </section>
                        )}
                        <XPCard xp={xp} />
                        <div className="next-exercise">
                          <span className="eyebrow">
                            {Math.floor(logs.length / 3) + 1 < queue.length
                              ? 'COMING UP'
                              : 'NICE AND SIMPLE'}
                          </span>
                          <strong>
                            {queue[Math.floor(logs.length / 3) + 1]
                              ? byId[queue[Math.floor(logs.length / 3) + 1].id].name
                              : 'Finish with a little recovery.'}
                          </strong>
                        </div>
                        <button
                          className="finish-link"
                          onClick={saveWorkout}
                          disabled={!logs.length}
                        >
                          Save & finish workout <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {view === 'journey' && (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">LOOK HOW FAR YOU’VE COME</p>
                      <h1>
                        Your effort has a story<span className="greeting-dot">.</span>
                      </h1>
                      <p>Small wins, adding up to something big.</p>
                    </div>
                    <Pill>
                      <Sparkles size={14} />
                      Keep becoming
                    </Pill>
                  </div>
                  <div className="journey-hero panel">
                    <div className="journey-profile">
                      <div className="journey-avatar">
                        <SparkBuddy small />
                      </div>
                      <div>
                        <span className="eyebrow">FITT ATHLETE</span>
                        <h2>Alex</h2>
                        <p>Momentum maker · Level {level}</p>
                      </div>
                    </div>
                    <XPCard xp={xp} />
                    <div className="journey-stats">
                      <span>
                        <Dumbbell size={20} />
                        <strong>{8 + (finished ? 1 : 0)}</strong>
                        <small>workouts</small>
                      </span>
                      <span>
                        <Award size={20} />
                        <strong>{3 + (finished ? 1 : 0) + (finished && best ? 1 : 0)}</strong>
                        <small>awards earned</small>
                      </span>
                      <span>
                        <Flame size={20} />
                        <strong>3</strong>
                        <small>weeks showing up</small>
                      </span>
                    </div>
                  </div>
                  <div className="journey-two">
                    <section className="panel consistency-panel">
                      <SectionTitle
                        title="Your kind of consistent"
                        action={<Pill>This week</Pill>}
                      />
                      <Week finished={finished} selected={selectedDay} onSelect={setSelectedDay} />
                      <p className="quiet-copy">
                        <Leaf size={15} />A routine with room for life. Every return counts.
                      </p>
                    </section>
                    <section className="panel personal-best">
                      <span className="record-icon">
                        <TrendingUp size={24} />
                      </span>
                      <div>
                        <p className="eyebrow">PERSONAL BEST · KNEE PUSH-UP</p>
                        <h3>
                          {finished && best
                            ? Math.max(
                                ...logs
                                  .filter((s) => s.exerciseId === 'knee-pushup')
                                  .map((s) => s.reps),
                              )
                            : 7}
                          <small> reps</small>
                        </h3>
                        <p>
                          {finished && best
                            ? 'A new chapter. Set today.'
                            : 'Your next rep could be a new chapter.'}
                        </p>
                      </div>
                      {finished && best && <Pill className="lime-pill">NEW BEST</Pill>}
                    </section>
                  </div>
                  <SectionTitle
                    eyebrow="MILESTONES THAT MEAN SOMETHING"
                    title="Your collection"
                    action={<span className="muted">Earned. Always yours.</span>}
                  />
                  <div className="award-grid">
                    {[
                      {
                        name: 'First move',
                        desc: 'Your very first workout.',
                        icon: Zap,
                        earned: true,
                        label: 'The start of something',
                        progress: 100,
                      },
                      {
                        name: 'Fresh start',
                        desc: 'First workout of the week.',
                        icon: Flame,
                        earned: true,
                        label: 'Earned this Monday',
                        progress: 100,
                      },
                      {
                        name: 'Back at it',
                        desc: 'Made time for yourself again.',
                        icon: Heart,
                        earned: true,
                        label: 'Every return counts',
                        progress: 100,
                      },
                      {
                        name: 'New territory',
                        desc: 'Set a new personal best.',
                        icon: TrendingUp,
                        earned: finished && best,
                        label: finished && best ? 'Newly unlocked' : 'Your next chapter awaits',
                        progress: finished && best ? 100 : 70,
                      },
                      {
                        name: 'Week winner',
                        desc: 'Reach your weekly workout goal.',
                        icon: Trophy,
                        earned: finished,
                        label: `${weekly} of 3 workouts`,
                        progress: (weekly / 3) * 100,
                      },
                      {
                        name: 'The ten club',
                        desc: 'Ten workouts. All you.',
                        icon: Star,
                        earned: false,
                        label: `${8 + (finished ? 1 : 0)} of 10 workouts`,
                        progress: (8 + (finished ? 1 : 0)) * 10,
                      },
                    ].map((a, i) => (
                      <button
                        key={a.name}
                        className={`award-tile panel ${a.earned ? 'unlocked' : 'locked'}`}
                        onClick={() =>
                          setToast(a.earned ? `${a.name} · ${a.desc}` : `${a.name} · ${a.label}`)
                        }
                      >
                        <div className="award-tile-top">
                          <span>{String(i + 1).padStart(2, '0')}</span>
                          {a.earned ? <Check size={15} /> : <LockKeyhole size={13} />}
                        </div>
                        <div className="award-seal">
                          <a.icon size={28} strokeWidth={1.8} />
                        </div>
                        <h3>{a.name}</h3>
                        <p>{a.desc}</p>
                        {!a.earned && (
                          <ProgressBar value={a.progress} label={`${a.name} progress`} />
                        )}
                        <small>
                          {a.earned && <Check size={11} />} {a.label}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="journey-bottom">
                    <SparkBuddy small />
                    <p>
                      <strong>You don’t have to be motivated every day.</strong> Just make the next
                      step small enough to take.
                    </p>
                    <button className="secondary-button" onClick={() => start(true)}>
                      Try a quick win <ArrowRight size={15} />
                    </button>
                  </div>
                </>
              )}

              {view === 'components' && (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">DIRECTION 01 / MOMENTUM</p>
                      <h1>
                        The little things, considered<span className="greeting-dot">.</span>
                      </h1>
                      <p>A component playground. Try the states and tune the personality.</p>
                    </div>
                    <Pill>
                      <Layers3 size={14} />
                      Design lab
                    </Pill>
                  </div>
                  <div className="lab-grid">
                    <section className="panel lab-section">
                      <SectionTitle eyebrow="01 / FEEL" title="Electric, with a human side" />
                      <p className="lab-copy">
                        Deep charcoal, warm type, an unmistakable lime. A friendly little spark adds
                        personality when it matters.
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
                      <SectionTitle eyebrow="02 / PROGRESS" title="A little more, every time" />
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
                        Proposed reward values. A smaller workout counts, earned XP stays yours, and
                        the weekly goal leaves room for recovery.
                      </p>
                    </section>
                    <section className="panel lab-section">
                      <SectionTitle eyebrow="03 / INTERACTION" title="A satisfying little yes" />
                      <div className="button-samples">
                        <button
                          className="primary-button"
                          onClick={() => {
                            setToast('+5 XP · Nice work. Every set adds up.')
                            setSetPulse((v) => v + 1)
                          }}
                        >
                          <Check size={17} />
                          Log this set <span>+5 XP</span>
                        </button>
                        <button className="secondary-button" onClick={() => start(true)}>
                          I have five minutes <ArrowRight size={15} />
                        </button>
                        <button className="secondary-button" disabled>
                          Workout saved <Check size={15} />
                        </button>
                      </div>
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
                        44 px touch targets, visible keyboard focus, short labels, and clear
                        feedback.
                      </p>
                    </section>
                    <section className="panel lab-section celebration-sample">
                      <SectionTitle eyebrow="04 / REWARD" title="Make the finish feel good" />
                      <TrophyArt />
                      <p>
                        A bright little moment. A new milestone. A reason to feel proud of showing
                        up.
                      </p>
                      <div className="segmented large">
                        <button className={!calm ? 'active' : ''} onClick={() => setCalm(false)}>
                          A little celebration
                        </button>
                        <button className={calm ? 'active' : ''} onClick={() => setCalm(true)}>
                          Keep it calm
                        </button>
                      </div>
                      <button className="primary-button" onClick={demoFinish}>
                        Play the celebration <Sparkles size={17} />
                      </button>
                      <span className="lab-note">
                        System reduced-motion preferences are respected.
                      </span>
                    </section>
                  </div>
                </>
              )}
              <footer className="app-footer">
                <span>
                  <FMark />A little stronger. A little more you.
                </span>
                <span>
                  Built for the long run <ArrowUpRight size={12} />
                </span>
              </footer>
            </main>
            <nav className="bottom-nav" aria-label="Mobile navigation">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={view === n.id ? 'active' : ''}
                  onClick={() => (n.id === 'workout' ? start(quick) : navigate(n.id))}
                  aria-current={view === n.id ? 'page' : undefined}
                >
                  <n.icon size={21} />
                  <span>{n.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
      <div className="study-caption">
        <span>01 — MOMENTUM</span>
        <p>Sample data · Interactive controls · Your real workouts are untouched</p>
        <button onClick={() => navigate('components')}>
          Explore the components <ArrowUpRight size={14} />
        </button>
      </div>
      {toast && (
        <div key={`${toast}-${setPulse}`} className="feedback-toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      )}
      {guide && (
        <Modal title={byId[guide].name} onClose={() => setGuide(null)}>
          <div className="guide-modal">
            <Pill>Movement preview</Pill>
            <ExerciseGuide exercise={byId[guide]} />
            <div className="guide-modal-muscles">
              <MuscleMap muscles={byId[guide].muscles} small />
              <div>
                <span className="eyebrow">KNOW YOUR MOVEMENT</span>
                <h3>Every rep, with confidence.</h3>
                <p>{byId[guide].cue}</p>
              </div>
            </div>
            <ol>
              {byId[guide].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </Modal>
      )}
      {settings && (
        <Modal title="Tune the feel" onClose={() => setSettings(false)}>
          <div className="tune-dialog">
            <p>Try a couple of variations before we settle on the direction.</p>
            <h3>Accent color</h3>
            <div className="accent-options">
              <button
                className={accent === 'lime' ? 'active' : ''}
                onClick={() => setAccent('lime')}
                aria-pressed={accent === 'lime'}
              >
                <i style={{ background: '#c7fa53' }} />
                Electric lime {accent === 'lime' && <Check size={16} />}
              </button>
              <button
                className={accent === 'mint' ? 'active' : ''}
                onClick={() => setAccent('mint')}
                aria-pressed={accent === 'mint'}
              >
                <i style={{ background: '#8fedb1' }} />
                Fresh mint {accent === 'mint' && <Check size={16} />}
              </button>
            </div>
            <h3>Celebration style</h3>
            <div className="segmented large">
              <button className={!calm ? 'active' : ''} onClick={() => setCalm(false)}>
                Playful
              </button>
              <button className={calm ? 'active' : ''} onClick={() => setCalm(true)}>
                Calm
              </button>
            </div>
            <p className="lab-note">
              Calm mode removes decorative motion and confetti. Reduced-motion system settings also
              apply.
            </p>
            <button
              className="primary-button"
              onClick={() => {
                setSettings(false)
                demoFinish()
              }}
            >
              Try this celebration <Sparkles size={16} />
            </button>
          </div>
        </Modal>
      )}
      {celebrate && (
        <Modal title="Your effort, celebrated" onClose={() => setCelebrate(false)}>
          <div className="celebration-content">
            <Confetti calm={calm} />
            <Pill className="lime-pill">
              <Check size={13} />
              WORKOUT SAVED
            </Pill>
            <div className="celebration-trophy">
              <TrophyArt />
            </div>
            <p className="eyebrow">YOU SHOWED UP FOR YOURSELF</p>
            <h2>{logs.length === total ? 'Look at you go.' : 'Showing up counts.'}</h2>
            <p>
              {logs.length === total
                ? 'A little stronger. A little more you.'
                : 'A small session is still a step forward.'}
            </p>
            <div className="earned-xp">
              <Zap size={27} fill="currentColor" />+<CountUp value={earnedXP} calm={calm} />
              <span>XP</span>
            </div>
            <div className="celebration-stats">
              <span>
                <strong>{logs.length}</strong>sets logged
              </span>
              <span>
                <strong>3 / 3</strong>weekly goal
              </span>
              <span>
                <strong>{best ? '1' : '0'}</strong>personal best{best ? '' : 's'}
              </span>
            </div>
            <div className="level-up-banner">
              <span>
                <Star size={21} fill="currentColor" />
              </span>
              <div>
                <p>{level > 6 ? 'LEVEL UP' : 'KEEP BUILDING'}</p>
                <strong>
                  {level > 6 ? `Hello, level ${level}.` : `Level ${level} looks good on you.`}
                </strong>
              </div>
              <span className="level-number">{String(level).padStart(2, '0')}</span>
            </div>
            <div className="unlocked-rewards">
              <span>
                <Trophy size={15} />
                <strong>Week winner</strong>+25 XP
              </span>
              {best && (
                <span>
                  <TrendingUp size={15} />
                  <strong>New personal best</strong>+15 XP
                </span>
              )}
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setCelebrate(false)
                navigate('journey')
              }}
            >
              See my journey <ArrowRight size={17} />
            </button>
            <button
              className="celebration-close"
              onClick={() => {
                setCelebrate(false)
                navigate('today')
              }}
            >
              Take the good feeling with you <Heart size={13} />
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
