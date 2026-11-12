import { Vector3 } from 'three'
import type { BodyModel } from '../../lib/types'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import {
  apply,
  bodyFrame,
  cycle,
  head,
  liftGirdle,
  pitch,
  pivot,
  reachArm,
  sides,
  solveJoint,
  subtree,
} from './full-body-rig'

/*
 * Face-down floor drills. The body lies on its chest, hips and thighs with the
 * feet pointed so their tops rest on the floor; only the arms move. Units are
 * metres, y up; the athlete's head points along +z.
 */
const lying = pitch(Math.PI / 2)
/**
 * Per-surface fit, tuned so each body rests on the floor: `floor` is the
 * rest-space depth that becomes y = 0, and `tilt` raises the chest about the
 * thigh contact (the female surface rests on its breasts, which the shared
 * skeleton cannot compress).
 */
const fit: Record<BodyModel, { floor: number; tilt: number; hip: number; neck: number }> = {
  male: { floor: 0.142, tilt: 0, hip: 0.095, neck: 0.22 },
  female: { floor: 0.137, tilt: 0.075, hip: 0.075, neck: 0.08 },
}
/** Rest-space thigh contact the tilt pivots about. */
const thighContact = new Vector3(0, -0.3, 0.1)
/** Height of the wrist joints: palms hover a few centimetres off the floor. */
const handHeight = 0.075
/** Plantarflexion that lays the tops of the feet on the floor. */
const pointed = pitch(1.45)
const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2

function lie(model: BodyModel = 'male') {
  const { floor, tilt, hip, neck } = fit[model]
  const rotation = pitch(Math.PI / 2 - tilt)
  // Keep the thigh contact where the untilted body puts it.
  const anchor = thighContact
    .clone()
    .applyQuaternion(lying)
    .add(new Vector3(0, floor, 0))
    .sub(thighContact.clone().applyQuaternion(rotation))
  const frame = bodyFrame(new Vector3())
  const body = { original: new Vector3(), anchor, rotation }
  subtree(frame, 'root', body)
  frame.transforms.set('body', body)
  pivot(frame, 'neck01', rotation.clone().multiply(pitch(-neck)))
  for (const [side] of sides) {
    const leg = pivot(frame, `upperleg01.${side}`, rotation.clone().multiply(pitch(-hip)))
    pivot(frame, `foot.${side}`, leg.rotation.clone().multiply(pointed))
    frame.knees.push(apply(leg, head(`lowerleg01.${side}`)))
  }
  frame.alignment = [apply(body, head('spine05')), apply(body, head('neck01'))]
  return { frame, rotation }
}

/** Palm down, fingers continuing the forearm's line over the floor. */
function palmDown(wrist: Vector3, elbow: Vector3, sign: number) {
  const fingers = wrist.clone().sub(elbow).setY(0).normalize()
  return { fingers, pinky: new Vector3(0, 1, 0).cross(fingers).multiplyScalar(sign) }
}

/** Wrist position `reach` metres from the shoulder, `angle` from the head direction (+z). */
function around(shoulder: Vector3, sign: number, angle: number, reach: number) {
  const drop = shoulder.y - handHeight
  const flat = Math.sqrt(reach * reach - drop * drop)
  return new Vector3(
    shoulder.x + sign * Math.sin(angle) * flat,
    handHeight,
    shoulder.z + Math.cos(angle) * flat,
  )
}
const armLength = (side: string) =>
  head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)) +
  head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
const degrees = (value: number) => (value * Math.PI) / 180
const elbowFor = (shoulder: Vector3, wrist: Vector3, pole: Vector3, side: 'L' | 'R') =>
  solveJoint(
    shoulder,
    wrist,
    pole,
    head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)),
    head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`)),
  )

/** Y (arms overhead) to W (elbows pulled to the ribs, hands by the head). */
export function pulldownPose(progress: number, model?: BodyModel) {
  const { depth } = cycle(progress)
  const { frame, rotation } = lie(model)
  for (const [side, sign] of sides) {
    liftGirdle(frame, side, rotation, 0.75 * (1 - smooth(depth / 0.8)))
    const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
    const y = around(shoulder, sign, degrees(32), armLength(side) * 0.97)
    const w = new Vector3(shoulder.x + sign * 0.23, handHeight, shoulder.z - 0.01)
    const wrist = y.clone().lerp(w, depth)
    // Elbows travel down toward the ribs, out to the side and off the floor.
    const pole = shoulder.clone().add(new Vector3(sign * 0.3, 0.12, -0.8))
    reachArm(frame, side, wrist, pole, palmDown(wrist, elbowFor(shoulder, wrist, pole, side), sign))
  }
  return frame
}

/** Straight arms sweep from beside the hips to overhead, hovering off the floor. */
export function snowAngelPose(progress: number, model?: BodyModel) {
  const { depth } = cycle(progress)
  const { frame, rotation } = lie(model)
  const angle = degrees(168 - 140 * depth)
  for (const [side, sign] of sides) {
    // The girdle rises only once the arms pass shoulder height.
    liftGirdle(frame, side, rotation, 0.75 * smooth((degrees(95) - angle) / degrees(67)))
    const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
    const wrist = around(shoulder, sign, angle, armLength(side) * 0.97)
    // Soft elbows bend upward, away from the floor.
    const pole = shoulder.clone().add(new Vector3(0, 0.5, 0))
    reachArm(frame, side, wrist, pole, palmDown(wrist, elbowFor(shoulder, wrist, pole, side), sign))
  }
  return frame
}

const scripts = {
  'prone-pulldown': {
    sample: pulldownPose,
    phases: ['Reach', 'Pull down', 'Squeeze', 'Reach forward'],
    keyframes: [
      { label: 'Y: arms overhead', progress: 0 },
      { label: 'W: elbows to ribs', progress: 0.53 },
      { label: 'Reach forward', progress: 0.79 },
    ],
    cues: [
      'Reach your arms overhead in a Y. Lift your hands slightly.',
      'Pull your elbows down toward your ribs.',
      'Squeeze your shoulder blades together.',
      'Reach forward again. Keep your lower back quiet.',
    ],
  },
  'reverse-snow-angel': {
    sample: snowAngelPose,
    phases: ['Hands by hips', 'Sweep overhead', 'Pause', 'Sweep back'],
    keyframes: [
      { label: 'Hands by hips', progress: 0 },
      { label: 'Overhead', progress: 0.53 },
      { label: 'Sweep back', progress: 0.79 },
    ],
    cues: [
      'Lie face down. Lift your hands slightly beside your hips.',
      'Sweep your arms out and overhead in a wide arc.',
      'Pause overhead. Keep your neck long.',
      'Sweep back slowly to your hips.',
    ],
  },
} as const

export const proneMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
  id,
  name: byId[id].name,
  steps: byId[id].steps,
  seconds: 6.4,
  phases: script.phases,
  keyframes: script.keyframes,
  regions: [
    { id: 'all', label: 'All' },
    ...byId[id].muscles.map((muscle) => {
      const label = muscle.replace('-', ' ')
      return { id: muscle, label: label[0].toUpperCase() + label.slice(1) }
    }),
  ],
  // Front looks down from beyond the head so the arm paths over the floor read.
  stage: { target: [0, 0.1, 0.1], height: 2.1, views: { front: [0, 3.1, 2.1] } },
  sample: script.sample,
  describe(progress) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: script.phases[phase],
      cue: script.cues[phase],
      breath: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'][phase],
    }
  },
}))
