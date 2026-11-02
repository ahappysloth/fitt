'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Dumbbell,
  Home,
  Settings2,
  ShieldCheck,
  TrendingUp,
  WifiOff,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type {
  AppState,
  BodyModel,
  Exercise,
  Profile,
  Session,
  UserPreferences,
  Workout,
} from './lib/types'
import { available, byId } from './lib/catalog'
import {
  doneSets,
  emptyState,
  freshWorkout,
  generateWorkout,
  localDay,
  quickWorkout,
  replaceExercise,
  totalSets,
} from './lib/workout'
import { parseBackup } from './lib/storage'
import { createRewardContext, getRewards } from './lib/rewards'
import { useTrainingStore } from './lib/useTrainingStore'
import { usePwa } from './lib/usePwa'
import {
  appRoutes,
  pageForPathname,
  type AppNavigation,
  type AppPage as Page,
  type NavigationOptions,
} from './lib/navigation'
import { FMark, SparkBuddy } from './components/FittArtwork'
import { BodyModelPreferenceProvider } from './components/BodyModelPreference'
import { Button } from './components/ui'
import TodayView from './components/TodayView'
import SessionView from './components/SessionView'
import JourneyView from './components/JourneyView'
import LibraryView from './components/LibraryView'
import SetupView from './components/SetupView'
import AccountPanel from './components/AccountPanel'
import ActiveWorkoutNotice from './components/ActiveWorkoutNotice'
import WorkoutBuilder from './components/WorkoutBuilder'
import AppDialogs, { type AppDialog } from './components/AppDialogs'
import { useAdminAccess } from './components/admin/useAdminAccess'
import './app-experience.css'

const AdminView = lazy(() => import('./components/admin/AdminView'))

const navigation = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'journey', label: 'Journey', icon: TrendingUp },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const
const defaultPreferences: UserPreferences = {
  displayName: '',
  celebration: 'playful',
  onboarded: false,
  bodyModel: 'male',
}

export default function App({ navigation: routeNavigation }: { navigation?: AppNavigation }) {
  // Standalone, sandboxed previews keep memory navigation and need no framework router.
  const [localPathname, setLocalPathname] = useState(appRoutes.today)
  const pathname = routeNavigation?.pathname ?? localPathname
  const page = pageForPathname(pathname) ?? 'today'
  const changePath = useCallback(
    (next: string, options?: NavigationOptions) => {
      if (routeNavigation) routeNavigation.navigate(next, options)
      else setLocalPathname(next)
    },
    [routeNavigation?.navigate],
  )
  const store = useTrainingStore()
  const { state, setState, ready, storageError, recoveryRaw, replaceState } = store
  const admin = useAdminAccess(store.account.user?.id, page === 'admin' ? 'admin' : '')
  const navigationItems = admin.allowed
    ? [...navigation, { id: 'admin' as const, label: 'Admin', icon: Wrench }]
    : navigation
  const pwa = usePwa()
  useEffect(() => {
    if (
      page === 'admin' &&
      !['checking', 'loading'].includes(store.account.status) &&
      !admin.checking &&
      !admin.allowed
    )
      changePath(appRoutes.settings, { replace: true })
  }, [page, store.account.status, admin.allowed, admin.checking, changePath])
  const [dialog, setDialog] = useState<AppDialog | null>(null)
  const [toast, setToastMessage] = useState('')
  const [toastDestination, setToastDestination] = useState<Page | null>(null)
  const [builderInitial, setBuilderInitial] = useState<Workout | undefined>()
  const [builderDirty, setBuilderDirty] = useState(false)
  const [sessionDirty, setSessionDirty] = useState(false)
  const pendingNavigation = useRef<(() => void) | null>(null)
  const handledAccountReturn = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  const finishing = useRef(false)
  const preferences = state.preferences || defaultPreferences
  const updateBlockedReason = storageError
    ? 'Back up your progress and resolve the storage warning before updating.'
    : builderDirty
      ? 'Save or leave your routine before updating.'
      : sessionDirty
        ? 'Save or cancel your workout edits before updating.'
        : null
  const changeBodyModel = useCallback(
    (bodyModel: BodyModel) => {
      setState((previous) => {
        const current = previous.preferences || defaultPreferences
        if ((current.bodyModel ?? 'male') === bodyModel) return previous
        return { ...previous, preferences: { ...current, bodyModel } }
      })
    },
    [setState],
  )
  const bodyModelPreference = useMemo(
    () => ({
      bodyModel: preferences.bodyModel ?? 'male',
      onBodyModelChange: changeBodyModel,
    }),
    [preferences.bodyModel, changeBodyModel],
  )
  const rewards = useMemo(
    () => getRewards(state.history, state.profile.weeklyGoal, new Date(now)),
    [state.history, state.profile.weeklyGoal, now],
  )
  useEffect(() => {
    document.documentElement.dataset.motion = preferences.celebration
  }, [preferences.celebration])
  useEffect(() => {
    if (!store.account.returnToAccount) return
    if (!handledAccountReturn.current) {
      handledAccountReturn.current = true
      changePath(appRoutes.settings, { replace: true, preserveSearch: true })
    }
    const frame = requestAnimationFrame(() =>
      document.getElementById('main-content')?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [store.account.returnToAccount, changePath])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    const wake = () => setNow(Date.now())
    window.addEventListener('focus', wake)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', wake)
    }
  }, [])
  useEffect(() => {
    // Keep actionable notices available until followed or dismissed.
    if (!toast || toastDestination) return
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast, toastDestination])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (builderDirty || sessionDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [builderDirty, sessionDirty])

  useEffect(
    () =>
      routeNavigation?.setBlocker((action) => {
        if (page === 'builder' && builderDirty) {
          pendingNavigation.current = action
          setDialog({ type: 'leave-builder' })
          return true
        }
        if (page === 'workout' && sessionDirty) {
          pendingNavigation.current = action
          setDialog({ type: 'leave-session' })
          return true
        }
        return false
      }),
    [routeNavigation?.setBlocker, page, builderDirty, sessionDirty],
  )

  function setToast(message: string, destination: Page | null = null) {
    setToastMessage(message)
    setToastDestination(destination)
  }

  function showPage(next: Page) {
    changePath(appRoutes[next])
    setDialog(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() =>
      document.getElementById('main-content')?.focus({ preventScroll: true }),
    )
  }
  function requestNavigation(action: () => void) {
    if (page === 'builder' && builderDirty) {
      pendingNavigation.current = action
      setDialog({ type: 'leave-builder' })
      return
    }
    if (page === 'workout' && sessionDirty) {
      pendingNavigation.current = action
      setDialog({ type: 'leave-session' })
      return
    }
    action()
  }
  function navigate(next: Page) {
    if (next === page && (next !== 'workout' || state.active)) return
    requestNavigation(() => (next === 'workout' ? start() : showPage(next)))
  }
  function followLink(event: MouseEvent<HTMLAnchorElement>, next: Page) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    navigate(next)
  }
  function profileChange(profile: Profile) {
    if (state.active) return
    setState((previous) => ({
      ...previous,
      profile,
      preferences: { ...(previous.preferences || defaultPreferences), onboarded: true },
      plan: generateWorkout(
        profile,
        profile.level === previous.profile.level ? previous.history : [],
      ),
    }))
  }
  function start(workout?: Workout) {
    if (!state.active) {
      const planned = workout || state.plan!
      if (
        planned.exercises.some(
          (entry) => !available(byId[entry.exerciseId], state.profile.equipment),
        )
      ) {
        setToast(
          'This workout uses equipment outside your setup. Edit it or update your equipment first.',
        )
        return
      }
      if (
        !state.profile.equipment.includes('vest') &&
        planned.exercises.some((entry) => entry.sets.some((set) => set.targetLoad > 0))
      ) {
        setToast(
          'This workout includes added weight. Add a weighted vest to your setup, or edit the routine to use bodyweight.',
        )
        return
      }
      finishing.current = false
      setState((previous) =>
        previous.active
          ? previous
          : {
              ...previous,
              active: {
                ...freshWorkout(workout || previous.plan!),
                startedAt: new Date().toISOString(),
              },
            },
      )
    }
    showPage('workout')
  }
  function startQuick() {
    start(quickWorkout(state.profile, state.history))
  }
  function clearSessionUI(id?: string) {
    if (!id) return
    try {
      sessionStorage.removeItem(`fitt.session-ui.${id}`)
    } catch {
      /* Browser may block session storage. */
    }
  }
  function finish() {
    const active = state.active
    if (!active || doneSets(active) === 0 || finishing.current) return
    finishing.current = true
    const finishedAt = new Date(Math.max(Date.now(), Date.parse(active.startedAt)))
    const session: Session = {
      ...active,
      completedAt: finishedAt.toISOString(),
      elapsedSeconds: Math.min(
        604800,
        Math.max(0, Math.floor((finishedAt.getTime() - Date.parse(active.startedAt)) / 1000)),
      ),
      rewardContext: createRewardContext(
        getRewards(state.history, state.profile.weeklyGoal, finishedAt).currentWeek.goal,
        finishedAt,
      ),
    }
    setState((previous) => {
      if (!previous.active || previous.history.some((item) => item.id === session.id))
        return previous
      const history = [...previous.history, session]
      return {
        ...previous,
        history,
        active: null,
        plan: generateWorkout(previous.profile, history),
      }
    })
    clearSessionUI(session.id)
    setSessionDirty(false)
    changePath(appRoutes.today)
    setNow(Date.now())
    setDialog({ type: 'summary', session, celebrate: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function discard() {
    clearSessionUI(state.active?.id)
    setState((previous) => ({ ...previous, active: null }))
    finishing.current = false
    setSessionDirty(false)
    showPage('today')
    setToast('Session discarded. Your saved progress stays safe.')
  }
  function swap(exercise: Exercise) {
    if (dialog?.type !== 'swap') return
    const { index, active } = dialog
    setState((previous) => {
      const workout = active ? previous.active : previous.plan
      if (!workout || !workout.exercises[index]) return previous
      const updated = {
        ...workout,
        exercises: workout.exercises.map((entry, i) =>
          i === index ? replaceExercise(entry, exercise) : entry,
        ),
      }
      return active ? { ...previous, active: updated as Session } : { ...previous, plan: updated }
    })
    setDialog(null)
    setToast(`Switched to ${exercise.name.toLowerCase()}.`)
  }
  function download(raw: string, name: string) {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function exportBackup() {
    download(JSON.stringify(state, null, 2), `fitt-backup-${localDay(new Date())}.json`)
    setToast('Your current progress is in the downloaded backup.')
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 10_000_000) throw new Error('Choose a backup smaller than 10 MB.')
      setDialog({ type: 'import', state: parseBackup(await file.text()) })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not read this backup.')
    }
  }
  function restore(next: AppState) {
    clearSessionUI(state.active?.id)
    replaceState(next)
    finishing.current = false
    showPage('today')
    setToast('Backup restored. Your training space is ready.')
  }
  function create(initial?: Workout) {
    if (state.active) {
      setToast('Finish or discard your active session before editing a workout.', 'workout')
      return
    }
    setBuilderInitial(initial)
    setBuilderDirty(false)
    showPage('builder')
  }
  function saveRoutine(routine: Workout) {
    const existing = state.routines || []
    if (!existing.some((item) => item.id === routine.id) && existing.length >= 100) {
      setToast('You have 100 saved workouts. Remove one before adding another.')
      return
    }
    setState((previous) => ({
      ...previous,
      routines: [...(previous.routines || []).filter((item) => item.id !== routine.id), routine],
      plan: freshWorkout(routine),
    }))
    setBuilderDirty(false)
    showPage('today')
    setToast('Workout saved. Your plan is ready when you are.')
  }
  function startRoutine(routine: Workout) {
    start(routine)
  }
  async function install() {
    const outcome = await pwa.install()
    if (outcome === 'manual') setDialog({ type: 'install' })
    else if (outcome === 'accepted') setToast('Fitt is ready for your home screen.')
  }
  const activeNavigation = page === 'builder' ? 'today' : page
  if (!ready)
    return (
      <div className="app-loading" role="status">
        <FMark />
        <h1>Make room for stronger.</h1>
        <p>Opening your training space…</p>
      </div>
    )
  return (
    <BodyModelPreferenceProvider value={bodyModelPreference}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
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
            {navigationItems.map((item) => (
              <a
                key={item.id}
                className={`nav-item ${activeNavigation === item.id ? 'active' : ''}`}
                href={appRoutes[item.id]}
                onClick={(event) => followLink(event, item.id)}
                aria-current={activeNavigation === item.id ? 'page' : undefined}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
                {activeNavigation === item.id && <span className="nav-dot" />}
              </a>
            ))}
          </nav>
          <button className="sidebar-challenge" onClick={() => requestNavigation(startQuick)}>
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
              Try a quick win
              <ArrowUpRight size={15} />
            </span>
          </button>
          <div className="sidebar-bottom">
            <span className="on-device">
              <ShieldCheck size={14} />
              Your pace. Your progress.
            </span>
            <a
              className="profile-button"
              href={appRoutes.settings}
              onClick={(event) => followLink(event, 'settings')}
            >
              <span className="tiny-avatar">
                <SparkBuddy small />
              </span>
              <span>
                <strong>{preferences.displayName || 'Your training space'}</strong>
                <small>Level {rewards.level} · Building momentum</small>
              </span>
              <ChevronRight size={14} />
            </a>
          </div>
        </aside>
        <div className="app-main">
          <header className="app-topbar">
            <button
              className="brand mobile-brand"
              aria-label="Fitt home"
              onClick={() => navigate('today')}
            >
              <FMark />
              <span>
                fitt<span className="brand-dot">.</span>
              </span>
            </button>
            <div className="breadcrumbs">
              Your training space
              <ChevronRight size={13} />
              <strong>
                {page === 'builder'
                  ? 'Create workout'
                  : navigationItems.find((item) => item.id === page)?.label}
              </strong>
            </div>
            <div className="topbar-right">
              {!pwa.online && (
                <span className="offline-pill">
                  <WifiOff size={13} />
                  Offline
                </span>
              )}
              <button
                className="xp-chip"
                onClick={() => navigate('journey')}
                aria-label={`${rewards.xp} XP. View your journey`}
              >
                <Zap size={16} fill="currentColor" />
                {rewards.xp.toLocaleString()} XP
              </button>
              <button
                className="avatar-button"
                onClick={() => navigate('settings')}
                aria-label="Open settings"
              >
                <SparkBuddy small />
              </button>
            </div>
          </header>
          {storageError && (
            <div className="state-banner warning" role="alert">
              <div>
                <strong>Your progress needs a backup.</strong>
                <p>{storageError}</p>
              </div>
              <Button variant="secondary" onClick={exportBackup}>
                Export current progress
              </Button>
              {recoveryRaw && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    download(recoveryRaw, `fitt-original-data-${localDay(new Date())}.json`)
                  }
                >
                  Download original data
                </Button>
              )}
            </div>
          )}
          {store.account.user &&
            ['conflict', 'expired', 'error'].includes(store.account.status) && (
              <div className="state-banner warning" role="status">
                <div>
                  <strong>
                    {store.account.status === 'conflict'
                      ? 'Choose which changes to keep.'
                      : store.account.status === 'expired'
                        ? 'Sign in again to sync your progress.'
                        : 'Your progress is waiting to sync.'}
                  </strong>
                  <p>Your changes stay on this device while you resolve the account update.</p>
                </div>
                <Button variant="secondary" onClick={() => navigate('settings')}>
                  Review account
                </Button>
              </div>
            )}
          {pwa.needRefresh && (
            <div className="state-banner" role="status">
              <p id="app-update-message">
                A fresh version of Fitt is ready.{' '}
                {updateBlockedReason ||
                  (state.active ? 'Your workout is saved. Resume it after updating.' : '')}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!updateBlockedReason) pwa.update()
                }}
                disabled={!!updateBlockedReason}
                aria-describedby="app-update-message"
              >
                Update app
              </Button>
            </div>
          )}
          {pwa.pwaError && (
            <div className="state-banner" role="status">
              <p>{pwa.pwaError}</p>
            </div>
          )}
          <main id="main-content" tabIndex={-1} className="main-content">
            {page === 'workout' && state.active ? (
              <SessionView
                session={state.active}
                profile={state.profile}
                onDirtyChange={setSessionDirty}
                onChange={(active) => setState((previous) => ({ ...previous, active }))}
                onBack={() => navigate('today')}
                onFinish={() =>
                  doneSets(state.active!) < totalSets(state.active!)
                    ? setDialog({ type: 'finish' })
                    : finish()
                }
                onDiscard={() => setDialog({ type: 'discard' })}
                onSwap={(index) => setDialog({ type: 'swap', index, active: true })}
                onInfo={(id) => setDialog({ type: 'exercise', id })}
              />
            ) : page === 'workout' ? (
              <section className="panel workout-start" aria-labelledby="workout-start-title">
                <Dumbbell size={30} aria-hidden="true" />
                <p className="eyebrow">YOUR NEXT WORKOUT</p>
                <h1 id="workout-start-title">Ready when you are.</h1>
                <p>
                  {state.plan?.title} · {state.plan?.duration} minutes ·{' '}
                  {state.plan?.exercises.length} exercises
                </p>
                <Button onClick={() => start()}>Start my workout</Button>
                <Button variant="secondary" onClick={() => navigate('today')}>
                  Review my plan
                </Button>
              </section>
            ) : page === 'journey' ? (
              <JourneyView
                history={state.history}
                profile={state.profile}
                preferences={preferences}
                onTrain={() => navigate('today')}
                onSession={(session) => setDialog({ type: 'summary', session })}
                onAward={(id) => setDialog({ type: 'award', id })}
              />
            ) : page === 'library' ? (
              <LibraryView
                profile={state.profile}
                onInfo={(id) => setDialog({ type: 'exercise', id })}
              />
            ) : page === 'settings' ? (
              <SetupView
                accountPanel={
                  <AccountPanel account={store.account} onGoToWorkout={() => navigate('workout')} />
                }
                accountMode={!!store.account.user}
                profile={state.profile}
                active={!!state.active}
                onGoToWorkout={() => navigate('workout')}
                preferences={preferences}
                onChange={profileChange}
                onPreferences={(next) =>
                  setState((previous) => ({
                    ...previous,
                    preferences: { ...next, onboarded: true },
                  }))
                }
                onExport={exportBackup}
                onImport={importBackup}
                onReset={() => setDialog({ type: 'reset' })}
                onInstall={install}
                onHelp={() => setDialog({ type: 'how' })}
              />
            ) : page === 'admin' ? (
              admin.verified && store.account.user ? (
                <Suspense fallback={<p role="status">Opening your admin studio…</p>}>
                  <AdminView
                    key={store.account.user.id}
                    userId={store.account.user.id}
                    studio={pathname === appRoutes.adminComponents ? 'components' : 'form'}
                    onStudioChange={(studio) =>
                      changePath(
                        studio === 'components' ? appRoutes.adminComponents : appRoutes.admin,
                      )
                    }
                  />
                </Suspense>
              ) : (
                <p role="status">Checking admin access…</p>
              )
            ) : page === 'builder' ? (
              state.active ? (
                <section aria-label="Create workout">
                  <h1>One workout at a time.</h1>
                  <ActiveWorkoutNotice onGoToWorkout={() => navigate('workout')}>
                    Finish or discard your current workout before creating another one.
                  </ActiveWorkoutNotice>
                </section>
              ) : (
                <WorkoutBuilder
                  profile={state.profile}
                  history={state.history}
                  initial={builderInitial}
                  onSave={saveRoutine}
                  onCancel={() => {
                    setBuilderDirty(false)
                    showPage('today')
                  }}
                  onInfo={(id) => setDialog({ type: 'exercise', id })}
                  onDirtyChange={setBuilderDirty}
                />
              )
            ) : (
              <TodayView
                state={state}
                onProfile={profileChange}
                onStart={() => start()}
                onQuick={startQuick}
                onInfo={(id) => setDialog({ type: 'exercise', id })}
                onSwap={(index) => setDialog({ type: 'swap', index, active: false })}
                onSetup={() => navigate('settings')}
                onJourney={() => navigate('journey')}
                onCreate={() => create()}
                onEdit={create}
                onRoutine={startRoutine}
                onDeleteRoutine={(id) => setDialog({ type: 'delete-routine', id })}
                onRegenerate={() => {
                  setState((previous) => ({
                    ...previous,
                    plan: generateWorkout(
                      previous.profile,
                      previous.history,
                      1 + Math.floor(Math.random() * 3),
                    ),
                  }))
                  setToast('A fresh plan, using your equipment.')
                }}
                onDismissWelcome={() =>
                  setState((previous) => ({
                    ...previous,
                    preferences: { ...preferences, onboarded: true },
                  }))
                }
              />
            )}
            <footer className="app-footer">
              <span>
                <FMark />A little stronger. A little more you.
              </span>
              <button onClick={() => setDialog({ type: 'how' })}>
                {storageError
                  ? 'Session only · export to keep'
                  : store.account.user
                    ? store.account.status === 'synced'
                      ? 'Account up to date'
                      : 'Saved here · sync pending'
                    : pwa.offlineReady
                      ? 'Ready for offline training'
                      : 'Saved on this device'}
                <ShieldCheck size={13} />
              </button>
            </footer>
          </main>
          <nav
            className={`bottom-nav${admin.allowed ? ' has-admin' : ''}`}
            aria-label="Mobile navigation"
          >
            {navigationItems.map((item) => (
              <a
                key={item.id}
                className={activeNavigation === item.id ? 'active' : ''}
                href={appRoutes[item.id]}
                onClick={(event) => followLink(event, item.id)}
                aria-current={activeNavigation === item.id ? 'page' : undefined}
              >
                <item.icon size={21} />
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </div>
      {toast && (
        <div className="feedback-toast" role="status">
          <span>
            <Check size={17} />
          </span>
          <p>{toast}</p>
          {toastDestination && (
            <Button
              variant="secondary"
              onClick={() => {
                navigate(toastDestination)
                setToast('')
              }}
            >
              Go to workout
            </Button>
          )}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <AppDialogs
        dialog={dialog}
        state={state}
        storageError={storageError}
        accountMode={!!store.account.user}
        onClose={() => {
          setDialog(null)
          pendingNavigation.current = null
          pwa.dismissInstallHelp()
        }}
        onSwap={swap}
        onFinish={finish}
        onDiscard={discard}
        onReset={() => {
          clearSessionUI(state.active?.id)
          replaceState(emptyState())
          finishing.current = false
          showPage('today')
          setToast('A fresh start. Your training space has been reset.')
        }}
        onRestore={restore}
        onDeleteRoutine={(id) => {
          setState((previous) => ({
            ...previous,
            routines: (previous.routines || []).filter((routine) => routine.id !== id),
          }))
          setDialog(null)
          setToast('Saved workout removed.')
        }}
        onLeaveUnsaved={() => {
          setBuilderDirty(false)
          setSessionDirty(false)
          setDialog(null)
          const action = pendingNavigation.current
          pendingNavigation.current = null
          action?.()
        }}
        onJourney={() => navigate('journey')}
        onExport={exportBackup}
      />
    </BodyModelPreferenceProvider>
  )
}
