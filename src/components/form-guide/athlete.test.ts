import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAthlete } from './athlete'
import { kneePushupPose, movementAt } from './knee-pushup'
import data from './body-data.json'

const point = (name: string) =>
  new Vector3(...(data.bones.find((bone) => bone.name === name)!.head as [number, number, number]))
describe('the Knee Push-up movement contract', () => {
  it('keeps contact anchors and arm lengths fixed through the full rep without elbow flips', () => {
    const initial = kneePushupPose(0)
    let previous = initial
    for (let frame = 0; frame <= 100; frame++) {
      const pose = kneePushupPose(frame / 100)
      for (const [index, side] of ['L', 'R'].entries()) {
        expect(pose.wrists[index].distanceTo(initial.wrists[index])).toBeLessThan(1e-8)
        expect(pose.knees[index].distanceTo(initial.knees[index])).toBeLessThan(1e-8)
        expect(pose.shoulders[index].distanceTo(pose.elbows[index])).toBeCloseTo(
          point(`upperarm01.${side}`).distanceTo(point(`lowerarm01.${side}`)),
          6,
        )
        expect(pose.elbows[index].distanceTo(pose.wrists[index])).toBeCloseTo(
          point(`lowerarm01.${side}`).distanceTo(point(`wrist.${side}`)),
          6,
        )
        expect(pose.elbows[index].distanceTo(previous.elbows[index])).toBeLessThan(0.025)
        expect(pose.elbows[index].z).toBeLessThan(
          pose.shoulders[index].clone().lerp(pose.wrists[index], 0.5).z,
        )
      }
      previous = pose
    }
    const end = kneePushupPose(1)
    expect(end.shoulders[0].distanceTo(initial.shoulders[0])).toBeLessThan(1e-8)
    expect(end.elbows[0].distanceTo(initial.elbows[0])).toBeLessThan(1e-8)
  })
  it('includes a paused bottom and returns seamlessly to the setup pose', () => {
    expect(movementAt(0.54).phase).toBe('Pause')
    expect(movementAt(0.58).depth).toBe(1)
    expect(movementAt(0)).toEqual(movementAt(1))
  })
  it('builds an actual weighted mesh and keeps the mesh finite throughout its motion', () => {
    const athlete = createAthlete()
    const geometry = athlete.mesh.geometry
    expect(athlete.mesh.skeleton.bones.length).toBe(163)
    for (const progress of [0, 0.25, 0.54, 0.8, 1]) {
      athlete.applyPose(kneePushupPose(progress))
      for (let index = 0; index < geometry.attributes.position.count; index += 17) {
        const position = new Vector3().fromBufferAttribute(geometry.attributes.position, index)
        athlete.mesh.applyBoneTransform(index, position)
        expect(position.toArray().every(Number.isFinite)).toBe(true)
        expect(position.length()).toBeLessThan(2)
      }
    }
    athlete.dispose()
  })
})

describe('skinned contact surfaces', () => {
  it('keeps palms stable, knees on the mat, and hand bones attached across the rep', () => {
    const athlete = createAthlete()
    const geometry = athlete.mesh.geometry
    const palms: number[] = [],
      knees: number[] = []
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const names = [0, 1, 2, 3]
        .filter((j) => geometry.attributes.skinWeight.getComponent(i, j) > 0)
        .map((j) => data.bones[geometry.attributes.skinIndex.getComponent(i, j)].name)
      if (names.every((name) => /^(wrist|metacarpal|finger)/.test(name))) palms.push(i)
      const position = new Vector3().fromBufferAttribute(geometry.attributes.position, i)
      if (position.distanceTo(point('lowerleg01.L')) < 0.075) knees.push(i)
    }
    const skinned = (i: number) =>
      athlete.mesh.applyBoneTransform(
        i,
        new Vector3().fromBufferAttribute(geometry.attributes.position, i),
      )
    athlete.applyPose(kneePushupPose(0))
    const initialPalms = palms.map(skinned)
    for (const progress of [0, 0.2, 0.4, 0.54, 0.7, 0.9, 1]) {
      athlete.applyPose(kneePushupPose(progress))
      const palmPositions = palms.map(skinned)
      palmPositions.forEach((position, index) =>
        expect(position.distanceTo(initialPalms[index])).toBeLessThan(0.00001),
      )
      const palmHeight = Math.min(...palmPositions.map((position) => position.y))
      const kneeHeight = Math.min(...knees.map((i) => skinned(i).y))
      expect(palmHeight).toBeGreaterThanOrEqual(0)
      expect(palmHeight).toBeLessThan(0.001)
      expect(kneeHeight).toBeGreaterThanOrEqual(0)
      expect(kneeHeight).toBeLessThan(0.004)
    }
    const bottom = kneePushupPose(0.54)
    for (let index = 0; index < 2; index++) {
      const forearm = bottom.elbows[index].clone().sub(bottom.wrists[index]).normalize()
      expect(forearm.angleTo(new Vector3(0, 1, 0))).toBeLessThan((8 * Math.PI) / 180)
    }
    athlete.dispose()
  })
})
