import { describe, expect, it } from 'vitest'
import { refineWeights, surfaceBuffers } from './surface-buffers'

const encode = (values: Float32Array | Uint16Array | Int16Array | Uint8Array) =>
  Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64')
const shared = {
  vertices: 3,
  positions: encode(new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0])),
  indices: encode(new Uint16Array([0, 1, 2])),
  skinIndices: encode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 1, 0, 0, 0])),
  skinWeights: encode(
    new Uint16Array([30000, 20000, 10000, 5535, 30000, 20000, 10000, 5535, 65535, 0, 0, 0]),
  ),
}
// Offsets count steps of `offsetScale` from the canonical vertex (appended
// vertices: from the midpoint of their parents).
const still = { offsetScale: 0.125, offsets: encode(new Int16Array(9)) }
const refined = {
  offsetScale: 0.125,
  offsets: encode(new Int16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2])),
  topology: {
    baseVertexCount: 3,
    edgeParents: encode(new Uint16Array([0, 1, 3, 2])),
    removedTriangles: encode(new Uint16Array([0])),
    addedIndices: encode(new Uint16Array([0, 3, 4, 0, 4, 2, 3, 1, 4, 1, 2, 4])),
  },
}

describe('local surface refinement', () => {
  it('preserves the base and derives recursive canonical coordinates and normalized skin weights', () => {
    const result = surfaceBuffers(shared, refined)
    expect([...result.canonical]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 0, 0, 0.5, 1, 0])
    expect([...result.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 0, 0.25, 0.5, 1, 0.25])
    expect([...result.indices]).toEqual([0, 3, 4, 0, 4, 2, 3, 1, 4, 1, 2, 4])
    expect([...result.skinIndices.slice(12, 16)]).toEqual([0, 4, 1, 5])
    expect([...result.skinWeights.slice(0, 12)]).toEqual([
      30000, 20000, 10000, 5535, 30000, 20000, 10000, 5535, 65535, 0, 0, 0,
    ])
    for (const index of [3, 4]) {
      expect(
        [...result.skinWeights.slice(index * 4, index * 4 + 4)].reduce(
          (sum, weight) => sum + weight,
          0,
        ),
      ).toBe(65535)
      expect(new Set(result.skinIndices.slice(index * 4, index * 4 + 4)).size).toBe(4)
    }
  })

  it('interpolates muscle masks through the same ancestry without changing the shared mask', () => {
    const base = new Float32Array([0, 0.5, 1])
    const { parents } = surfaceBuffers(shared, refined)
    expect([...refineWeights(base, parents)]).toEqual([0, 0.5, 1, 0.25, 0.625])
    expect([...base]).toEqual([0, 0.5, 1])
  })

  it('reproduces the canonical surface exactly where a body has no offset', () => {
    const result = surfaceBuffers(shared, still)
    expect(result.positions).toEqual(result.canonical)
    expect([...result.indices]).toEqual([0, 1, 2])
    expect(result.parents).toHaveLength(0)
  })

  it('accepts normalized authored normals and rejects invalid lighting data', () => {
    const normals = encode(new Int16Array(Array.from({ length: 5 }, () => [0, 0, 32767]).flat()))
    const result = surfaceBuffers(shared, { ...refined, normals })
    expect(result.normals).toHaveLength(result.positions.length)
    expect(result.normals![2]).toBe(1)
    expect(() =>
      surfaceBuffers(shared, { ...refined, normals: encode(new Int16Array([0, 0, 32767])) }),
    ).toThrow('match')
    const invalid = new Int16Array(15).fill(32767)
    expect(() => surfaceBuffers(shared, { ...refined, normals: encode(invalid) })).toThrow('unit')
  })

  it('rejects mismatched ancestry and triangle indices before building a mesh', () => {
    expect(() =>
      surfaceBuffers(shared, { ...refined, topology: { ...refined.topology, baseVertexCount: 2 } }),
    ).toThrow('canonical mesh')
    expect(() =>
      surfaceBuffers(shared, {
        ...refined,
        topology: { ...refined.topology, edgeParents: encode(new Uint16Array([0, 4, 3, 2])) },
      }),
    ).toThrow('precede')
    expect(() =>
      surfaceBuffers(shared, {
        ...refined,
        topology: { ...refined.topology, addedIndices: encode(new Uint16Array([0, 1, 5])) },
      }),
    ).toThrow('triangle indices')
    expect(() =>
      surfaceBuffers(shared, {
        ...refined,
        topology: { ...refined.topology, removedTriangles: encode(new Uint16Array([1])) },
      }),
    ).toThrow('triangle indices')
    expect(() => surfaceBuffers(shared, { ...still, offsets: encode(new Int16Array(6)) })).toThrow(
      'canonical mesh',
    )
  })
})
