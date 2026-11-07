import { test, expect, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type CameraMatrices = { projectionMatrix: number[]; modelViewMatrix: number[] }

async function cameraMatrices(canvas: Locator): Promise<CameraMatrices> {
  return canvas.evaluate((element) =>
    (
      window as unknown as {
        cameraMatrices: WeakMap<HTMLCanvasElement, CameraMatrices>
      }
    ).cameraMatrices.get(element as HTMLCanvasElement)!,
  )
}

function rotation(matrix: number[]) {
  return [0, 1, 2, 4, 5, 6, 8, 9, 10].map((index) => matrix[index])
}

function expectSameMatrix(actual: number[], expected: number[]) {
  expect(actual.length).toBe(expected.length)
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 5))
}

test('studio mouse controls pan with middle drag, rotate with left drag, and zoom with the wheel', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Observe the real camera matrices sent to WebGL. This distinguishes panning
  // from rotation/zoom without depending on the model's silhouette or lighting.
  await page.addInitScript(() => {
    const observations = new WeakMap<HTMLCanvasElement, Record<string, number[]>>()
    Object.assign(window, { cameraMatrices: observations })
    const locations = new WeakMap<WebGLUniformLocation, string>()
    for (const Constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = Constructor.prototype as WebGL2RenderingContext
      const locate = prototype.getUniformLocation
      prototype.getUniformLocation = function (program, name) {
        const location = locate.call(this, program, name)
        if (location) locations.set(location, name)
        return location
      }
      const upload = prototype.uniformMatrix4fv
      prototype.uniformMatrix4fv = function (
        ...args: [
          WebGLUniformLocation | null,
          boolean,
          Float32List | Iterable<number>,
          number?,
          number?,
        ]
      ) {
        Reflect.apply(upload, this, args)
        const name = args[0] && locations.get(args[0])
        if (name !== 'projectionMatrix' && name !== 'modelViewMatrix') return
        const canvas = this.canvas as HTMLCanvasElement
        const current = observations.get(canvas) || {}
        const offset = args[3] || 0
        current[name] = Array.from(args[2]).slice(offset, offset + 16)
        observations.set(canvas, current)
      }
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const html = await readFile(
    process.env.FITT_FORM_PREVIEW_PATH || 'preview/fitt-form-studio.html',
    'utf8',
  )
  await page.route('**/camera-study', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto('/camera-study')
  for (const selector of ['.form-3d', '#model-inspector']) {
    const viewer = page.locator(selector)
    const canvas = viewer.locator('canvas')
    await viewer.scrollIntoViewIfNeeded()
    await expect(viewer).toHaveAttribute('data-ready', 'true')
    await canvas.scrollIntoViewIfNeeded()
    const reset = viewer.getByRole('button', {
      name: selector === '.form-3d' ? 'Reset camera' : 'Reset inspector camera',
      exact: true,
    })
    await reset.click()
    await canvas.scrollIntoViewIfNeeded()
    const initial = await cameraMatrices(canvas)
    expect(initial.projectionMatrix).toHaveLength(16)
    expect(initial.modelViewMatrix).toHaveLength(16)
    const viewport = (await canvas.boundingBox())!
    const start = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 }
    const scroll = await page.evaluate(() => scrollY)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(start.x + 50, start.y + 24, { steps: 6 })
    await page.mouse.up({ button: 'middle' })
    const panned = await cameraMatrices(canvas)
    expectSameMatrix(panned.projectionMatrix, initial.projectionMatrix)
    expectSameMatrix(rotation(panned.modelViewMatrix), rotation(initial.modelViewMatrix))
    expect(panned.modelViewMatrix.slice(12, 15)).not.toEqual(initial.modelViewMatrix.slice(12, 15))
    expect(await page.evaluate(() => scrollY)).toBe(scroll)
    await reset.click()
    await page.mouse.move(start.x, start.y)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(start.x + 80, start.y, { steps: 6 })
    await page.mouse.up({ button: 'left' })
    const rotated = await cameraMatrices(canvas)
    expectSameMatrix(rotated.projectionMatrix, initial.projectionMatrix)
    expect(rotation(rotated.modelViewMatrix)).not.toEqual(rotation(initial.modelViewMatrix))
    await reset.click()
    await page.mouse.move(start.x, start.y)
    await page.mouse.wheel(0, -240)
    await expect
      .poll(async () => (await cameraMatrices(canvas)).projectionMatrix)
      .not.toEqual(initial.projectionMatrix)
    expect(await page.evaluate(() => scrollY)).toBe(scroll)
    await reset.click()
    await canvas.focus()
    await page.keyboard.press('Shift+ArrowUp')
    const keyboardPan = await cameraMatrices(canvas)
    expectSameMatrix(keyboardPan.projectionMatrix, initial.projectionMatrix)
    expectSameMatrix(rotation(keyboardPan.modelViewMatrix), rotation(initial.modelViewMatrix))
    expect(keyboardPan.modelViewMatrix.slice(12, 15)).not.toEqual(
      initial.modelViewMatrix.slice(12, 15),
    )
    await page.keyboard.press('Home')
    const restored = await cameraMatrices(canvas)
    expectSameMatrix(restored.projectionMatrix, initial.projectionMatrix)
    expectSameMatrix(restored.modelViewMatrix, initial.modelViewMatrix)
  }
  expect(errors).toEqual([])
})
