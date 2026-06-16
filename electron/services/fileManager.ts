import { IpcMain, dialog, shell, app, clipboard, nativeImage } from 'electron'
import { copyFileSync } from 'fs'
import { basename } from 'path'

export function registerFileHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('files:copyImageToClipboard', (_event, filePath: string) => {
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) throw new Error('Não foi possível ler a imagem.')
    clipboard.writeImage(image)
    return { success: true }
  })

  ipcMain.handle('files:downloadFile', async (_event, filePath: string, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName ?? basename(filePath),
    })
    if (result.canceled || !result.filePath) return null
    copyFileSync(filePath, result.filePath)
    return result.filePath
  })

  ipcMain.handle('files:openDialog', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [
        { name: 'Audio/Video', extensions: ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'flac'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('files:saveDialog', async (_event, defaultPath?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('files:reveal', async (_event, filePath: string) => {
    await shell.showItemInFolder(filePath)
    return { success: true }
  })

  ipcMain.handle('files:getAppDataPath', () => {
    return app.getPath('userData')
  })

  ipcMain.handle('files:openExternal', (_event, url: string) => {
    shell.openExternal(url)
    return { success: true }
  })
}
