import { defineConfig } from '@playwright/test'
import { resolve } from 'path'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Screenshot on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: {
        // Electron E2E requires launching the compiled app via _electron
        // The launch path is resolved at runtime in the spec file
        launchOptions: {
          executablePath: resolve(__dirname, 'node_modules/.bin/electron'),
        },
      },
    },
  ],
})
