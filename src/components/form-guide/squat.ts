import { Quaternion, Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import {
  apply,
  arm,
  bodyFrame,
  cycle,
  frameRotation,
  head,
  limb,
  pitch,
  pivot,
  sides,
  solveJoint,
  subtree,
  tail,
} from './full-body-rig'

export function squatPose(progress: number) {
  const { depth } = cycle(progress)
  const frame = bodyFrame(new Vector3(0, 0.8075 - 0.36 * depth, -0.22 * depth))
  const torso = pivot(frame, 'spine05', pitch(0.48 * depth))
  for (const [side, sign] of sides) {
    const hip = apply(frame.transforms.get(`upperleg01.${side}`)!, head(`upperleg01.${side}`))
    const ankle = head(`foot.${side}`).add(new Vector3(0, 0.8175, 0))
    const knee = solveJoint(
      hip,
      ankle,
      new Vector3(sign * 0.22, 0.42, 1),
      head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`)),
      head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`)),
    )
    limb(frame, `upperleg01.${side}`, `lowerleg01.${side}`, hip, knee)
    limb(frame, `lowerleg01.${side}`, `foot.${side}`, knee, ankle)
    subtree(frame, `foot.${side}`, {
      original: head(`foot.${side}`),
      anchor: ankle,
      rotation: new Quaternion(),
    })
    frame.knees.push(knee)
    const shoulder = apply(torso, head(`upperarm01.${side}`))
    const wrist = shoulder.clone().add(new Vector3(sign * 0.01, -0.06, 0.405))
    const handRotation = frameRotation(
      head(`finger3-1.${side}`).sub(head(`wrist.${side}`)),
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(1, 0, 0),
    )
    arm(frame, side, wrist, shoulder.clone().add(new Vector3(sign * 0.08, -0.3, 0.2)), handRotation)
  }
  frame.alignment = [
    apply(frame.transforms.get('root')!, head('spine05')),
    apply(torso, head('neck01')),
    apply(torso, tail('head')),
  ]
  return frame
}
const phases = ['Set up', 'Lower', 'Pause', 'Stand'] as const
export const squatMotion = {
  id: 'squat',
  name: 'Bodyweight squat',
  seconds: 6.4,
  steps: byId.squat.steps,
  phases,
  keyframes: [
    { label: 'Stand tall', progress: 0 },
    { label: 'Lower & pause', progress: 0.53 },
    { label: 'Stand up', progress: 0.79 },
  ],
  regions: [
    { id: 'all', label: 'All' },
    { id: 'quads', label: 'Quads' },
    { id: 'glutes', label: 'Glutes' },
    { id: 'core', label: 'Core' },
    { id: 'lower-back', label: 'Lower back' },
    { id: 'calves', label: 'Calves' },
  ],
  stage: { target: [0, 0.9, 0], height: 1.95 },
  sample: squatPose,
  describe(progress: number) {
    const { depth, phase } = cycle(progress)
    return {
      depth,
      phase: phases[phase],
      cue: [
        'Set your feet. Keep your whole foot grounded.',
        'Sit down between your hips. Let knees follow toes.',
        'Pause at a comfortable depth. Keep heels down.',
        'Push through your whole foot and stand tall.',
      ][phase],
      breath: ['Get ready', 'Breathe in', 'Stay braced', 'Breathe out'][phase],
    }
  },
} satisfies GuideMotion
