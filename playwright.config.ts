import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const liveTests = process.env.FITT_RUN_LIVE_DB_TESTS === '1'
const externalLiveOrigin = process.env.FITT_LIVE_TEST_ORIGIN
if (externalLiveOrigin) {
  const target = new URL(externalLiveOrigin)
  if (
    !liveTests ||
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      'FITT_LIVE_TEST_ORIGIN requires FITT_RUN_LIVE_DB_TESTS=1 and an exact HTTPS origin.',
    )
  }
}
const liveProxy = externalLiveOrigin && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)

export default defineConfig({
  testDir: './tests',
  // An explicitly selected hosted target runs only isolated account fixtures.
  testMatch: externalLiveOrigin ? '**/account-live.spec.ts' : undefined,
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: externalLiveOrigin || 'http://127.0.0.1:4173',
    // Live sessions contain signed credentials and must not enter trace files.
    trace: liveTests ? 'off' : 'retain-on-failure',
    proxy: liveProxy ? { server: liveProxy } : undefined,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      // Use software WebGL to exercise the real 3D guide in headless CI.
      args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
    timezoneId: 'America/New_York',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: externalLiveOrigin
    ? undefined
    : {
        command: 'npm run preview',
        env: {
          BETTER_AUTH_URL: 'http://127.0.0.1:4173',
          TRUSTED_ORIGINS: 'http://127.0.0.1:4173',
        },
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
})
