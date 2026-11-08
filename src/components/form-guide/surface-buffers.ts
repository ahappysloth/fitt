interface SharedSurface {
  vertices: number
  positions: string
  indices: string
  skinIndices: string
  skinWeights: string
}

export interface ModelSurface {
  positions: string
  normals?: string
  topology?: {
    baseVertexCount: number
    edgeParents: string
    indices: string
  }
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer
}

/** Refined vertices keep their canonical ancestry for skinning and muscle masks. */
export function surfaceBuffers(shared: SharedSurface, surface: ModelSurface) {
  const positions = new Float32Array(decode(surface.positions))
  const normals = surface.normals ? new Float32Array(decode(surface.normals)) : undefined
  const parents = new Uint16Array(decode(surface.topology?.edgeParents ?? ''))
  const count = shared.vertices + parents.length / 2
  if (
    parents.length % 2 ||
    positions.length !== count * 3 ||
    (surface.topology && surface.topology.baseVertexCount !== shared.vertices)
  )
    throw new Error('The model surface does not match its canonical mesh.')
  if (normals) {
    if (normals.length !== positions.length)
      throw new Error('Model normals do not match its surface.')
    for (let offset = 0; offset < normals.length; offset += 3) {
      const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2])
      if (!Number.isFinite(length) || Math.abs(length - 1) > 0.01)
        throw new Error('Model normals must be finite unit vectors.')
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
  const indices = new Uint16Array(decode(surface.topology?.indices ?? shared.indices))
  if (indices.length % 3 || indices.some((index) => index >= count))
    throw new Error('The model triangle indices do not match its surface.')
  return { positions, normals, canonical, parents, indices, skinIndices, skinWeights }
}

export function refineWeights(base: Float32Array, parents: Uint16Array) {
  if (!parents.length) return base
  const result = new Float32Array(base.length + parents.length / 2)
  result.set(base)
  for (let offset = 0; offset < parents.length; offset += 2)
    result[base.length + offset / 2] = (result[parents[offset]] + result[parents[offset + 1]]) / 2
  return result
}
