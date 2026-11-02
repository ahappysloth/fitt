'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Layers3,
  LoaderCircle,
  Monitor,
  Move3D,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { Button, Pill } from '../ui'
import './admin.css'

type Studio = 'form' | 'components'
interface Preview {
  key: string
  html?: string
  error?: string
}

export default function AdminView({ userId }: { userId: string }) {
  const [studio, setStudio] = useState<Studio>('form')
  const [mobile, setMobile] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [readyKey, setReadyKey] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const key = `${userId}:${studio}:${attempt}`
  const current = preview?.key === key ? preview : null
  const ready = readyKey === key

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/admin/previews/${studio}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'X-Fitt-Account': userId },
          signal: controller.signal,
        })
        if (!response.ok)
          throw new Error(
            response.status === 401 || response.status === 403
              ? 'Sign in with your authorized account to open this studio.'
              : 'The studio could not load. Try again when you’re online.',
          )
        if (!response.headers.get('content-type')?.includes('text/html'))
          throw new Error('The studio returned an unexpected response. Please try again.')
        const html = await response.text()
        if (!controller.signal.aborted) setPreview({ key, html })
      } catch (error) {
        if (!controller.signal.aborted)
          setPreview({
            key,
            error: error instanceof Error ? error.message : 'The studio could not load.',
          })
      }
    }
    void load()
    return () => controller.abort()
  }, [key, studio, userId])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null') return
      if (event.data?.type === 'fitt-admin-preview-ready' && event.data.kind === studio)
        setReadyKey(key)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [key, studio])

  return (
    <div className="admin-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN / THE WORKSHOP</p>
          <h1>
            A space to fine-tune Fitt<span className="greeting-dot">.</span>
          </h1>
          <p>Explore the movement. Try the details. Make it feel right.</p>
        </div>
        <Pill>
          <ShieldCheck size={14} aria-hidden="true" />
          Private studio
        </Pill>
      </div>
      <div className="admin-toolbar panel">
        <div className="admin-studios" role="group" aria-label="Admin studio">
          <button type="button" aria-pressed={studio === 'form'} onClick={() => setStudio('form')}>
            <Move3D size={17} aria-hidden="true" />
            Form studio
          </button>
          <button
            type="button"
            aria-pressed={studio === 'components'}
            onClick={() => setStudio('components')}
          >
            <Layers3 size={17} aria-hidden="true" />
            Components
          </button>
        </div>
        <div className="admin-preview-actions">
          {studio === 'components' && (
            <Button
              variant="secondary"
              disabled={!ready}
              onClick={() =>
                frame.current?.contentWindow?.postMessage(
                  { type: 'fitt-admin-preview', command: 'celebrate' },
                  '*',
                )
              }
            >
              <Sparkles size={16} aria-hidden="true" />
              Test celebration
            </Button>
          )}
          <Button
            variant="secondary"
            aria-pressed={mobile}
            onClick={() => setMobile((value) => !value)}
          >
            {mobile ? (
              <Monitor size={16} aria-hidden="true" />
            ) : (
              <Smartphone size={16} aria-hidden="true" />
            )}
            {mobile ? 'Desktop preview' : 'Preview mobile'}
          </Button>
        </div>
      </div>
      <p className="admin-demo-note">
        <ShieldCheck size={15} aria-hidden="true" />
        An isolated preview. Trying a workout or celebration here won’t change your progress.
      </p>
      <section
        className={`admin-preview-stage ${mobile ? 'is-mobile' : ''}`}
        aria-label={studio === 'form' ? 'Form studio preview' : 'Component playground preview'}
      >
        {!current && (
          <div className="admin-preview-state" role="status">
            <LoaderCircle size={24} className="admin-loading" aria-hidden="true" />
            <p>Opening your studio…</p>
          </div>
        )}
        {current?.error && (
          <div className="admin-preview-state" role="alert">
            <p>{current.error}</p>
            <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              <RotateCcw size={16} aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}
        {current?.html && (
          <iframe
            key={key}
            ref={frame}
            sandbox="allow-scripts"
            srcDoc={current.html}
            title={studio === 'form' ? 'Fitt form studio preview' : 'Fitt component preview'}
            className="admin-preview-frame"
            data-ready={ready}
          />
        )}
      </section>
    </div>
  )
}
