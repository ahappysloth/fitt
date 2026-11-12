import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { pushupMotions } from './pushups'
import { apply, head, solveJoint } from './full-body-rig'
import data from './body-data.json'

const motions = pushupMotions
describe('push-up family surfaces', () => {
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
            if (names.every((name) => /^(wrist|metacarpal|finger|foot|toe)/.test(name)))
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
              for (const prop of motion.stage?.props ?? []) {
                if (prop.kind !== 'box') continue
                const inside = [point.x, point.y, point.z].every(
                  (value, axis) =>
                    Math.abs(value - prop.center[axis]) < prop.size[axis] / 2 - 0.015,
                )
                if (inside) throw new Error(`${motion.id} vertex ${vertex} intersects equipment`)
              }
            }
            expect(minimumY).toBeGreaterThan(-0.002)
            expect(minimumY).toBeLessThan(0.035)
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
})

for (const motion of pushupMotions) {
  it.each(['male', 'female'] as const)(`${motion.id} retains %s shoulder area`, (model) => {
    const athlete = createAthlete(model)
    try {
      const geometry = athlete.mesh.geometry
      const canonical = geometry.attributes.canonicalPosition
      const position = geometry.attributes.position
      const triangles: { ids: number[]; area: number }[] = []
      const area = (points: Vector3[]) =>
        points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length()
      for (let index = 0; index < geometry.index!.count; index += 3) {
        const ids = [0, 1, 2].map((offset) => geometry.index!.getX(index + offset))
        const center = ids
          .map((id) => new Vector3().fromBufferAttribute(canonical, id))
          .reduce((sum, point) => sum.add(point), new Vector3())
          .divideScalar(3)
        if (
          Math.abs(center.x) < 0.12 ||
          Math.abs(center.x) > 0.22 ||
          center.y < 0.45 ||
          center.y > 0.56
        )
          continue
        triangles.push({
          ids,
          area: area(ids.map((id) => new Vector3().fromBufferAttribute(position, id))),
        })
      }
      expect(triangles.length).toBeGreaterThan(400)
      for (const progress of [0, 0.16, 0.2, 0.24, 0.28, 0.4, 0.53, 0.75, 1]) {
        athlete.applyPose(motion.sample(progress))
        const ratios = triangles
          .map(
            (triangle) =>
              area(triangle.ids.map((id) => athlete.mesh.getVertexPosition(id, new Vector3()))) /
              triangle.area,
          )
          .sort((a, b) => a - b)
        // The lower tail detects pinched attachment triangles that an average hides.
        expect(ratios[Math.floor(ratios.length * 0.05)]).toBeGreaterThan(0.35)
      }
    } finally {
      athlete.dispose()
    }
  })
}
