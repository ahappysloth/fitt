import { Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import { apply, cycle, head, limb, sides, solveJoint, subtree } from './full-body-rig'
import { overheadPose, pullupMotion } from './pull-up'
import { band, bench } from './props'

const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2
export function scapularPose(progress: number) {
  return overheadPose(0, 1.3 - 0.45 * cycle(progress).depth, true)
}
export function assistedPose(progress: number) {
  const depth = cycle(progress).depth
  const frame = overheadPose(depth, undefined, 1 - smooth(depth / 0.2))
  const foot = apply(frame.transforms.get('foot.L')!, head('foot.L'))
  // The stirrup supports the sole; its two sides remain anchored to the bar.
  foot.y -= 0.085
  const left = foot.clone().add(new Vector3(-0.045, 0, 0.025))
  const right = foot.clone().add(new Vector3(0.045, 0, 0.025))
  frame.rods = [
    band([-0.045, 2.067, 0.077], left),
    band([0.045, 2.067, 0.077], right),
    band(left, right),
  ]
  return frame
}
export function negativePose(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  const depth = t < 0.72 ? 1 - smooth((t - 0.12) / 0.6) : smooth((t - 0.78) / 0.22)
  const frame = overheadPose(depth, undefined, 1 - smooth(depth / 0.2))
  // Bring each foot back onto the rear step before extending the legs to reset.
  const contact = t < 0.12 ? 1 - smooth(t / 0.12) : t > 0.72 ? smooth((t - 0.72) / 0.1) : 0
  for (const [side, sign] of sides) {
    const hip = apply(frame.transforms.get(`upperleg01.${side}`)!, head(`upperleg01.${side}`))
    const originalFoot = apply(frame.transforms.get(`foot.${side}`)!, head(`foot.${side}`))
    const foot = originalFoot.clone().lerp(new Vector3(sign * 0.1, 0.83, -0.3), contact)
    foot.y += 0.28 * Math.sin(Math.PI * contact)
    const knee = solveJoint(
      hip,
      foot,
      hip.clone().add(new Vector3(0, -0.2, 1)),
      head(`upperleg01.${side}`).distanceTo(head(`lowerleg01.${side}`)),
      head(`lowerleg01.${side}`).distanceTo(head(`foot.${side}`)),
    )
    limb(frame, `upperleg01.${side}`, `lowerleg01.${side}`, hip, knee)
    limb(frame, `lowerleg01.${side}`, `foot.${side}`, knee, foot)
    subtree(frame, `foot.${side}`, {
      original: head(`foot.${side}`),
      anchor: foot,
      rotation: frame.transforms.get('root')!.rotation,
    })
    frame.knees[side === 'L' ? 0 : 1] = knee
  }
  return frame
}
export const barPullMotions: GuideMotion[] = [
  ['scapular-pullup', scapularPose],
  ['negative-pullup', negativePose],
  ['assisted-pullup', assistedPose],
].map(([id, sample]) => {
  const exercise = byId[id as string]
  return {
    ...pullupMotion,
    id: exercise.id,
    name: exercise.name,
    steps: exercise.steps,
    seconds: exercise.id === 'negative-pullup' ? 8 : 6.4,
    regions: [
      { id: 'all', label: 'All' },
      ...exercise.muscles.map((id) => ({ id, label: id.replace('-', ' ') })),
    ],
    sample: sample as GuideMotion['sample'],
    stage: {
      ...pullupMotion.stage,
      height: 2.7,
      props:
        exercise.id === 'negative-pullup'
          ? bench([0, 0.745, -0.4], { width: 0.65, depth: 0.4 })
          : [],
    },
    keyframes: [
      { label: 'Setup', progress: 0 },
      { label: 'Movement', progress: 0.54 },
      { label: 'Return', progress: 0.79 },
    ],
    describe(progress: number) {
      const index = progress < 0.08 ? 0 : progress < 0.72 ? 1 : 2
      return {
        depth: cycle(progress).depth,
        phase: ['Setup', 'Movement', 'Return'][index],
        cue: exercise.steps[index],
        breath: 'Breathe steadily',
      }
    },
  }
})
