import type { BufferGeometry } from 'three'

/** Polish the lighting field without relaxing the sculpt, rig or contact points. */
export function finishSurfaceNormals(geometry: BufferGeometry) {
  const normal = geometry.getAttribute('normal')
  const triangles = geometry.getIndex()
  if (!normal || !triangles) return

  const original = Float32Array.from(normal.array)
  const minimumAlignment = Math.cos(Math.PI / 9)
  const maximumTangent = Math.sin(Math.PI / 9)
  let current = original.slice()
  // Work along existing edges only: disconnected eyes, lips and fingers must
  // never pick up the shading of a nearby surface on the other side of a gap.
  const neighbors = Array.from({ length: normal.count }, () => new Set<number>())
  for (let offset = 0; offset < triangles.count; offset += 3) {
    const ids = [triangles.getX(offset), triangles.getX(offset + 1), triangles.getX(offset + 2)]
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge],
        b = ids[(edge + 1) % 3]
      neighbors[a].add(b)
      neighbors[b].add(a)
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const next = current.slice()
    for (let vertex = 0; vertex < normal.count; vertex++) {
      const offset = vertex * 3
      const x = current[offset],
        y = current[offset + 1],
        z = current[offset + 2]
      let sumX = 0,
        sumY = 0,
        sumZ = 0,
        total = 0
      for (const other of neighbors[vertex]) {
        const neighbor = other * 3
        const dot =
          original[offset] * original[neighbor] +
          original[offset + 1] * original[neighbor + 1] +
          original[offset + 2] * original[neighbor + 2]
        // Keep genuine creases. The soft gate also avoids a visible threshold
        // between a polished broad muscle and a sharper anatomical feature.
        const weight = Math.max(0, (dot - 0.5) / 0.5) ** 2
        sumX += current[neighbor] * weight
        sumY += current[neighbor + 1] * weight
        sumZ += current[neighbor + 2] * weight
        total += weight
      }
      if (!total) continue
      let nx = x * 0.45 + (sumX / total) * 0.55
      let ny = y * 0.45 + (sumY / total) * 0.55
      let nz = z * 0.45 + (sumZ / total) * 0.55
      const length = Math.hypot(nx, ny, nz)
      nx /= length
      ny /= length
      nz /= length
      // Limit the lighting change to 20 degrees from the authored field, so
      // repeated polishing cannot flatten facial folds or broad muscle planes.
      const alignment =
        nx * original[offset] + ny * original[offset + 1] + nz * original[offset + 2]
      if (alignment < minimumAlignment) {
        const tangentScale = maximumTangent / Math.sqrt(1 - alignment * alignment)
        nx =
          original[offset] * minimumAlignment + (nx - original[offset] * alignment) * tangentScale
        ny =
          original[offset + 1] * minimumAlignment +
          (ny - original[offset + 1] * alignment) * tangentScale
        nz =
          original[offset + 2] * minimumAlignment +
          (nz - original[offset + 2] * alignment) * tangentScale
      }
      next[offset] = nx
      next[offset + 1] = ny
      next[offset + 2] = nz
    }
    current = next
  }
  normal.array.set(current)
  normal.needsUpdate = true
}
