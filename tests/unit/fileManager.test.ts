import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, copyFileSync: vi.fn() }
})

import { ipcMain, dialog, clipboard, nativeImage } from 'electron'
import { copyFileSync } from 'fs'
import { registerFileHandlers } from '../../electron/services/fileManager'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

describe('registerFileHandlers — channel registration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'files:openDialog',
      'files:saveDialog',
      'files:reveal',
      'files:getAppDataPath',
      'files:openExternal',
      'files:copyImageToClipboard',
      'files:downloadFile',
    ]))
  })
})

describe('files:copyImageToClipboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('writes the image to the clipboard and returns success', () => {
    vi.mocked(nativeImage.createFromPath).mockReturnValue({ isEmpty: () => false } as never)
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    const result = handlers['files:copyImageToClipboard']({}, '/path/to/thumb.jpg')

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/path/to/thumb.jpg')
    expect(clipboard.writeImage).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  it('throws when the image cannot be read', () => {
    vi.mocked(nativeImage.createFromPath).mockReturnValue({ isEmpty: () => true } as never)
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    expect(() => handlers['files:copyImageToClipboard']({}, '/missing.jpg'))
      .toThrow('Não foi possível ler a imagem.')
  })
})

describe('files:downloadFile', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null when the user cancels the save dialog', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: '' })
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    const result = await handlers['files:downloadFile']({}, '/path/to/thumb.jpg', 'clip_thumb.jpg')

    expect(result).toBeNull()
    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('copies the file to the chosen destination and returns the path', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/Users/me/Downloads/clip_thumb.jpg' })
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    const result = await handlers['files:downloadFile']({}, '/path/to/thumb.jpg', 'clip_thumb.jpg')

    expect(copyFileSync).toHaveBeenCalledWith('/path/to/thumb.jpg', '/Users/me/Downloads/clip_thumb.jpg')
    expect(result).toBe('/Users/me/Downloads/clip_thumb.jpg')
  })

  it('uses the source file basename as the default path when none is provided', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/Users/me/Downloads/thumb.jpg' })
    const handlers = captureHandlers()
    registerFileHandlers(ipcMain as never)

    await handlers['files:downloadFile']({}, '/path/to/thumb.jpg')

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'thumb.jpg' }))
  })
})
