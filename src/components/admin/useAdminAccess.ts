'use client'

import { useEffect, useState } from 'react'

interface AccessResult {
  userId: string
  entryKey: string
  allowed: boolean
  verifiedForEntry: boolean
  checking: boolean
}

/** UI discovery only; direct admin requests are separately authorized by the Worker. */
export function useAdminAccess(userId: string | null | undefined, entryKey = '') {
  const [result, setResult] = useState<AccessResult | null>(null)
  useEffect(() => {
    if (!userId) return
    let live = true
    let pending: AbortController | undefined
    const check = async () => {
      pending?.abort()
      const controller = new AbortController()
      pending = controller
      setResult((previous) => ({
        userId,
        entryKey,
        allowed: previous?.userId === userId && previous.allowed,
        verifiedForEntry:
          previous?.userId === userId &&
          previous.entryKey === entryKey &&
          previous.verifiedForEntry,
        checking: true,
      }))
      try {
        const response = await fetch('/api/admin/access', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'X-Fitt-Account': userId },
          signal: controller.signal,
        })
        const data: unknown = response.ok ? await response.json() : null
        const allowed =
          !!data &&
          typeof data === 'object' &&
          'allowed' in data &&
          data.allowed === true &&
          'userId' in data &&
          data.userId === userId
        if (live && !controller.signal.aborted)
          setResult({ userId, entryKey, allowed, verifiedForEntry: allowed, checking: false })
      } catch {
        if (live && !controller.signal.aborted)
          setResult({ userId, entryKey, allowed: false, verifiedForEntry: false, checking: false })
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    void check()
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      live = false
      pending?.abort()
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [userId, entryKey])
  return {
    // Never carry an affirmative role over a logout or account switch.
    allowed: !!userId && result?.userId === userId && result.allowed,
    // A fresh route entry waits for verification. Routine focus refreshes keep
    // the already authorized playground mounted until a revocation is received.
    verified:
      !!userId &&
      result?.userId === userId &&
      result.entryKey === entryKey &&
      result.verifiedForEntry,
    checking:
      !!userId && (result?.userId !== userId || result.entryKey !== entryKey || result.checking),
  }
}
