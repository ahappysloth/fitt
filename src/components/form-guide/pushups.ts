import { Vector3 } from 'three'
import { byId } from '../../lib/catalog'
import type { GuideMotion } from './contracts'
import {
  apply,
  barGrip,
  bodyFrame,
  frameRotation,
  head,
  pitch,
  sides,
  subtree,
} from './full-body-rig'
import { movementAt, solveElbow } from './knee-pushup'
import { bench, rings, wall } from './props'

/** Shared straight-body press. Hands and feet have persistent support frames. */
function motion(
  id: string,
  height: number,
  top: number,
  bottom: number,
  width = 0.247,
): GuideMotion {
  const vertical = id === 'wall-pushup'
  const support = new Vector3(0, 0.15, -1.05)
  const original = head('foot.L').add(head('foot.R')).multiplyScalar(0.5)
  return {
    id,
    name: byId[id].name,
    steps: byId[id].steps,
    seconds: 6.4,
    phases: ['Set up', 'Lower', 'Pause', 'Press'],
    keyframes: [
      { label: 'Set up', progress: 0 },
      { label: 'Lower & pause', progress: 0.54 },
      { label: 'Press', progress: 0.79 },
    ],
    regions: [
      { id: 'all', label: 'All' },
      ...byId[id].muscles.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
    ],
    stage: {
      target: [0, vertical ? 0.85 : 0.5, -0.35],
      height: vertical ? 2 : 1.8,
      props: vertical
        ? wall(0)
        : id === 'incline-pushup'
          ? bench([0, height, 0.45], { width: 0.85, depth: 0.45 })
          : id === 'ring-pushup'
            ? rings(0.2, height, width)
            : [],
    },
    describe(progress) {
      const value = movementAt(progress)
      return {
        ...value,
        cue: byId[id].steps[value.phase === 'Set up' ? 0 : value.phase === 'Press' ? 2 : 1],
      }
    },
    sample(progress) {
      const depth = movementAt(progress).depth
      const rotation = pitch(Math.PI / 2 - ((top + (bottom - top) * depth) * Math.PI) / 180)
      const frame = bodyFrame(new Vector3())
      const body = { original, anchor: support, rotation }
      subtree(frame, 'root', body)
      frame.transforms.set('body', body)
      for (const [side, sign] of sides) {
        const shoulderRest = head(`upperarm01.${side}`),
          elbowRest = head(`lowerarm01.${side}`),
          wristRest = head(`wrist.${side}`)
        const shoulder = apply(body, shoulderRest)
        const wrist = new Vector3(
          sign * width,
          vertical ? height : height + 0.052,
          vertical ? -0.052 : 0.2,
        )
        const elbow = solveElbow(
          shoulder,
          wrist,
          shoulder.clone().add(new Vector3(sign * 0.115, -0.1, -0.33)),
          shoulderRest.distanceTo(elbowRest),
          elbowRest.distanceTo(wristRest),
        )
        const handSide = head(`finger2-1.${side}`).sub(head(`finger5-1.${side}`))
        subtree(frame, `upperarm01.${side}`, {
          original: shoulderRest,
          anchor: shoulder,
          rotation: frameRotation(
            elbowRest.clone().sub(shoulderRest),
            new Vector3(0, 0, 1),
            elbow.clone().sub(shoulder),
            new Vector3(0, 0, 1).applyQuaternion(rotation),
          ),
        })
        subtree(frame, `lowerarm01.${side}`, {
          original: elbowRest,
          anchor: elbow,
          rotation: frameRotation(
            wristRest.clone().sub(elbowRest),
            handSide,
            wrist.clone().sub(elbow),
            new Vector3(-sign, 0, 0),
          ),
        })
        subtree(frame, `wrist.${side}`, {
          original: wristRest,
          anchor: wrist,
          rotation: frameRotation(
            head(`finger3-1.${side}`).sub(wristRest),
            handSide,
            vertical
              ? new Vector3(0, 1, 0)
              : new Vector3(sign * (width < 0.15 ? -0.65 : 0.08), 0, 1),
            new Vector3(-sign, 0, 0),
          ),
        })
        subtree(frame, `foot.${side}`, {
          original: head(`foot.${side}`),
          anchor: apply(body, head(`foot.${side}`)),
          rotation: pitch(0.45),
        })
        if (id === 'ring-pushup') barGrip(frame, side)
        frame.shoulders.push(shoulder)
        frame.elbows.push(elbow)
        frame.wrists.push(wrist)
        frame.knees.push(apply(body, head(`lowerleg01.${side}`)))
      }
      frame.alignment = [support.clone(), apply(body, head('spine05')), apply(body, head('neck01'))]
      return frame
    },
  }
}
export const pushupMotions = [
  motion('wall-pushup', 1.25, 61, 53),
  motion('incline-pushup', 0.5, 37, 24),
  motion('pushup', 0, 16, 6),
  motion('diamond-pushup', 0, 14, 6, 0.095),
  motion('ring-pushup', 0.12, 21, 10),
]
