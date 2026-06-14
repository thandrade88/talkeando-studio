/**
 * E2E tests for Talkeando Studio using Playwright's Electron integration.
 *
 * These tests launch the real Electron application and exercise the UI
 * end-to-end. Run with: npm run test:e2e
 *
 * Prerequisites: the app must be built first (`npm run build`).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'

const APP_ENTRY = resolve(__dirname, '../../dist-electron/main/index.js')

test.describe('Talkeando Studio — app launch', () => {
  test('app opens and shows the main window', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })

    try {
      const window = await app.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const title = await window.title()
      // The window title may be "Talkeando Studio" or the URL during development
      expect(title.length).toBeGreaterThan(0)

      // The app should render some HTML
      const body = await window.locator('body').innerHTML()
      expect(body.length).toBeGreaterThan(0)
    } finally {
      await app.close()
    }
  })

  test('setup wizard or main layout is rendered on first launch', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })

    try {
      const window = await app.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Either the SetupWizard modal or the Sidebar navigation must be present
      const hasSetup = await window.locator('text=Configuração inicial').isVisible().catch(() => false)
      const hasSidebar = await window.locator('text=TALKEANDO').isVisible().catch(() => false)

      expect(hasSetup || hasSidebar).toBe(true)
    } finally {
      await app.close()
    }
  })

  test('navigation links are visible in the sidebar', async () => {
    const app = await electron.launch({ args: [APP_ENTRY] })

    try {
      const window = await app.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Skip wizard if present
      const continueBtn = window.locator('button', { hasText: 'Abrir o Studio' })
      if (await continueBtn.isVisible().catch(() => false)) {
        // If we can skip setup, do so
        const skipApiKey = window.locator('button', { hasText: 'Pular por agora' })
        if (await skipApiKey.isVisible().catch(() => false)) {
          await skipApiKey.click()
        }
      }

      // After setup (or if already past it) check the sidebar
      const dashboardLink = window.locator('text=Dashboard')
      const settingsLink = window.locator('text=Configurações')

      // At least one should be visible
      const hasDash = await dashboardLink.isVisible().catch(() => false)
      const hasSettings = await settingsLink.isVisible().catch(() => false)
      expect(hasDash || hasSettings).toBe(true)
    } finally {
      await app.close()
    }
  })
})
