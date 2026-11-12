import { Vector3 } from 'three'
import type { createAthlete } from './athlete'
import data from './body-data.json'

/*
 * Surface measurements shared by the motion tests. Not imported by the app.
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
