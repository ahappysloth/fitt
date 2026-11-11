import { useEffect, useState } from 'react'

/**
 * The current time, refreshed at local midnight and when the page becomes
 * visible again, so calendars stay honest when the app stays open overnight.
 */
export function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      const date = new Date()
      setNow(date)
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      clearTimeout(timer)
      timer = setTimeout(refresh, midnight.getTime() - date.getTime() + 100)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}
