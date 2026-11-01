'use client'

import { useEffect, useRef, useState } from 'react'
import type { AppState } from './types'
import { loadState, saveState, STORAGE_KEY } from './storage'
import { emptyState, generateWorkout } from './workout'

export function useTrainingStore() {
  const [state, setState] = useState<AppState>(emptyState)
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null)
  const blockedRef = useRef(false)

  useEffect(() => {
    const loaded = loadState()
    setState({
      ...loaded.state,
      plan: loaded.state.plan || generateWorkout(loaded.state.profile, loaded.state.history),
    })
    blockedRef.current = !!loaded.error
    setBlocked(!!loaded.error)
    setStorageError(loaded.error)
    if (loaded.error) {
      try {
        setRecoveryRaw(localStorage.getItem(STORAGE_KEY))
      } catch {
        /* Session-only preview. */
      }
    }
    setReady(true)
    const conflict = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      blockedRef.current = true
      setBlocked(true)
      setStorageError(
        'Another tab changed your training data. Saving is paused. Export this session if needed, then reload to use the latest data.',
      )
    }
    window.addEventListener('storage', conflict)
    return () => window.removeEventListener('storage', conflict)
  }, [])

  useEffect(() => {
    if (ready && !blocked && !blockedRef.current) setStorageError(saveState(state))
  }, [state, ready, blocked])

  function replaceState(next: AppState) {
    // Only called after an explicit restore/reset confirmation in the UI.
    blockedRef.current = false
    setBlocked(false)
    setRecoveryRaw(null)
    setStorageError(null)
    setState({ ...next, plan: next.plan || generateWorkout(next.profile, next.history) })
  }

  return { state, setState, ready, blocked, storageError, recoveryRaw, replaceState }
}
