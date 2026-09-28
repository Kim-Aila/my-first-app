import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright owns ./tests (its own testDir, its own `test`/`expect` API) — exclude it
    // so Vitest doesn't try to run Playwright specs through the Vitest runner.
    exclude: ['**/node_modules/**', './tests/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
