import { ipcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { getWhisperBinaryPath } from './whisperSetup'

export function isFirstRunComplete(): boolean {
  const db = getDatabase()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").get() as { value: string } | undefined
  return row?.value === '1'
}

export function markSetupComplete(): void {
  const db = getDatabase()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_complete', '1')").run()
}

export function shouldShowSetupWizard(): boolean {
  if (isFirstRunComplete()) return false
  // Also skip if whisper is already available (e.g., dev environment with brew)
  if (getWhisperBinaryPath()) return false
  return true
}

export function registerFirstRunHandlers(): void {
  ipcMain.handle('setup:isComplete', () => isFirstRunComplete())
  ipcMain.handle('setup:shouldShow', () => shouldShowSetupWizard())
  ipcMain.handle('setup:markComplete', () => {
    markSetupComplete()
    return { success: true }
  })
}
