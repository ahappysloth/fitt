import { describe, expect, it } from 'vitest'
import { createAthlete } from './athlete'
import data from './body-data.json'
import { muscleFeather, muscleLayer, muscleRegionWeights, previewMuscles } from './muscle-regions'
import { kneePushupPose } from './knee-pushup'
import { muscleNames } from '../../lib/catalog'

const raw = Uint8Array.from(atob(data.positions), (character) => character.charCodeAt(0))
const positions = new Float32Array(raw.buffer)
const masks = Array.from({ length: data.vertices }, (_, index) =>
  muscleRegionWeights(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]),
)

describe('shared muscle regions', () => {
  it('covers every app muscle on both sides without painting the head or feet', () => {
    expect(new Set(previewMuscles)).toEqual(new Set(Object.keys(muscleNames)))
    for (const muscle of previewMuscles) {
      const coverage = { left: 0, right: 0 }
      let invalid = 0,
        outsideBody = 0
      masks.forEach((mask, index) => {
        const x = positions[index * 3],
          y = positions[index * 3 + 1]
        if (!Number.isFinite(mask[muscle]) || mask[muscle] < 0 || mask[muscle] > 1) invalid++
        if ((y > 0.62 || y < -0.73) && mask[muscle] !== 0) outsideBody++
        if (mask[muscle] > 0.5) coverage[x > 0 ? 'left' : 'right']++
      })
      expect(invalid, `${muscle} finite normalized weights`).toBe(0)
      expect(outsideBody, `${muscle} head/foot exclusion`).toBe(0)
      expect(coverage.left, `${muscle} left coverage`).toBeGreaterThan(20)
      expect(coverage.right, `${muscle} right coverage`).toBeGreaterThan(20)
    }
  })

  it('separates front/back trunk surfaces and the opposing upper-arm groups', () => {
    let backOnFront = 0,
      chestOnBack = 0,
      opposingArms = 0
    // A weight is a ramp through the outline; only weights above the feather are drawn.
    const drawn = (weight: number) => weight > muscleFeather[0]
    masks.forEach((mask, index) => {
      const z = positions[index * 3 + 2]
      if (z > 0.05 && (drawn(mask['upper-back']) || drawn(mask['lower-back']))) backOnFront++
      if (z < -0.02 && drawn(mask.chest)) chestOnBack++
      if (mask.biceps > 0.6 && mask.triceps > 0.6) opposingArms++
    })
    expect({ backOnFront, chestOnBack, opposingArms }).toEqual({
      backOnFront: 0,
      chestOnBack: 0,
      opposingArms: 0,
    })
  })

  it('keeps the groups of one seam layer apart, so every shared border is drawn as a seam', () => {
    const touching = new Set<string>()
    masks.forEach((mask) => {
      for (const layer of [0, 1]) {
        const drawn = previewMuscles.filter(
          (muscle) => muscleLayer[muscle] === layer && mask[muscle] > muscleFeather[0],
        )
        if (drawn.length > 1) touching.add(drawn.join('+'))
      }
    })
    expect([...touching]).toEqual([])
  })

  it('covers the central abdomen and upper glute surface instead of only their edges', () => {
    const abdomen: number[] = [],
      glutes: number[] = []
    masks.forEach((mask, index) => {
      const x = Math.abs(positions[index * 3]),
        y = positions[index * 3 + 1],
        z = positions[index * 3 + 2]
      if (x < 0.055 && y > 0.17 && y < 0.31 && z > 0.11) abdomen.push(mask.core)
      if (x > 0.045 && x < 0.14 && y > 0.04 && y < 0.13 && z < -0.065) glutes.push(mask.glutes)
    })
    expect(abdomen.length).toBeGreaterThan(20)
    expect(glutes.length).toBeGreaterThan(20)
    for (const weights of [abdomen, glutes]) {
      expect(weights.filter((weight) => weight > 0.5).length / weights.length).toBeGreaterThan(0.8)
    }
  })

  it('combines selected regions without accumulating intensity or changing the pose', () => {
    const athlete = createAthlete()
    try {
      athlete.applyPose(kneePushupPose(0.54))
      const geometry = athlete.mesh.geometry
      const pose = athlete.mesh.skeleton.boneMatrices!.slice()
      const shape = geometry.attributes.position.array.slice()
      athlete.highlight(['chest'])
      const chest = geometry.attributes.muscleWeight.array.slice()
      athlete.highlight(['calves'])
      const calves = geometry.attributes.muscleWeight.array.slice()
      athlete.highlight(['chest', 'calves', 'chest'])
      const combined = geometry.attributes.muscleWeight.array
      const expectedWeights = Float32Array.from(chest, (weight, index) =>
        Math.max(weight, calves[index]),
      )
      expect(combined).toEqual(expectedWeights)
      expect(geometry.attributes.position.array).toEqual(shape)
      expect(athlete.mesh.skeleton.boneMatrices).toEqual(pose)
      const highlights = combined.slice()
      athlete.model('female')
      const femaleGeometry = athlete.mesh.geometry
      expect(femaleGeometry.attributes.muscleWeight.array.slice(0, highlights.length)).toEqual(
        highlights,
      )
      expect(athlete.mesh.skeleton.boneMatrices).toEqual(pose)
      athlete.highlight([])
      const neutral = femaleGeometry.attributes.muscleWeight.array
      expect(neutral.every((weight) => weight === 0)).toBe(true)
      athlete.focus(true, 'all')
      const exercise = femaleGeometry.attributes.muscleWeight.array.slice()
      athlete.highlight(['chest', 'triceps', 'shoulders'])
      expect(femaleGeometry.attributes.muscleWeight.array).toEqual(exercise)
    } finally {
      athlete.dispose()
    }
  })
})
