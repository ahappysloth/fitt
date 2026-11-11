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
) {
  const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
  const elbow = solveJoint(
    shoulder,
    wrist,
    pole,
    head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)),
    head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`)),
  )
  limb(frame, `upperarm01.${side}`, `lowerarm01.${side}`, shoulder, elbow)
  limb(frame, `lowerarm01.${side}`, `wrist.${side}`, elbow, wrist)
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
