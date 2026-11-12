import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { BodyModel } from '../../lib/types'
import type { GuideMotion, PoseFrame, StageProp } from './contracts'
import { holdCycle, holdPhases } from './core'
import {
  apply,
  bodyFrame,
  cycle,
  head,
  liftGirdle,
  pitch,
  reachArm,
  sides,
  solveJoint,
  subtree,
  tail,
  wrapGrip,
  type Side,
} from './full-body-rig'
import { ball, heelUp, plantLeg } from './lunges'
import { parallettes } from './props'

/*
 * Shoulder and support drills. Units are metres, y up; the athlete faces +z.
 */
const armLength = (side: Side) =>
  head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)) +
  head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
const joint = (frame: PoseFrame, name: string) => apply(frame.transforms.get(name)!, head(name))
const palmDown = (sign: number) => ({
  fingers: new Vector3(0, 0, 1),
  pinky: new Vector3(sign, 0, 0),
})

/* Tuck support ------------------------------------------------------------- */

const gripHeight = 0.3
const gripHalfWidth = 0.2
/** Wrist joints sit above the grips, palms wrapped over the bars. */
const wristOverGrip = 0.075
const shoulderRest = head('upperarm01.L')
/** Straight arms stack the shoulders over the hands. */
const supportHeight = gripHeight + wristOverGrip + 0.995 * armLength('L')

export function tuckSupportPose(progress: number) {
  const { depth } = holdCycle(progress)
  const frame = bodyFrame(new Vector3(0, supportHeight - shoulderRest.y, -0.02))
  for (const [side, sign] of sides) {
    const hip = joint(frame, `upperleg01.${side}`)
    // From heels lightly on the floor in front to knees tucked to the chest.
    const supported = hip.clone().add(new Vector3(0, 0.082 - hip.y, 0.6))
    const tucked = hip.clone().add(new Vector3(0, -0.06, 0.16))
    const ankle = supported.lerp(tucked, depth)
    const foot = pitch(-0.45).slerp(pitch(0.85), depth)
    plantLeg(frame, side, ankle, hip.clone().add(new Vector3(0, 0.6, 1)), foot)
    const shoulder = joint(frame, `upperarm01.${side}`)
    const wrist = new Vector3(sign * gripHalfWidth, gripHeight + wristOverGrip, shoulder.z)
    // Neutral grip: palms in, fingers wrapping down over the bar, thumbs forward.
    reachArm(frame, side, wrist, shoulder.clone().add(new Vector3(sign * 0.3, 0, -0.4)), {
      fingers: new Vector3(-sign * 0.45, -1, 0).normalize(),
      pinky: new Vector3(0, 0, -1),
    })
    wrapGrip(frame, side, 0.5)
  }
  frame.alignment = [joint(frame, 'neck01'), joint(frame, 'spine05')]
  return frame
}

/* Wall slide --------------------------------------------------------------- */

const wallFace = -0.2
/** Each surface stands with its furthest-back point (upper back or glutes) on the wall. */
const standBack: Record<BodyModel, number> = { male: 0.1, female: 0.118 }
const wallSlab: StageProp[] = [
  {
    kind: 'box',
    center: [0, 1.2, wallFace - 0.06],
    size: [1.6, 2.4, 0.12],
    surface: true,
  },
]

export function wallSlidePose(progress: number, model: BodyModel = 'male') {
  const { depth } = cycle(progress)
  const frame = bodyFrame(new Vector3(0, 0.827, wallFace + standBack[model]))
  for (const [side, sign] of sides) {
    liftGirdle(frame, side, new Quaternion(), 0.2 + 0.55 * depth)
    const shoulder = joint(frame, `upperarm01.${side}`)
    const upper = head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`))
    const lower = head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
    // Goalpost (upper arms out, forearms up) to a Y overhead, close to the wall.
    const goalpost = shoulder.clone().add(new Vector3(sign * upper * 0.99, lower * 0.97, -0.03))
    const angle = (26 * Math.PI) / 180
    const overhead = shoulder
      .clone()
      .add(
        new Vector3(sign * Math.sin(angle), Math.cos(angle), -0.06).multiplyScalar(
          0.97 * armLength(side),
        ),
      )
    const wrist = goalpost.lerp(overhead, depth)
    const pole = shoulder.clone().add(new Vector3(sign * 0.6, -0.35, -0.05))
    const elbow = solveJoint(shoulder, wrist, pole, upper, lower)
    // Palms forward, the backs of the hands toward the wall.
    reachArm(frame, side, wrist, pole, {
      fingers: wrist.clone().sub(elbow).normalize(),
      pinky: new Vector3(sign, 0, 0),
    })
  }
  frame.alignment = [joint(frame, 'spine05'), joint(frame, 'neck01')]
  return frame
}

/* Pike push-up ------------------------------------------------------------- */

/** Arms reach overhead relative to the inverted torso, so the girdle rises. */
const pikeGirdle = 0.85
const handHeight = 0.052
const hands = { L: new Vector3(0.2, handHeight, 0), R: new Vector3(-0.2, handHeight, 0) }
const hipRest = head('upperleg01.L').add(head('upperleg01.R')).multiplyScalar(0.5)
/** Hips high and back: an inverted V with the feet on their balls. */
const hipsAt = new Vector3(0, 0.78, -0.32)
const feetLift = 0.7
const ballsAt = (side: Side, sign: number) => new Vector3(sign * 0.12, ball(side).y + 0.827, -0.7)
const torsoAt = (angle: number) => ({ original: hipRest, anchor: hipsAt, rotation: pitch(angle) })
/** The torso at `angle` with the girdle raised as the motion raises it. */
function pikeTorso(angle: number) {
  const frame = bodyFrame(new Vector3())
  const body = torsoAt(angle)
  subtree(frame, 'root', body)
  for (const [side] of sides) liftGirdle(frame, side, body.rotation, pikeGirdle)
  return frame
}
/** Bisects the torso angle (rest-up turned head-down) until `above(frame)` turns false. */
function torsoWhere(above: (frame: PoseFrame) => boolean) {
  let low = Math.PI / 2,
    high = Math.PI
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2
    if (above(pikeTorso(middle))) low = middle
    else high = middle
  }
  return low
}
/** Top: straight arms. Bottom: the top of the head just above the floor. */
const pikeTop = torsoWhere(
  (frame) => joint(frame, 'upperarm01.L').distanceTo(hands.L) > 0.995 * armLength('L'),
)
const pikeBottom = torsoWhere(
  (frame) => apply(frame.transforms.get('head')!, tail('head')).y > 0.075,
)

export function pikePushupPose(progress: number) {
  const { depth } = cycle(progress)
  const frame = bodyFrame(new Vector3())
  const body = torsoAt(pikeTop + (pikeBottom - pikeTop) * depth)
  subtree(frame, 'root', body)
  frame.transforms.set('body', body)
  for (const [side, sign] of sides) {
    const { ankle, rotation } = heelUp(side, ballsAt(side, sign), feetLift)
    plantLeg(frame, side, ankle, ankle.clone().add(new Vector3(0, 0.3, 1)), rotation, true)
    liftGirdle(frame, side, body.rotation, pikeGirdle)
    const shoulder = joint(frame, `upperarm01.${side}`)
    // Elbows travel back toward the feet at about 45 degrees.
    const pole = shoulder.clone().add(new Vector3(sign * 0.3, 0.2, -0.5))
    reachArm(frame, side, hands[side], pole, palmDown(sign))
  }
  frame.alignment = [joint(frame, 'neck01'), hipsAt.clone()]
  return frame
}

const scripts: Record<
  string,
  {
    sample: (progress: number, model?: BodyModel) => PoseFrame
    phases: readonly string[]
    timeline: (progress: number) => { depth: number; phase: number }
    keyframes: GuideMotion['keyframes']
    cues: readonly string[]
    breaths: readonly string[]
    seconds: number
    stage: NonNullable<GuideMotion['stage']>
  }
> = {
  'tuck-support': {
    sample: tuckSupportPose,
    phases: holdPhases,
    timeline: holdCycle,
    keyframes: [
      { label: 'Heels down', progress: 0 },
      { label: 'Knees tucked', progress: 0.53 },
      { label: 'Release', progress: 0.87 },
    ],
    cues: [
      'Grip the parallettes beside your hips with straight arms.',
      'Press down, lift your hips and tuck your knees toward your chest.',
      'Hold. Push the bars away and keep your shoulders down.',
      'Lower your feet. Keep them lightly supported if needed.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Breathe steadily', 'Breathe in'],
    seconds: 8,
    stage: {
      target: [0, 0.7, 0.15],
      height: 1.7,
      props: parallettes(0, gripHalfWidth, gripHeight),
    },
  },
  'wall-slide': {
    sample: wallSlidePose,
    phases: ['Goalpost', 'Slide up', 'Pause', 'Slide down'],
    timeline: cycle,
    keyframes: [
      { label: 'Goalpost', progress: 0 },
      { label: 'Arms overhead', progress: 0.53 },
      { label: 'Slide down', progress: 0.79 },
    ],
    cues: [
      'Back against the wall, arms bent like a goalpost.',
      'Slide your arms overhead. Keep your ribs down.',
      'Pause in a comfortable range. No forcing.',
      'Slide back down slowly to the goalpost.',
    ],
    breaths: ['Get ready', 'Breathe in', 'Stay tall', 'Breathe out'],
    seconds: 6.4,
    stage: { target: [0, 1.05, 0], height: 2.1, props: wallSlab },
  },
  'pike-pushup': {
    sample: pikePushupPose,
    phases: ['Set up', 'Lower', 'Pause', 'Press'],
    timeline: cycle,
    keyframes: [
      { label: 'Hips high', progress: 0 },
      { label: 'Head toward floor', progress: 0.53 },
      { label: 'Press up', progress: 0.79 },
    ],
    cues: [
      'Hands on the floor, hips high in an upside-down V.',
      'Bend your elbows and lower your head toward the floor in front of your hands.',
      'Pause just above the floor. Elbows back, not flared.',
      'Press back up to straight arms. Keep your hips high.',
    ],
    breaths: ['Get ready', 'Breathe in', 'Stay braced', 'Breathe out'],
    seconds: 6.4,
    stage: { target: [0, 0.5, -0.5], height: 1.8 },
  },
}

export const shoulderMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
  id,
  name: byId[id].name,
  steps: byId[id].steps,
  seconds: script.seconds,
  phases: script.phases,
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
    const { depth, phase } = script.timeline(progress)
    return {
      depth,
      phase: script.phases[phase],
      cue: script.cues[phase],
      breath: script.breaths[phase],
    }
  },
}))
