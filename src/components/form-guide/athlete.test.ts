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
  it('lets the calves and feet follow the body around planted knees throughout the rep', () => {
    const initial = kneePushupPose(0)
    for (const side of ['L', 'R']) {
      const startFoot = initial.transforms.get(`foot.${side}`)!
      const knee = initial.transforms.get(`shin.${side}`)!.anchor
      const shinLength = knee.distanceTo(startFoot.anchor)
      let previousAnkle = startFoot.anchor
      for (let frame = 0; frame <= 100; frame++) {
        const pose = kneePushupPose(frame / 100)
        const foot = pose.transforms.get(`foot.${side}`)!
        const bodyTurn = pose.transforms
          .get('body')!
          .rotation.clone()
          .multiply(initial.transforms.get('body')!.rotation.clone().invert())
        const expectedAnkle = startFoot.anchor.clone().sub(knee).applyQuaternion(bodyTurn).add(knee)
        expect(foot.anchor.distanceTo(expectedAnkle)).toBeLessThan(1e-8)
        expect(foot.anchor.distanceTo(knee)).toBeCloseTo(shinLength, 8)
        expect(foot.rotation.angleTo(bodyTurn.clone().multiply(startFoot.rotation))).toBeLessThan(
          1e-6,
        )
        expect(foot.anchor.distanceTo(previousAnkle)).toBeLessThan(0.015)
        previousAnkle = foot.anchor
      }
      expect(
        kneePushupPose(0.54).transforms.get(`foot.${side}`)!.anchor.y - startFoot.anchor.y,
      ).toBeGreaterThan(0.07)
    }
  })
  it.each(['male', 'female'] as const)(
    'keeps the weighted %s mesh finite throughout its motion',
    (model) => {
      const athlete = createAthlete(model)
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
    },
  )
  it('defaults to male and changes the surface without replacing the rig or losing the pose', () => {
    const athlete = createAthlete()
    athlete.applyPose(kneePushupPose(0.54))
    const geometry = athlete.mesh.geometry
    const position = geometry.attributes.position
    const male = position.array.slice()
    const matrices = athlete.mesh.skeleton.boneMatrices!.slice()
    expect(athlete.mesh.name).toBe('Fitt male training mannequin')
    athlete.model('female')
    expect(position.array).not.toEqual(male)
    expect(athlete.mesh.skeleton.boneMatrices).toEqual(matrices)
    athlete.model('male')
    expect(athlete.mesh.geometry).toBe(geometry)
    expect(geometry.attributes.position).toBe(position)
    expect(position.array).toEqual(male)
    athlete.dispose()
  })
})

describe('skinned contact surfaces', () => {
  it.each(['male', 'female'] as const)(
    'keeps %s palms stable, knees on the mat, and hand bones attached across the rep',
    (model) => {
      const athlete = createAthlete(model)
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
    },
  )
})
