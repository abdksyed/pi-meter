import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Pi Meter browser tests.
 *
 * The web server is `scripts/serve-test-app.py`, started and stopped by this
 * config only (`reuseExistingServer: false`). It serves `frontend/dist` and
 * indexes a throw-away synthetic fixture corpus, so no test reads the real
 * `~/.pi` sessions or `data/pi-meter.sqlite`.
 *
 * Prerequisites:
 *   cd frontend && npm run build      # produces frontend/dist
 *   npx playwright install chromium   # once per machine
 *
 * Commands:
 *   npm run test:e2e                  # Chromium, headless
 *   npm run test:e2e -- --headed
 *   PI_METER_E2E_PORT=9123 npm run test:e2e
 *
 * Fixture/asset notes:
 * - `PI_METER_E2E_PORT` (default 8901) keeps the test server clear of the
 *   developer's `deploy.sh` instance (8787) and the Vite dev proxy (8743).
 * - `PI_METER_E2E_FIXTURES_DIR` pins the fixture directory (default: fresh
 *   temp dir per run, removed afterwards).
 * - Screenshots/traces are written under `frontend/test-results` and
 *   `frontend/playwright-report` (both git-ignored).
 */
const PORT = Number(process.env.PI_METER_E2E_PORT ?? 8901)
const HOST = '127.0.0.1'
const BASE_URL = process.env.PI_METER_E2E_BASE_URL ?? `http://${HOST}:${PORT}`

const FIXTURES_ARGS = process.env.PI_METER_E2E_FIXTURES_DIR
  ? `--fixtures-dir ${JSON.stringify(process.env.PI_METER_E2E_FIXTURES_DIR)}`
  : ''

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Deterministic locale/timezone; the fixture timestamps are UTC.
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Enable once the Chromium suite is stable (plan §"Browser regressions").
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command:
      `uv run python ../scripts/serve-test-app.py --host ${HOST} --port ${PORT} ` +
      `--log-level warning ${FIXTURES_ARGS}`.trim(),
    url: `${BASE_URL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PI_METER_E2E_PORT: String(PORT),
    },
  },
})
