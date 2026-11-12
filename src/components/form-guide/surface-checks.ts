import { Vector3 } from 'three'
import { expect } from 'vitest'
import type { GuideMotion } from './contracts'
import { apply, head } from './full-body-rig'
import type { createAthlete } from './athlete'
import data from './body-data.json'

/*
 * Surface and rig checks shared by the motion tests. Not imported by the app.
 */
type Athlete = ReturnType<typeof createAthlete>
const patterns: [string, RegExp][] = [
  ['head', /^(head|neck|jaw|eye|tongue|oris|levator|temporalis|special|nose|cheek|brow|ear|lip)/],
  ['upperBack', /^(spine01|spine02|clavicle|shoulder01|breast)/],
  ['pelvis', /^(spine03|spine04|spine05|root|pelvis)/],
  ['thigh.L', /^upperleg.*\.L$/],
  ['thigh.R', /^upperleg.*\.R$/],
  ['shin.L', /^lowerleg.*\.L$/],
  ['shin.R', /^lowerleg.*\.R$/],
  ['foot.L', /^(foot|toe).*\.L$/],
  ['foot.R', /^(foot|toe).*\.R$/],
  ['hand', /^(wrist|metacarpal|finger)/],
]

/** Each vertex's region, from its most heavily weighted bone. */
export function bodyRegions(athlete: Athlete) {
  const { skinIndex, skinWeight, position } = athlete.mesh.geometry.attributes
  return Array.from({ length: position.count }, (_, vertex) => {
    let weight = 0,
      bone = 0
    for (let slot = 0; slot < 4; slot++)
      if (skinWeight.getComponent(vertex, slot) > weight) {
        weight = skinWeight.getComponent(vertex, slot)
        bone = skinIndex.getComponent(vertex, slot)
      }
    const name = data.bones[bone].name
    return patterns.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other'
  })
}

/** Lowest posed surface point overall (`all`) and per region; throws on a nonfinite vertex. */
export function lowestByRegion(athlete: Athlete, regions: string[]) {
  const result: Record<string, number> = { all: Infinity }
  const point = new Vector3()
  for (let vertex = 0; vertex < regions.length; vertex++) {
    athlete.mesh.getVertexPosition(vertex, point)
    if (![point.x, point.y, point.z].every(Number.isFinite))
      throw new Error(`Nonfinite vertex ${vertex}`)
    result.all = Math.min(result.all, point.y)
    result[regions[vertex]] = Math.min(result[regions[vertex]] ?? Infinity, point.y)
  }
  return result
}

/**
 * Shoulder-attachment triangles and a measure of their fifth-percentile area
 * ratio against rest. The lower tail detects pinched triangles that an average
 * hides; the pull-up regression requires it to stay above 0.35.
 */
export function shoulderArea(athlete: Athlete) {
  const geometry = athlete.mesh.geometry
  const canonical = geometry.attributes.canonicalPosition
  const position = geometry.attributes.position
  const area = (points: Vector3[]) =>
    points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length()
  const triangles: { ids: number[]; area: number }[] = []
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
  return {
    count: triangles.length,
    lowTail() {
      const ratios = triangles
        .map(
          (triangle) =>
            area(triangle.ids.map((id) => athlete.mesh.getVertexPosition(id, new Vector3()))) /
            triangle.area,
        )
        .sort((a, b) => a - b)
      return ratios[Math.floor(ratios.length * 0.05)]
    },
  }
}

/**
 * Every bone keeps its rest length to its parent, rotations stay unit length,
 * no bone jumps more than `maxStep` metres between 1% steps (a flipped limb
 * would), and the loop closes exactly. Uses vitest's expect: tests only.
 */
export function expectRigIntact(motion: GuideMotion, maxStep: number) {
  for (const model of ['male', 'female'] as const) {
    const start = motion.sample(0, model)
    let previous = start
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100
      const frame = motion.sample(progress, model)
      expect(frame.transforms.size).toBe(data.bones.length + 1)
      for (const bone of data.bones) {
        const transform = frame.transforms.get(bone.name)!
        expect(Math.abs(transform.rotation.length() - 1)).toBeLessThan(1e-10)
        const position = apply(transform, head(bone.name))
        expect(
          position.distanceTo(apply(previous.transforms.get(bone.name)!, head(bone.name))),
        ).toBeLessThan(maxStep)
        if (bone.parent >= 0) {
          const parent = data.bones[bone.parent]
          expect(
            position.distanceTo(apply(frame.transforms.get(parent.name)!, head(parent.name))),
          ).toBeCloseTo(head(bone.name).distanceTo(head(parent.name)), 9)
        }
        if (step === 100)
          expect(
            position.distanceTo(apply(start.transforms.get(bone.name)!, head(bone.name))),
          ).toBeLessThan(1e-10)
      }
      previous = frame
    }
  }
}
