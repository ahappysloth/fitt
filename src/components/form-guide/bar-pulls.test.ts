import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { barPullMotions } from './bar-pulls'
import { apply, head, solveJoint } from './full-body-rig'
import data from './body-data.json'

const motions = barPullMotions
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
          ).toBeLessThan(0.2)
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
})

for (const pullupMotion of motions)
  describe('pull-up shoulder skinning regression', () => {
    it('keeps the humeral anterior axis forward throughout overhead elevation', () => {
      for (let step = 0; step <= 100; step++) {
        const frame = pullupMotion.sample(step / 100)
        for (const side of ['L', 'R']) {
          const forward = new Vector3(0, 0, 1).applyQuaternion(
            frame.transforms.get(`upperarm01.${side}`)!.rotation,
          )
          // The old world-X frame reversed this axis at hang while every IK
          // length/endpoint check still passed; the shoulder skin collapsed.
          expect(forward.z).toBeGreaterThan(0.9)
        }
      }
    })
    it.each(['male', 'female'] as const)(
      'retains area across the %s shoulder attachment',
      (model) => {
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
            athlete.applyPose(pullupMotion.sample(progress))
            const ratios = triangles
              .map(
                (triangle) =>
                  area(
                    triangle.ids.map((id) => athlete.mesh.getVertexPosition(id, new Vector3())),
                  ) / triangle.area,
              )
              .sort((a, b) => a - b)
            // Check the lower tail, not average volume: averaging hid the pinched
            // seam among heavily stretched neighbouring triangles. Before the
            // correction the fifth percentile fell to .30 on both body surfaces.
            expect(ratios[Math.floor(ratios.length * 0.05)]).toBeGreaterThan(0.35)
          }
        } finally {
          athlete.dispose()
        }
      },
    )
    it.each(['male', 'female'] as const)('preserves the %s elbow fold at the top', (model) => {
      const athlete = createAthlete(model)
      try {
        athlete.applyPose(pullupMotion.sample(0.53))
        const geometry = athlete.mesh.geometry
        const canonical = geometry.attributes.canonicalPosition
        const position = geometry.attributes.position
        const ratios: number[] = []
        const area = (points: Vector3[]) =>
          points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length()
        for (let index = 0; index < geometry.index!.count; index += 3) {
          const ids = [0, 1, 2].map((offset) => geometry.index!.getX(index + offset))
          const center = ids
            .map((id) => new Vector3().fromBufferAttribute(canonical, id))
            .reduce((sum, point) => sum.add(point), new Vector3())
            .divideScalar(3)
          center.x = Math.abs(center.x)
          if (center.distanceTo(head('lowerarm01.L')) >= 0.075) continue
          ratios.push(
            area(ids.map((id) => athlete.mesh.getVertexPosition(id, new Vector3()))) /
              area(ids.map((id) => new Vector3().fromBufferAttribute(position, id))),
          )
        }
        ratios.sort((a, b) => a - b)
        expect(ratios.length).toBeGreaterThan(100)
        // Forcing the forearm's front to world Z repaired the hang but flattened
        // the flexed elbow: p10 fell to .37/.36. Transporting the humeral frame
        // through flexion retains the reviewed rounded elbow on both surfaces.
        expect(ratios[Math.floor(ratios.length * 0.1)]).toBeGreaterThan(0.42)
      } finally {
        athlete.dispose()
      }
    })
  })

it('keeps scapular elbows straight while lifting the torso', () => {
  const motion = motions[0]
  const low = motion.sample(0)
  const high = motion.sample(0.53)
  expect(
    high.transforms.get('root')!.anchor.y - low.transforms.get('root')!.anchor.y,
  ).toBeGreaterThan(0.01)
  for (let i = 0; i <= 100; i++) {
    const f = motion.sample(i / 100)
    for (let side = 0; side < 2; side++) {
      expect(
        f.elbows[side]
          .clone()
          .sub(f.shoulders[side])
          .angleTo(f.wrists[side].clone().sub(f.elbows[side])),
      ).toBeLessThan((5 * Math.PI) / 180)
    }
  }
})
it('keeps both band anchors on the bar and the stirrup under the foot', () => {
  for (let i = 0; i <= 100; i++) {
    const f = motions[2].sample(i / 100)
    const rods = f.rods!
    for (const rod of rods.slice(0, 2)) {
      expect(rod.from[1]).toBe(2.067)
      expect(rod.from[2]).toBe(0.077)
    }
    expect(rods[0].to).toEqual(rods[2].from)
    expect(rods[1].to).toEqual(rods[2].to)
    const center = new Vector3(...rods[2].from).add(new Vector3(...rods[2].to)).multiplyScalar(0.5)
    const foot = apply(f.transforms.get('foot.L')!, head('foot.L'))
    expect(center.distanceTo(foot)).toBeLessThan(0.095)
  }
})

it('places negative pull-up feet on the bench at reset and straightens arms at the bottom', () => {
  const top = motions[1].sample(0)
  for (const side of ['L', 'R']) {
    const foot = apply(top.transforms.get(`foot.${side}`)!, head(`foot.${side}`))
    expect(foot.y).toBeCloseTo(0.83)
    expect(foot.z).toBeCloseTo(-0.3)
  }
  const bottom = motions[1].sample(0.72)
  for (let i = 0; i < 2; i++)
    expect(
      bottom.elbows[i]
        .clone()
        .sub(bottom.shoulders[i])
        .angleTo(bottom.wrists[i].clone().sub(bottom.elbows[i])),
    ).toBeLessThan((5 * Math.PI) / 180)
})
it('keeps the grips within centimetres of the fixed bar throughout every cycle', () => {
  for (const motion of motions)
    for (let i = 0; i <= 100; i++) {
      const frame = motion.sample(i / 100)
      for (const side of ['L', 'R']) {
        const name = `finger3-2.${side}`
        const point = apply(frame.transforms.get(name)!, head(name))
        expect(Math.hypot(point.y - 2.067, point.z - 0.077)).toBeLessThan(0.04)
      }
    }
})

it.each(['male', 'female'] as const)('keeps the %s feet on the bench surface at reset', (model) => {
  const athlete = createAthlete(model)
  try {
    athlete.applyPose(motions[1].sample(0))
    let minimum = Infinity
    const geometry = athlete.mesh.geometry
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const p = athlete.mesh.getVertexPosition(i, new Vector3())
      minimum = Math.min(minimum, p.y)
    }
    expect(minimum).toBeGreaterThan(0.745 - 0.025)
    expect(minimum).toBeLessThan(0.745 + 0.025)
  } finally {
    athlete.dispose()
  }
})

it.each(['male', 'female'] as const)('keeps the %s surface out of the bench slab', (model) => {
  const athlete = createAthlete(model)
  try {
    for (let step = 0; step <= 100; step++) {
      athlete.applyPose(motions[1].sample(step / 100))
      for (let i = 0; i < athlete.mesh.geometry.attributes.position.count; i++) {
        const p = athlete.mesh.getVertexPosition(i, new Vector3())
        const inside =
          Math.abs(p.x) < 0.315 && p.z > -0.59 && p.z < -0.21 && p.y > 0.705 && p.y < 0.735
        if (inside) throw new Error(`bench penetration at ${step}% vertex ${i}`)
      }
    }
  } finally {
    athlete.dispose()
  }
})
