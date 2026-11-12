import data from './body-data.json'
import type { Muscle } from '../../lib/types'

export const previewMuscleGroups = [
  { label: 'Upper body', muscles: ['chest', 'shoulders', 'biceps', 'triceps', 'forearms'] },
  { label: 'Trunk', muscles: ['upper-back', 'lower-back', 'core'] },
  { label: 'Lower body', muscles: ['quads', 'glutes', 'hamstrings', 'calves'] },
] as const satisfies ReadonlyArray<{ label: string; muscles: readonly Muscle[] }>

export const previewMuscles: readonly Muscle[] = previewMuscleGroups.flatMap(({ muscles }) => [
  ...muscles,
])

export const kneePushupMuscles: readonly Muscle[] = ['chest', 'triceps', 'shoulders']

type Point = readonly [number, number, number]
const head = (name: string) =>
  data.bones.find((bone) => bone.name === name)!.head as unknown as Point
const shoulder = head('upperarm01.L')
const elbow = head('lowerarm01.L')
const wrist = head('wrist.L')
const hip = head('upperleg01.L')
const knee = head('lowerleg01.L')
const ankle = head('foot.L')

function smoothstep(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

/** Approximate surface regions in the canonical bind pose, shared by every viewer.
 * The same vertex masks follow the skin through body-shape changes and animation.
 * These are visual regions, not segmented anatomical muscle meshes.
 */
export function muscleRegionWeights(x: number, y: number, z: number): Record<Muscle, number> {
  const ax = Math.abs(x)
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
    const radius = Math.sqrt(((ax - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2)
    return 1 - smoothstep(0.62, 1.08, radius)
  }
  // Orient limb regions along their real bone frames instead of world-axis blobs.
  const limb = (
    start: Point,
    end: Point,
    along: number,
    halfLength: number,
    width: number,
    depth: number,
    frontOffset: number,
  ) => {
    const dx = end[0] - start[0],
      dy = end[1] - start[1],
      dz = end[2] - start[2]
    const length = Math.hypot(dx, dy, dz)
    const ux = dx / length,
      uy = dy / length,
      uz = dz / length
    // Project the forward direction into the plane normal to the limb axis.
    const frontLength = Math.sqrt(1 - uz * uz)
    const fx = (-uz * ux) / frontLength,
      fy = (-uz * uy) / frontLength,
      fz = frontLength
    const sx = uy * fz - uz * fy,
      sy = uz * fx - ux * fz,
      sz = ux * fy - uy * fx
    const px = ax - start[0],
      py = y - start[1],
      pz = z - start[2]
    const longitudinal = (px * ux + py * uy + pz * uz) / length
    const side = px * sx + py * sy + pz * sz
    const front = px * fx + py * fy + pz * fz
    const radius = Math.sqrt(
      ((longitudinal - along) / halfLength) ** 2 +
        (side / width) ** 2 +
        ((front - frontOffset) / depth) ** 2,
    )
    return 1 - smoothstep(0.64, 1.1, radius)
  }

  return {
    chest: Math.max(
      ellipsoid(0.08, 0.425, 0.112, 0.09, 0.086, 0.07),
      ellipsoid(0.105, 0.482, 0.087, 0.065, 0.052, 0.047),
    ),
    shoulders: ellipsoid(0.185, 0.51, 0.017, 0.069, 0.071, 0.086),
    biceps: limb(shoulder, elbow, 0.53, 0.38, 0.057, 0.043, 0.04),
    triceps: limb(shoulder, elbow, 0.53, 0.41, 0.06, 0.042, -0.029),
    forearms: limb(elbow, wrist, 0.4, 0.5, 0.065, 0.06, 0),
    'upper-back': Math.max(
      ellipsoid(0.067, 0.447, -0.044, 0.095, 0.102, 0.037),
      ellipsoid(0.105, 0.347, -0.043, 0.071, 0.09, 0.043),
    ),
    'lower-back': ellipsoid(0.043, 0.225, -0.034, 0.08, 0.12, 0.042),
    core: Math.max(
      ellipsoid(0.035, 0.245, 0.143, 0.085, 0.145, 0.055),
      ellipsoid(0.115, 0.254, 0.047, 0.041, 0.109, 0.055),
    ),
    quads: limb(hip, knee, 0.46, 0.43, 0.087, 0.058, 0.059),
    glutes: ellipsoid(0.09, 0.072, -0.078, 0.105, 0.104, 0.063),
    hamstrings: limb(hip, knee, 0.48, 0.37, 0.081, 0.051, -0.044),
    calves: limb(knee, ankle, 0.45, 0.36, 0.062, 0.051, -0.039),
  }
}
