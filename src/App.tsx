import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Dumbbell,
  Flame,
  Leaf,
  Play,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  WifiOff,
  X,
} from 'lucide-react'
import { available, byId, equipmentList, exercises, muscleNames } from './lib/catalog'
import type { AppState, Exercise, Focus, Muscle, Profile, Session, Workout } from './lib/types'
import {
  alternativesFor,
  doneSets,
  emptyState,
  focusNames,
  generateWorkout,
  localDay,
  replaceExercise,
  totalSets,
  weekCount,
  weekDays,
} from './lib/workout'
import { loadState, parseBackup, saveState, STORAGE_KEY } from './lib/storage'
import { Brand, HeroArt, MuscleMap } from './components/Visuals'
import Modal from './components/Modal'
import SessionView from './components/SessionView'
import ProgressView from './components/ProgressView'
import SetupView from './components/SetupView'
import ExerciseGuide, { ExerciseThumbnail } from './components/ExerciseGuide'

type Page = 'train' | 'progress' | 'library' | 'setup'
type Dialog =
  | { type: 'exercise'; id: string }
  | { type: 'swap'; index: number; active: boolean }
  | { type: 'finish' | 'discard' | 'reset' | 'install' | 'how' }
  | { type: 'import'; state: AppState }
  | { type: 'summary'; session: Session }
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
const pages: { id: Page; name: string; icon: typeof Dumbbell }[] = [
  { id: 'train', name: 'Your workout', icon: Dumbbell },
  { id: 'progress', name: 'Progress', icon: TrendingUp },
  { id: 'library', name: 'Exercise library', icon: BookOpen },
  { id: 'setup', name: 'My setup', icon: SlidersHorizontal },
]

export default function App() {
  const [loaded] = useState(loadState)
  const [state, setState] = useState<AppState>(() => ({
    ...loaded.state,
    plan: loaded.state.plan || generateWorkout(loaded.state.profile, loaded.state.history),
  }))
  const [blocked, setBlocked] = useState(!!loaded.error)
  const [storageError, setStorageError] = useState(loaded.error)
  const [page, setPage] = useState<Page>('train')
  const [inSession, setInSession] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  useEffect(() => {
    if (!blocked) setStorageError(saveState(state))
  }, [state, blocked])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false),
      install = (event: Event) => {
        event.preventDefault()
        setInstallEvent(event as InstallEvent)
      }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('beforeinstallprompt', install)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('beforeinstallprompt', install)
    }
  }, [])
  const plan = state.plan!
  const navigate = (next: Page) => {
    setPage(next)
    setInSession(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const profileChange = (profile: Profile) => {
    if (state.active) return
    // A change of experience level starts a new recommendation baseline; history stays intact.
    setState((s) => ({
      ...s,
      profile,
      plan: generateWorkout(profile, profile.level === s.profile.level ? s.history : []),
    }))
  }
  function start() {
    if (!state.active)
      setState((s) => ({ ...s, active: { ...s.plan!, startedAt: new Date().toISOString() } }))
    setInSession(true)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function finish() {
    if (!state.active || doneSets(state.active) === 0) return
    const session: Session = {
      ...state.active,
      completedAt: new Date().toISOString(),
      elapsedSeconds: Math.min(
        604800,
        Math.max(0, Math.floor((Date.now() - new Date(state.active.startedAt).getTime()) / 1000)),
      ),
    }
    setState((s) => {
      const history = [...s.history, session]
      return { ...s, history, active: null, plan: generateWorkout(s.profile, history) }
    })
    setInSession(false)
    setDialog({ type: 'summary', session })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function download(raw: string, name: string) {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function exportBackup() {
    let raw = JSON.stringify(state, null, 2)
    if (blocked) {
      try {
        raw = localStorage.getItem(STORAGE_KEY) || raw
      } catch {
        /* Export in-memory state if browser storage is unavailable. */
      }
    }
    download(raw, `fitt-backup-${localDay(new Date())}.json`)
    setToast('Backup downloaded. Keep it somewhere safe.')
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 10_000_000) throw new Error('Choose a backup smaller than 10 MB.')
      const imported = parseBackup(await file.text())
      setDialog({ type: 'import', state: imported })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not read this backup.')
    }
  }
  async function install() {
    if (installEvent) {
      await installEvent.prompt()
      const result = await installEvent.userChoice
      if (result.outcome === 'accepted') setToast('Fitt is ready for your home screen.')
      setInstallEvent(null)
    } else setDialog({ type: 'install' })
  }
  const swapWorkout = dialog?.type === 'swap' ? (dialog.active ? state.active : plan) : null
  const swapEntry = dialog?.type === 'swap' ? swapWorkout?.exercises[dialog.index] : null
  function swap(exercise: Exercise) {
    if (dialog?.type !== 'swap' || !swapEntry) return
    const replace = (w: Workout) => ({
      ...w,
      exercises: w.exercises.map((e, i) => (i === dialog.index ? replaceExercise(e, exercise) : e)),
    })
    setState((s) =>
      dialog.active
        ? { ...s, active: replace(s.active!) as Session }
        : { ...s, plan: replace(s.plan!) },
    )
    setDialog(null)
    setToast(`Switched to ${exercise.name.toLowerCase()}.`)
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-button" aria-label="Fitt home" onClick={() => navigate('train')}>
          <Brand />
        </button>
        <div className="sidebar-label">YOUR TRAINING SPACE</div>
        <nav aria-label="Main navigation">
          {pages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.name}</span>
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="leaf-icon">
              <Leaf size={21} />
            </span>
            <strong>Built for the long run.</strong>
            <p>
              Small steps today.
              <br />
              Stronger foundations tomorrow.
            </p>
            <button onClick={() => setDialog({ type: 'how' })}>
              The Fitt approach <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="device-status">
            <span className={`status-dot ${!online ? 'offline' : ''}`} />
            <span>
              {storageError
                ? 'Session only · export to keep'
                : !online
                  ? 'You’re offline'
                  : offlineReady
                    ? 'Ready for offline training'
                    : 'Saved on this device'}
            </span>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand compact />
          </div>
          <div className="breadcrumb">
            Your training space <ChevronRight size={13} />
            <strong>{inSession ? 'Active session' : pages.find((p) => p.id === page)?.name}</strong>
          </div>
          <div className="topbar-right">
            {!online && (
              <span className="offline-tag">
                <WifiOff size={14} /> Offline
              </span>
            )}
            <span className="date-label">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <button
              className="avatar"
              aria-label="Open training preferences"
              onClick={() => navigate('setup')}
            >
              YOU
            </button>
          </div>
        </header>
        {storageError && (
          <div className="storage-error" role="alert">
            {storageError}
            <button onClick={exportBackup}>Export backup</button>
          </div>
        )}
        {needRefresh && (
          <div className="update-banner">
            A fresh version of Fitt is ready.
            <button onClick={() => updateServiceWorker(true)}>
              Update app <RotateCcw size={14} />
            </button>
          </div>
        )}
        <main id="main-content">
          {inSession && state.active ? (
            <SessionView
              session={state.active}
              profile={state.profile}
              onChange={(active) => setState((s) => ({ ...s, active }))}
              onBack={() => setInSession(false)}
              onFinish={() =>
                doneSets(state.active!) < totalSets(state.active!)
                  ? setDialog({ type: 'finish' })
                  : finish()
              }
              onDiscard={() => setDialog({ type: 'discard' })}
              onSwap={(index) => setDialog({ type: 'swap', index, active: true })}
              onInfo={(id) => setDialog({ type: 'exercise', id })}
            />
          ) : page === 'train' ? (
            <TrainView
              state={state}
              onProfile={profileChange}
              onStart={start}
              onSetup={() => navigate('setup')}
              onInfo={(id) => setDialog({ type: 'exercise', id })}
              onSwap={(index) => setDialog({ type: 'swap', index, active: false })}
              onHow={() => setDialog({ type: 'how' })}
            />
          ) : page === 'progress' ? (
            <ProgressView history={state.history} onTrain={() => navigate('train')} />
          ) : page === 'setup' ? (
            <SetupView
              profile={state.profile}
              active={!!state.active}
              onChange={profileChange}
              onExport={exportBackup}
              onImport={importBackup}
              onReset={() => setDialog({ type: 'reset' })}
              onInstall={install}
            />
          ) : (
            <LibraryView
              profile={state.profile}
              onInfo={(id) => setDialog({ type: 'exercise', id })}
            />
          )}
          <footer className="main-footer">
            <span>
              Fitt <span className="footer-dot">/</span> A little stronger, every day.
            </span>
            <button onClick={() => setDialog({ type: 'how' })}>
              Made for your kind of progress <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
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
                          ? 'Another step forward.'
                          : dialog.type === 'install'
                            ? 'Take Fitt with you.'
                            : 'Progress, at your pace.'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.type === 'exercise' && <ExerciseDetail exercise={byId[dialog.id]} />}
          {dialog.type === 'swap' && swapEntry && (
            <>
              <p className="modal-description">
                Alternatives to {byId[swapEntry.exerciseId].name.toLowerCase()} using your
                equipment. Choose the variation you can perform with control.
              </p>
              <div className="swap-list">
                {alternativesFor(swapEntry, state.profile).map((e) => (
                  <button key={e.id} onClick={() => swap(e)}>
                    <span className={`movement-icon ${e.pattern}`}>
                      <ExerciseThumbnail exerciseId={e.id} compact />
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        {e.level < byId[swapEntry.exerciseId].level
                          ? 'Easier'
                          : e.level > byId[swapEntry.exerciseId].level
                            ? 'More challenging'
                            : 'Similar level'}{' '}
                        · {e.min} {e.unit}
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
              {alternativesFor(swapEntry, state.profile).length === 0 && (
                <p>
                  No other variations are available with this equipment. You can lower reps or added
                  load during your session.
                </p>
              )}
            </>
          )}
          {dialog.type === 'finish' && (
            <>
              <p className="modal-description">
                You’ve logged {doneSets(state.active!)} of {totalSets(state.active!)} sets. Save
                these as a partial workout. Unfinished sets won’t count toward your progress.
              </p>
              <div className="modal-buttons">
                <button className="secondary-button" onClick={() => setDialog(null)}>
                  Keep training
                </button>
                <button className="primary-button" onClick={finish}>
                  Save workout <Check size={17} />
                </button>
              </div>
            </>
          )}
          {dialog.type === 'discard' && (
            <>
              <p className="modal-description">
                This removes the in-progress workout and its logged sets. Your completed history
                stays saved.
              </p>
              <div className="modal-buttons">
                <button className="secondary-button" onClick={() => setDialog(null)}>
                  Keep session
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    setState((s) => ({ ...s, active: null }))
                    setInSession(false)
                    setDialog(null)
                  }}
                >
                  Discard session
                </button>
              </div>
            </>
          )}
          {dialog.type === 'reset' && (
            <>
              <p className="modal-description">
                This permanently removes all workouts and preferences from this browser. Export a
                backup first if you want to keep them.
              </p>
              <button className="text-button" onClick={exportBackup}>
                <ArrowDownToLine size={16} /> Export before resetting
              </button>
              <div className="modal-buttons">
                <button className="secondary-button" onClick={() => setDialog(null)}>
                  Keep my data
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    const fresh = emptyState()
                    fresh.plan = generateWorkout(fresh.profile, [])
                    setState(fresh)
                    setBlocked(false)
                    setDialog(null)
                    setInSession(false)
                    setToast('Your training space has been reset.')
                  }}
                >
                  Reset all data
                </button>
              </div>
            </>
          )}
          {dialog.type === 'import' && (
            <>
              <p className="modal-description">
                Restore {dialog.state.history.length} workouts and your saved preferences. This
                replaces the data currently on this device
                {dialog.state.active ? ', including a saved session you can resume' : ''}.
              </p>
              <button className="text-button" onClick={exportBackup}>
                <ArrowDownToLine size={16} /> Back up current data first
              </button>
              <div className="modal-buttons">
                <button className="secondary-button" onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setState({
                      ...dialog.state,
                      plan:
                        dialog.state.plan ||
                        generateWorkout(dialog.state.profile, dialog.state.history),
                    })
                    setBlocked(false)
                    setDialog(null)
                    setInSession(false)
                    setToast('Backup restored. Welcome back.')
                  }}
                >
                  Restore backup
                </button>
              </div>
            </>
          )}
          {dialog.type === 'summary' && (
            <div className="summary">
              <span className="summary-check">
                <Check size={32} />
              </span>
              <p>
                Showing up is how strong happens.
                <br />
                {storageError
                  ? 'Export a backup to keep this workout before closing the app.'
                  : 'Your workout is saved on this device.'}
              </p>
              <div className="summary-stats">
                <div>
                  <strong>{doneSets(dialog.session)}</strong>
                  <span>SETS LOGGED</span>
                </div>
                <div>
                  <strong>
                    {Math.max(1, Math.round((dialog.session.elapsedSeconds || 0) / 60))}
                  </strong>
                  <span>MINUTES</span>
                </div>
                <div>
                  <strong>{state.history.length}</strong>
                  <span>TOTAL SESSIONS</span>
                </div>
              </div>
              <div className="summary-note">
                <Sparkles size={19} />
                <p>
                  Your next workout uses today’s reps and effort. Take time to recover before
                  another demanding session.
                </p>
              </div>
              <button
                className="primary-button full"
                onClick={() => {
                  setDialog(null)
                  navigate('progress')
                }}
              >
                See your progress <ArrowRight size={17} />
              </button>
            </div>
          )}
          {dialog.type === 'install' && (
            <>
              <p className="modal-description">
                Fitt can live on your home screen and work without a connection after its first full
                load.
              </p>
              <div className="instruction-block">
                <strong>iPhone or iPad</strong>
                <p>Open this site in Safari. Tap Share, then “Add to Home Screen.”</p>
                <strong>Android or desktop</strong>
                <p>Open the browser menu and choose “Install app” or “Add to Home screen.”</p>
              </div>
              <p className="caption">
                Installation needs a secure HTTPS address (or a local development server). Your data
                stays in the browser you use; export a backup before switching browsers.
              </p>
            </>
          )}
          {dialog.type === 'how' && (
            <div className="approach">
              <span className="approach-icon">
                <Leaf size={30} />
              </span>
              <p className="modal-description">
                Strength is a practice. Fitt helps you find a manageable starting point, pay
                attention to your effort, and build from there.
              </p>
              <ol>
                <li>
                  <strong>Start with what you have.</strong>
                  <p>
                    Workouts use your equipment and experience. Choose an easier variation whenever
                    you need it.
                  </p>
                </li>
                <li>
                  <strong>Log what really happened.</strong>
                  <p>
                    Change your reps, hold time, or added load. A hard or incomplete set lowers
                    remaining targets.
                  </p>
                </li>
                <li>
                  <strong>Earn the next step.</strong>
                  <p>
                    Complete every set at its target with good or easy effort in two consecutive
                    sessions of an exercise. The next plan adds one rep (or five seconds). At the
                    top of the range, it can introduce a harder available variation or a little
                    added weight.
                  </p>
                </li>
              </ol>
              <div className="gentle-note">
                These are simple training rules, not a clinical assessment. Keep movement
                controlled, allow recovery, and stop if something hurts.
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function TrainView({
  state,
  onProfile,
  onStart,
  onSetup,
  onInfo,
  onSwap,
  onHow,
}: {
  state: AppState
  onProfile: (p: Profile) => void
  onStart: () => void
  onSetup: () => void
  onInfo: (id: string) => void
  onSwap: (i: number) => void
  onHow: () => void
}) {
  const plan = state.active || state.plan!
  const muscles = [...new Set(plan.exercises.flatMap((e) => byId[e.exerciseId].muscles))]
  const count = weekCount(state.history)
  const last = state.history[state.history.length - 1]
  const recent = last && Date.now() - new Date(last.completedAt!).getTime() < 86400000
  const days = weekDays()
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-line" /> BUILT AROUND YOU
          </p>
          <h1>
            Your daily practice<span>.</span>
          </h1>
          <p className="subtitle">Meet yourself where you are. Get a little stronger.</p>
        </div>
        <button className="secondary-button setup-shortcut" onClick={onSetup}>
          <Settings2 size={16} /> My equipment{' '}
          <span className="button-count">{state.profile.equipment.length || '0'}</span>
        </button>
      </div>
      <div className="dashboard-grid">
        <div className="training-column">
          <section className="workout-hero">
            <div className="hero-copy">
              <span className="hero-tag">
                <span /> YOUR NEXT CHAPTER
              </span>
              <h2>
                A little stronger.
                <br />
                <span>Every session.</span>
              </h2>
              <p>
                Just you, your body, and a plan
                <br className="desktop-break" /> that grows with you.
              </p>
              <button className="hero-button" onClick={onStart}>
                {state.active ? 'Resume workout' : 'Let’s get moving'}
                <Play size={16} fill="currentColor" />
              </button>
              <div className="hero-meta">
                <span>
                  <Clock3 size={13} />
                  {plan.duration} min
                </span>
                <span className="meta-dot">·</span>
                <span>{plan.exercises.length} exercises</span>
                <span className="meta-dot">·</span>
                <span>{focusNames[state.profile.focus]}</span>
              </div>
            </div>
            <HeroArt />
            <div className="hero-caption">PROGRESS IS A PRACTICE.</div>
          </section>
          {state.active && (
            <div className="resume-note">
              <span>
                <span className="status-dot" /> Session in progress · {doneSets(state.active)} sets
                saved
              </span>
              <button onClick={onStart}>
                Pick up where you left off <ArrowRight size={14} />
              </button>
            </div>
          )}
          {recent && (
            <div className="recovery-note">
              <Leaf size={17} />
              <p>
                You trained recently. Consider rest or gentle movement today; this plan will be here
                when you’re ready.
              </p>
            </div>
          )}
          <section className="workout-section">
            <div className="section-heading">
              <div>
                <h2>The plan for today</h2>
                <p>Thoughtfully balanced. Yours to adjust.</p>
              </div>
              <span className="tag subtle">
                <Sparkles size={12} /> Adaptive
              </span>
            </div>
            <div className="workout-controls">
              <div className="focus-tabs" aria-label="Workout focus">
                {(['full', 'upper', 'lower', 'core'] as Focus[]).map((f) => (
                  <button
                    key={f}
                    aria-pressed={state.profile.focus === f}
                    disabled={!!state.active}
                    className={state.profile.focus === f ? 'selected' : ''}
                    onClick={() => onProfile({ ...state.profile, focus: f })}
                  >
                    {f === 'core' ? 'Core' : focusNames[f]}
                  </button>
                ))}
              </div>
              <label className="duration-select">
                <Clock3 size={14} />
                <span className="sr-only">Workout duration</span>
                <select
                  disabled={!!state.active}
                  value={state.profile.duration}
                  onChange={(e) =>
                    onProfile({
                      ...state.profile,
                      duration: Number(e.target.value) as Profile['duration'],
                    })
                  }
                >
                  <option value={20}>20 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                </select>
              </label>
            </div>
            <div className="workout-list">
              {plan.exercises.map((entry, i) => {
                const e = byId[entry.exerciseId]
                return (
                  <div className="workout-row" key={i}>
                    <span className="exercise-index">{String(i + 1).padStart(2, '0')}</span>
                    <button
                      className={`movement-icon ${e.pattern}`}
                      aria-label={`View ${e.name} instructions`}
                      onClick={() => onInfo(e.id)}
                    >
                      <ExerciseThumbnail exerciseId={e.id} compact />
                    </button>
                    <button className="workout-row-name" onClick={() => onInfo(e.id)}>
                      <strong>{e.name}</strong>
                      <span>
                        {e.muscles
                          .slice(0, 2)
                          .map((m) => muscleNames[m])
                          .join(' · ')}
                      </span>
                    </button>
                    <div className="exercise-dose">
                      <strong>
                        {entry.sets.length} <span>×</span> {entry.sets[0].target}
                      </strong>
                      <span>{e.unit === 'sec' ? 'second holds' : 'reps per set'}</span>
                    </div>
                    <button
                      className="swap-button"
                      aria-label={`Swap ${e.name}`}
                      disabled={!!state.active}
                      onClick={() => onSwap(i)}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="workout-footnote">
              <ShieldCheck size={15} />
              <span>Clean reps first. You can adjust every set as you go.</span>
            </div>
          </section>
          <button className="progression-banner" onClick={onHow}>
            <span className="progression-icon">
              <TrendingUp size={22} />
            </span>
            <span>
              <strong>A plan that learns your pace.</strong>
              <small>Log your reps. Tell us how it felt. We’ll take it from there.</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        </div>
        <aside className="dashboard-aside">
          <section className="panel week-panel">
            <div className="panel-heading">
              <h2>Keep showing up</h2>
              <Flame size={18} />
            </div>
            <p className="week-goal">
              <strong>{count}</strong>
              <span> / {state.profile.weeklyGoal} workouts this week</span>
            </p>
            <div className="week-calendar">
              {days.map((day, i) => {
                const done = state.history.some(
                  (s) => localDay(new Date(s.completedAt!)) === localDay(day),
                )
                const today = localDay(day) === localDay(new Date())
                return (
                  <div key={i} className={today ? 'is-today' : ''}>
                    <span>
                      {day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)}
                    </span>
                    <span className={`day-circle ${done ? 'day-done' : ''}`}>
                      {done ? <Check size={14} /> : day.getDate()}
                    </span>
                    {today && <i />}
                  </div>
                )
              })}
            </div>
            <div className="week-bottom">
              <span className="small-dot" />
              <p>
                {count >= state.profile.weeklyGoal
                  ? 'Weekly goal reached. Make space for recovery.'
                  : count === 0
                    ? 'Your next chapter starts with one session.'
                    : `${state.profile.weeklyGoal - count} more this week. One session at a time.`}
              </p>
            </div>
          </section>
          <section className="panel muscles-panel">
            <div className="panel-heading">
              <h2>A full-body picture</h2>
              <button className="icon-button" aria-label="About muscles worked" onClick={onHow}>
                <CircleHelp size={16} />
              </button>
            </div>
            <p>Muscles in today’s workout</p>
            <MuscleMap muscles={muscles} />
            <div className="muscle-legend">
              <span className="legend-dot" /> Muscles worked <span>{muscles.length} groups</span>
            </div>
            <div className="muscle-tags">
              {muscles.map((m) => (
                <span key={m}>{muscleNames[m]}</span>
              ))}
            </div>
          </section>
          <div className="quiet-note">
            <span>01 / THE FOUNDATION</span>
            <p>
              “Consistency is a skill.
              <br />
              You get better at it
              <br />
              <em>by showing up.</em>”
            </p>
            <div className="quiet-note-line" />
          </div>
        </aside>
      </div>
    </div>
  )
}

function ExerciseDetail({ exercise: e }: { exercise: Exercise }) {
  return (
    <div className="exercise-detail">
      <div className="exercise-detail-top">
        <span className={`movement-icon large ${e.pattern}`}>
          <ExerciseThumbnail exerciseId={e.id} compact />
        </span>
        <div>
          <span className="tag">
            {e.level <= 1 ? 'Foundation' : e.level === 2 ? 'Intermediate' : 'Progression'}
          </span>
          <p>{e.cue}</p>
        </div>
      </div>
      <ExerciseGuide exercise={e} />
      <div className="detail-muscles">
        <MuscleMap muscles={e.muscles} small />
        <div>
          <p className="eyebrow">WHERE YOU’LL FEEL IT</p>
          <h3>Muscles at work</h3>
          <div className="muscle-tags">
            {e.muscles.map((m) => (
              <span key={m}>{muscleNames[m]}</span>
            ))}
          </div>
          <p className="caption">Highlighted in green on the front and back views.</p>
        </div>
      </div>
      <h3 className="form-heading">Make every rep a good rep.</h3>
      <ol className="form-steps">
        {e.steps.map((step, i) => (
          <li key={i}>
            <span>{i + 1}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
      <div className="detail-facts">
        <span>
          <Dumbbell size={15} />
          {e.equipment.length
            ? e.equipment.map((id) => equipmentList.find((e) => e.id === id)!.name).join(' + ')
            : 'Bodyweight'}
        </span>
        <span>
          <Clock3 size={15} />
          {e.rest}s rest
        </span>
      </div>
      <div className="gentle-note">
        Choose a range you can control. Stop if you feel sharp pain, dizziness, or unusual
        discomfort.
      </div>
    </div>
  )
}

function LibraryView({ profile, onInfo }: { profile: Profile; onInfo: (id: string) => void }) {
  const [search, setSearch] = useState(''),
    [muscle, setMuscle] = useState<Muscle | 'all'>('all'),
    [onlyAvailable, setOnlyAvailable] = useState(false)
  const filtered = exercises.filter(
    (e) =>
      (e.name + ' ' + e.muscles.join(' ')).toLowerCase().includes(search.toLowerCase()) &&
      (muscle === 'all' || e.muscles.includes(muscle)) &&
      (!onlyAvailable || available(e, profile.equipment)),
  )
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">KNOW YOUR MOVEMENT</p>
          <h1>
            Good form starts here<span>.</span>
          </h1>
          <p className="subtitle">A thoughtful library for a stronger, more capable you.</p>
        </div>
        <span className="heading-symbol">
          <BookOpen size={27} />
        </span>
      </div>
      <div className="library-filters">
        <label className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder="Find your next movement…"
            aria-label="Search exercises"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter muscle group</span>
          <select
            className="full-select"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value as Muscle | 'all')}
          >
            <option value="all">All muscle groups</option>
            {Object.entries(muscleNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />{' '}
          My equipment only
        </label>
      </div>
      <div className="library-count">
        {filtered.length} movements <span>•</span> Find strength in the fundamentals
      </div>
      <div className="library-grid">
        {filtered.map((e) => (
          <button className="library-card" key={e.id} onClick={() => onInfo(e.id)}>
            <div className={`library-art ${e.pattern}`}>
              <ExerciseThumbnail exerciseId={e.id} />
              <span className="library-number">
                {String(exercises.indexOf(e) + 1).padStart(2, '0')}
              </span>
              <ArrowUpRight size={18} />
            </div>
            <div className="library-card-copy">
              <div className="library-card-meta">
                <span>
                  {e.level <= 1 ? 'FOUNDATION' : e.level === 2 ? 'INTERMEDIATE' : 'PROGRESSION'}
                </span>
                {available(e, profile.equipment) && (
                  <span className="available-dot" title="Available with your equipment" />
                )}
              </div>
              <h3>{e.name}</h3>
              <p>
                {e.muscles
                  .slice(0, 3)
                  .map((m) => muscleNames[m])
                  .join(' · ')}
              </p>
            </div>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-small">
          <Search size={30} />
          <h3>No movements found.</h3>
          <p>Try another name, muscle group, or equipment filter.</p>
          <button
            className="secondary-button"
            onClick={() => {
              setSearch('')
              setMuscle('all')
              setOnlyAvailable(false)
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
