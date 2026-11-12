import type { RodProp, StageProp } from './contracts'

/*
 * Equipment for 3D guides, composed from the scene's box/rod/ring primitives.
 * Units are metres with y up and the athlete facing +z, matching the rig.
 * Each helper returns props for `GuideMotion.stage.props`; motions place
 * equipment by its contact surface (bench top, bar centre, wall face) so a
 * pose can target the same coordinates.
 */
type Vec3 = readonly [number, number, number]
const leg = 0.04

/** A bench or step: `top` is the centre of its upper surface. */
export function bench(top: Vec3, size: { width?: number; depth?: number } = {}): StageProp[] {
  const [x, y, z] = top
  const width = size.width ?? 0.36
  const depth = size.depth ?? 0.9
  const thickness = 0.05
  const props: StageProp[] = [
    { kind: 'box', center: [x, y - thickness / 2, z], size: [width, thickness, depth] },
  ]
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      props.push({
        kind: 'box',
        center: [x + sx * (width / 2 - leg), (y - thickness) / 2, z + sz * (depth / 2 - leg)],
        size: [leg, y - thickness, leg],
      })
  return props
}

/** A table: like a bench, but wider, with a thin top an athlete can grip from below. */
export function table(top: Vec3, size: { width?: number; depth?: number } = {}): StageProp[] {
  return bench(top, { width: size.width ?? 1.4, depth: size.depth ?? 0.8 })
}

/** A wall whose face is the plane z = `face`, spanning the athlete's width. */
export function wall(face: number, height = 2.4, width = 2): StageProp[] {
  const thickness = 0.12
  return [
    {
      kind: 'box',
      center: [0, height / 2, face + thickness / 2],
      size: [width, height, thickness],
      surface: true,
    },
  ]
}

/** A door frame the athlete grips from inside: two jambs at x = ±halfWidth, face at z = `face`. */
export function doorframe(face: number, halfWidth = 0.42, height = 2.05): StageProp[] {
  const jamb = 0.09
  const props: StageProp[] = [-1, 1].map((side) => ({
    kind: 'box',
    center: [side * (halfWidth + jamb / 2), height / 2, face + jamb / 2],
    size: [jamb, height, jamb],
  }))
  props.push({
    kind: 'box',
    center: [0, height + jamb / 2, face + jamb / 2],
    size: [halfWidth * 2 + jamb * 2, jamb, jamb],
  })
  return props
}

/** A pair of parallettes: grips at height `height`, at x = ±halfWidth, centred on z. */
export function parallettes(z: number, halfWidth = 0.27, height = 0.3, length = 0.45): StageProp[] {
  const props: StageProp[] = []
  for (const side of [-1, 1]) {
    const x = side * halfWidth
    props.push({ kind: 'rod', from: [x, height, z - length / 2], to: [x, height, z + length / 2] })
    for (const end of [-1, 1]) {
      const zEnd = z + (end * length) / 2
      props.push({ kind: 'rod', from: [x, 0, zEnd], to: [x, height, zEnd] })
      props.push({
        kind: 'rod',
        from: [x - 0.08, 0.01, zEnd],
        to: [x + 0.08, 0.01, zEnd],
        radius: 0.015,
      })
    }
  }
  return props
}

/**
 * Gymnastic rings hanging from an anchor height: ring centres at `ringHeight`,
 * at x = ±halfWidth, on z. Straps run up to the anchor.
 */
export function rings(z: number, ringHeight: number, halfWidth = 0.25, anchor = 2.6): StageProp[] {
  const props: StageProp[] = []
  for (const side of [-1, 1]) {
    const x = side * halfWidth
    props.push({ kind: 'ring', center: [x, ringHeight, z] })
    props.push({ kind: 'rod', from: [x, ringHeight + 0.09, z], to: [x, anchor, z], radius: 0.008 })
  }
  return props
}

/**
 * A resistance band between two points, such as a foot and a hand. Bands
 * stretch as the athlete moves, so motions usually return them per frame in
 * `PoseFrame.rods` rather than in the static stage props.
 */
export function band(from: Vec3 | { x: number; y: number; z: number }, to: typeof from): RodProp {
  const point = (p: typeof from): Vec3 => ('x' in p ? [p.x, p.y, p.z] : p)
  return { kind: 'rod', from: point(from), to: point(to), radius: 0.007, band: true }
}
