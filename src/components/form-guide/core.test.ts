import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { coreMotions } from './core'
import { apply, head } from './full-body-rig'
import { shoulderMotions } from './shoulders'
import { bodyRegions, expectRigIntact, lowestByRegion, shoulderArea } from './surface-checks'
import type { PoseFrame } from './contracts'

const motions = [...coreMotions, ...shoulderMotions]
const byId = Object.fromEntries(motions.map((motion) => [motion.id, motion]))
const models = ['male', 'female'] as const
const steps = (count: number) => Array.from({ length: count + 1 }, (_, step) => step / count)
const joint = (frame: PoseFrame, name: string) => apply(frame.transforms.get(name)!, head(name))
const angleAt = (a: Vector3, at: Vector3, b: Vector3) =>
  (a.clone().sub(at).angleTo(b.clone().sub(at)) * 180) / Math.PI
const elbowAngle = (frame: PoseFrame, index: number) =>
  angleAt(frame.shoulders[index], frame.elbows[index], frame.wrists[index])

type Athlete = ReturnType<typeof createAthlete>
/** Poses each step on both bodies and passes floor heights (and the athlete) to `check`. */
function eachSurface(
  id: string,
  check: (floor: Record<string, number>, progress: number, athlete: Athlete) => void,
  progresses = steps(12),
) {
  for (const model of models) {
    const athlete = createAthlete(model)
    try {
      const regions = bodyRegions(athlete)
      for (const progress of progresses) {
        athlete.applyPose(byId[id].sample(progress, model))
        check(lowestByRegion(athlete, regions), progress, athlete)
      }
    } finally {
      athlete.dispose()
    }
  }
}

describe('core and shoulder drills', () => {
  for (const motion of motions) {
    it(`${motion.id}: preserves joint connections, lengths and the loop seam`, () =>
      expectRigIntact(motion, 0.07))
    it(`${motion.id}: reports only phases from its own list`, () => {
      for (const progress of steps(100))
        expect(motion.phases).toContain(motion.describe(progress).phase)
    })
  }

  it('dead bug keeps the back down and alternates opposite arm and leg', () => {
    eachSurface('deadbug', (floor) => {
      expect(floor.all).toBeGreaterThan(-0.008)
      expect(Math.max(floor.upperBack, floor.pelvis)).toBeLessThan(0.02)
    })
    const tabletop = byId.deadbug.sample(0)
    for (const side of ['L', 'R'])
      expect(joint(tabletop, `lowerleg01.${side}`).y).toBeGreaterThan(
        joint(tabletop, `upperleg01.${side}`).y + 0.35,
      )
    // First the right arm and left leg extend, then the left arm and right leg.
    for (const [progress, arm, leg] of [
      [0.25, 1, 'L'],
      [0.75, 0, 'R'],
    ] as const) {
      const frame = byId.deadbug.sample(progress)
      expect(frame.wrists[arm].z).toBeLessThan(frame.shoulders[arm].z - 0.3)
      expect(frame.wrists[1 - arm].y).toBeGreaterThan(frame.shoulders[1 - arm].y + 0.35)
      const hip = joint(frame, `upperleg01.${leg}`)
      expect(joint(frame, `foot.${leg}`).z - hip.z).toBeGreaterThan(0.7)
    }
    eachSurface(
      'deadbug',
      (floor) => {
        // The long leg hovers just off the floor.
        const long = Math.min(floor['foot.L'], floor['foot.R'])
        expect(long).toBeGreaterThan(0.03)
        expect(long).toBeLessThan(0.18)
      },
      [0.25, 0.75],
    )
  })

  it('hollow hold lifts shoulders and legs with the lower back down', () => {
    eachSurface('hollow-hold', (floor, progress) => {
      expect(floor.all).toBeGreaterThan(-0.008)
      expect(floor.pelvis).toBeLessThan(0.012)
      if (progress === 0) expect(Math.min(floor['foot.L'], floor['foot.R'])).toBeLessThan(0.015)
      if (progress > 0.3 && progress < 0.75) {
        expect(floor.upperBack).toBeGreaterThan(0.02)
        expect(Math.min(floor['foot.L'], floor['foot.R'])).toBeGreaterThan(0.15)
      }
    })
  })

  it('plank stacks shoulders over elbows in one straight line, from the knees', () => {
    for (const progress of steps(24)) {
      const frame = byId.plank.sample(progress)
      for (const index of [0, 1]) {
        const shoulder = frame.shoulders[index],
          elbow = frame.elbows[index]
        expect(Math.hypot(shoulder.x - elbow.x, shoulder.z - elbow.z)).toBeLessThan(0.01)
      }
    }
    const hold = byId.plank.sample(0.53)
    const shoulders = hold.shoulders[0].clone().add(hold.shoulders[1]).multiplyScalar(0.5)
    const hip = joint(hold, 'upperleg01.L')
    expect(angleAt(shoulders, hip, joint(hold, 'foot.L'))).toBeGreaterThan(172)
    eachSurface('plank', (floor, progress) => {
      expect(floor.all).toBeGreaterThan(-0.008)
      expect(floor.hand).toBeLessThan(0.015)
      if (progress === 0) expect(Math.min(floor['thigh.L'], floor['shin.L'])).toBeLessThan(0.01)
      if (progress > 0.3 && progress < 0.75) {
        expect(floor['foot.L']).toBeLessThan(0.015)
        expect(floor.pelvis).toBeGreaterThan(0.08)
      }
    })
  })

  it('tuck support holds straight arms on the bars with the hips up', () => {
    const rods = byId['tuck-support'].stage!.props!.filter((prop) => prop.kind === 'rod')
    const grips = rods.filter((rod) => rod.from[1] === rod.to[1] && rod.from[1] > 0.2)
    for (const progress of steps(24)) {
      const frame = byId['tuck-support'].sample(progress)
      for (const index of [0, 1]) expect(elbowAngle(frame, index)).toBeGreaterThan(170)
    }
    eachSurface('tuck-support', (floor, progress, athlete) => {
      expect(floor.all).toBeGreaterThan(-0.008)
      expect(floor.pelvis).toBeGreaterThan(0.15)
      if (progress === 0) expect(floor['foot.L']).toBeLessThan(0.015)
      if (progress > 0.3 && progress < 0.75) expect(floor['foot.L']).toBeGreaterThan(0.06)
      // Only the hands touch the bars.
      const regions = bodyRegions(athlete)
      const point = new Vector3()
      for (let vertex = 0; vertex < regions.length; vertex++) {
        if (regions[vertex] === 'hand') continue
        athlete.mesh.getVertexPosition(vertex, point)
        for (const rod of grips) {
          const inside =
            Math.hypot(point.x - rod.from[0], point.y - rod.from[1]) < (rod.radius ?? 0.018) &&
            point.z > Math.min(rod.from[2], rod.to[2]) &&
            point.z < Math.max(rod.from[2], rod.to[2])
          if (inside) throw new Error(`Vertex ${vertex} (${regions[vertex]}) intersects a bar`)
        }
      }
    })
  })

  it('wall slide keeps the back on the wall from goalpost to overhead', () => {
    const wall = byId['wall-slide'].stage!.props!.find((prop) => prop.kind === 'box')!
    const face = wall.center[2] + wall.size[2] / 2
    eachSurface('wall-slide', (floor, _progress, athlete) => {
      expect(floor.all).toBeGreaterThan(-0.005)
      let back = Infinity
      const point = new Vector3()
      for (let vertex = 0; vertex < athlete.mesh.geometry.attributes.position.count; vertex++)
        back = Math.min(back, athlete.mesh.getVertexPosition(vertex, point).z)
      expect(back).toBeGreaterThan(face - 0.008)
      expect(back).toBeLessThan(face + 0.015)
    })
    const goalpost = byId['wall-slide'].sample(0)
    for (const index of [0, 1]) {
      expect(elbowAngle(goalpost, index)).toBeGreaterThan(70)
      expect(elbowAngle(goalpost, index)).toBeLessThan(110)
    }
    const overhead = byId['wall-slide'].sample(0.53)
    for (const wrist of overhead.wrists)
      expect(wrist.y).toBeGreaterThan(apply(overhead.transforms.get('head')!, head('head')).y + 0.2)
  })

  it('pike push-up lowers the head toward the floor in front of the hands', () => {
    const top = byId['pike-pushup'].sample(0)
    const bottom = byId['pike-pushup'].sample(0.53)
    for (const index of [0, 1]) {
      expect(elbowAngle(top, index)).toBeGreaterThan(160)
      expect(elbowAngle(bottom, index)).toBeLessThan(110)
    }
    for (const progress of steps(24)) {
      const frame = byId['pike-pushup'].sample(progress)
      expect(frame.wrists[0].distanceTo(top.wrists[0])).toBeLessThan(1e-9)
    }
    eachSurface('pike-pushup', (floor, progress) => {
      expect(floor.all).toBeGreaterThan(-0.005)
      expect(floor['foot.L']).toBeLessThan(0.015)
      expect(floor.hand).toBeLessThan(0.015)
      expect(floor.pelvis).toBeGreaterThan(0.4)
      if (Math.abs(progress - 0.5) < 0.05) {
        expect(floor.head).toBeGreaterThan(0.02)
        expect(floor.head).toBeLessThan(0.12)
      }
    })
  })
})

for (const motion of motions) {
  it.each(models)(`${motion.id} retains %s shoulder area`, (model) => {
    const athlete = createAthlete(model)
    try {
      const shoulder = shoulderArea(athlete)
      expect(shoulder.count).toBeGreaterThan(400)
      // Every 2%: a pinch can be narrow (the dead bug's once spanned under 3%).
      for (const progress of steps(50)) {
        athlete.applyPose(motion.sample(progress, model))
        expect(shoulder.lowTail()).toBeGreaterThan(0.35)
      }
    } finally {
      athlete.dispose()
    }
  })
}
