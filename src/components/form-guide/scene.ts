import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createAthlete, type FocusRegion } from './athlete'
import type { GuideMotion } from './contracts'
import type { BodyModel, Muscle } from '../../lib/types'

export type CameraView = 'angle' | 'side' | 'front'
export interface GuideScene {
  play(playing: boolean): void
  seek(progress: number): void
  speed(value: number): void
  view(value: CameraView): void
  rotate(amount: number): void
  zoom(amount: number): void
  focus(enabled: boolean, region: FocusRegion): void
  highlight(regions: readonly Muscle[]): void
  alignment(enabled: boolean): void
  model(value: BodyModel): void
  dispose(): void
}

/** Owns WebGL resources and renders only during playback or a user interaction. */
export function createGuideScene(
  host: HTMLDivElement,
  motion: GuideMotion,
  onProgress: (progress: number) => void,
  onLost: () => void,
  onCameraChange: (view: CameraView | 'custom') => void,
  inspectionControls = false,
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
      `Interactive 3D ${motion.name.toLowerCase()}. ${
        inspectionControls
          ? 'Left-drag rotates, middle-drag moves, scroll zooms. Shift and arrow keys move, Home resets.'
          : 'Drag to rotate, or use the camera controls below.'
      }`,
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
    const stage = motion.stage
    const stageTarget = stage ? new THREE.Vector3(...stage.target) : null
    const controls = new OrbitControls(camera, renderer.domElement)
    cleanups.push(() => controls.dispose())
    controls.target.set(0, 0.3, 0.08)
    controls.enablePan = inspectionControls
    controls.enableZoom = inspectionControls
    controls.screenSpacePanning = true
    controls.minZoom = 0.75
    controls.maxZoom = 1.5
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
    controls.panSpeed = 0.8
    controls.zoomSpeed = 0.9
    if (inspectionControls) {
      const preventMiddleDefault = (event: MouseEvent) => {
        if (event.button === 1) event.preventDefault()
      }
      renderer.domElement.addEventListener('mousedown', preventMiddleDefault)
      cleanups.push(() =>
        renderer.domElement.removeEventListener('mousedown', preventMiddleDefault),
      )
    }
    controls.enableDamping = false
    controls.minPolarAngle = 0.18
    controls.maxPolarAngle = Math.PI / 2 - 0.09
    controls.rotateSpeed = 0.7
    scene.add(new THREE.HemisphereLight('#e8ecf0', '#4a4f4e', 1.4))
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
    if (stage) {
      const extent = Math.max(1.7, stage.height * 1.2)
      key.shadow.camera.left = -extent
      key.shadow.camera.right = extent
      key.shadow.camera.top = extent
      key.shadow.camera.bottom = -extent
    }
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
    if (stage?.bar) {
      const { center, width, radius = 0.018 } = stage.bar
      const material = new THREE.MeshStandardMaterial({
        color: '#667064',
        roughness: 0.4,
        metalness: 0.3,
      })
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), material)
      bar.rotation.z = Math.PI / 2
      bar.position.set(...center)
      bar.castShadow = true
      scene.add(bar)
      // Keep the upright supports behind the athlete in the side view.
      const supportDepth = 0.35
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, center[1], 16),
          material.clone(),
        )
        post.position.set(center[0] + (side * width) / 2, center[1] / 2, center[2] - supportDepth)
        post.castShadow = true
        scene.add(post)
        const bracket = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, supportDepth, 16),
          material.clone(),
        )
        bracket.rotation.x = Math.PI / 2
        bracket.position.set(
          center[0] + (side * width) / 2,
          center[1],
          center[2] - supportDepth / 2,
        )
        bracket.castShadow = true
        scene.add(bracket)
      }
    }
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
      // The timeline shares the rendered pose's clock, including on slow frames.
      onProgress(progress)
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
      const halfHeight = stage
        ? Math.max(stage.height / 2, (stage.height * 0.42) / aspect)
        : Math.max(0.8, 1.0 / aspect)
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
      controls.target.copy(stageTarget || new THREE.Vector3(0, 0.29, 0.08))
      camera.position.copy(
        stageTarget
          ? stageTarget
              .clone()
              .add(
                value === 'side'
                  ? new THREE.Vector3(4, 0.12, 0)
                  : value === 'front'
                    ? new THREE.Vector3(0, 0.12, 4)
                    : new THREE.Vector3(2.6, 0.85, 3.7),
              )
          : value === 'side'
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
    function pan(horizontal: number, vertical: number) {
      onCameraChange('custom')
      camera.updateMatrixWorld()
      const step = ((camera.top - camera.bottom) / camera.zoom) * 0.12
      const offset = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrixWorld, 0)
        .multiplyScalar(horizontal * step)
      offset.addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
        vertical * step,
      )
      controls.target.add(offset)
      camera.position.add(offset)
      controls.update()
      render()
    }
    function keyboard(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const keys = ['ArrowLeft', 'ArrowRight', '+', '-', '=', 'Home']
      if (inspectionControls && event.shiftKey) keys.push('ArrowUp', 'ArrowDown')
      if (!keys.includes(event.key)) return
      event.preventDefault()
      if (inspectionControls && event.shiftKey && event.key.startsWith('Arrow'))
        pan(
          event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0,
          event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0,
        )
      else if (event.key === 'ArrowLeft') rotate(-0.15)
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
        // Stop synchronously: a queued frame must not overwrite a drag/keyboard seek.
        playing = false
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        previous = 0
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
        const regions = motion.regions.flatMap(({ id }) => (id === 'all' ? [] : [id]))
        athlete.highlight(enabled ? (region === 'all' ? regions : [region]) : [])
        render()
      },
      highlight(regions) {
        athlete.highlight(regions)
        render()
      },
      alignment(enabled) {
        alignment.visible = enabled
        render()
      },
      model(value) {
        athlete.model(value)
        render()
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
