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

/**
 * A region's weight is a linear ramp through its outline: 0.5 on the outline,
 * rising to 1 `muscleRamp` metres inside and falling to 0 the same distance
 * outside. Triangles interpolate a linear ramp exactly, so the shader can draw
 * a clean outline on the coarse mesh by feathering only `muscleFeather` around
 * 0.5. Weights below the feather are never drawn.
 */
export const muscleRamp = 0.035
export const muscleFeather = [0.44, 0.56] as const

/**
 * Neighbouring groups overlap slightly and belong to different layers. The
 * shader draws a thin unlit seam where two selected layers meet, so a combined
 * highlight still reads as separate muscles. Groups in one layer never touch.
 */
export const muscleLayer: Record<Muscle, 0 | 1> = {
  chest: 0,
  biceps: 0,
  triceps: 0,
  forearms: 0,
  'upper-back': 0,
  core: 0,
  quads: 0,
  glutes: 0,
  calves: 0,
  shoulders: 1,
  'lower-back': 1,
  hamstrings: 1,
}

type Point = readonly [number, number, number]
const head = (name: string) =>
  data.bones.find((bone) => bone.name === name)!.head as unknown as Point
const shoulder = head('upperarm01.L')
const elbow = head('lowerarm01.L')
const wrist = head('wrist.L')
const hip = head('upperleg01.L')
const knee = head('lowerleg01.L')
const ankle = head('foot.L')

/** A limb's own frame: distance along it (0 at `start`, 1 at `end`), then metres to its
 * side and toward the body's front, so regions follow the bone instead of world axes. */
function limbFrame(start: Point, end: Point) {
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
  return (x: number, y: number, z: number) => {
    const px = x - start[0],
      py = y - start[1],
      pz = z - start[2]
    const along = px * ux + py * uy + pz * uz
    return {
      along: along / length,
      side: px * sx + py * sy + pz * sz,
      front: px * fx + py * fy + pz * fz,
      length,
    }
  }
}
const upperArm = limbFrame(shoulder, elbow)
const forearm = limbFrame(elbow, wrist)
const thigh = limbFrame(hip, knee)
const shin = limbFrame(knee, ankle)

/**
 * Signed distances in metres, positive inside. They are approximate away from
 * an outline, which is all the ramp needs.
 */
function ellipsoid(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
) {
  const radius = Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz)
  return (1 - radius) * Math.min(rx, ry, rz)
}
/** A rounded intersection: a plain minimum leaves a crease the mesh cannot follow. */
function both(a: number, b: number, blend = 0.02) {
  const h = Math.max(0, Math.min(1, 0.5 + (b - a) / (2 * blend)))
  return b + (a - b) * h - blend * h * (1 - h)
}
/** Depth of the canonical trunk's midline at each height, from its cross-sections. */
const trunkDepths = [
  [-0.02, 0.014],
  [0.1, 0.027],
  [0.18, 0.05],
  [0.3, 0.068],
  [0.42, 0.05],
  [0.5, 0.025],
  [0.58, 0.015],
] as const
function trunkMiddle(y: number) {
  for (let index = 1; index < trunkDepths.length; index++) {
    const [low, from] = trunkDepths[index - 1]
    const [high, to] = trunkDepths[index]
    if (y < high || index === trunkDepths.length - 1) {
      const t = Math.max(0, Math.min(1, (y - low) / (high - low)))
      return from + (to - from) * t
    }
  }
  return trunkDepths[0][1]
}
const either = (a: number, b: number, blend = 0.02) => -both(-a, -b, blend)
const weight = (distance: number) => Math.max(0, Math.min(1, 0.5 + distance / (2 * muscleRamp)))

/** Approximate surface regions in the canonical bind pose, shared by every viewer.
 * The same vertex masks follow the skin through body-shape changes and animation.
 * These are visual regions, not segmented anatomical muscle meshes.
 */
export function muscleRegionWeights(x: number, y: number, z: number): Record<Muscle, number> {
  const ax = Math.abs(x)
  const arm = upperArm(ax, y, z)
  const lower = forearm(ax, y, z)
  const leg = thigh(ax, y, z)
  const calf = shin(ax, y, z)
  // Distances from the outside of each limb's own cylinder, so a region can stop
  // at a height along the limb without bulging through the neighbouring surface.
  const span = (frame: { along: number; length: number }, from: number, to: number) =>
    both((frame.along - from) * frame.length, (to - frame.along) * frame.length, 0.015)
  // The trunk leans through the bind pose, so front and back are measured from
  // its own midline rather than from a fixed depth.
  const middle = trunkMiddle(y)
  const front = z - middle - 0.005
  const back = middle - 0.022 - z
  // The arms hang beside the trunk in the bind pose; trunk regions stop short of them.
  const clearOfArm = (from: number, radius: number) =>
    Math.hypot(arm.side, arm.front, Math.min(arm.along - from, 0) * arm.length) - radius

  // Pectorals: a fan from the sternum to the armpit, under the collarbone.
  const sternum = ax - 0.01
  const collarbone = 0.565 - 0.2 * ax - y
  const pectoral = both(
    both(ellipsoid(ax, y, z, 0.085, 0.452, 0.1, 0.115, 0.116, 0.13), front + 0.012),
    both(sternum, collarbone, 0.01),
  )

  // Deltoid: a cap over the joint that narrows to its insertion on the outer arm.
  const cap = ellipsoid(ax, y, z, 0.182, 0.512, 0.012, 0.075, 0.08, 0.085)
  const insertion = ellipsoid(arm.along, arm.side, arm.front, 0.2, -0.035, 0, 0.33, 0.065, 0.066)
  const deltoid = both(either(cap, insertion, 0.015), ax - 0.128 - 0.25 * (0.56 - y), 0.012)
  const chest = both(pectoral, clearOfArm(0.3, 0.058))

  // Upper arm: opposing front and back groups from below the deltoid to the elbow.
  const biceps = both(
    ellipsoid(arm.along, arm.side, arm.front, 0.54, 0, 0.036, 0.34, 0.062, 0.05),
    arm.front - 0.004,
    0.008,
  )
  const triceps = both(
    ellipsoid(arm.along, arm.side, arm.front, 0.52, 0, -0.03, 0.42, 0.064, 0.05),
    -0.012 - arm.front,
    0.008,
  )
  const forearms = ellipsoid(lower.along, lower.side, lower.front, 0.44, 0, 0, 0.42, 0.07, 0.066)

  // Back: trapezius and lats share one kite from the neck to a point above the
  // waist; the lumbar erectors continue it down to the pelvis.
  const trapezius = 0.6 - 0.42 * ax - y
  const latEdge = y - (0.215 + 0.95 * ax)
  const upperBack = both(both(both(trapezius, latEdge, 0.03), back), clearOfArm(0.12, 0.075))
  // The sacrum separates the glutes: their upper edge rises from the cleft to the hip.
  const sacrum = y - (0.075 + 0.85 * ax)
  const glutes = both(
    ellipsoid(ax, y, z, 0.09, 0.07, -0.075, 0.112, 0.118, 0.078),
    0.008 - sacrum,
    0.015,
  )
  const lowerBack = both(
    both(
      both(ellipsoid(ax, y, z, 0, 0.2, -0.03, 0.1, 0.15, 0.09), 0.01 - latEdge, 0.012),
      sacrum + 0.008,
      0.012,
    ),
    back,
  )

  // Abdomen and obliques: below the rib arch, down to the V above the hips.
  const ribs = 0.326 - 0.4 * ax - y
  const groin = y - (0.07 + 0.75 * ax)
  const core = both(both(ribs, groin, 0.03), front + 0.02)

  // Thigh: front and back groups from the hip crease to above the knee.
  const quads = both(
    both(
      ellipsoid(leg.along, leg.side, leg.front, 0.5, 0, 0.045, 0.47, 0.105, 0.085),
      leg.front - 0.012,
      0.012,
    ),
    span(leg, 0.1 + 1.2 * leg.side, 0.9),
    0.03,
  )
  const hamstrings = both(
    both(
      ellipsoid(leg.along, leg.side, leg.front, 0.52, 0, -0.045, 0.42, 0.098, 0.08),
      -0.02 - leg.front,
      0.012,
    ),
    span(leg, 0.12, 0.92),
    0.03,
  )
  const calves = both(
    ellipsoid(calf.along, calf.side, calf.front, 0.36, 0, -0.03, 0.36, 0.07, 0.062),
    -0.002 - calf.front,
    0.01,
  )

  // Regions never reach the head, hands or feet.
  const limit = Math.min(1, Math.max(0, (0.615 - y) / 0.02), Math.max(0, (y + 0.72) / 0.02))
  const bounded = (distance: number) => weight(distance) * limit
  return {
    chest: bounded(chest),
    shoulders: bounded(deltoid),
    biceps: bounded(biceps),
    triceps: bounded(triceps),
    forearms: bounded(forearms),
    'upper-back': bounded(upperBack),
    'lower-back': bounded(lowerBack),
    core: bounded(core),
    quads: bounded(quads),
    glutes: bounded(glutes),
    hamstrings: bounded(hamstrings),
    calves: bounded(calves),
  }
}
