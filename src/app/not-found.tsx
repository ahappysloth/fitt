import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="app-loading">
      <h1>A fresh start is this way.</h1>
      <p>That page isn’t part of your training space.</p>
      <Link className="app-retry" href="/">
        Back to Fitt
      </Link>
    </main>
  )
}
