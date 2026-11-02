import routes from './app-routes.json'

export const appRoutes = routes
export type AppPage = Exclude<keyof typeof routes, 'adminComponents'>
export type NavigationBlocker = (proceed: () => void) => boolean
export interface NavigationOptions {
  replace?: boolean
  preserveSearch?: boolean
}
export interface AppNavigation {
  pathname: string
  navigate: (pathname: string, options?: NavigationOptions) => void
  setBlocker: (blocker: NavigationBlocker) => () => void
}

export function pageForPathname(pathname: string): AppPage | null {
  if (pathname === routes.adminComponents) return 'admin'
  const entry = Object.entries(routes).find(([, path]) => path === pathname)
  return (entry?.[0] as AppPage | undefined) ?? null
}

interface HistoryPosition {
  id: string
  index: number
}
interface PendingTraversal {
  target: HistoryPosition
  delta: number
  restoring: boolean
  replay: boolean
}

function readPosition(state: unknown): HistoryPosition | null {
  if (!state || typeof state !== 'object' || !('fittNavigation' in state)) return null
  const position = state.fittNavigation
  return position &&
    typeof position === 'object' &&
    'id' in position &&
    typeof position.id === 'string' &&
    'index' in position &&
    Number.isSafeInteger(position.index) &&
    Number(position.index) >= 0
    ? (position as HistoryPosition)
    : null
}

/**
 * Public views share one stateful client shell. Vinext's supported History API
 * integration updates its pathname hooks without fetching an RSC document, so
 * navigating a locally saved workout also works offline.
 *
 * The browser has already moved when popstate fires. A blocked traversal is
 * reversed before showing another view, then replayed only after confirmation.
 * Keeping the original entries preserves Back/Forward and the unsaved editor.
 */
export class BrowserNavigation {
  private pathname: string
  private readonly listeners = new Set<() => void>()
  private position: HistoryPosition | null = null
  private blocker: NavigationBlocker | null = null
  private pending: PendingTraversal | null = null
  private replayTarget: HistoryPosition | null = null
  private afterRestore: (() => void) | null = null

  constructor(initialPathname: string) {
    this.pathname = initialPathname
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.pathname

  setBlocker = (blocker: NavigationBlocker) => {
    this.blocker = blocker
    return () => {
      if (this.blocker === blocker) this.blocker = null
    }
  }

  start = () => {
    this.position = readPosition(history.state) ?? {
      id: Math.random().toString(36).slice(2),
      index: 0,
    }
    // Pass only our own state. Vinext preserves its metadata automatically;
    // copying it would classify this as an internal router write instead.
    history.replaceState({ fittNavigation: this.position }, '', location.href)
    this.commit(location.pathname)
    window.addEventListener('popstate', this.onPopState, { capture: true })
    return () => window.removeEventListener('popstate', this.onPopState, { capture: true })
  }

  navigate = (pathname: string, options: NavigationOptions = {}) => {
    if (!pageForPathname(pathname)) return
    // A dialog can be resolved before the browser has completed its reversal.
    // Replay is deferred by onPopState; ordinary navigation starts afterwards.
    if (this.pending?.restoring) {
      this.afterRestore = () => this.navigate(pathname, options)
      return
    }
    this.pending = null
    this.replayTarget = null
    const url = new URL(pathname, location.origin)
    if (options.preserveSearch) {
      url.search = location.search
      url.hash = location.hash
    }
    const current = this.position ??
      readPosition(history.state) ?? {
        id: Math.random().toString(36).slice(2),
        index: 0,
      }
    const replace = options.replace || url.href === location.href
    const next = { id: current.id, index: current.index + (replace ? 0 : 1) }
    history[replace ? 'replaceState' : 'pushState']({ fittNavigation: next }, '', url)
    this.position = next
    this.commit(url.pathname)
  }

  private commit(pathname: string) {
    if (pathname === this.pathname) return
    this.pathname = pathname
    for (const listener of this.listeners) listener()
  }

  private onPopState = (event: PopStateEvent) => {
    const target = readPosition(event.state)
    const current = this.position
    if (target && current && target.id === current.id) {
      const pending = this.pending
      if (pending?.restoring) {
        event.stopImmediatePropagation()
        if (target.index !== current.index) {
          history.go(current.index - target.index)
          return
        }
        pending.restoring = false
        if (this.afterRestore) {
          const navigate = this.afterRestore
          this.afterRestore = null
          navigate()
        } else if (pending.replay) this.replay(pending)
        return
      }
      if (this.replayTarget?.id === target.id && this.replayTarget.index === target.index) {
        this.replayTarget = null
      } else {
        const delta = target.index - current.index
        if (delta !== 0 && this.blocker) {
          const attempt: PendingTraversal = { target, delta, restoring: true, replay: false }
          if (
            this.blocker(() => {
              if (this.pending !== attempt) return
              if (attempt.restoring) attempt.replay = true
              else this.replay(attempt)
            })
          ) {
            this.pending = attempt
            event.stopImmediatePropagation()
            history.go(-delta)
            return
          }
        }
      }
      this.position = target
    }
    this.pending = null
    this.commit(location.pathname)
  }

  private replay(attempt: PendingTraversal) {
    this.pending = null
    this.replayTarget = attempt.target
    history.go(attempt.delta)
  }
}
