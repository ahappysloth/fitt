'use client'

import dynamic from 'next/dynamic'

const FittApp = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div className="app-loading" role="status" aria-live="polite">
      <svg viewBox="0 0 32 28" width="48" height="42" aria-hidden="true">
        <path fill="currentColor" d="M5 23V5h21v5H11v4h12v5H11v4z" />
      </svg>
      <p>Getting your training space ready…</p>
      <span className="app-loading-line" aria-hidden="true" />
    </div>
  ),
})

// Device storage is hydrated in the client app, never during server rendering.
export default function FittClient() {
  return <FittApp />
}
