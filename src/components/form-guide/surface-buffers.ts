interface SharedSurface {
  vertices: number
  positions: string
  indices: string
  skinIndices: string
  skinWeights: string
}

/**
 * A body surface, stored relative to the shared canonical mesh:
 * `offsets` are int16 XYZ steps of `offsetScale` metres from each canonical
 * vertex, `normals` are int16 unit vectors (÷ 32767), and `topology` lists only
 * the shared triangles a local refinement removed and the ones it added.
 */
export interface ModelSurface {
  offsets: string
  offsetScale: number
  normals?: string
  topology?: {
    baseVertexCount: number
    edgeParents: string
    removedTriangles: string
    addedIndices: string
  }
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer
}

/** Refined vertices keep their canonical ancestry for skinning and muscle masks. */
export function surfaceBuffers(shared: SharedSurface, surface: ModelSurface) {
  const offsets = new Int16Array(decode(surface.offsets))
  const packedNormals = surface.normals ? new Int16Array(decode(surface.normals)) : undefined
  const parents = new Uint16Array(decode(surface.topology?.edgeParents ?? ''))
  const count = shared.vertices + parents.length / 2
  if (
    parents.length % 2 ||
    offsets.length !== count * 3 ||
    !Number.isFinite(surface.offsetScale) ||
    (surface.topology && surface.topology.baseVertexCount !== shared.vertices)
  )
    throw new Error('The model surface does not match its canonical mesh.')
  let normals: Float32Array | undefined
  if (packedNormals) {
    if (packedNormals.length !== offsets.length)
      throw new Error('Model normals do not match its surface.')
    normals = new Float32Array(packedNormals.length)
    for (let offset = 0; offset < normals.length; offset += 3) {
      const x = packedNormals[offset] / 32767,
        y = packedNormals[offset + 1] / 32767,
        z = packedNormals[offset + 2] / 32767
      const length = Math.hypot(x, y, z)
      if (Math.abs(length - 1) > 0.01) throw new Error('Model normals must be unit vectors.')
      normals[offset] = x / length
      normals[offset + 1] = y / length
      normals[offset + 2] = z / length
    }
  }
  const canonical = new Float32Array(count * 3)
  const skinIndices = new Uint8Array(count * 4)
  const skinWeights = new Uint16Array(count * 4)
  canonical.set(new Float32Array(decode(shared.positions)))
  skinIndices.set(new Uint8Array(decode(shared.skinIndices)))
  skinWeights.set(new Uint16Array(decode(shared.skinWeights)))
  for (let offset = 0; offset < parents.length; offset += 2) {
    const index = shared.vertices + offset / 2
    const left = parents[offset],
      right = parents[offset + 1]
    if (left >= index || right >= index) throw new Error('Model ancestry must precede its vertex.')
    for (let axis = 0; axis < 3; axis++)
      canonical[index * 3 + axis] = (canonical[left * 3 + axis] + canonical[right * 3 + axis]) / 2
    const influences = new Map<number, number>()
    for (const parent of [left, right])
      for (let slot = 0; slot < 4; slot++) {
        const bone = skinIndices[parent * 4 + slot]
        const weight = skinWeights[parent * 4 + slot]
        if (weight) influences.set(bone, (influences.get(bone) ?? 0) + weight)
      }
    const strongest = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4)
    const total = strongest.reduce((sum, entry) => sum + entry[1], 0)
    if (!total) throw new Error('A refined model vertex has no skin weights.')
    let normalized = 0
    strongest.forEach(([bone, weight], slot) => {
      skinIndices[index * 4 + slot] = bone
      const value = Math.round((weight / total) * 65535)
      skinWeights[index * 4 + slot] = value
      normalized += value
    })
    skinWeights[index * 4] += 65535 - normalized
  }
  // A zero offset reproduces the canonical coordinate exactly, so contact
  // surfaces a body shares with the canonical mesh stay bit-identical.
  const positions = new Float32Array(count * 3)
  for (let offset = 0; offset < positions.length; offset++)
    positions[offset] = canonical[offset] + offsets[offset] * surface.offsetScale
  const indices = triangleIndices(shared, surface.topology)
  if (indices.length % 3 || indices.some((index) => index >= count))
    throw new Error('The model triangle indices do not match its surface.')
  return { positions, normals, canonical, parents, indices, skinIndices, skinWeights }
}

function triangleIndices(shared: SharedSurface, topology: ModelSurface['topology']) {
  const base = new Uint16Array(decode(shared.indices))
  if (!topology) return base
  const removed = new Uint16Array(decode(topology.removedTriangles))
  const added = new Uint16Array(decode(topology.addedIndices))
  const indices = new Uint16Array(base.length - removed.length * 3 + added.length)
  const dropped = new Uint8Array(base.length / 3)
  for (const triangle of removed) {
    if (triangle >= dropped.length || dropped[triangle])
      throw new Error('The model triangle indices do not match its surface.')
    dropped[triangle] = 1
  }
  let offset = 0
  for (let triangle = 0; triangle < dropped.length; triangle++)
    if (!dropped[triangle]) {
      indices.set(base.subarray(triangle * 3, triangle * 3 + 3), offset)
      offset += 3
    }
  indices.set(added, offset)
  return indices
}

export function refineWeights(base: Float32Array, parents: Uint16Array) {
  if (!parents.length) return base
  const result = new Float32Array(base.length + parents.length / 2)
  result.set(base)
  for (let offset = 0; offset < parents.length; offset += 2)
    result[base.length + offset / 2] = (result[parents[offset]] + result[parents[offset + 1]]) / 2
  return result
}
