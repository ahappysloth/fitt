import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createAthlete, type FocusRegion } from './athlete'
import type { GuideMotion } from './contracts'

export type CameraView = 'angle' | 'side' | 'front'
export interface GuideScene {
  play(playing: boolean): void
  seek(progress: number): void
  speed(value: number): void
  view(value: CameraView): void
  rotate(amount: number): void
  zoom(amount: number): void
  focus(enabled: boolean, region: FocusRegion): void
  alignment(enabled: boolean): void
  dispose(): void
}

/** Owns WebGL resources and renders only during playback or a user interaction. */
export function createGuideScene(
  host: HTMLDivElement,
  motion: GuideMotion,
  onProgress: (progress: number) => void,
  onLost: () => void,
  onCameraChange: (view: CameraView | 'custom') => void,
): GuideScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  let disposed = false,
    frame = 0
  const cleanups: Array<() => void> = [
    () => renderer.domElement.remove(),
    () => renderer.forceContextLoss(),
    () => renderer.dispose(),
    () => cancelAnimationFrame(frame),
  ]
  function dispose() {
    if (disposed) return
    disposed = true
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup()
      } catch {
        /* Continue releasing the remaining owned resources. */
      }
    }
  }
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.88
    renderer.setClearColor('#111412', 0)
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.setAttribute(
      'aria-label',
      `Interactive 3D ${motion.name.toLowerCase()}. Drag to rotate, or use the camera controls below.`,
    )
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    cleanups.push(() =>
      scene.traverse((object) => {
        if (
          (object instanceof THREE.Mesh || object instanceof THREE.Line) &&
          !(object instanceof THREE.SkinnedMesh)
        ) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      }),
    )
    const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.2, -1.2, 0.01, 20)
    const controls = new OrbitControls(camera, renderer.domElement)
    cleanups.push(() => controls.dispose())
    controls.target.set(0, 0.3, 0.08)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    controls.minPolarAngle = 0.18
    controls.maxPolarAngle = Math.PI / 2 - 0.09
    controls.rotateSpeed = 0.7
    scene.add(new THREE.HemisphereLight('#e8ecf0', '#252525', 1.4))
    const key = new THREE.DirectionalLight('#fffaf3', 2.6)
    cleanups.push(() => key.shadow.dispose())
    key.position.set(2.3, 3.8, 2.3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -1.7
    key.shadow.camera.right = 1.7
    key.shadow.camera.top = 1.7
    key.shadow.camera.bottom = -1.7
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 8
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.015
    scene.add(key)
    const rim = new THREE.DirectionalLight('#e8f0e2', 2.1)
    rim.position.set(-2, 1.8, -2)
    scene.add(rim)
    const fill = new THREE.DirectionalLight('#c0c8da', 0.9)
    fill.position.set(-2, 0.6, 2)
    scene.add(fill)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.01
    ground.receiveShadow = true
    scene.add(ground)
    const shape = new THREE.Shape()
    const x = -0.52,
      z = -1.03,
      w = 1.04,
      h = 2.1,
      r = 0.085
    shape.moveTo(x + r, z)
    shape.lineTo(x + w - r, z)
    shape.quadraticCurveTo(x + w, z, x + w, z + r)
    shape.lineTo(x + w, z + h - r)
    shape.quadraticCurveTo(x + w, z + h, x + w - r, z + h)
    shape.lineTo(x + r, z + h)
    shape.quadraticCurveTo(x, z + h, x, z + h - r)
    shape.lineTo(x, z + r)
    shape.quadraticCurveTo(x, z, x + r, z)
    const mat = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 12),
      new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.92, metalness: 0 }),
    )
    mat.rotation.x = -Math.PI / 2
    mat.receiveShadow = true
    mat.position.y = 0
    scene.add(mat)
    const edges = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        shape.getPoints(64).map((p) => new THREE.Vector3(p.x, 0.001, -p.y)),
      ),
      new THREE.LineBasicMaterial({ color: '#40443b', transparent: true, opacity: 0.4 }),
    )
    scene.add(edges)
    for (const end of [-0.91, 0.91]) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.08, 0.002, end),
          new THREE.Vector3(0.08, 0.002, end),
        ]),
        new THREE.LineBasicMaterial({ color: '#c7fa53', transparent: true, opacity: 0.6 }),
      )
      scene.add(line)
    }
    const athlete = createAthlete()
    cleanups.push(() => athlete.dispose())
    scene.add(athlete.mesh)
    const alignmentGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ])
    const alignment = new THREE.Line(
      alignmentGeometry,
      new THREE.LineDashedMaterial({
        color: '#d8ff87',
        dashSize: 0.035,
        gapSize: 0.022,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    )
    alignment.visible = false
    alignment.renderOrder = 3
    scene.add(alignment)
    let progress = 0,
      playing = false,
      speed = 1,
      previous = 0,
      lastReport = 0,
      inView = true
    const render = () => {
      if (!disposed) renderer.render(scene, camera)
    }
    function setPose() {
      const pose = motion.sample(progress)
      athlete.applyPose(pose)
      const points = [pose.alignment[0], pose.alignment.at(-1)!].map((p) =>
        p.clone().add(new THREE.Vector3(0.24, 0.035, 0)),
      )
      alignmentGeometry.setFromPoints(points)
      alignment.computeLineDistances()
    }
    function isVisible() {
      const dialog = document.querySelector('dialog[open]')
      return inView && !document.hidden && (!dialog || dialog.contains(host))
    }
    function tick(time: number) {
      frame = 0
      if (disposed || !playing || !isVisible()) {
        previous = 0
        return
      }
      if (previous)
        progress = (progress + (Math.min(time - previous, 80) / 1000 / motion.seconds) * speed) % 1
      previous = time
      try {
        setPose()
        render()
      } catch {
        dispose()
        onLost()
        return
      }
      if (time - lastReport > 70) {
        onProgress(progress)
        lastReport = time
      }
      frame = requestAnimationFrame(tick)
    }
    function schedule() {
      if (disposed) return
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      previous = 0
      if (playing && isVisible()) frame = requestAnimationFrame(tick)
      else render()
    }
    const resize = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight
      if (!width || !height || disposed) return
      const aspect = width / height
      const halfHeight = Math.max(0.8, 1.0 / aspect)
      camera.left = -halfHeight * aspect
      camera.right = halfHeight * aspect
      camera.top = halfHeight
      camera.bottom = -halfHeight
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      render()
    })
    cleanups.push(() => resize.disconnect())
    resize.observe(host)
    const visibility = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        schedule()
      },
      { threshold: 0.01 },
    )
    cleanups.push(() => visibility.disconnect())
    visibility.observe(host)
    document.addEventListener('visibilitychange', schedule)
    document.addEventListener('toggle', schedule, true)
    document.addEventListener('close', schedule, true)
    cleanups.push(() => {
      document.removeEventListener('toggle', schedule, true)
      document.removeEventListener('close', schedule, true)
    })
    cleanups.push(() => document.removeEventListener('visibilitychange', schedule))
    controls.addEventListener('change', render)
    controls.addEventListener('start', () => onCameraChange('custom'))
    function view(value: CameraView) {
      onCameraChange(value)
      controls.target.set(0, 0.29, 0.08)
      camera.position.copy(
        value === 'side'
          ? new THREE.Vector3(3, 0.83, 0.08)
          : value === 'front'
            ? new THREE.Vector3(0, 1.18, 3)
            : new THREE.Vector3(2.6, 1.8, 2.6),
      )
      camera.zoom = 1
      camera.updateProjectionMatrix()
      controls.update()
      render()
    }
    function rotate(amount: number) {
      onCameraChange('custom')
      const offset = camera.position
        .clone()
        .sub(controls.target)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), amount)
      camera.position.copy(controls.target).add(offset)
      controls.update()
      render()
    }
    function zoom(amount: number) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom + amount, 0.75, 1.5)
      camera.updateProjectionMatrix()
      render()
    }
    function keyboard(event: KeyboardEvent) {
      if (!['ArrowLeft', 'ArrowRight', '+', '-', '=', 'Home'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') rotate(-0.15)
      else if (event.key === 'ArrowRight') rotate(0.15)
      else if (event.key === 'Home') view('angle')
      else zoom(event.key === '-' ? -0.1 : 0.1)
    }
    function lost(event: Event) {
      event.preventDefault()
      onLost()
    }
    renderer.domElement.addEventListener('keydown', keyboard)
    renderer.domElement.addEventListener('webglcontextlost', lost)
    cleanups.push(() => {
      renderer.domElement.removeEventListener('keydown', keyboard)
      renderer.domElement.removeEventListener('webglcontextlost', lost)
    })
    setPose()
    view('angle')
    return {
      play(value) {
        playing = value
        schedule()
      },
      seek(value) {
        progress = THREE.MathUtils.clamp(value, 0, 1)
        setPose()
        onProgress(progress)
        render()
      },
      speed(value) {
        speed = value
      },
      view,
      rotate,
      zoom,
      focus(enabled, region) {
        athlete.focus(enabled, region)
        render()
      },
      alignment(enabled) {
        alignment.visible = enabled
        render()
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
