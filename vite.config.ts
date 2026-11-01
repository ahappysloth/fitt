import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vite is retained for unit tests and the self-contained review artifact.
// The production application is built and served by Next.js.
export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
