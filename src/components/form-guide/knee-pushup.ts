import * as THREE from 'three'
import { byId } from '../../lib/catalog'
import data from './body-data.json'
import type { PoseFrame, RigTransform, GuideMotion } from './contracts'

export type GuidePhase = 'Set up' | 'Lower' | 'Pause' | 'Press'
export const CYCLE_SECONDS = 6.4
const v = (values: number[]) => new THREE.Vector3(...(values as [number, number, number]))
const rest = new Map(
  data.bones.map((bone) => [bone.name, { head: v(bone.head), tail: v(bone.tail) }]),
)
const head = (name: string) => rest.get(name)!.head.clone()
const tail = (name: string) => rest.get(name)!.tail.clone()
const smooth = (t: number) => (1 - Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1))) / 2

export function movementAt(progress: number): {
  depth: number
  phase: GuidePhase
  cue: string
  breath: string
} {
  const t = THREE.MathUtils.clamp(progress, 0, 1)
  if (t < 0.08 || t >= 0.96)
    return {
      depth: 0,
      phase: 'Set up',
      cue: 'Brace your core. Knees, hips, and head in one line.',
      breath: 'Get ready',
    }
  if (t < 0.51)
    return {
      depth: smooth((t - 0.08) / 0.43),
      phase: 'Lower',
      cue: 'Lower with control. Let your elbows travel back.',
      breath: 'Breathe in',
    }
  if (t < 0.6)
    return {
      depth: 1,
      phase: 'Pause',
      cue: 'A brief pause. Keep your hips with your shoulders.',
      breath: 'Stay braced',
    }
  return {
    depth: 1 - smooth((t - 0.6) / 0.36),
    phase: 'Press',
    cue: 'Press the floor away. Rise as one straight line.',
    breath: 'Breathe out',
  }
}

/** Two-bone IK with a persistent pole, fixed endpoints, and constant segment lengths. */
export function solveElbow(
  shoulder: THREE.Vector3,
  wrist: THREE.Vector3,
  pole: THREE.Vector3,
  upper: number,
  lower: number,
) {
  const delta = wrist.clone().sub(shoulder)
  const distance = delta.length()
  if (distance > upper + lower || distance < Math.abs(upper - lower))
    throw new Error('Arm target is outside the rig reach.')
  const along = delta.normalize()
  const projection = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const perpendicular = pole
    .clone()
    .sub(shoulder)
    .addScaledVector(along, -pole.clone().sub(shoulder).dot(along))
    .normalize()
  return shoulder
    .clone()
    .addScaledVector(along, projection)
    .addScaledVector(perpendicular, Math.sqrt(Math.max(0, upper * upper - projection * projection)))
}

/** Align two frames; the secondary axis prevents a wrist/forearm roll as the elbow bends. */
function frameRotation(
  from: THREE.Vector3,
  fromSide: THREE.Vector3,
  to: THREE.Vector3,
  toSide: THREE.Vector3,
) {
  const basis = (direction: THREE.Vector3, side: THREE.Vector3) => {
    const y = direction.clone().normalize()
    const x = side.clone().addScaledVector(y, -side.dot(y)).normalize()
    return new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y).normalize())
  }
  return new THREE.Quaternion().setFromRotationMatrix(
    basis(to, toSide).multiply(basis(from, fromSide).invert()),
  )
}

const kneeCenter = head('lowerleg01.L').add(head('lowerleg01.R')).multiplyScalar(0.5)
const fixedCenter = new THREE.Vector3(0, 0.0529, -0.46)

export function kneePushupPose(progress: number): PoseFrame {
  const depth = movementAt(progress).depth
  const angle = THREE.MathUtils.degToRad(27.3 - depth * 13.2)
  const bodyRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2 - angle,
  )
  const body: RigTransform = { original: kneeCenter, anchor: fixedCenter, rotation: bodyRotation }
  const apply = (point: THREE.Vector3) =>
    point.sub(body.original).applyQuaternion(body.rotation).add(body.anchor)
  const transforms = new Map<string, RigTransform>([['body', body]])
  const shoulders: THREE.Vector3[] = [],
    elbows: THREE.Vector3[] = [],
    wrists: THREE.Vector3[] = [],
    knees: THREE.Vector3[] = []
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const originalShoulder = head(`upperarm01.${side}`),
      originalElbow = head(`lowerarm01.${side}`),
      originalWrist = head(`wrist.${side}`)
    const shoulder = apply(originalShoulder.clone())
    const wrist = new THREE.Vector3(sign * 0.247, 0.052, 0.2)
    const elbow = solveElbow(
      shoulder,
      wrist,
      shoulder.clone().add(new THREE.Vector3(sign * 0.115, -0.1, -0.33)),
      originalShoulder.distanceTo(originalElbow),
      originalElbow.distanceTo(originalWrist),
    )
    const backward = new THREE.Vector3(0, 0, -1)
    const upperRotation = frameRotation(
      originalElbow.clone().sub(originalShoulder),
      new THREE.Vector3(0, 0, 1),
      elbow.clone().sub(shoulder),
      new THREE.Vector3(0, -1, 0),
    )
    const index = head(`finger2-1.${side}`),
      pinky = head(`finger5-1.${side}`)
    const handDirection = head(`finger3-1.${side}`).sub(originalWrist)
    const handSide = index.sub(pinky)
    const handRotation = frameRotation(
      handDirection,
      handSide,
      new THREE.Vector3(sign * 0.08, 0, 1),
      new THREE.Vector3(-sign, 0, 0),
    )
    const lowerRotation = frameRotation(
      originalWrist.clone().sub(originalElbow),
      handSide,
      wrist.clone().sub(elbow),
      new THREE.Vector3(-sign, 0, 0),
    )
    transforms.set(`upperarm.${side}`, {
      original: originalShoulder,
      anchor: shoulder,
      rotation: upperRotation,
    })
    transforms.set(`lowerarm.${side}`, {
      original: originalElbow,
      anchor: elbow,
      rotation: lowerRotation,
    })
    transforms.set(`hand.${side}`, {
      original: originalWrist,
      anchor: wrist,
      rotation: handRotation,
    })
    const originalKnee = head(`lowerleg01.${side}`),
      originalAnkle = head(`foot.${side}`)
    const knee = apply(originalKnee.clone())
    const shinDirection = new THREE.Vector3(0, 0.36, -0.94).normalize()
    const ankle = knee
      .clone()
      .addScaledVector(shinDirection, originalKnee.distanceTo(originalAnkle))
    const shinRotation = frameRotation(
      originalAnkle.clone().sub(originalKnee),
      new THREE.Vector3(sign, 0, 0),
      shinDirection,
      new THREE.Vector3(sign, 0, 0),
    )
    const footRotation = frameRotation(
      tail(`foot.${side}`).sub(originalAnkle),
      new THREE.Vector3(sign, 0, 0),
      backward,
      new THREE.Vector3(sign, 0, 0),
    )
    transforms.set(`shin.${side}`, { original: originalKnee, anchor: knee, rotation: shinRotation })
    transforms.set(`foot.${side}`, {
      original: originalAnkle,
      anchor: ankle,
      rotation: footRotation,
    })
    shoulders.push(shoulder)
    elbows.push(elbow)
    wrists.push(wrist)
    knees.push(knee)
  }
  return {
    transforms,
    shoulders,
    elbows,
    wrists,
    knees,
    alignment: [
      fixedCenter.clone(),
      apply(head('spine05')),
      apply(head('neck01')),
      apply(tail('head')),
    ],
  }
}

export const kneePushupMotion = {
  id: 'knee-pushup',
  name: 'Knee push-up',
  seconds: CYCLE_SECONDS,
  steps: byId['knee-pushup'].steps,
  phases: ['Set up', 'Lower', 'Pause', 'Press'],
  keyframes: [
    { label: 'Set up', progress: 0 },
    { label: 'Lower & pause', progress: 0.54 },
    { label: 'Press up', progress: 0.8 },
  ],
  regions: [
    { id: 'all', label: 'All' },
    { id: 'chest', label: 'Chest' },
    { id: 'triceps', label: 'Triceps' },
    { id: 'shoulders', label: 'Shoulders' },
  ],
  sample: kneePushupPose,
  describe: movementAt,
} satisfies GuideMotion
