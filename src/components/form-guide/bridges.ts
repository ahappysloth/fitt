import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { BodyModel } from '../../lib/types'
import type { GuideMotion, PoseFrame } from './contracts'
import {
  apply,
  bodyFrame,
  cycle,
  head,
  limb,
  pitch,
  pivot,
  reachArm,
  sides,
  solveJoint,
  subtree,
  type Side,
} from './full-body-rig'

/*
 * Glute bridges, lying on the back with the head toward -z and the feet toward
 * +z. The body rotates about the upper back, which stays on the floor with the
 * head; feet stay flat and the arms rest on the floor beside the hips.
 */
const supine = pitch(-Math.PI / 2)
/**
 * Per surface fit. The body pivots on the upper back (`depth` and `height` place
 * that contact in rest space); `settle` tilts the resting body so the upper back
 * and the buttocks both touch the floor; `neck` extends the head onto the floor;
 * `lift` is the bridge angle at the top, so shoulders, hips and knees line up.
 */
const fit: Record<
  BodyModel,
  { depth: number; settle: number; height: number; neck: number; lift: number }
> = {
  male: { depth: -0.098, settle: -0.05, height: 0.5, neck: 0.25, lift: 0.48 },
  female: { depth: -0.061, settle: 0.097, height: 0.55, neck: 0.06, lift: 0.37 },
}
const upperBack = (model: BodyModel) => new Vector3(0, fit[model].height, fit[model].depth)
const ankleHeight = 0.0727
const feetZ = 0.82

const legLength = (side: Side) =>
  [
    head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`)),
    head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`)),
  ] as const

/** Wrists rest on the floor at 85% reach from the shoulders as each body lies at the bottom. */
function armRest(model: BodyModel, side: Side, sign: number) {
  const resting = pitch(-fit[model].settle).multiply(supine)
  const shoulder = head(`upperarm01.${side}`).sub(upperBack(model)).applyQuaternion(resting)
  const reach =
    0.85 *
    (head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)) +
      head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`)))
  const x = sign * 0.3,
    y = 0.055
  const along = Math.sqrt(reach ** 2 - (x - shoulder.x) ** 2 - (y - shoulder.y) ** 2)
  return new Vector3(x, y, shoulder.z + along)
}

/**
 * Lies the body on its back, head toward -z, fitted so each surface's upper back
 * and buttocks rest on the floor. `lift` raises the hips about the upper back and
 * `tuck` flexes the neck; `curl` lifts the chest; all in radians. Shared with
 * the supine core drills.
 */
export function lieOnBack(model: BodyModel = 'male', lift = 0, tuck = 0, curl = 0) {
  const rotation = pitch(-(fit[model].settle + lift)).multiply(supine)
  const frame = bodyFrame(new Vector3())
  const body = { original: upperBack(model), anchor: new Vector3(), rotation }
  subtree(frame, 'root', body)
  frame.transforms.set('body', body)
  // `curl` lifts the chest and shoulders off the floor about the mid back.
  const chest = pitch(curl)
  if (curl) pivot(frame, 'spine02', chest.clone().multiply(rotation))
  // The head stays flat on the floor whatever the hips do, and rides with a curl.
  pivot(
    frame,
    'neck01',
    chest
      .clone()
      .multiply(supine)
      .multiply(pitch(-fit[model].neck + tuck)),
  )
  return { frame, body, rotation, chest }
}

function bridge(progress: number, model: BodyModel = 'male', single = false): PoseFrame {
  const { depth } = cycle(progress)
  const lift = fit[model].lift * depth
  // A slight chin tuck at the top keeps the back of the head on the floor.
  const { frame, body, rotation } = lieOnBack(model, lift, 0.7 * lift)
  const hips: Vector3[] = []
  let thigh = new Vector3()
  for (const [side, sign] of sides) {
    const hip = apply(body, head(`upperleg01.${side}`))
    hips.push(hip)
    if (single && side === 'R') continue
    const ankle = new Vector3(sign * 0.13, ankleHeight, feetZ)
    const [upper, lower] = legLength(side)
    const knee = solveJoint(hip, ankle, ankle.clone().add(new Vector3(0, 1, 0.3)), upper, lower)
    limb(frame, `upperleg01.${side}`, `lowerleg01.${side}`, hip, knee)
    limb(frame, `lowerleg01.${side}`, `foot.${side}`, knee, ankle)
    subtree(frame, `foot.${side}`, {
      original: head(`foot.${side}`),
      anchor: ankle,
      rotation: new Quaternion(),
    })
    frame.knees.push(knee)
    thigh = knee.clone().sub(hip).normalize()
  }
  if (single) {
    // The free leg stays straight, held in line with the working thigh; hips stay level.
    const rest = head('lowerleg01.R').sub(head('upperleg01.R')).applyQuaternion(rotation)
    const leg = new Quaternion().setFromUnitVectors(rest.normalize(), thigh).multiply(rotation)
    subtree(frame, 'upperleg01.R', {
      original: head('upperleg01.R'),
      anchor: hips[1],
      rotation: leg,
    })
    frame.knees.push(apply(frame.transforms.get('lowerleg01.R')!, head('lowerleg01.R')))
  }
  for (const [side, sign] of sides) {
    // Arms long on the floor beside the hips, palms down.
    const wrist = armRest(model, side, sign)
    const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
    // Any elbow bend opens sideways along the floor rather than lifting.
    const pole = shoulder.clone().add(new Vector3(sign * 0.6, 0.04, 0.15))
    const fingers = new Vector3(0, 0, 1)
    reachArm(frame, side, wrist, pole, {
      fingers,
      pinky: new Vector3(sign, 0, 0),
    })
  }
  frame.alignment = [
    apply(body, head('neck01')),
    hips[0].clone().add(hips[1]).multiplyScalar(0.5),
    frame.knees[0],
  ]
  return frame
}

export const gluteBridgePose = (progress: number, model?: BodyModel) => bridge(progress, model)
export const singleLegBridgePose = (progress: number, model?: BodyModel) =>
  bridge(progress, model, true)

const scripts = {
  'glute-bridge': {
    sample: gluteBridgePose,
    keyframes: [
      { label: 'Feet flat', progress: 0 },
      { label: 'Hips up & squeeze', progress: 0.53 },
      { label: 'Lower slowly', progress: 0.79 },
    ],
    cues: [
      'Lie on your back, knees bent, feet flat and hip-width apart.',
      'Press through your heels and lift your hips.',
      'Squeeze your glutes. Shoulders, hips and knees in one line.',
      'Lower slowly without arching your lower back.',
    ],
  },
  'single-leg-bridge': {
    sample: singleLegBridgePose,
    keyframes: [
      { label: 'One foot lifted', progress: 0 },
      { label: 'Hips up, level', progress: 0.53 },
      { label: 'Lower slowly', progress: 0.79 },
    ],
    cues: [
      'Set up for a bridge and lift one foot, leg long.',
      'Push through the planted heel and lift your hips.',
      'Keep your pelvis level. Squeeze the working glute.',
      'Lower with control. Switch sides after your reps.',
    ],
  },
} as const

const phases = ['Set up', 'Lift', 'Squeeze', 'Lower'] as const
export const bridgeMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
  id,
  name: byId[id].name,
  steps: byId[id].steps,
  seconds: 6.4,
  phases,
  keyframes: script.keyframes,
  regions: [
    { id: 'all', label: 'All' },
    ...byId[id].muscles.map((muscle) => ({
      id: muscle,
      label: muscle[0].toUpperCase() + muscle.slice(1),
    })),
  ],
  // Front looks down from beyond the feet so the hip lift reads.
  stage: { target: [0, 0.25, 0.3], height: 1.7, views: { front: [0, 1.6, 3.1] } },
  sample: script.sample,
  describe(progress) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: phases[phase],
      cue: script.cues[phase],
      breath: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'][phase],
    }
  },
}))
