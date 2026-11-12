import { Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { BodyModel } from '../../lib/types'
import type { GuideMotion, PoseFrame, RodProp } from './contracts'
import {
  apply,
  bodyFrame,
  cycle,
  head,
  pitch,
  pivot,
  reachArm,
  sides,
  solveJoint,
  subtree,
  wrapGrip,
} from './full-body-rig'
import { band, rings } from './props'

/*
 * Horizontal pulls. Units are metres, y up; the athlete faces +z.
 *
 * Ring rows: a straight body pivots on planted heels. The rings sit where the
 * straight arms reach at the bottom, so the elbows start straight; the top
 * angle is solved so the chest arrives at the rings.
 *
 * Seated band row: legs straight on the floor, torso tall, a band looped
 * around the soles and pulled to the lower ribs.
 */
const upperArm = (side: string) => head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`))
const foreArm = (side: string) => head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
const elbowAt = (shoulder: Vector3, wrist: Vector3, pole: Vector3, side: string) =>
  solveJoint(shoulder, wrist, pole, upperArm(side), foreArm(side))
const degrees = (value: number) => (value * Math.PI) / 180

/** Rest-space heel contact the leaning body pivots on. */
const heel = new Vector3(0, -0.815, -0.045)
/** World position of the planted heels. */
const heelAt = new Vector3(0, 0, 0.55)
/** Body angle above the floor -> rotation of the standing rest pose about the heels. */
const lean = (angle: number) => pitch(angle - Math.PI / 2)
const shoulderAt = (angle: number, side: string) =>
  head(`upperarm01.${side}`).sub(heel).applyQuaternion(lean(angle)).add(heelAt)
/** Wrist joints sit this far from the ring centre: palm on the rim, below the ring. */
const palm = new Vector3(0, -0.085, 0)

interface RowGeometry {
  bottom: number
  top: number
  wrists: Record<'L' | 'R', Vector3>
}
/**
 * Places the wrists at straight-arm reach from the shoulders at the bottom
 * angle, angled slightly toward the feet, then finds the top angle at which
 * the shoulders come within `gap` of the hands.
 */
function rowGeometry(bottom: number, gap: number): RowGeometry {
  const wrists = {} as Record<'L' | 'R', Vector3>
  for (const [side, sign] of sides) {
    const shoulder = shoulderAt(bottom, side)
    const chest = new Vector3(0, 0, 1).applyQuaternion(lean(bottom))
    const up = new Vector3(0, 1, 0).applyQuaternion(lean(bottom))
    const reach = 0.995 * (upperArm(side) + foreArm(side))
    const direction = chest
      .multiplyScalar(Math.cos(degrees(28)))
      .addScaledVector(up, -Math.sin(degrees(28)))
      .add(new Vector3(sign * 0.12, 0, 0))
      .normalize()
    wrists[side] = shoulder.addScaledVector(direction, reach)
  }
  let low = bottom,
    high = bottom + degrees(40)
  for (let step = 0; step < 50; step++) {
    const middle = (low + high) / 2
    if (shoulderAt(middle, 'L').distanceTo(wrists.L) > gap) low = middle
    else high = middle
  }
  return { bottom, top: low, wrists }
}

function ringRow(geometry: RowGeometry, progress: number) {
  const { depth } = cycle(progress)
  const angle = geometry.bottom + (geometry.top - geometry.bottom) * depth
  const rotation = lean(angle)
  const frame = bodyFrame(new Vector3())
  const body = { original: heel, anchor: heelAt, rotation }
  subtree(frame, 'root', body)
  frame.transforms.set('body', body)
  const chest = new Vector3(0, 0, 1).applyQuaternion(rotation)
  const up = new Vector3(0, 1, 0).applyQuaternion(rotation)
  for (const [side, sign] of sides) {
    const shoulder = apply(body, head(`upperarm01.${side}`))
    const wrist = geometry.wrists[side]
    // Elbows travel back past the torso, toward the floor and slightly out.
    const pole = shoulder
      .clone()
      .addScaledVector(chest, -0.5)
      .addScaledVector(up, -0.35)
      .add(new Vector3(sign * 0.3, 0, 0))
    const elbow = elbowAt(shoulder, wrist, pole, side)
    // Neutral grip: thumbs toward the head, little fingers toward the feet.
    reachArm(frame, side, wrist, pole, {
      fingers: wrist.clone().sub(elbow).normalize(),
      pinky: up.clone().negate(),
    })
    wrapGrip(frame, side, 0.55)
    frame.knees.push(apply(body, head(`lowerleg01.${side}`)))
  }
  frame.alignment = [heelAt.clone(), apply(body, head('spine05')), apply(body, head('neck01'))]
  return frame
}

/** Seated band row: where the pelvis sits so each surface's seat and legs meet the floor. */
const seat: Record<BodyModel, Vector3> = {
  male: new Vector3(0, 0.023, -0.02),
  female: new Vector3(0, 0.053, -0.02),
}
const legsForward = pitch(-Math.PI / 2)
/** Rest-space outer edge of each sole at the arch, where the band wraps. */
const soleEdge = (sign: number) => new Vector3(sign * 0.285, -0.821, 0.05)

function bandRow(progress: number, model: BodyModel = 'male'): PoseFrame {
  const { depth } = cycle(progress)
  const frame = bodyFrame(seat[model])
  const body = frame.transforms.get('body')!
  const feet: Vector3[] = []
  for (const [side, sign] of sides) {
    const leg = pivot(frame, `upperleg01.${side}`, legsForward)
    frame.knees.push(apply(leg, head(`lowerleg01.${side}`)))
    feet.push(apply(leg, soleEdge(sign)))
  }
  const rods: RodProp[] = [band(feet[0], feet[1])]
  sides.forEach(([side, sign], index) => {
    const shoulder = apply(body, head(`upperarm01.${side}`))
    const reach = shoulder.clone().add(new Vector3(sign * 0.03, -0.17, 0.4))
    const squeeze = shoulder.clone().add(new Vector3(sign * 0.06, -0.26, 0.1))
    const wrist = reach.lerp(squeeze, depth)
    const pole = shoulder.clone().add(new Vector3(sign * 0.25, -0.2, -0.4))
    const elbow = elbowAt(shoulder, wrist, pole, side)
    // Neutral grip on the band ends: thumbs up.
    reachArm(frame, side, wrist, pole, {
      fingers: wrist.clone().sub(elbow).normalize(),
      pinky: new Vector3(0, -1, 0),
    })
    wrapGrip(frame, side, 0.6)
    const grip = apply(frame.transforms.get(`wrist.${side}`)!, head(`finger3-1.${side}`))
    rods.push(band(feet[index], grip))
  })
  frame.rods = rods
  frame.alignment = [apply(body, head('root')), apply(body, head('neck01'))]
  return frame
}

const ringRowGeometry = rowGeometry(degrees(45), 0.2)
const lowRingRowGeometry = rowGeometry(degrees(22), 0.2)
const ringCentre = (geometry: RowGeometry) => geometry.wrists.L.clone().sub(palm)
const ringStage = (geometry: RowGeometry) => {
  const centre = ringCentre(geometry)
  return rings(centre.z, centre.y, centre.x, 2.6)
}

const pullPhases = ['Set up', 'Pull', 'Squeeze', 'Release'] as const
const scripts: Record<
  string,
  {
    sample: (progress: number, model?: BodyModel) => PoseFrame
    keyframes: GuideMotion['keyframes']
    cues: readonly string[]
    stage: NonNullable<GuideMotion['stage']>
  }
> = {
  'band-row': {
    sample: bandRow,
    keyframes: [
      { label: 'Arms long', progress: 0 },
      { label: 'Squeeze', progress: 0.53 },
      { label: 'Release slowly', progress: 0.79 },
    ],
    cues: [
      'Sit tall with the band around the middle of your shoes.',
      'Pull the ends toward your lower ribs. Lead with your elbows.',
      'Squeeze your shoulder blades. Stay tall.',
      'Release slowly. Keep the band away from your face.',
    ],
    stage: { target: [0, 0.45, 0.3], height: 1.5 },
  },
  'ring-row': {
    sample: (progress) => ringRow(ringRowGeometry, progress),
    keyframes: [
      { label: 'Straight arms', progress: 0 },
      { label: 'Chest to rings', progress: 0.53 },
      { label: 'Lower slowly', progress: 0.79 },
    ],
    cues: [
      'Hold the rings and lean back. Body straight, heels planted.',
      'Pull your chest toward the rings. Ribs down.',
      'Squeeze at the top. Elbows past your torso.',
      'Lower slowly to straight arms.',
    ],
    stage: { target: [0, 0.75, 0.05], height: 2.1, props: ringStage(ringRowGeometry) },
  },
  'low-ring-row': {
    sample: (progress) => ringRow(lowRingRowGeometry, progress),
    keyframes: [
      { label: 'Straight arms', progress: 0 },
      { label: 'Hands to ribs', progress: 0.53 },
      { label: 'Lower slowly', progress: 0.79 },
    ],
    cues: [
      'Lower rings, body closer to horizontal. Brace from heels to head.',
      'Pull until your hands reach your ribs.',
      'Squeeze at the top. Keep your hips up.',
      'Lower under control. Feet stay planted.',
    ],
    stage: { target: [0, 0.55, -0.15], height: 2.1, props: ringStage(lowRingRowGeometry) },
  },
}

export const rowMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
  id,
  name: byId[id].name,
  steps: byId[id].steps,
  seconds: 6.4,
  phases: pullPhases,
  keyframes: script.keyframes,
  regions: [
    { id: 'all', label: 'All' },
    ...byId[id].muscles.map((muscle) => {
      const label = muscle.replace('-', ' ')
      return { id: muscle, label: label[0].toUpperCase() + label.slice(1) }
    }),
  ],
  stage: script.stage,
  sample: script.sample,
  describe(progress) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: pullPhases[phase],
      cue: script.cues[phase],
      breath: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'][phase],
    }
  },
}))

/** Exposed for tests: ring centres and wrist targets per ring row. */
export const ringRowLayout = {
  'ring-row': { ...ringRowGeometry, ring: ringCentre(ringRowGeometry) },
  'low-ring-row': { ...lowRingRowGeometry, ring: ringCentre(lowRingRowGeometry) },
}
