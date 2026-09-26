import { defineConfig, devices } from '@playwright/test'

const port = 4173

// Runs against the built app (`npm run test:e2e` builds first): the service worker only exists there,
// and `vite preview` sends the production headers from vercel.json.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Motion off by default so screens swap at once; e2e/motion.spec.ts turns it back on.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    // To watch a run: SLOW_MO=800 npx playwright test --headed --workers=1
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 0) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The closest stand-in for iOS Safari that runs in CI. It is not a real iPhone.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // iPhone's Save or share path only: a download there opens a viewer instead of saving.
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testMatch: 'share.spec.ts' },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  },
})
