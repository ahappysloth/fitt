'use client'

import { useEffect, useState } from 'react'

interface AccessResult {
  userId: string
  allowed: boolean
  checking: boolean
}

/** UI discovery only: every private preview request is also authorized by the server. */
export function useAdminAccess(userId: string | null | undefined) {
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
        allowed: previous?.userId === userId && previous.allowed,
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
        if (live && !controller.signal.aborted) setResult({ userId, allowed, checking: false })
      } catch {
        if (live && !controller.signal.aborted)
          setResult({ userId, allowed: false, checking: false })
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
  }, [userId])
  return {
    // Never carry an affirmative role over a logout or account switch.
    allowed: !!userId && result?.userId === userId && result.allowed,
    checking: !!userId && (result?.userId !== userId || result.checking),
  }
}
