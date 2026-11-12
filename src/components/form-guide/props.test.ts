import { describe, expect, it } from 'vitest'
import { band, bench, doorframe, parallettes, rings, table, wall } from './props'
import type { StageProp } from './contracts'

const boxes = (props: StageProp[]) =>
  props.filter((prop): prop is Extract<StageProp, { kind: 'box' }> => prop.kind === 'box')
const top = (box: Extract<StageProp, { kind: 'box' }>) => box.center[1] + box.size[1] / 2

describe('equipment props', () => {
  it('puts a bench or table top exactly at the requested contact height, on legs to the floor', () => {
    for (const props of [bench([0, 0.45, 0.6]), table([0, 0.75, 0])]) {
      const [surface, ...legs] = boxes(props)
      expect(legs).toHaveLength(4)
      for (const leg of legs) {
        expect(leg.center[1] - leg.size[1] / 2).toBeCloseTo(0)
        expect(top(leg)).toBeCloseTo(surface.center[1] - surface.size[1] / 2)
      }
    }
    expect(top(boxes(bench([0, 0.45, 0.6]))[0])).toBeCloseTo(0.45)
    expect(top(boxes(table([0, 0.75, 0]))[0])).toBeCloseTo(0.75)
  })
  it('places wall and door-frame faces on the requested plane', () => {
    const [face] = boxes(wall(-0.5))
    expect(face.center[2] - face.size[2] / 2).toBeCloseTo(-0.5)
    expect(face.surface).toBe(true)
    for (const jamb of boxes(doorframe(-0.4)))
      expect(jamb.center[2] - jamb.size[2] / 2).toBeCloseTo(-0.4)
  })
  it('puts parallette grips and ring centres where hands will hold them', () => {
    const grips = parallettes(0.6).filter(
      (prop) => prop.kind === 'rod' && prop.from[1] === 0.3 && prop.to[1] === 0.3,
    )
    expect(grips).toHaveLength(2)
    const pair = rings(0, 1.2).filter((prop) => prop.kind === 'ring')
    expect(pair.map((prop) => prop.center)).toEqual([
      [-0.25, 1.2, 0],
      [0.25, 1.2, 0],
    ])
  })
  it('draws a band between two points given as tuples or vectors', () => {
    const strand = band([0, 0.1, 0.9], { x: 0.1, y: 0.8, z: 0.3 })
    expect(strand).toMatchObject({
      kind: 'rod',
      from: [0, 0.1, 0.9],
      to: [0.1, 0.8, 0.3],
      band: true,
    })
    expect(strand.radius).toBeLessThan(0.018)
  })
})
