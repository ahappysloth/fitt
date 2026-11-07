import { Layers2 } from 'lucide-react'
import { muscleNames } from '../../lib/catalog'
import type { Muscle } from '../../lib/types'
import { previewMuscleGroups, previewMuscles } from './muscle-regions'

export interface MusclePreviewState {
  enabled: boolean
  regions: readonly Muscle[]
  onEnabledChange(value: boolean): void
  onRegionsChange(value: readonly Muscle[]): void
}

export default function MusclePreviewControls({
  enabled,
  regions,
  onEnabledChange,
  onRegionsChange,
}: MusclePreviewState) {
  function toggle(muscle: Muscle) {
    onRegionsChange(
      regions.includes(muscle)
        ? regions.filter((region) => region !== muscle)
        : [...regions, muscle],
    )
  }
  return (
    <div id="muscle-preview" className="model-inspector__muscle-preview">
      <div className="model-inspector__muscle-heading">
        <div>
          <h3>Muscle preview</h3>
          <p>Try highlights in the standing model and animated guide.</p>
        </div>
        <button
          type="button"
          className="model-inspector__muscle-toggle"
          aria-label="Preview muscle groups"
          aria-pressed={enabled}
          aria-expanded={enabled}
          aria-controls={enabled ? 'muscle-preview-options' : undefined}
          onClick={() => onEnabledChange(!enabled)}
        >
          <Layers2 size={15} />
          {enabled ? 'On' : 'Off'}
          <span className="form-3d__switch" />
        </button>
      </div>
      {enabled && (
        <div id="muscle-preview-options" className="model-inspector__muscle-options">
          <div className="model-inspector__muscle-actions">
            <span aria-live="polite">
              {regions.length ? `${regions.length} selected` : 'No highlights'}
            </span>
            <div>
              <button
                type="button"
                disabled={regions.length === previewMuscles.length}
                onClick={() => onRegionsChange(previewMuscles)}
              >
                Select all
              </button>
              <button type="button" disabled={!regions.length} onClick={() => onRegionsChange([])}>
                Clear
              </button>
            </div>
          </div>
          {previewMuscleGroups.map(({ label, muscles }) => (
            <div
              key={label}
              className="model-inspector__muscle-group"
              role="group"
              aria-label={`${label} muscle highlights`}
            >
              <span>{label}</span>
              <div>
                {muscles.map((muscle) => (
                  <button
                    type="button"
                    key={muscle}
                    aria-pressed={regions.includes(muscle)}
                    onClick={() => toggle(muscle)}
                  >
                    <i aria-hidden="true" />
                    {muscleNames[muscle]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="model-inspector__muscle-footnote">
            <p>Surface highlights show approximate muscle regions.</p>
            <a href="#movement">View in motion</a>
          </div>
        </div>
      )}
    </div>
  )
}
