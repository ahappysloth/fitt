import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { bridgeMotions } from './bridges'
import { apply, head } from './full-body-rig'
import { benchTop, lungeMotions } from './lunges'
import { bodyRegions, expectRigIntact, lowestByRegion, shoulderArea } from './surface-checks'
import type { PoseFrame } from './contracts'

const motions = [...lungeMotions, ...bridgeMotions]
const byId = Object.fromEntries(motions.map((motion) => [motion.id, motion]))
const models = ['male', 'female'] as const
const steps = (count: number) => Array.from({ length: count + 1 }, (_, step) => step / count)
const joint = (frame: PoseFrame, name: string) => apply(frame.transforms.get(name)!, head(name))
const degreesBetween = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI

/** Poses every step for both bodies and hands the floor heights per region to `check`. */
function eachFloor(
  id: string,
  check: (floor: Record<string, number>, progress: number, model: string) => void,
  count = 12,
) {
  for (const model of models) {
    const athlete = createAthlete(model)
    try {
      const regions = bodyRegions(athlete)
      for (const progress of steps(count)) {
        athlete.applyPose(byId[id].sample(progress, model))
        check(lowestByRegion(athlete, regions), progress, model)
      }
    } finally {
      athlete.dispose()
    }
  }
}

describe('lunges and bridges', () => {
  for (const motion of motions) {
    it(`${motion.id}: preserves joint connections, lengths and the loop seam`, () =>
      // Fast sweeps (fingertips, a stepping foot) move most per 1%; a flip would jump far more.
      expectRigIntact(motion, 0.07))
    it(`${motion.id}: reports only phases from its own list`, () => {
      for (const progress of steps(100))
        expect(motion.phases).toContain(motion.describe(progress).phase)
    })
  }

  it('reverse lunge plants the front foot and lowers the back knee just off the floor', () => {
    const front = byId['reverse-lunge'].sample(0)
    for (const progress of steps(50))
      expect(
        joint(byId['reverse-lunge'].sample(progress), 'foot.L').distanceTo(joint(front, 'foot.L')),
      ).toBeLessThan(1e-9)
    eachFloor('reverse-lunge', (floor, progress) => {
      expect(floor.all).toBeGreaterThan(-0.005)
      expect(floor['foot.L']).toBeLessThan(0.015)
      if (progress === 0) expect(floor['foot.R']).toBeLessThan(0.015)
      if (Math.abs(progress - 0.5) < 0.05) {
        // Bottom: the rear foot is on its ball and the rear knee hovers.
        expect(floor['foot.R']).toBeLessThan(0.015)
        const knee = Math.min(floor['shin.R'], floor['thigh.R'])
        expect(knee).toBeGreaterThan(0.015)
        expect(knee).toBeLessThan(0.08)
      }
    })
  })

  it('split squat keeps the front foot planted and the rear instep on the bench', () => {
    const stage = byId['split-squat'].stage!
    const boxes = stage.props!.filter((prop) => prop.kind === 'box')
    for (const model of models) {
      const athlete = createAthlete(model)
      try {
        const regions = bodyRegions(athlete)
        for (const progress of steps(12)) {
          athlete.applyPose(byId['split-squat'].sample(progress, model))
          const floor = lowestByRegion(athlete, regions)
          expect(floor.all).toBeGreaterThan(-0.005)
          expect(floor['foot.L']).toBeLessThan(0.015)
          expect(floor['foot.R']).toBeGreaterThan(benchTop - 0.005)
          expect(floor['foot.R']).toBeLessThan(benchTop + 0.01)
          const point = new Vector3()
          for (let vertex = 0; vertex < regions.length; vertex++) {
            athlete.mesh.getVertexPosition(vertex, point)
            for (const box of boxes)
              if (
                [point.x, point.y, point.z].every(
                  (value, axis) => Math.abs(value - box.center[axis]) < box.size[axis] / 2 - 0.01,
                )
              )
                throw new Error(`Vertex ${vertex} intersects the bench`)
          }
        }
      } finally {
        athlete.dispose()
      }
    }
    const top = byId['split-squat'].sample(0)
    const bottom = byId['split-squat'].sample(0.53)
    expect(top.knees[1].y - bottom.knees[1].y).toBeGreaterThan(0.2)
  })

  for (const id of ['glute-bridge', 'single-leg-bridge']) {
    it(`${id} keeps the head and upper back down and lifts the hips into line`, () => {
      eachFloor(id, (floor, progress) => {
        expect(floor.all).toBeGreaterThan(-0.008)
        expect(floor.head).toBeLessThan(0.02)
        expect(floor.upperBack).toBeLessThan(0.012)
        expect(floor['foot.L']).toBeLessThan(0.015)
        if (progress === 0) expect(floor.pelvis).toBeLessThan(0.012)
        if (Math.abs(progress - 0.5) < 0.05) expect(floor.pelvis).toBeGreaterThan(0.12)
      })
      for (const model of models) {
        const top = byId[id].sample(0.53, model)
        const shoulders = top.shoulders[0].clone().add(top.shoulders[1]).multiplyScalar(0.5)
        const hip = joint(top, 'upperleg01.L')
        const knee = joint(top, 'lowerleg01.L')
        // Shoulders, hips and knees in one line at the top.
        expect(degreesBetween(hip.clone().sub(shoulders), knee.clone().sub(hip))).toBeLessThan(15)
      }
    })
  }

  it('single-leg bridge holds the free leg straight and in line with the working thigh', () => {
    for (const progress of steps(20)) {
      const frame = byId['single-leg-bridge'].sample(progress)
      const hip = joint(frame, 'upperleg01.R'),
        knee = joint(frame, 'lowerleg01.R'),
        ankle = joint(frame, 'foot.R')
      // Straight means the rest shape: the rest leg carries a slight knee angle.
      const restBend = degreesBetween(
        head('lowerleg01.R').sub(head('upperleg01.R')),
        head('foot.R').sub(head('lowerleg01.R')),
      )
      expect(degreesBetween(knee.clone().sub(hip), ankle.clone().sub(knee))).toBeCloseTo(
        restBend,
        6,
      )
      const working = joint(frame, 'lowerleg01.L').sub(joint(frame, 'upperleg01.L'))
      expect(degreesBetween(knee.clone().sub(hip), working)).toBeLessThan(1)
    }
    eachFloor('single-leg-bridge', (floor) => expect(floor['foot.R']).toBeGreaterThan(0.2))
  })
})

for (const motion of motions) {
  it.each(models)(`${motion.id} retains %s shoulder area`, (model) => {
    const athlete = createAthlete(model)
    try {
      const shoulder = shoulderArea(athlete)
      expect(shoulder.count).toBeGreaterThan(400)
      for (const progress of [0, 0.16, 0.24, 0.4, 0.53, 0.75, 1]) {
        athlete.applyPose(motion.sample(progress, model))
        expect(shoulder.lowTail()).toBeGreaterThan(0.35)
      }
    } finally {
      athlete.dispose()
    }
  })
}
