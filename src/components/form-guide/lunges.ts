import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { BodyModel } from '../../lib/types'
import type { GuideMotion, PoseFrame, RigTransform } from './contracts'
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
import { bench } from './props'

/*
 * Split-stance leg drills. Units are metres, y up; the athlete faces +z. The
 * left leg leads; the right leg steps back (reverse lunge) or rests its instep
 * on a bench (Bulgarian split squat).
 */
/** Flat feet stand with their ankles here above their rest position (the squat's fit). */
const standing = 0.827
const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2
const toes = [1, 2, 3, 4, 5].map((toe) => `toe${toe}-1`)
/** Rest-space ball of the foot: the toe joints' line, on the sole. */
export const ball = (side: Side) => head(`toe3-1.${side}`).setX(head(`foot.${side}`).x)

/** Two-bone leg IK to a placed ankle, with the foot (and flat toes, if given) set in world space. */
export function plantLeg(
  frame: PoseFrame,
  side: Side,
  ankle: Vector3,
  pole: Vector3,
  foot: Quaternion,
  flatToes = false,
) {
  const hip = apply(frame.transforms.get(`upperleg01.${side}`)!, head(`upperleg01.${side}`))
  const knee = solveJoint(
    hip,
    ankle,
    pole,
    head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`)),
    head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`)),
  )
  limb(frame, `upperleg01.${side}`, `lowerleg01.${side}`, hip, knee)
  limb(frame, `lowerleg01.${side}`, `foot.${side}`, knee, ankle)
  const footTransform: RigTransform = {
    original: head(`foot.${side}`),
    anchor: ankle,
    rotation: foot,
  }
  subtree(frame, `foot.${side}`, footTransform)
  if (flatToes)
    for (const toe of toes) {
      const name = `${toe}.${side}`
      subtree(frame, name, {
        original: head(name),
        anchor: apply(footTransform, head(name)),
        rotation: new Quaternion(),
      })
    }
  frame.knees.push(knee)
  return knee
}

/** Arms hang relaxed beside the thighs, following the torso's lean. */
function relaxedArms(frame: PoseFrame, torso: RigTransform) {
  for (const [side, sign] of sides) {
    const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
    const hang = new Vector3(sign * 0.08, -0.43, 0.05).applyQuaternion(torso.rotation)
    const pole = new Vector3(sign * 0.15, -0.1, -0.4).applyQuaternion(torso.rotation)
    reachArm(frame, side, shoulder.clone().add(hang), shoulder.clone().add(pole))
  }
}

/** Ankle of a foot whose ball stays at `ballAt` while the heel lifts by `lift` radians. */
export function heelUp(side: Side, ballAt: Vector3, lift: number) {
  const rotation = pitch(lift)
  const offset = head(`foot.${side}`).sub(ball(side)).applyQuaternion(rotation)
  return { ankle: ballAt.clone().add(offset), rotation }
}

const front: Side = 'L'
const frontAnkle = head(`foot.${front}`).add(new Vector3(-0.09, standing, 0))

export function reverseLungePose(progress: number) {
  const { depth } = cycle(progress)
  // Pelvis descends and moves back as the rear foot travels; the step lands by 85%.
  const frame = bodyFrame(new Vector3(0, 0.817 - 0.37 * depth, -0.36 * depth))
  const torso = pivot(frame, 'spine05', pitch(0.12 * depth))
  plantLeg(
    frame,
    front,
    frontAnkle,
    frontAnkle.clone().add(new Vector3(0, 0.5, 1)),
    new Quaternion(),
  )
  const step = smooth(depth / 0.85)
  const start = ball('R').add(new Vector3(0.09, standing, 0))
  const ballAt = start.clone().lerp(new Vector3(start.x, start.y, -0.78), step)
  ballAt.y += 0.09 * Math.sin(Math.PI * Math.min(1, depth / 0.85))
  const { ankle, rotation } = heelUp('R', ballAt, 0.9 * smooth(depth / 0.5))
  plantLeg(frame, 'R', ankle, ankle.clone().add(new Vector3(0, -0.2, 1)), rotation, true)
  relaxedArms(frame, torso)
  frame.alignment = [
    apply(frame.transforms.get('root')!, head('spine05')),
    apply(torso, head('neck01')),
  ]
  return frame
}

/** Bulgarian split squat: front foot forward, rear instep on a bench behind. */
const splitFront = head(`foot.${front}`).add(new Vector3(-0.09, standing, 0.3))
const instep = pitch(2.55)
export const splitRear = new Vector3(-0.13, 0.47, -0.58)
/** The instep's lowest point with the rear ankle at `splitRear`: the bench top. */
export const benchTop = 0.408
export function splitSquatPose(progress: number) {
  const { depth } = cycle(progress)
  const frame = bodyFrame(new Vector3(0, 0.74 - 0.33 * depth, -0.01 - 0.11 * depth))
  const torso = pivot(frame, 'spine05', pitch(0.1 + 0.18 * depth))
  plantLeg(
    frame,
    front,
    splitFront,
    splitFront.clone().add(new Vector3(0, 0.5, 1)),
    new Quaternion(),
  )
  plantLeg(frame, 'R', splitRear, splitRear.clone().add(new Vector3(0, -0.6, 1)), instep)
  relaxedArms(frame, torso)
  frame.alignment = [
    apply(frame.transforms.get('root')!, head('spine05')),
    apply(torso, head('neck01')),
  ]
  return frame
}

const scripts: Record<
  string,
  {
    sample: (progress: number, model?: BodyModel) => PoseFrame
    phases: readonly string[]
    keyframes: GuideMotion['keyframes']
    cues: readonly string[]
    stage: NonNullable<GuideMotion['stage']>
  }
> = {
  'reverse-lunge': {
    sample: reverseLungePose,
    phases: ['Stand tall', 'Step back & lower', 'Pause', 'Drive up'],
    keyframes: [
      { label: 'Stand tall', progress: 0 },
      { label: 'Both knees bent', progress: 0.53 },
      { label: 'Step back in', progress: 0.79 },
    ],
    cues: [
      'Stand tall with your feet under your hips.',
      'Step one foot back and lower both knees.',
      'Pause with your back knee just off the floor. Front knee over your foot.',
      'Push through your front foot and step back in.',
    ],
    stage: { target: [0, 0.8, -0.3], height: 2 },
  },
  'split-squat': {
    sample: splitSquatPose,
    phases: ['Set up', 'Lower', 'Pause', 'Stand'],
    keyframes: [
      { label: 'Rear foot on bench', progress: 0 },
      { label: 'Lower & pause', progress: 0.53 },
      { label: 'Drive up', progress: 0.79 },
    ],
    cues: [
      'Rest the top of your back foot on the bench. Front foot flat.',
      'Bend your front knee and lower your back knee.',
      'Pause at a comfortable depth. Keep your front heel down.',
      'Drive through your front foot to stand.',
    ],
    stage: {
      target: [0, 0.8, -0.2],
      height: 2,
      props: bench([splitRear.x, benchTop, splitRear.z - 0.16], { width: 0.4, depth: 0.36 }),
    },
  },
}

export const lungeMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => ({
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
  stage: script.stage,
  sample: script.sample,
  describe(progress) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: script.phases[phase],
      cue: script.cues[phase],
      breath: ['Get ready', 'Breathe in', 'Stay braced', 'Breathe out'][phase],
    }
  },
}))
