'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'manual'

export function usePwa() {
  const [online, setOnline] = useState(true)
  const [offlineReady, setOfflineReady] = useState(false)
  const [needRefresh, setNeedRefresh] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installHelp, setInstallHelp] = useState(false)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [pwaError, setPwaError] = useState<string | null>(null)
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const requestedUpdate = useRef(false)

  useEffect(() => {
    let live = true
    const disposers: (() => void)[] = []
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const updateInstalled = () =>
      setInstalled(
        displayMode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
      )
    const onlineChanged = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) void registration.current?.update().catch(() => {})
    }
    const beforeInstall = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const appInstalled = () => {
      setInstalled(true)
      setPrompt(null)
      setInstallHelp(false)
    }
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void registration.current?.update().catch(() => {})
    }
    setOnline(navigator.onLine)
    updateInstalled()
    window.addEventListener('online', onlineChanged)
    window.addEventListener('offline', onlineChanged)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    document.addEventListener('visibilitychange', checkForUpdate)
    displayMode.addEventListener('change', updateInstalled)

    const canRegister =
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_STANDALONE !== 'true' &&
      /^https?:$/.test(window.location.protocol) &&
      window.isSecureContext &&
      'serviceWorker' in navigator
    let previousController = canRegister ? navigator.serviceWorker.controller : null

    const register = async () => {
      if (!canRegister || !live) return
      try {
        const sw = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
        if (!live) return
        registration.current = sw
        setNeedRefresh(!!sw.waiting)
        const trackInstalling = () => {
          const worker = sw.installing
          if (!worker) return
          const stateChanged = () => {
            if (!live) return
            if (worker.state === 'installed') {
              setPwaError(null)
              if (navigator.serviceWorker.controller) setNeedRefresh(true)
            }
            if (worker.state === 'redundant' && !sw.active)
              setPwaError('Offline setup couldn’t finish. Reopen Fitt when you’re online to retry.')
          }
          worker.addEventListener('statechange', stateChanged)
          disposers.push(() => worker.removeEventListener('statechange', stateChanged))
        }
        sw.addEventListener('updatefound', trackInstalling)
        disposers.push(() => sw.removeEventListener('updatefound', trackInstalling))
        trackInstalling()
        await navigator.serviceWorker.ready
        if (live) {
          setOfflineReady(true)
          setPwaError(null)
        }
      } catch {
        if (live)
          setPwaError('Offline setup couldn’t finish. Reopen Fitt when you’re online to retry.')
      }
    }
    const controllerChanged = () => {
      const hadController = !!previousController
      previousController = navigator.serviceWorker.controller
      if (requestedUpdate.current) {
        window.location.reload()
      } else if (hadController && previousController) {
        // Another tab can activate the update. Offer an explicit reload here,
        // preserving any work that this tab has not saved yet.
        setNeedRefresh(true)
      }
    }
    if (canRegister) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
      if (document.readyState === 'complete') void register()
      else window.addEventListener('load', register, { once: true })
    }
    return () => {
      live = false
      window.removeEventListener('online', onlineChanged)
      window.removeEventListener('offline', onlineChanged)
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
      window.removeEventListener('load', register)
      document.removeEventListener('visibilitychange', checkForUpdate)
      displayMode.removeEventListener('change', updateInstalled)
      if (canRegister)
        navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  const update = useCallback(() => {
    const current = registration.current
    if (!current) return
    const waiting = current.waiting
    if (!waiting) {
      // A sibling tab may already have activated this version. The current
      // document still needs to reload, even though there is no waiting worker.
      if (current.active) window.location.reload()
      return
    }
    requestedUpdate.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (!prompt) {
      setInstallHelp(true)
      return 'manual'
    }
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      setPrompt(null)
      return outcome
    } catch {
      setPrompt(null)
      setInstallHelp(true)
      return 'manual'
    }
  }, [prompt])

  const dismissInstallHelp = useCallback(() => setInstallHelp(false), [])

  return {
    online,
    offlineReady,
    needRefresh,
    canInstall: !!prompt,
    installed,
    installHelp,
    pwaError,
    install,
    update,
    dismissInstallHelp,
  }
}
