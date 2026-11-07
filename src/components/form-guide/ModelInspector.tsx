'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Maximize2,
  Minus,
  Move3D,
  Plus,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import type { BodyModel } from '../../lib/types'
import {
  createModelInspectorScene,
  type InspectorView,
  type ModelInspectorScene,
} from './model-inspector-scene'
import MusclePreviewControls, { type MusclePreviewState } from './MusclePreviewControls'
import './model-inspector.css'

export default function ModelInspector({
  bodyModel,
  onBodyModelChange,
  musclePreview,
}: {
  bodyModel: BodyModel
  onBodyModelChange(value: BodyModel): void
  musclePreview: MusclePreviewState
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ModelInspectorScene | null>(null)
  const latestModel = useRef(bodyModel)
  latestModel.current = bodyModel
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [view, setView] = useState<InspectorView | 'custom'>('angle')
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    if (!host.current) return
    if (!('IntersectionObserver' in window)) {
      setActive(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px' },
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!active || !host.current) return
    try {
      scene.current = createModelInspectorScene(
        host.current,
        latestModel.current,
        (nextView, nextZoom) => {
          setView(nextView)
          setZoom(nextZoom)
        },
        () => {
          setUnavailable(true)
          setReady(false)
        },
      )
      setReady(true)
    } catch {
      setUnavailable(true)
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [active])
  useEffect(() => {
    scene.current?.model(bodyModel)
  }, [bodyModel])
  useEffect(() => {
    scene.current?.highlight(musclePreview.enabled ? musclePreview.regions : [])
  }, [musclePreview.enabled, musclePreview.regions, ready])
  useEffect(() => {
    if (unavailable) {
      scene.current?.dispose()
      scene.current = null
    }
  }, [unavailable])

  return (
    <section
      id="model-inspector"
      className="model-inspector"
      aria-labelledby="model-inspector-title"
      data-ready={ready && !unavailable}
      data-model={bodyModel}
      data-muscle-preview={musclePreview.enabled}
      data-highlighted-muscles={musclePreview.enabled ? musclePreview.regions.join(',') : ''}
    >
      <div className="form-study__section-title">
        <div>
          <p className="eyebrow">A CLOSER LOOK</p>
          <h2 id="model-inspector-title">Meet your model.</h2>
        </div>
        <span>
          STANDING STUDY <Move3D size={14} />
        </span>
      </div>
      <p className="model-inspector__intro">
        Explore the male and female models in a relaxed standing pose. Turn, move, and get closer to
        see every detail.
      </p>
      <div className="model-inspector__studio">
        <div className="model-inspector__topbar">
          <span>BODY MODEL</span>
          <div className="model-inspector__segments" role="group" aria-label="Inspector body model">
            {(['male', 'female'] as const).map((model) => (
              <button
                type="button"
                key={model}
                aria-pressed={bodyModel === model}
                onClick={() => onBodyModelChange(model)}
              >
                {model === 'male' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
        </div>
        <div className="model-inspector__stage">
          <div ref={host} className="model-inspector__viewport" />
          {!ready && !unavailable && (
            <p className="model-inspector__message" role="status">
              Preparing your model…
            </p>
          )}
          {unavailable && (
            <p className="model-inspector__message" role="status">
              3D isn’t available in this browser. Open this preview in a browser with WebGL to
              explore the standing models.
            </p>
          )}
          {ready && !unavailable && (
            <div className="model-inspector__stage-note" aria-hidden="true">
              <i /> RELAXED STANCE<span>{zoom}%</span>
            </div>
          )}
        </div>
        <fieldset className="model-inspector__controls" disabled={!ready || unavailable}>
          <legend className="model-inspector__sr-only">Model inspection controls</legend>
          <MusclePreviewControls {...musclePreview} />
          <div className="model-inspector__row">
            <div
              className="model-inspector__segments"
              role="group"
              aria-label="Inspector camera view"
            >
              {(
                [
                  ['angle', '3/4 view'],
                  ['front', 'Front'],
                  ['side', 'Side'],
                  ['back', 'Back'],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  onClick={() => scene.current?.view(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="model-inspector__details"
              role="group"
              aria-label="Inspect model detail"
            >
              <button type="button" onClick={() => scene.current?.detail('body')}>
                <Maximize2 size={14} /> Full body
              </button>
              <button type="button" onClick={() => scene.current?.detail('head')}>
                Head
              </button>
              <button type="button" onClick={() => scene.current?.detail('feet')}>
                Feet
              </button>
            </div>
          </div>
          <div className="model-inspector__row model-inspector__navigation">
            <div className="model-inspector__tools">
              <div role="group" aria-label="Rotate inspector model">
                <button
                  type="button"
                  aria-label="Rotate inspector left"
                  onClick={() => scene.current?.rotate(-Math.PI / 8)}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Rotate inspector right"
                  onClick={() => scene.current?.rotate(Math.PI / 8)}
                >
                  <RotateCw size={16} />
                </button>
              </div>
              <div role="group" aria-label="Move inspector camera">
                <button
                  type="button"
                  aria-label="Move inspector camera left"
                  onClick={() => scene.current?.pan(-1, 0)}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Move inspector camera right"
                  onClick={() => scene.current?.pan(1, 0)}
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Move inspector camera up"
                  onClick={() => scene.current?.pan(0, 1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Move inspector camera down"
                  onClick={() => scene.current?.pan(0, -1)}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
              <div role="group" aria-label="Inspector zoom">
                <button
                  type="button"
                  aria-label="Zoom out from standing model"
                  onClick={() => scene.current?.zoom(1 / 1.25)}
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Zoom in on standing model"
                  onClick={() => scene.current?.zoom(1.25)}
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Reset inspector camera"
                  onClick={() => scene.current?.reset()}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </fieldset>
        <p id="model-inspector-help" className="model-inspector__help">
          Left-drag to rotate. Middle-drag or use two fingers to move. Scroll or pinch to zoom.{' '}
          <span>Keyboard: arrows rotate, Shift + arrows move, + / − zoom, Home resets.</span>
        </p>
      </div>
    </section>
  )
}
