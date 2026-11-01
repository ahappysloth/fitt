import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
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
  webServer: {
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
