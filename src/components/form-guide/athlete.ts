import * as THREE from 'three'
import data from './body-data.json'
import maleData from './male-body-data.json'
import femaleData from './female-body-data.json'
import type { BodyModel, Muscle } from '../../lib/types'
import { kneePushupMuscles, muscleRegionWeights, previewMuscles } from './muscle-regions'
import type { PoseFrame, FocusRegion } from './contracts'
export type { FocusRegion } from './contracts'

const v = (values: number[]) => new THREE.Vector3(...(values as [number, number, number]))
function decode(value: string) {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes.buffer
}
let canonicalMasks: Record<Muscle, Float32Array> | undefined
function muscleMasks(positions: Float32Array) {
  if (canonicalMasks) return canonicalMasks
  const masks = Object.fromEntries(
    previewMuscles.map((muscle) => [muscle, new Float32Array(data.vertices)]),
  ) as Record<Muscle, Float32Array>
  for (let index = 0; index < data.vertices; index++) {
    const weights = muscleRegionWeights(
      positions[index * 3],
      positions[index * 3 + 1],
      positions[index * 3 + 2],
    )
    for (const muscle of previewMuscles) masks[muscle][index] = weights[muscle]
  }
  // Immutable canonical masks are shared by the inspector and movement viewers.
  canonicalMasks = masks
  return masks
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
  const selectedWeights = new Float32Array(data.vertices)
  const masks = muscleMasks(positions)
  geometry.setAttribute('muscleWeight', new THREE.BufferAttribute(selectedWeights, 1))
  const material = new THREE.MeshStandardMaterial({
    color: '#858b8a',
    roughness: 0.52,
    metalness: 0.18,
  })
  const activeColor = { value: new THREE.Color('#c7fa53') }
  // Shape the edge after interpolation so closeups keep a narrow, smooth feather
  // instead of exposing the coarse mesh triangles with a per-vertex threshold.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fittMuscleColor = activeColor
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float muscleWeight;\nvarying float vFittMuscleWeight;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFittMuscleWeight = muscleWeight;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 fittMuscleColor;\nvarying float vFittMuscleWeight;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float muscleEdge = smoothstep(0.15, 0.85, vFittMuscleWeight);
         diffuseColor.rgb = mix(diffuseColor.rgb, fittMuscleColor, muscleEdge);`,
      )
  }
  material.customProgramCacheKey = () => 'fitt-muscle-edge-1'
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
    subtle = new THREE.Color('#59605c')
  function highlight(regions: readonly Muscle[]) {
    for (let i = 0; i < data.vertices; i++) {
      let mask = 0
      for (const region of regions) mask = Math.max(mask, masks[region][i])
      selectedWeights[i] = mask
    }
    material.color.copy(regions.length ? subtle : baseColor)
    geometry.attributes.muscleWeight.needsUpdate = true
  }
  function focus(enabled: boolean, region: FocusRegion) {
    // The workout's All control means its exercise regions, never the whole body.
    highlight(enabled ? (region === 'all' ? kneePushupMuscles : [region]) : [])
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
    highlight,
    model,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      skeleton.dispose()
    },
  }
}
