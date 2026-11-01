import * as THREE from 'three'
import data from './body-data.json'
import maleData from './male-body-data.json'
import femaleData from './female-body-data.json'
import type { BodyModel } from '../../lib/types'
import type { PoseFrame, FocusRegion } from './contracts'
export type { FocusRegion } from './contracts'

const v = (values: number[]) => new THREE.Vector3(...(values as [number, number, number]))
function decode(value: string) {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes.buffer
}
function regionWeights(x: number, y: number, z: number): [number, number, number] {
  const ax = Math.abs(x)
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
    const radius = Math.sqrt(((ax - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2)
    return 1 - THREE.MathUtils.smoothstep(radius, 0.66, 1.07)
  }
  const chest = Math.max(
    ellipsoid(0.08, 0.42, 0.108, 0.087, 0.092, 0.061),
    ellipsoid(0.11, 0.465, 0.096, 0.062, 0.055, 0.048),
  )
  const shoulder = ellipsoid(0.182, 0.508, 0.014, 0.067, 0.072, 0.08)
  const triceps = Math.max(
    ellipsoid(0.245, 0.428, -0.015, 0.067, 0.1, 0.049),
    ellipsoid(0.283, 0.381, -0.007, 0.046, 0.06, 0.044),
  )
  return [chest, triceps, shoulder]
}
function transformKey(name: string) {
  const side = name.endsWith('.L') ? 'L' : 'R'
  if (name.startsWith('upperarm')) return `upperarm.${side}`
  if (name.startsWith('lowerarm')) return `lowerarm.${side}`
  if (name.startsWith('wrist') || name.startsWith('finger') || name.startsWith('metacarpal'))
    return `hand.${side}`
  if (name.startsWith('lowerleg')) return `shin.${side}`
  if (name.startsWith('foot') || name.startsWith('toe')) return `foot.${side}`
  return 'body'
}

export function createAthlete(initialModel: BodyModel = 'male') {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(decode(data.positions))
  const malePositions = new Float32Array(decode(maleData.positions))
  const femalePositions = new Float32Array(decode(femaleData.positions))
  // Keep canonical coordinates intact for muscle masks and subsequent switches.
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3))
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint8BufferAttribute(new Uint8Array(decode(data.skinIndices)), 4),
  )
  geometry.setAttribute(
    'skinWeight',
    new THREE.Uint16BufferAttribute(new Uint16Array(decode(data.skinWeights)), 4, true),
  )
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(decode(data.indices)), 1))
  const colors = new Float32Array(positions.length)
  const masks = Array.from({ length: data.vertices }, (_, i) =>
    regionWeights(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]),
  )
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.18,
  })
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = 'Fitt training mannequin'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const bones = data.bones.map((info) => {
    const bone = new THREE.Bone()
    bone.name = info.name
    return bone
  })
  data.bones.forEach((info, i) => {
    const parent = info.parent < 0 ? mesh : bones[info.parent]
    bones[i].position.copy(v(info.head))
    if (info.parent >= 0) bones[i].position.sub(v(data.bones[info.parent].head))
    parent.add(bones[i])
  })
  mesh.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  mesh.bind(skeleton)
  const worlds = bones.map(() => new THREE.Matrix4())
  const local = new THREE.Matrix4(),
    inverse = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(1, 1, 1)
  const baseColor = new THREE.Color('#858b8a'),
    activeColor = new THREE.Color('#c7fa53'),
    subtle = new THREE.Color('#59605c')
  function focus(enabled: boolean, region: FocusRegion) {
    const color = new THREE.Color()
    for (let i = 0; i < data.vertices; i++) {
      const mask =
        region === 'all'
          ? Math.max(...masks[i])
          : masks[i][{ chest: 0, triceps: 1, shoulders: 2 }[region]]
      color.copy(enabled ? subtle : baseColor)
      if (enabled) color.lerp(activeColor, mask)
      color.toArray(colors, i * 3)
    }
    geometry.attributes.color.needsUpdate = true
  }
  function applyPose(frame: PoseFrame) {
    data.bones.forEach((info, i) => {
      const transform = frame.transforms.get(transformKey(info.name))!
      position
        .copy(v(info.head))
        .sub(transform.original)
        .applyQuaternion(transform.rotation)
        .add(transform.anchor)
      worlds[i].compose(position, transform.rotation, scale)
      local.copy(worlds[i])
      if (info.parent >= 0) local.premultiply(inverse.copy(worlds[info.parent]).invert())
      local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale)
    })
    mesh.updateMatrixWorld(true)
    skeleton.update()
    return frame
  }
  function model(value: BodyModel) {
    geometry.attributes.position.array.set(value === 'male' ? malePositions : femalePositions)
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
    // A shape switch retains the skeleton, pose, masks and GPU resources.
    mesh.name = `Fitt ${value} training mannequin`
  }
  model(initialModel)
  focus(true, 'all')
  return {
    mesh,
    applyPose,
    focus,
    model,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      skeleton.dispose()
    },
  }
}
