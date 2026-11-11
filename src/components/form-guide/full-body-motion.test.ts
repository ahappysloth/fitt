import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { squatMotion } from './squat'
import { pullupMotion } from './pull-up'
import { apply, head, solveJoint } from './full-body-rig'
import data from './body-data.json'

const motions = [squatMotion, pullupMotion]
describe('full-body pose foundation', () => {
  it('rejects unreachable IK instead of stretching a limb', () => {
    expect(() =>
      solveJoint(new Vector3(), new Vector3(0, 3, 0), new Vector3(0, 0, 1), 1, 1),
    ).toThrow('reach')
  })
  for (const motion of motions) {
    it(`${motion.id}: preserves all joint connections, lengths and loop seam`, () => {
      const start = motion.sample(0)
      let previous = start
      for (let i = 0; i <= 100; i++) {
        const frame = motion.sample(i / 100)
        expect(frame.transforms.size).toBe(data.bones.length + 1)
        for (const bone of data.bones) {
          const transform = frame.transforms.get(bone.name)!
          expect(Math.abs(transform.rotation.length() - 1)).toBeLessThan(1e-10)
          const position = apply(transform, head(bone.name))
          expect(
            position.distanceTo(apply(previous.transforms.get(bone.name)!, head(bone.name))),
          ).toBeLessThan(0.045)
          if (bone.parent >= 0) {
            const parent = data.bones[bone.parent]
            const parentPosition = apply(frame.transforms.get(parent.name)!, head(parent.name))
            expect(position.distanceTo(parentPosition)).toBeCloseTo(
              head(bone.name).distanceTo(head(parent.name)),
              9,
            )
          }
          if (i === 100)
            expect(
              position.distanceTo(apply(start.transforms.get(bone.name)!, head(bone.name))),
            ).toBeLessThan(1e-10)
        }
        previous = frame
      }
    })
    it.each(['male', 'female'] as const)(
      `${motion.id}: keeps %s surfaces finite, clear of floor and contacts fixed`,
      (model) => {
        const athlete = createAthlete(model)
        try {
          const geometry = athlete.mesh.geometry
          const { position, skinIndex, skinWeight } = geometry.attributes
          const contacts: number[] = []
          for (let vertex = 0; vertex < position.count; vertex++) {
            const names = [0, 1, 2, 3]
              .filter((slot) => skinWeight.getComponent(vertex, slot) > 0)
              .map((slot) => data.bones[skinIndex.getComponent(vertex, slot)].name)
            if (
              names.every((name) =>
                motion.id === 'squat'
                  ? /^(foot|toe)/.test(name)
                  : /^(wrist|metacarpal|finger)/.test(name),
              )
            )
              contacts.push(vertex)
          }
          expect(contacts.length).toBeGreaterThan(100)
          const initial = new Map<number, Vector3>()
          for (let step = 0; step <= 20; step++) {
            athlete.applyPose(motion.sample(step / 20))
            let minimumY = Infinity
            for (let vertex = 0; vertex < position.count; vertex++) {
              const point = athlete.mesh.getVertexPosition(vertex, new Vector3())
              if (![point.x, point.y, point.z].every(Number.isFinite))
                throw new Error(`Nonfinite vertex ${vertex}`)
              minimumY = Math.min(minimumY, point.y)
            }
            expect(minimumY).toBeGreaterThan(-0.002)
            if (motion.id === 'squat') expect(minimumY).toBeLessThan(0.016)
            for (const vertex of contacts) {
              const point = athlete.mesh.getVertexPosition(vertex, new Vector3())
              if (step === 0) initial.set(vertex, point)
              else expect(point.distanceTo(initial.get(vertex)!)).toBeLessThan(1e-6)
            }
          }
        } finally {
          athlete.dispose()
        }
      },
    )
  }
  it('places the pull-up bar within the curved finger grip on both hands', () => {
    const frame = pullupMotion.sample(0.53)
    const [, barY, barZ] = pullupMotion.stage.bar.center
    for (const side of ['L', 'R']) {
      for (const finger of [2, 3, 4]) {
        const points = [1, 2, 3].map((joint) => {
          const name = `finger${finger}-${joint}.${side}`
          return apply(frame.transforms.get(name)!, head(name))
        })
        expect(Math.max(...points.map((p) => p.z))).toBeGreaterThan(barZ)
        expect(Math.min(...points.map((p) => p.z))).toBeLessThan(barZ)
        expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(barY)
        expect(Math.min(...points.map((p) => p.y))).toBeLessThan(barY + 0.01)
      }
    }
  })
})
