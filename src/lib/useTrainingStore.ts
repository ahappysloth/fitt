'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { TrainingManager } from './cloud/manager'
import { parseAuthCallback, type AuthCallback } from './cloud/callback'

export function useTrainingStore() {
  const ref = useRef<TrainingManager | null>(null)
  if (!ref.current) ref.current = new TrainingManager()
  const manager = ref.current
  const callback = useRef<AuthCallback | null | undefined>(undefined)
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot)

  useEffect(() => {
    // Keep the consumed result across Strict Mode's effect restart.
    if (callback.current === undefined) {
      callback.current = parseAuthCallback(location.href)
      if (callback.current) {
        try {
          history.replaceState(history.state, '', callback.current.cleanedUrl)
        } catch {
          /* A blocked history API must not prevent account recovery. */
        }
      }
    }
    manager.start(
      {
        storage: () => window.localStorage,
        request: (path, init) => fetch(path, init),
        online: () => navigator.onLine,
        origin: location.origin,
        redirect: (url) => location.assign(url),
        socket: (url) => new WebSocket(url),
        download: (raw, filename) => {
          const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
          const link = document.createElement('a')
          link.href = url
          link.download = filename
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        },
      },
      process.env.NEXT_PUBLIC_STANDALONE !== 'true',
      callback.current,
    )
    const storage = (event: StorageEvent) => manager.storageChanged(event.key)
    const visible = () => {
      if (document.visibilityState === 'visible') manager.wake()
    }
    window.addEventListener('storage', storage)
    window.addEventListener('online', manager.wake)
    window.addEventListener('offline', manager.wake)
    window.addEventListener('focus', manager.wake)
    document.addEventListener('visibilitychange', visible)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && manager.getSnapshot().account.user)
        manager.wake()
    }, 30_000)
    return () => {
      manager.stop()
      window.removeEventListener('storage', storage)
      window.removeEventListener('online', manager.wake)
      window.removeEventListener('offline', manager.wake)
      window.removeEventListener('focus', manager.wake)
      document.removeEventListener('visibilitychange', visible)
      clearInterval(poll)
    }
  }, [manager])

  return { ...snapshot, setState: manager.setState, replaceState: manager.replaceState }
}
