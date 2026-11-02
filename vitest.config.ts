import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit tests run in Node, separately from the Vite Workers/RSC environments.
export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
