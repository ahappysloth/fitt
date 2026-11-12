import { Matrix4, Quaternion, Vector3 } from 'three'
import data from './body-data.json'
import type { PoseFrame, RigTransform } from './contracts'

export const sides = [
  ['L', 1],
  ['R', -1],
] as const
export type Side = 'L' | 'R'
const rest = new Map(data.bones.map((bone) => [bone.name, bone]))
export const head = (name: string) =>
  new Vector3(...(rest.get(name)!.head as [number, number, number]))
export const tail = (name: string) =>
  new Vector3(...(rest.get(name)!.tail as [number, number, number]))
export const apply = (transform: RigTransform, point: Vector3) =>
  point.clone().sub(transform.original).applyQuaternion(transform.rotation).add(transform.anchor)
export const pitch = (angle: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle)

/** Align a limb while retaining a secondary anatomical axis to avoid axial flips. */
export function frameRotation(from: Vector3, fromSide: Vector3, to: Vector3, toSide: Vector3) {
  const basis = (direction: Vector3, side: Vector3) => {
    const y = direction.clone().normalize()
    const x = side.clone().addScaledVector(y, -side.dot(y)).normalize()
    if (x.lengthSq() < 1e-8) throw new Error('Limb frame requires a nonparallel secondary axis')
    return new Matrix4().makeBasis(x, y, x.clone().cross(y).normalize())
  }
  return new Quaternion().setFromRotationMatrix(
    basis(to, toSide).multiply(basis(from, fromSide).invert()),
  )
}

/** Constant-length two-bone IK. An unreachable target is an authoring error, never a stretch. */
export function solveJoint(
  start: Vector3,
  end: Vector3,
  pole: Vector3,
  upper: number,
  lower: number,
) {
  const delta = end.clone().sub(start),
    distance = delta.length()
  if (distance < 1e-8 || distance > upper + lower + 1e-8 || distance < Math.abs(upper - lower))
    throw new Error('Limb target is outside the rig reach')
  const along = delta.normalize()
  const projection = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const perpendicular = pole.clone().sub(start)
  perpendicular.addScaledVector(along, -perpendicular.dot(along)).normalize()
  if (perpendicular.lengthSq() < 1e-8) throw new Error('IK pole must be off the limb axis')
  return start
    .clone()
    .addScaledVector(along, projection)
    .addScaledVector(perpendicular, Math.sqrt(Math.max(0, upper * upper - projection * projection)))
}

/** Each subtree initially shares a rigid transform; later child overrides articulate it.
 * Facial descendants consequently follow the neck/head together, including the eyes.
 */
export function subtree(frame: PoseFrame, name: string, transform: RigTransform) {
  const included = new Set<number>()
  data.bones.forEach((bone, index) => {
    if (bone.name === name || included.has(bone.parent)) {
      included.add(index)
      frame.transforms.set(bone.name, transform)
    }
  })
}
export function bodyFrame(translation: Vector3): PoseFrame {
  const transform = { original: new Vector3(), anchor: translation, rotation: new Quaternion() }
  const frame: PoseFrame = {
    transforms: new Map([['body', transform]]),
    shoulders: [],
    elbows: [],
    wrists: [],
    knees: [],
    alignment: [],
  }
  subtree(frame, 'root', transform)
  return frame
}
export function pivot(frame: PoseFrame, name: string, rotation: Quaternion) {
  const original = head(name)
  const transform = { original, anchor: apply(frame.transforms.get(name)!, original), rotation }
  subtree(frame, name, transform)
  return transform
}
export function limb(
  frame: PoseFrame,
  root: string,
  end: string,
  start: Vector3,
  finish: Vector3,
  axis = new Vector3(1, 0, 0),
) {
  const original = head(root)
  const transform = {
    original,
    anchor: start,
    rotation: frameRotation(head(end).sub(original), axis, finish.clone().sub(start), axis),
  }
  subtree(frame, root, transform)
  return transform
}
export function arm(
  frame: PoseFrame,
  side: Side,
  wrist: Vector3,
  pole: Vector3,
  handRotation: Quaternion,
  anatomicalAxis = new Vector3(1, 0, 0),
) {
  const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
  const elbow = solveJoint(
    shoulder,
    wrist,
    pole,
    head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)),
    head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`)),
  )
  limb(frame, `upperarm01.${side}`, `lowerarm01.${side}`, shoulder, elbow, anatomicalAxis)
  limb(frame, `lowerarm01.${side}`, `wrist.${side}`, elbow, wrist, anatomicalAxis)
  subtree(frame, `wrist.${side}`, {
    original: head(`wrist.${side}`),
    anchor: wrist,
    rotation: handRotation,
  })
  frame.shoulders.push(shoulder)
  frame.elbows.push(elbow)
  frame.wrists.push(wrist)
}
export function cycle(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  const smooth = (v: number) => (1 - Math.cos(Math.PI * v)) / 2
  return t < 0.08 || t >= 0.96
    ? { depth: 0, phase: 0 }
    : t < 0.48
      ? { depth: smooth((t - 0.08) / 0.4), phase: 1 }
      : t < 0.58
        ? { depth: 1, phase: 2 }
        : { depth: 1 - smooth((t - 0.58) / 0.38), phase: 3 }
}

/** Authored cylindrical grip: each phalanx rotates about its own joint, with no scaling.
 * This is a fixed demonstration grip, not a contact/force simulation.
 */
export function barGrip(frame: PoseFrame, side: Side) {
  const sign = side === 'L' ? 1 : -1
  for (let finger = 1; finger <= 5; finger++) {
    for (let joint = 1; joint <= 3; joint++) {
      const name = `finger${finger}-${joint}.${side}`
      const original = head(name)
      const anchor = apply(frame.transforms.get(name)!, original)
      const direction =
        finger === 1
          ? [
              new Vector3(sign * 0.6, 0.7, -0.3),
              new Vector3(sign * 0.3, 0.5, -0.8),
              new Vector3(-sign * 0.3, 0.2, -0.9),
            ][joint - 1]
          : [new Vector3(0, 0.1, -1), new Vector3(0, -1, -0.2), new Vector3(0, -0.5, 0.85)][
              joint - 1
            ]
      subtree(frame, name, {
        original,
        anchor,
        rotation: frameRotation(
          tail(name).sub(original),
          new Vector3(1, 0, 0),
          direction,
          new Vector3(1, 0, 0),
        ),
      })
    }
  }
}

/**
 * Two-bone arm IK whose upper arm takes the shortest rotation from its current
 * (rest or girdle-pivoted) direction, so the humerus never flips its anterior
 * axis; the forearm and hand inherit that twist rather than an absolute frame.
 */
export function reachArm(
  frame: PoseFrame,
  side: Side,
  wrist: Vector3,
  pole: Vector3,
  /** Optional hand placement: the fingers' direction and the index-to-little-finger
   * direction. The forearm pronates or supinates to meet it, as a real forearm does. */
  palm?: { fingers: Vector3; pinky: Vector3 },
) {
  const shoulderRest = head(`upperarm01.${side}`),
    elbowRest = head(`lowerarm01.${side}`),
    wristRest = head(`wrist.${side}`)
  const parent = frame.transforms.get(`upperarm01.${side}`)!
  const shoulder = apply(parent, shoulderRest)
  const elbow = solveJoint(
    shoulder,
    wrist,
    pole,
    shoulderRest.distanceTo(elbowRest),
    elbowRest.distanceTo(wristRest),
  )
  const turn = (from: Vector3, to: Vector3, base: Quaternion) =>
    new Quaternion()
      .setFromUnitVectors(from.applyQuaternion(base).normalize(), to.normalize())
      .multiply(base)
  const upper = turn(
    elbowRest.clone().sub(shoulderRest),
    elbow.clone().sub(shoulder),
    parent.rotation,
  )
  subtree(frame, `upperarm01.${side}`, {
    original: shoulderRest,
    anchor: shoulder,
    rotation: upper,
  })
  const across = head(`finger5-1.${side}`).sub(head(`finger2-1.${side}`))
  const lower = palm
    ? frameRotation(wristRest.clone().sub(elbowRest), across, wrist.clone().sub(elbow), palm.pinky)
    : turn(wristRest.clone().sub(elbowRest), wrist.clone().sub(elbow), upper)
  subtree(frame, `lowerarm01.${side}`, { original: elbowRest, anchor: elbow, rotation: lower })
  const hand = {
    original: wristRest,
    anchor: wrist,
    rotation: palm
      ? frameRotation(head(`finger3-1.${side}`).sub(wristRest), across, palm.fingers, palm.pinky)
      : lower,
  }
  subtree(frame, `wrist.${side}`, hand)
  frame.shoulders.push(shoulder)
  frame.elbows.push(elbow)
  frame.wrists.push(wrist)
  return { shoulder, elbow, hand }
}

/** Raises the shoulder girdle about the body's anterior axis, as the pull-up does overhead. */
export function liftGirdle(frame: PoseFrame, side: Side, body: Quaternion, elevation: number) {
  const anterior = new Vector3(0, 0, 1).applyQuaternion(body)
  const sign = side === 'L' ? 1 : -1
  return pivot(
    frame,
    `shoulder01.${side}`,
    new Quaternion().setFromAxisAngle(anterior, sign * elevation).multiply(body),
  )
}

/**
 * Curls the fingers toward the palm relative to the hand's own frame, for grips
 * whose orientation follows the arm (rings held from below). `curl` is radians
 * per joint for the fingers; the thumb closes by half as much.
 */
export function wrapGrip(frame: PoseFrame, side: Side, curl: number) {
  const hand = frame.transforms.get(`wrist.${side}`)!
  // Across the knuckles, index to little finger: the fingers' flexion axis at rest.
  const across = head(`finger5-1.${side}`)
    .sub(head(`finger2-1.${side}`))
    .normalize()
  const axis = side === 'L' ? across : across.negate()
  for (let finger = 1; finger <= 5; finger++) {
    let parent = hand
    for (let joint = 1; joint <= 3; joint++) {
      const name = `finger${finger}-${joint}.${side}`
      if (!frame.transforms.has(name)) continue
      const original = head(name)
      const angle = (finger === 1 ? 0.5 : 1) * curl * joint
      const transform = {
        original,
        anchor: apply(parent, original),
        rotation: hand.rotation.clone().multiply(new Quaternion().setFromAxisAngle(axis, angle)),
      }
      subtree(frame, name, transform)
      parent = transform
    }
  }
}
