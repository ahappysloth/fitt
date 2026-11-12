import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import {
  apply,
  arm,
  barGrip,
  bodyFrame,
  cycle,
  frameRotation,
  head,
  sides,
  pivot,
  tail,
} from './full-body-rig'

export function pullupPose(progress: number) {
  const { depth } = cycle(progress)
  return overheadPose(depth)
}

/** Shared overhead solver; defaults preserve the approved pull-up exactly. */
export function overheadPose(
  depth: number,
  elevation = 0.85 - 0.5 * depth,
  straight: boolean | number = false,
) {
  const frame = bodyFrame(new Vector3(0, 0.995 + 0.445 * depth, 0))
  for (const [side, sign] of sides) {
    // Share overhead elevation with the shoulder girdle rather than hinging only at the humerus.
    pivot(
      frame,
      `shoulder01.${side}`,
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), sign * elevation),
    )
    const wrist = new Vector3(sign * 0.29, 1.99, 0.1)
    const handRotation = frameRotation(
      head(`finger3-1.${side}`).sub(head(`wrist.${side}`)),
      head(`finger2-1.${side}`).sub(head(`finger5-1.${side}`)),
      new Vector3(0, 1, 0),
      new Vector3(-sign, 0, 0),
    )
    const shoulder = apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`))
    if (straight) {
      const length =
        head(`upperarm01.${side}`).distanceTo(head(`lowerarm01.${side}`)) +
        head(`lowerarm01.${side}`).distanceTo(head(`wrist.${side}`))
      const dy =
        wrist.y -
        Math.sqrt(
          (length - 0.00001) ** 2 - (wrist.x - shoulder.x) ** 2 - (wrist.z - shoulder.z) ** 2,
        ) -
        shoulder.y
      if (side === 'L') {
        for (const transform of new Set(frame.transforms.values()))
          transform.anchor.y += dy * Number(straight)
      }
      shoulder.copy(apply(frame.transforms.get(`upperarm01.${side}`)!, head(`upperarm01.${side}`)))
    }
    arm(
      frame,
      side,
      wrist,
      shoulder.clone().add(new Vector3(sign * 0.25, -0.3, -0.03)),
      handRotation,
      // Carry the anatomical front through arm elevation. Projecting world X
      // into an upward-pointing arm reverses its front/back frame and twists
      // the upper arm 180 degrees, collapsing the shoulder skin blend.
      new Vector3(0, 0, 1),
    )
    // Carry the upper-arm orientation through elbow flexion. A fixed world
    // normal for the forearm would reverse its natural fold at the top.
    const upper = frame.transforms.get(`upperarm01.${side}`)!
    const lower = frame.transforms.get(`lowerarm01.${side}`)!
    const lowerDirection = head(`wrist.${side}`)
      .sub(head(`lowerarm01.${side}`))
      .normalize()
    const posedDirection = wrist
      .clone()
      .sub(frame.elbows[frame.elbows.length - 1])
      .normalize()
    const lowerRotation = new Quaternion()
      .setFromUnitVectors(lowerDirection.applyQuaternion(upper.rotation), posedDirection)
      .multiply(upper.rotation)
    for (const name of [`lowerarm01.${side}`, `lowerarm02.${side}`])
      frame.transforms.set(name, { ...lower, rotation: lowerRotation })
    barGrip(frame, side)
    frame.knees.push(apply(frame.transforms.get('root')!, head(`lowerleg01.${side}`)))
  }
  const body = frame.transforms.get('root')!
  frame.alignment = [
    apply(body, head('spine05')),
    apply(body, head('neck01')),
    apply(body, tail('head')),
  ]
  return frame
}
const phases = ['Set up', 'Pull', 'Pause', 'Lower'] as const
export const pullupMotion = {
  id: 'pullup',
  name: 'Pull-up',
  seconds: 6.4,
  steps: byId.pullup.steps,
  phases,
  keyframes: [
    { label: 'Active hang', progress: 0 },
    { label: 'Top & pause', progress: 0.53 },
    { label: 'Lower slowly', progress: 0.79 },
  ],
  regions: [
    { id: 'all', label: 'All' },
    { id: 'upper-back', label: 'Upper back' },
    { id: 'biceps', label: 'Biceps' },
    { id: 'forearms', label: 'Forearms' },
    { id: 'core', label: 'Core' },
  ],
  stage: {
    target: [0, 1.2, 0],
    height: 2.55,
    bar: { center: [0, 2.067, 0.077], width: 0.95, radius: 0.014 },
  },
  sample: pullupPose,
  describe(progress: number) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: phases[phase],
      cue: [
        'Start in an active hang. Brace and keep still.',
        'Drive elbows down. Lift without swinging.',
        'Keep your neck neutral at the top.',
        'Lower with control to the active hang.',
      ][phase],
      breath: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'][phase],
    }
  },
} satisfies GuideMotion
