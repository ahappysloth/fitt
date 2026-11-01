'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers2,
  Maximize2,
  Minus,
  Move3D,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
} from 'lucide-react'
import type { FocusRegion } from './athlete'
import { kneePushupMotion } from './knee-pushup'
import type { GuideMotion } from './contracts'
import { createGuideScene, type CameraView, type GuideScene } from './scene'
import './form-guide.css'

export default function KneePushupGuide({ fallback }: { fallback?: ReactNode }) {
  return <FormGuide key={kneePushupMotion.id} motion={kneePushupMotion} fallback={fallback} />
}

export function FormGuide({ motion, fallback }: { motion: GuideMotion; fallback?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<GuideScene | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [view, setView] = useState<CameraView | 'custom'>('angle')
  const [muscles, setMuscles] = useState(true)
  const [region, setRegion] = useState<FocusRegion>('all')
  const [alignment, setAlignment] = useState(false)
  const movement = motion.describe(progress)
  useEffect(() => {
    if (!host.current) return
    try {
      scene.current = createGuideScene(
        host.current,
        motion,
        setProgress,
        () => setUnavailable(true),
        setView,
      )
      setReady(true)
    } catch {
      setUnavailable(true)
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [motion])
  useEffect(() => {
    scene.current?.play(playing)
  }, [playing])
  useEffect(() => {
    scene.current?.speed(speed)
  }, [speed])
  useEffect(() => {
    scene.current?.focus(muscles, region)
  }, [muscles, region])
  useEffect(() => {
    scene.current?.alignment(alignment)
  }, [alignment])
  useEffect(() => {
    if (unavailable) {
      scene.current?.dispose()
      scene.current = null
    }
  }, [unavailable])
  function seek(value: number) {
    setPlaying(false)
    scene.current?.seek(value)
  }
  function camera(value: CameraView) {
    setView(value)
    scene.current?.view(value)
  }
  if (unavailable)
    return (
      <div className="form-3d-fallback">
        <p>3D isn’t available in this browser. You can still follow the form guide.</p>
        {fallback || (
          <div className="form-3d-static">
            <h3>{motion.name}</h3>
            <ol>
              {motion.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    )
  return (
    <section className="form-3d" aria-label={`${motion.name} animated guide`} data-ready={ready}>
      <div className="form-3d__heading">
        <span>
          <span className="form-3d__live-dot" /> FORM STUDIO
        </span>
        <span className="form-3d__badge">
          <Move3D size={12} /> EXPLORE IN 3D
        </span>
      </div>
      <div className="form-3d__stage">
        <div className="form-3d__phase">
          <span>{String(motion.phases.indexOf(movement.phase) + 1).padStart(2, '0')}</span>
          <div>
            <strong>{movement.phase}</strong>
            <small>{movement.breath}</small>
          </div>
        </div>
        <div ref={host} className="form-3d__viewport" />
        {!ready && (
          <div className="form-3d__loading" role="status">
            Preparing your form guide…
          </div>
        )}
        <div className="form-3d__zoom" role="group" aria-label="Model zoom">
          <button
            type="button"
            aria-label="Zoom in on model"
            onClick={() => scene.current?.zoom(0.1)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            aria-label="Zoom out from model"
            onClick={() => scene.current?.zoom(-0.1)}
          >
            <Minus size={15} />
          </button>
          <button type="button" aria-label="Reset camera" onClick={() => camera('angle')}>
            <Maximize2 size={14} />
          </button>
        </div>
        <div className="form-3d__orbit-hint">
          <Move3D size={13} />
          <span>Drag to explore</span>
        </div>
      </div>
      <div className="form-3d__camera-row">
        <div role="group" aria-label="Camera view" className="form-3d__views">
          {(
            [
              ['angle', '3/4 view'],
              ['side', 'Side'],
              ['front', 'Front'],
            ] as const
          ).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={view === id} onClick={() => camera(id)}>
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Rotate model" className="form-3d__rotate">
          <button
            type="button"
            aria-label="Rotate model left"
            onClick={() => scene.current?.rotate(-Math.PI / 8)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Rotate model right"
            onClick={() => scene.current?.rotate(Math.PI / 8)}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div className="form-3d__coaching" aria-live="off">
        <span className="form-3d__cue-icon">
          <Check size={15} />
        </span>
        <p>{movement.cue}</p>
      </div>
      <div className="form-3d__playback">
        <div className="form-3d__transport">
          <button
            type="button"
            className="form-3d__play"
            disabled={!ready}
            aria-label={playing ? 'Pause animation' : 'Play animation'}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? (
              <Pause size={15} fill="currentColor" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            <span>{playing ? 'Pause' : 'Play guide'}</span>
          </button>
          <span className="form-3d__tempo">One controlled rep</span>
          <button
            type="button"
            className="form-3d__speed"
            aria-label={`Playback speed ${speed}x`}
            onClick={() => setSpeed(speed === 1 ? 0.5 : 1)}
          >
            {speed}×
          </button>
          <button
            type="button"
            className="form-3d__restart"
            aria-label="Restart animation"
            onClick={() => seek(0)}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <input
          aria-label="Movement progress"
          aria-valuetext={`${movement.phase}, ${Math.round(progress * 100)} percent through the rep`}
          type="range"
          min="0"
          max="100"
          step=".1"
          value={progress * 100}
          onChange={(event) => seek(Number(event.target.value) / 100)}
          style={{ '--form-progress': `${progress * 100}%` } as React.CSSProperties}
        />
        <div className="form-3d__keyframes">
          {motion.keyframes.map(({ label, progress }) => (
            <button type="button" key={label} onClick={() => seek(progress)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-3d__layers">
        <button type="button" aria-pressed={muscles} onClick={() => setMuscles(!muscles)}>
          <Layers2 size={15} />
          Muscle focus
          <span className="form-3d__switch" />
        </button>
        <button type="button" aria-pressed={alignment} onClick={() => setAlignment(!alignment)}>
          <ScanLine size={15} />
          Body line
          <span className="form-3d__switch" />
        </button>
      </div>
      {muscles && (
        <div className="form-3d__muscles" role="group" aria-label="Highlighted muscle region">
          {motion.regions.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              aria-pressed={region === id}
              onClick={() => setRegion(id)}
            >
              <i />
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="form-3d__note">
        Highlighted areas show muscle involvement, not activation intensity.
      </p>
    </section>
  )
}
