'use client'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="app-loading" role="alert">
      <h1>Let’s try that again.</h1>
      <p>Fitt couldn’t finish loading. Your saved workouts are still on this device.</p>
      <button className="app-retry" onClick={reset}>
        Try again
      </button>
    </main>
  )
}
