import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { BodyModel } from '../../lib/types'
import type { GuideMotion, PoseFrame } from './contracts'
import { lieOnBack } from './bridges'
import {
  apply,
  bodyFrame,
  head,
  liftGirdle,
  pitch,
  pivot,
  reachArm,
  sides,
  solveJoint,
  subtree,
  type Side,
} from './full-body-rig'
import { ball, heelUp, plantLeg } from './lunges'

/*
 * Core drills. Units are metres, y up. The supine drills lie head toward -z
 * (lieOnBack); the plank faces the floor with its head toward +z.
 */
const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2
const armLength = (side: Side) =>
  head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)) +
  head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
const legLength = (side: Side) =>
  head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`)) +
  head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`))
const joint = (frame: PoseFrame, name: string) => apply(frame.transforms.get(name)!, head(name))

/** Timed holds: get into position, hold for most of the loop, release. */
export const holdPhases = ['Set up', 'Get into position', 'Hold', 'Release'] as const
export function holdCycle(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  return t < 0.08 || t >= 0.96
    ? { depth: 0, phase: 0 }
    : t < 0.32
      ? { depth: smooth((t - 0.08) / 0.24), phase: 1 }
      : t < 0.72
        ? { depth: 1, phase: 2 }
        : { depth: 1 - smooth((t - 0.72) / 0.24), phase: 3 }
}

/* Dead bug ----------------------------------------------------------------- */

const deadBugPhases = ['Tabletop', 'Extend', 'Return', 'Switch sides'] as const
/** One side, then the other: right arm with left leg, then left arm with right leg. */
export function deadBugCycle(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  // Each side: reach out over 22% of the loop, hold briefly, return over 22%.
  const reach = (start: number) =>
    t < start
      ? 0
      : t < start + 0.22
        ? smooth((t - start) / 0.22)
        : t < start + 0.26
          ? 1
          : 1 - smooth((t - start - 0.26) / 0.22)
  const first = reach(0.02),
    second = reach(0.52)
  const phase = t < 0.02 ? 0 : t < 0.28 ? 1 : t < 0.5 ? 2 : t < 0.52 ? 3 : t < 0.78 ? 1 : 2
  return { first, second, depth: Math.max(first, second), phase }
}

/** Arm from straight up (0) to overhead just off the floor (1), palms facing in. */
function deadBugArm(
  frame: PoseFrame,
  rotation: Quaternion,
  side: Side,
  sign: number,
  reach: number,
) {
  const angle = 1.52 * reach
  // The arm is raised the whole time (up at tabletop, overhead at full reach), so
  // the girdle stays raised; a ramped lift pinched the shoulder mid-sweep.
  liftGirdle(frame, side, rotation, 0.75)
  const shoulder = joint(frame, `upperarm01.${side}`)
  const direction = new Vector3(sign * 0.1, Math.cos(angle), -Math.sin(angle)).normalize()
  const wrist = shoulder.clone().addScaledVector(direction, 0.97 * armLength(side))
  reachArm(frame, side, wrist, shoulder.clone().add(new Vector3(sign * 0.5, 0, 0.4)), {
    fingers: direction,
    pinky: new Vector3(0, Math.sin(angle), Math.cos(angle)),
  })
}

/** Leg from tabletop (hip and knee at 90°) to long and hovering (1). */
function deadBugLeg(frame: PoseFrame, side: Side, reach: number) {
  const hip = joint(frame, `upperleg01.${side}`)
  const thigh = head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`))
  const shin = head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`))
  const tabletop = hip.clone().add(new Vector3(0, thigh, shin * 0.98))
  const lift = 0.1
  const long = hip
    .clone()
    .add(new Vector3(0, Math.sin(lift), Math.cos(lift)).multiplyScalar(0.985 * legLength(side)))
  const ankle = tabletop.lerp(long, reach)
  const knee = solveJoint(hip, ankle, hip.clone().add(new Vector3(0, 1, 0.6)), thigh, shin)
  subtree(frame, `upperleg01.${side}`, {
    original: head(`upperleg01.${side}`),
    anchor: hip,
    rotation: new Quaternion()
      .setFromUnitVectors(
        head(`lowerleg01.${side}`)
          .sub(head(`upperleg01.${side}`))
          .applyQuaternion(frame.transforms.get(`upperleg01.${side}`)!.rotation)
          .normalize(),
        knee.clone().sub(hip).normalize(),
      )
      .multiply(frame.transforms.get(`upperleg01.${side}`)!.rotation),
  })
  const upper = frame.transforms.get(`upperleg01.${side}`)!
  subtree(frame, `lowerleg01.${side}`, {
    original: head(`lowerleg01.${side}`),
    anchor: knee,
    rotation: new Quaternion()
      .setFromUnitVectors(
        head(`foot.${side}`)
          .sub(head(`lowerleg01.${side}`))
          .applyQuaternion(upper.rotation)
          .normalize(),
        ankle.clone().sub(knee).normalize(),
      )
      .multiply(upper.rotation),
  })
  frame.knees.push(knee)
}

export function deadBugPose(progress: number, model?: BodyModel) {
  const { first, second } = deadBugCycle(progress)
  const { frame, rotation } = lieOnBack(model)
  // First the right arm and left leg extend, then the left arm and right leg.
  deadBugArm(frame, rotation, 'L', 1, second)
  deadBugArm(frame, rotation, 'R', -1, first)
  deadBugLeg(frame, 'L', first)
  deadBugLeg(frame, 'R', second)
  frame.alignment = [joint(frame, 'neck01'), joint(frame, 'spine05')]
  return frame
}

/* Hollow body hold --------------------------------------------------------- */

const supine = pitch(-Math.PI / 2)
/** Hip angle that lays each body's straight legs on the floor before they lift. */
const legsDown: Record<BodyModel, number> = { male: -0.02, female: -0.06 }

export function hollowPose(progress: number, model?: BodyModel) {
  const { depth } = holdCycle(progress)
  const curl = 0.36 * depth
  const { frame, rotation, chest } = lieOnBack(model, 0, 0.12 * depth, curl)
  // Straight legs rise together from the hips; the lower back stays down. The
  // legs start flat on the floor whatever each body's resting tilt.
  const legs = pitch(-(legsDown[model ?? 'male'] + 0.42 * depth)).multiply(supine)
  for (const [side] of sides) {
    pivot(frame, `upperleg01.${side}`, legs)
    frame.knees.push(joint(frame, `lowerleg01.${side}`))
  }
  for (const [side, sign] of sides) {
    // Arms reach overhead in line with the lifted chest.
    liftGirdle(frame, side, chest.clone().multiply(rotation), 0.75)
    const shoulder = joint(frame, `upperarm01.${side}`)
    const direction = new Vector3(sign * 0.18, 0.06, -1).applyQuaternion(chest).normalize()
    const wrist = shoulder.clone().addScaledVector(direction, 0.96 * armLength(side))
    reachArm(frame, side, wrist, shoulder.clone().add(new Vector3(sign * 0.5, -0.2, 0)))
  }
  frame.alignment = [joint(frame, 'neck01'), joint(frame, 'spine05'), frame.knees[0]]
  return frame
}

/* Forearm plank ------------------------------------------------------------ */

const elbowHeight = 0.045
/** Wrists sit a little higher than the elbows so the palms rest on, not in, the floor. */
const wristHeight = 0.052
/** Toes tucked under, heels up: the foot's pitch about the ball. */
const tucked = 1.15
const upperArm = head('upperarm01.L').distanceTo(head('lowerarm01.L'))
const foreArm = head('lowerarm01.L').distanceTo(head('wrist.L'))
const shoulderMid = head('upperarm01.L').add(head('upperarm01.R')).multiplyScalar(0.5)
/** Shoulders stay stacked over the elbows, which rest on the floor. */
const plankShoulders = new Vector3(0, elbowHeight + upperArm, 0)
const bodyAt = (angle: number) => ({
  original: shoulderMid,
  anchor: plankShoulders,
  rotation: pitch(Math.PI / 2 - angle),
})
const ballOf = (angle: number, side: Side) => {
  const ankle = apply(bodyAt(angle), head(`foot.${side}`))
  return ankle.sub(head(`foot.${side}`).sub(ball(side)).applyQuaternion(pitch(tucked)))
}
/** Straight-body angle at which the balls of the feet reach the floor. */
const plankAngle = (() => {
  const floorBall = ball('L').y + 0.827
  let low = 0,
    high = Math.PI / 4
  for (let step = 0; step < 50; step++) {
    const middle = (low + high) / 2
    if (ballOf(middle, 'L').y > floorBall) low = middle
    else high = middle
  }
  return low
})()
const plankBalls = { L: ballOf(plankAngle, 'L'), R: ballOf(plankAngle, 'R') }
const kneeHeight = 0.06
/** Torso-and-thigh angle at which the knees, in line with the body, reach the floor. */
const kneelAngle = (() => {
  let low = plankAngle,
    high = Math.PI / 3
  for (let step = 0; step < 50; step++) {
    const middle = (low + high) / 2
    if (apply(bodyAt(middle), head('lowerleg01.L')).y > kneeHeight) low = middle
    else high = middle
  }
  return low
})()
/** Lying on the floor, pointed: the foot as in the prone drills. */
const flatFoot = pitch(Math.PI / 2 + 1.25)

export function plankPose(progress: number) {
  const { depth } = holdCycle(progress)
  // From the knees (shins and feet on the floor) up onto the toes in one straight line.
  const angle = kneelAngle + (plankAngle - kneelAngle) * depth
  const frame = bodyFrame(new Vector3())
  const body = bodyAt(angle)
  subtree(frame, 'root', body)
  frame.transforms.set('body', body)
  for (const [side, sign] of sides) {
    const kneelKnee = apply(bodyAt(kneelAngle), head(`lowerleg01.${side}`))
    const shin = head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`))
    const kneel = kneelKnee.clone().add(new Vector3(0, -0.012, -0.995 * shin))
    const { ankle: plankAnkle, rotation: plankFoot } = heelUp(side, plankBalls[side], tucked)
    const ankle = kneel.clone().lerp(plankAnkle, depth)
    // The foot swings up off the floor between the two positions.
    ankle.y += 0.06 * Math.sin(Math.PI * depth)
    const foot = flatFoot.clone().slerp(plankFoot, depth)
    plantLeg(frame, side, ankle, ankle.clone().add(new Vector3(0, -1, 0.4)), foot, depth > 0.5)
    // Arms forward of the torso: raise the girdle as the pull-up does overhead.
    liftGirdle(frame, side, body.rotation, 0.4)
    const shoulder = joint(frame, `upperarm01.${side}`)
    const elbow = new Vector3(shoulder.x, elbowHeight, shoulder.z)
    const fingers = new Vector3(-sign * 0.22, 0, 1).normalize()
    const flat = Math.sqrt(foreArm ** 2 - (wristHeight - elbowHeight) ** 2)
    const wrist = elbow.clone().addScaledVector(fingers, flat).setY(wristHeight)
    reachArm(frame, side, wrist, elbow, {
      fingers,
      pinky: new Vector3(0, 1, 0).cross(fingers).multiplyScalar(sign),
    })
  }
  frame.alignment = [joint(frame, 'neck01'), joint(frame, 'spine05'), plankBalls.L.clone()]
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
  deadbug: {
    sample: deadBugPose,
    phases: deadBugPhases,
    timeline: deadBugCycle,
    keyframes: [
      { label: 'Tabletop', progress: 0 },
      { label: 'Right arm, left leg', progress: 0.25 },
      { label: 'Left arm, right leg', progress: 0.75 },
    ],
    cues: [
      'Arms up, hips and knees at 90°. Lower back gently on the floor.',
      'Reach one arm back and the opposite leg long, just off the floor.',
      'Return slowly to tabletop.',
      'Switch sides. Move slowly and keep breathing.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Breathe in', 'Breathe in'],
    seconds: 8,
    // Front looks down from beyond the feet so the opposite arm and leg read.
    stage: { target: [0, 0.3, 0.15], height: 1.9, views: { front: [0, 1.7, 3.1] } },
  },
  'hollow-hold': {
    sample: hollowPose,
    phases: holdPhases,
    timeline: holdCycle,
    keyframes: [
      { label: 'Lower back down', progress: 0 },
      { label: 'Hollow hold', progress: 0.53 },
      { label: 'Release', progress: 0.87 },
    ],
    cues: [
      'Lie on your back and gently flatten your lower back to the floor.',
      'Lift your shoulders and legs. Reach your arms overhead.',
      'Hold. Keep your lower back down and breathe.',
      'Lower with control. Bend your knees to make it easier.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Breathe steadily', 'Breathe in'],
    seconds: 8,
    stage: { target: [0, 0.25, 0.05], height: 1.9 },
  },
  plank: {
    sample: plankPose,
    phases: holdPhases,
    timeline: holdCycle,
    keyframes: [
      { label: 'Knees down', progress: 0 },
      { label: 'Straight line', progress: 0.53 },
      { label: 'Release', progress: 0.87 },
    ],
    cues: [
      'Elbows under your shoulders, forearms on the floor.',
      'Lift your knees. Brace your core and glutes.',
      'Hold a straight line from head to heels. Breathe steadily.',
      'Lower your knees when your hips sag or you lose control.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Breathe steadily', 'Breathe in'],
    seconds: 8,
    stage: { target: [0, 0.3, -0.5], height: 1.7 },
  },
}

export const coreMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
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
