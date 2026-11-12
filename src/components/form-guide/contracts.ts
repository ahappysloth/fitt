import type { Quaternion, Vector3 } from 'three'
import type { Muscle } from '../../lib/types'

/** A rest-space anatomical segment mapped to a posed world-space frame. */
export interface RigTransform {
  original: Vector3
  anchor: Vector3
  rotation: Quaternion
}
export interface PoseFrame {
  transforms: Map<string, RigTransform>
  shoulders: Vector3[]
  elbows: Vector3[]
  wrists: Vector3[]
  knees: Vector3[]
  alignment: Vector3[]
}
export type FocusRegion = 'all' | Muscle

type Vec3 = readonly [number, number, number]
/** Primitive shapes the scene can draw; equipment is composed from these. */
export type StageProp =
  | { kind: 'box'; center: Vec3; size: Vec3; surface?: boolean }
  | { kind: 'rod'; from: Vec3; to: Vec3; radius?: number }
  | { kind: 'ring'; center: Vec3; radius?: number; tube?: number }

export interface GuideMotion {
  id: string
  name: string
  seconds: number
  steps: readonly string[]
  phases: readonly string[]
  keyframes: ReadonlyArray<{ label: string; progress: number }>
  regions: ReadonlyArray<{ id: FocusRegion; label: string }>
  /** Optional framing and props; omitted preserves the approved floor guide. */
  stage?: {
    target: readonly [number, number, number]
    height: number
    bar?: { center: readonly [number, number, number]; width: number; radius?: number }
    /** Equipment and surfaces, built from props.ts helpers. Metres; y up, athlete faces +z. */
    props?: readonly StageProp[]
  }
  sample(progress: number): PoseFrame
  describe(progress: number): { depth: number; phase: string; cue: string; breath: string }
}
