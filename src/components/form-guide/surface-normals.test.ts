import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { createAthlete } from './athlete'
import male from './male-body-data.json'
import female from './female-body-data.json'
import { finishSurfaceNormals } from './surface-normals'

describe('the shared model finish', () => {
  it.each(['male', 'female'] as const)(
    'polishes %s shading without changing its sculpt or reversing outward lighting',
    (model) => {
      const athlete = createAthlete(model)
      try {
        const geometry = athlete.mesh.geometry
        const baseline = geometry.clone()
        if (model === 'female') {
          const bytes = Uint8Array.from(atob(female.normals), (character) =>
            character.charCodeAt(0),
          )
          baseline.setAttribute('normal', new BufferAttribute(new Float32Array(bytes.buffer), 3))
        } else baseline.computeVertexNormals()
        try {
          const asset = model === 'male' ? male : female
          const bytes = Uint8Array.from(atob(asset.positions), (character) =>
            character.charCodeAt(0),
          )
          expect(geometry.attributes.position.array).toEqual(new Float32Array(bytes.buffer))
          const source = baseline.attributes.normal
          const polished = geometry.attributes.normal
          const before = new Vector3(),
            after = new Vector3()
          for (let vertex = 0; vertex < polished.count; vertex++) {
            before.fromBufferAttribute(source, vertex)
            after.fromBufferAttribute(polished, vertex)
            expect(Number.isFinite(after.length())).toBe(true)
            expect(after.length()).toBeCloseTo(1, 5)
            expect(before.dot(after)).toBeGreaterThan(Math.cos(Math.PI / 9) - 1e-6)
          }
          let originalVariation = 0,
            polishedVariation = 0
          const indices = geometry.index!
          for (let offset = 0; offset < indices.count; offset += 3) {
            const ids = [0, 1, 2].map((corner) => indices.getX(offset + corner))
            const points = ids.map((id) =>
              new Vector3().fromBufferAttribute(geometry.attributes.position, id),
            )
            const face = points[1].sub(points[0]).cross(points[2].sub(points[0])).normalize()
            const mean = (attribute: typeof source) =>
              ids
                .reduce(
                  (sum, id) => sum.add(new Vector3().fromBufferAttribute(attribute, id)),
                  new Vector3(),
                )
                .normalize()
            if (face.dot(mean(source)) > 0) expect(face.dot(mean(polished))).toBeGreaterThan(0)
            for (let edge = 0; edge < 3; edge++) {
              const a = ids[edge],
                b = ids[(edge + 1) % 3]
              originalVariation += before
                .fromBufferAttribute(source, a)
                .distanceToSquared(after.fromBufferAttribute(source, b))
              polishedVariation += before
                .fromBufferAttribute(polished, a)
                .distanceToSquared(after.fromBufferAttribute(polished, b))
            }
          }
          expect(polishedVariation).toBeLessThan(originalVariation)
        } finally {
          baseline.dispose()
        }
      } finally {
        athlete.dispose()
      }
    },
  )

  it('does not blend disconnected nearby surfaces', () => {
    const geometry = new BufferGeometry()
    try {
      // Two perpendicular surfaces whose vertices occupy the same seam.
      geometry.setAttribute(
        'position',
        new BufferAttribute(
          new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]),
          3,
        ),
      )
      geometry.setIndex([0, 1, 2, 3, 4, 5])
      geometry.computeVertexNormals()
      const original = geometry.attributes.normal.array.slice()
      finishSurfaceNormals(geometry)
      expect(geometry.attributes.normal.array).toEqual(original)
    } finally {
      geometry.dispose()
    }
  })
})
