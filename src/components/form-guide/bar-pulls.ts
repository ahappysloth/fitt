import { Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import { apply, cycle, head, limb, sides, solveJoint, subtree } from './full-body-rig'
import { overheadPose, pullupMotion } from './pull-up'
import { band, bench } from './props'

const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2
/**
 * Relaxed hang to an active hang. The torso lifts only about 2 cm: the rig's shoulder
 * skin pinches below the approved active-hang elevation (0.85), and shrugging past
 * 1.3 adds no lift, so this motion is held from release until the shoulder rig improves.
 */
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
const negativeDepth = (t: number) =>
  t < 0.72 ? 1 - smooth((t - 0.12) / 0.6) : smooth((t - 0.78) / 0.22)
export function negativePose(progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  const depth = negativeDepth(t)
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
interface Script {
  phases: readonly string[]
  keyframes: GuideMotion['keyframes']
  cues: readonly string[]
  breaths: readonly string[]
  seconds: number
  sample: GuideMotion['sample']
  /** Depth and phase index at a progress; defaults to the shared pull cycle. */
  timeline?: (progress: number) => { depth: number; phase: number }
}
const scripts: Record<string, Script> = {
  'scapular-pullup': {
    phases: ['Relaxed hang', 'Shoulders down', 'Pause', 'Relax'],
    keyframes: [
      { label: 'Relaxed hang', progress: 0 },
      { label: 'Shoulders down', progress: 0.53 },
      { label: 'Relax slowly', progress: 0.79 },
    ],
    cues: [
      'Hang with straight arms and an overhand grip.',
      'Draw your shoulders down away from your ears. Elbows stay straight.',
      'Hold the lift for a moment.',
      'Relax slowly back into the hang.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'],
    seconds: 6.4,
    sample: scapularPose,
  },
  'negative-pullup': {
    phases: ['Top', 'Lower slowly', 'Hang', 'Step back up'],
    keyframes: [
      { label: 'Chin over bar', progress: 0 },
      { label: 'Lowering', progress: 0.42 },
      { label: 'Straight arms', progress: 0.74 },
    ],
    cues: [
      'Start with your chin above the bar. Lift your feet off the bench.',
      'Lower for 3 to 5 seconds. Stay in control the whole way.',
      'Reach straight arms, then find the bench with your feet.',
      'Step back up onto the bench to reset.',
    ],
    breaths: ['Get ready', 'Breathe steadily', 'Breathe out', 'Breathe in'],
    seconds: 8,
    sample: negativePose,
    timeline(progress) {
      const t = Math.max(0, Math.min(1, progress))
      return { depth: negativeDepth(t), phase: t < 0.12 ? 0 : t < 0.72 ? 1 : t < 0.8 ? 2 : 3 }
    },
  },
  'assisted-pullup': {
    phases: ['Set up', 'Pull', 'Pause', 'Lower'],
    keyframes: [
      { label: 'Hang in the band', progress: 0 },
      { label: 'Top & pause', progress: 0.53 },
      { label: 'Lower slowly', progress: 0.79 },
    ],
    cues: [
      'Hang with one foot in the band. Brace and keep still.',
      'Drive your elbows down until your chin reaches the bar.',
      'Keep your neck neutral at the top.',
      'Lower with control. No swinging.',
    ],
    breaths: ['Get ready', 'Breathe out', 'Stay braced', 'Breathe in'],
    seconds: 6.4,
    sample: assistedPose,
  },
}

export const barPullMotions: GuideMotion[] = Object.entries(scripts).map(([id, script]) => {
  const exercise = byId[id]
  const timeline = script.timeline ?? cycle
  return {
    ...pullupMotion,
    id: exercise.id,
    name: exercise.name,
    steps: exercise.steps,
    seconds: script.seconds,
    phases: script.phases,
    keyframes: script.keyframes,
    regions: [
      { id: 'all', label: 'All' },
      ...exercise.muscles.map((id) => {
        const label = id.replace('-', ' ')
        return { id, label: label[0].toUpperCase() + label.slice(1) }
      }),
    ],
    sample: script.sample,
    stage: {
      ...pullupMotion.stage,
      height: 2.7,
      props: id === 'negative-pullup' ? bench([0, 0.745, -0.4], { width: 0.65, depth: 0.4 }) : [],
    },
    describe(progress: number) {
      const { depth, phase } = timeline(progress)
      return {
        depth,
        phase: script.phases[phase],
        cue: script.cues[phase],
        breath: script.breaths[phase],
      }
    },
  }
})
