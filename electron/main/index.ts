import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, extname } from 'path'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const MEDIA_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// Must be called synchronously before app is ready so Electron treats the
// scheme as a privileged (stream-capable, fetch-capable) origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-media',
    privileges: {
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: false,
    }
  }
])
import { setupDatabase } from '../services/database'
import { registerEpisodeHandlers } from '../services/episodeManager'
import { registerTranscriptHandlers } from '../services/transcriptEngine'
import { registerAIHandlers } from '../services/aiEngine'
import { registerClipHandlers } from '../services/clipEngine'
import { registerFileHandlers } from '../services/fileManager'
import { registerWhisperSetupHandlers } from '../services/whisperSetup'
import { registerFirstRunHandlers } from '../services/firstRunSetup'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.talkeando.studio')

  // Serve local media files with proper Range support so <audio>/<video> can seek.
  protocol.handle('app-media', (request) => {
    const rawPath = decodeURIComponent(request.url.slice('app-media://'.length).split('?')[0].split('#')[0])
    const filePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    const mimeType = MEDIA_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

    let stat: ReturnType<typeof statSync>
    try { stat = statSync(filePath) } catch { return new Response(null, { status: 404 }) }

    const fileSize = stat.size
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (!m) return new Response(null, { status: 416 })
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1
      return new Response(
        Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
        {
          status: 206,
          headers: {
            'Content-Type':   mimeType,
            'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges':  'bytes',
            'Content-Length': String(end - start + 1),
          },
        },
      )
    }

    return new Response(
      Readable.toWeb(createReadStream(filePath)) as ReadableStream,
      {
        status: 200,
        headers: {
          'Content-Type':   mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges':  'bytes',
        },
      },
    )
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupDatabase()
  registerEpisodeHandlers(ipcMain)
  registerTranscriptHandlers(ipcMain)
  registerAIHandlers(ipcMain)
  registerClipHandlers(ipcMain)
  registerFileHandlers(ipcMain)
  registerWhisperSetupHandlers(ipcMain)
  registerFirstRunHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
