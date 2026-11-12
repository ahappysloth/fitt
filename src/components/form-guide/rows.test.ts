import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { apply, head } from './full-body-rig'
import { proneMotions } from './prone'
import { ringRowLayout, rowMotions } from './rows'
import data from './body-data.json'
import { bodyRegions, lowestByRegion, shoulderArea } from './surface-checks'
import type { GuideMotion } from './contracts'

const motions = [...proneMotions, ...rowMotions]
const byId = Object.fromEntries(motions.map((motion) => [motion.id, motion]))
const models = ['male', 'female'] as const
const steps = (count: number) => Array.from({ length: count + 1 }, (_, step) => step / count)
const angleAt = (a: Vector3, joint: Vector3, b: Vector3) =>
  (a.clone().sub(joint).angleTo(b.clone().sub(joint)) * 180) / Math.PI

/** Lowest point per region, with left and right merged into torso, thigh and foot. */
function lowest(athlete: ReturnType<typeof createAthlete>, regions: string[]) {
  const floor = lowestByRegion(athlete, regions)
  return {
    all: floor.all,
    torso: Math.min(floor.upperBack, floor.pelvis),
    thigh: Math.min(floor['thigh.L'], floor['thigh.R']),
    foot: Math.min(floor['foot.L'], floor['foot.R']),
  }
}

describe('floor pulls and rows', () => {
  for (const motion of motions) {
    it(`${motion.id}: preserves joint connections, lengths and the loop seam`, () => {
      for (const model of models) {
        const start = motion.sample(0, model)
        let previous = start
        for (const progress of steps(100)) {
          const frame = motion.sample(progress, model)
          expect(frame.transforms.size).toBe(data.bones.length + 1)
          for (const bone of data.bones) {
            const transform = frame.transforms.get(bone.name)!
            expect(Math.abs(transform.rotation.length() - 1)).toBeLessThan(1e-10)
            const position = apply(transform, head(bone.name))
            expect(
              position.distanceTo(apply(previous.transforms.get(bone.name)!, head(bone.name))),
              // Fingertips sweep fastest in the snow angel; a flip would jump far more.
            ).toBeLessThan(0.07)
            if (bone.parent >= 0) {
              const parent = data.bones[bone.parent]
              expect(
                position.distanceTo(apply(frame.transforms.get(parent.name)!, head(parent.name))),
              ).toBeCloseTo(head(bone.name).distanceTo(head(parent.name)), 9)
            }
            if (progress === 1)
              expect(
                position.distanceTo(apply(start.transforms.get(bone.name)!, head(bone.name))),
              ).toBeLessThan(1e-10)
          }
          previous = frame
        }
      }
    })
  }

  it.each(models)('rests the prone drills on the %s chest, hips and thighs', (model) => {
    const athlete = createAthlete(model)
    try {
      const groups = bodyRegions(athlete)
      for (const motion of proneMotions)
        for (const progress of steps(12)) {
          athlete.applyPose(motion.sample(progress, model))
          const floor = lowest(athlete, groups)
          // Nothing sinks visibly; the torso and thighs touch, the feet lie close.
          expect(floor.all).toBeGreaterThan(-0.008)
          expect(floor.torso).toBeLessThan(0.012)
          expect(floor.thigh).toBeLessThan(0.02)
          expect(floor.foot).toBeLessThan(0.04)
        }
    } finally {
      athlete.dispose()
    }
  })

  it.each(models)('plants the %s heels for the ring rows and seats the band row', (model) => {
    const athlete = createAthlete(model)
    try {
      const groups = bodyRegions(athlete)
      for (const progress of steps(12)) {
        for (const id of ['ring-row', 'low-ring-row']) {
          athlete.applyPose(byId[id].sample(progress, model))
          const floor = lowest(athlete, groups)
          expect(floor.all).toBeGreaterThan(-0.01)
          expect(floor.foot).toBeLessThan(0.01)
        }
        athlete.applyPose(byId['band-row'].sample(progress, model))
        const floor = lowest(athlete, groups)
        expect(floor.all).toBeGreaterThan(-0.008)
        expect(Math.min(floor.torso, floor.thigh)).toBeLessThan(0.005)
      }
    } finally {
      athlete.dispose()
    }
  })

  it('keeps ring-row hands on the rings, from straight arms to a deep pull', () => {
    for (const id of ['ring-row', 'low-ring-row'] as const) {
      const layout = ringRowLayout[id]
      const rings = byId[id].stage!.props!.filter((prop) => prop.kind === 'ring')
      for (const progress of steps(50)) {
        const frame = byId[id].sample(progress)
        frame.wrists.forEach((wrist, index) => {
          const ring = rings.find((prop) => Math.sign(prop.center[0]) === Math.sign(wrist.x))!
          expect(wrist.distanceTo(layout.wrists[index ? 'R' : 'L'])).toBeLessThan(1e-9)
          // The palm holds the bottom of its ring.
          expect(wrist.distanceTo(new Vector3(...ring.center))).toBeLessThan(0.1)
        })
      }
      const bottom = byId[id].sample(0)
      const top = byId[id].sample(0.53)
      for (const index of [0, 1]) {
        expect(
          angleAt(bottom.shoulders[index], bottom.elbows[index], bottom.wrists[index]),
        ).toBeGreaterThan(165)
        expect(angleAt(top.shoulders[index], top.elbows[index], top.wrists[index])).toBeLessThan(
          100,
        )
      }
    }
    // Ring row leans about 45 degrees, the low ring row much closer to horizontal.
    expect((ringRowLayout['ring-row'].bottom * 180) / Math.PI).toBeCloseTo(45)
    expect((ringRowLayout['low-ring-row'].bottom * 180) / Math.PI).toBeCloseTo(22)
  })

  it('stretches the band from the soles to the hands in every frame', () => {
    for (const progress of steps(50)) {
      const frame = byId['band-row'].sample(progress)
      const [across, left, right] = frame.rods!
      expect(across.band && left.band && right.band).toBe(true)
      expect(new Vector3(...left.from).distanceTo(new Vector3(...across.from))).toBeLessThan(1e-9)
      expect(new Vector3(...right.from).distanceTo(new Vector3(...across.to))).toBeLessThan(1e-9)
      ;[left, right].forEach((strand, index) => {
        const side = index ? 'R' : 'L'
        const grip = apply(frame.transforms.get(`wrist.${side}`)!, head(`finger3-1.${side}`))
        expect(new Vector3(...strand.to).distanceTo(grip)).toBeLessThan(1e-9)
        const foot = apply(frame.transforms.get(`foot.${side}`)!, head(`foot.${side}`))
        expect(new Vector3(...strand.from).distanceTo(foot)).toBeLessThan(0.15)
      })
    }
    // Hands travel from long arms to the lower ribs.
    const reach = byId['band-row'].sample(0)
    const squeeze = byId['band-row'].sample(0.53)
    expect(reach.wrists[0].z - squeeze.wrists[0].z).toBeGreaterThan(0.3)
  })

  it('moves the prone arms through a Y to a W, and from the hips to overhead', () => {
    const relative = (motion: GuideMotion, progress: number) => {
      const frame = motion.sample(progress)
      return frame.wrists.map((wrist, index) => wrist.clone().sub(frame.shoulders[index]))
    }
    for (const offset of relative(byId['prone-pulldown'], 0)) expect(offset.z).toBeGreaterThan(0.3)
    for (const offset of relative(byId['prone-pulldown'], 0.53))
      expect(Math.abs(offset.z)).toBeLessThan(0.1)
    for (const offset of relative(byId['reverse-snow-angel'], 0))
      expect(offset.z).toBeLessThan(-0.3)
    for (const offset of relative(byId['reverse-snow-angel'], 0.53))
      expect(offset.z).toBeGreaterThan(0.3)
  })

  it('reports only phases from each motion’s own list', () => {
    for (const motion of motions)
      for (const progress of steps(100))
        expect(motion.phases).toContain(motion.describe(progress).phase)
  })
})

for (const motion of motions) {
  it.each(models)(`${motion.id} retains %s shoulder area`, (model) => {
    const athlete = createAthlete(model)
    try {
      const shoulder = shoulderArea(athlete)
      expect(shoulder.count).toBeGreaterThan(400)
      for (const progress of [0, 0.16, 0.24, 0.4, 0.53, 0.75, 1]) {
        athlete.applyPose(motion.sample(progress, model))
        expect(shoulder.lowTail()).toBeGreaterThan(0.35)
      }
    } finally {
      athlete.dispose()
    }
  })
}
