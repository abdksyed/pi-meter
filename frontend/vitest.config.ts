import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Vitest configuration for Pi Meter.
 *
 * - jsdom environment, no network access, deterministic clock per test
 *   (`vi.useFakeTimers()` / `vi.setSystemTime()` in the test itself).
 * - `src/test/setup.ts` installs jest-dom matchers, resets browser storage and
 *   provides a `matchMedia` stub.
 * - Playwright specs (`frontend/e2e`) are excluded; they run from
 *   `playwright.config.ts` instead.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
})
