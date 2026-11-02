import { expect, type Page } from '@playwright/test'

export async function openPreviewHost(page: Page) {
  // Match a real embedding page: navigating srcdoc from an opaque about:blank
  // parent crashes Chromium 156 while it creates the sandboxed site instance.
  await page.route('**/embedded-preview-host', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Preview host</title></head><body></body></html>',
    }),
  )
  await page.goto('/embedded-preview-host')
}

export async function mountSandboxedPreview(
  page: Page,
  source: string,
  title: string,
  allowDownloads = false,
) {
  await page.evaluate(
    ({ source, title, allowDownloads }) => {
      const iframe = document.createElement('iframe')
      iframe.title = title
      iframe.sandbox.value = allowDownloads ? 'allow-scripts allow-downloads' : 'allow-scripts'
      iframe.style.cssText = 'width:100%;height:900px;border:0'
      // Set the initial document before attaching; no intermediate blank frame.
      iframe.srcdoc = source
      document.body.replaceChildren(iframe)
    },
    { source, title, allowDownloads },
  )
  const frame = page.frameLocator('iframe')
  await expect
    .poll(() =>
      frame.locator('html').evaluate(() => {
        let storageError: string | undefined
        try {
          localStorage.getItem('sandbox-probe')
        } catch (error) {
          storageError = error instanceof DOMException ? error.name : 'unexpected'
        }
        return { origin: self.origin, storageError }
      }),
    )
    .toEqual({ origin: 'null', storageError: 'SecurityError' })
  return frame
}
