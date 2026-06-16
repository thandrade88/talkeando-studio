import { vi } from 'vitest'

export const app = {
  getPath: vi.fn((name: string) => {
    const map: Record<string, string> = {
      userData: '/tmp/talkeando-test',
      appData: '/tmp/talkeando-test',
      temp: '/tmp',
      documents: '/tmp/documents',
    }
    return map[name] ?? `/tmp/test-${name}`
  }),
  getVersion: vi.fn(() => '0.1.0'),
  getName: vi.fn(() => 'talkeando-studio-test'),
  isReady: vi.fn(() => true),
  quit: vi.fn(),
  on: vi.fn(),
}

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
}

export const BrowserWindow = {
  fromWebContents: vi.fn(() => null),
  getAllWindows: vi.fn(() => []),
  fromId: vi.fn(() => null),
}

export const net = {
  request: vi.fn(() => ({
    on: vi.fn(),
    end: vi.fn(),
  })),
}

export const dialog = {
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
  showSaveDialog: vi.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
}

export const shell = {
  openPath: vi.fn(() => Promise.resolve('')),
  showItemInFolder: vi.fn(),
}

export const clipboard = {
  writeImage: vi.fn(),
  writeText: vi.fn(),
}

export const nativeImage = {
  createFromPath: vi.fn(() => ({ isEmpty: vi.fn(() => false) })),
}
