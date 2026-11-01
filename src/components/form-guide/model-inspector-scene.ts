import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { BodyModel } from '../../lib/types'
import { createAthlete } from './athlete'

export type InspectorView = 'angle' | 'front' | 'side' | 'back'
export type InspectorDetail = 'body' | 'head' | 'feet'
export type InspectorInteraction = 'orbit' | 'pan'
export interface ModelInspectorScene {
  model(value: BodyModel): void
  view(value: InspectorView): void
  detail(value: InspectorDetail): void
  interaction(value: InspectorInteraction): void
  rotate(horizontal: number, vertical?: number): void
  pan(horizontal: number, vertical: number): void
  zoom(factor: number): void
  reset(): void
  dispose(): void
}

/** A neutral, unposed athlete. Rendering is driven only by camera/model changes. */
export function createModelInspectorScene(
  host: HTMLDivElement,
  initialModel: BodyModel,
  onChange: (view: InspectorView | 'custom', zoom: number) => void,
  onLost: () => void,
): ModelInspectorScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  let disposed = false
  const cleanups: Array<() => void> = [
    () => renderer.domElement.remove(),
    () => renderer.forceContextLoss(),
    () => renderer.dispose(),
  ]
  function dispose() {
    if (disposed) return
    disposed = true
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup()
      } catch {
        /* Release the remaining resources even after context loss. */
      }
    }
  }
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setClearColor('#111412', 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.88
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'img')
    canvas.setAttribute(
      'aria-label',
      'Standing character model. Arrow keys rotate, Shift and arrow keys move, plus and minus zoom, Home resets.',
    )
    canvas.setAttribute('aria-describedby', 'model-inspector-help')
    host.appendChild(canvas)
    const scene = new THREE.Scene()
    const athlete = createAthlete(initialModel)
    cleanups.push(() => athlete.dispose())
    athlete.focus(false, 'all')
    scene.add(athlete.mesh)
    athlete.mesh.geometry.computeBoundingBox()
    const bounds = athlete.mesh.geometry.boundingBox!.clone()
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20)
    const controls = new OrbitControls(camera, canvas)
    cleanups.push(() => controls.dispose())
    controls.enableDamping = false
    controls.enablePan = true
    controls.screenSpacePanning = true
    controls.enableZoom = true
    controls.minZoom = 0.65
    controls.maxZoom = 12
    controls.minPolarAngle = 0.04
    controls.maxPolarAngle = Math.PI - 0.04
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.9
    controls.panSpeed = 0.8
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
    scene.add(new THREE.HemisphereLight('#e8ecf0', '#252525', 1.4))
    const key = new THREE.DirectionalLight('#fffaf3', 2.6)
    key.position.set(2.3, 3.8, 2.3)
    // Even studio lighting makes the surface readable. Cast shadows from hands
    // onto the body can look like mesh defects in an anatomy inspection view.
    scene.add(key)
    const rim = new THREE.DirectionalLight('#e8f0e2', 2.1)
    rim.position.set(-2, 1.8, -2)
    scene.add(rim)
    const fill = new THREE.DirectionalLight('#c0c8da', 0.9)
    fill.position.set(-2, 0.6, 2)
    scene.add(fill)
    let selectedView: InspectorView | 'custom' = 'angle'
    function render() {
      if (disposed) return
      try {
        renderer.render(scene, camera)
      } catch {
        dispose()
        onLost()
      }
    }
    function report() {
      onChange(selectedView, Math.round(camera.zoom * 100))
    }
    function changed() {
      render()
      report()
    }
    function start() {
      selectedView = 'custom'
      report()
    }
    controls.addEventListener('change', changed)
    controls.addEventListener('start', start)
    cleanups.push(() => {
      controls.removeEventListener('change', changed)
      controls.removeEventListener('start', start)
    })
    function update() {
      camera.updateProjectionMatrix()
      controls.update()
      changed()
    }
    function view(value: InspectorView) {
      selectedView = value
      const direction =
        value === 'front'
          ? new THREE.Vector3(0, 0, 4)
          : value === 'side'
            ? new THREE.Vector3(4, 0, 0)
            : value === 'back'
              ? new THREE.Vector3(0, 0, -4)
              : new THREE.Vector3(2.6, 0.3, 3.7)
      camera.position.copy(controls.target).add(direction)
      update()
    }
    function detail(value: InspectorDetail) {
      const target = center.clone()
      if (value === 'head') target.y = bounds.max.y - size.y * 0.095
      if (value === 'feet') target.y = bounds.min.y + size.y * 0.075
      // Translating camera and target together preserves the viewing angle.
      camera.position.add(target.clone().sub(controls.target))
      controls.target.copy(target)
      camera.zoom = value === 'body' ? 1 : 4.5
      update()
    }
    function rotate(horizontal: number, vertical = 0) {
      selectedView = 'custom'
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta += horizontal
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi + vertical,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      )
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
      update()
    }
    function pan(horizontal: number, vertical: number) {
      selectedView = 'custom'
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
      update()
    }
    function zoom(factor: number) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom)
      update()
    }
    function reset() {
      detail('body')
      view('angle')
    }
    function keyboard(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      if (event.key === 'Home') reset()
      else if (['+', '=', '-', '_'].includes(event.key))
        zoom(event.key === '-' || event.key === '_' ? 1 / 1.2 : 1.2)
      else {
        const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        const vertical = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
        if (event.shiftKey) pan(horizontal, vertical)
        else rotate(horizontal * 0.15, -vertical * 0.15)
      }
    }
    function lost(event: Event) {
      event.preventDefault()
      dispose()
      onLost()
    }
    canvas.addEventListener('keydown', keyboard)
    canvas.addEventListener('webglcontextlost', lost)
    cleanups.push(() => {
      canvas.removeEventListener('keydown', keyboard)
      canvas.removeEventListener('webglcontextlost', lost)
    })
    function resize() {
      if (disposed || !host.clientWidth || !host.clientHeight) return
      const aspect = host.clientWidth / host.clientHeight
      const halfHeight = Math.max(size.y * 0.58, (size.x * 0.6) / aspect)
      camera.left = -halfHeight * aspect
      camera.right = halfHeight * aspect
      camera.top = halfHeight
      camera.bottom = -halfHeight
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth, host.clientHeight)
      render()
    }
    const observer = new ResizeObserver(resize)
    cleanups.push(() => observer.disconnect())
    observer.observe(host)
    controls.target.copy(center)
    reset()
    resize()
    return {
      model(value) {
        athlete.model(value)
        render()
      },
      view,
      detail,
      rotate,
      pan,
      zoom,
      reset,
      interaction(value) {
        controls.mouseButtons.LEFT = value === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
        controls.touches.ONE = value === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
