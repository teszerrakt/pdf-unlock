import { defineConfig } from 'vitest/config'

// Unit tests only. E2E lives in e2e/ and runs with Playwright (playwright.config.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
