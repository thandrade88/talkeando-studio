import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, extname } from 'path'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Local HTTP server for media files — bypasses protocol.handle's mojo IPC
// which has a 32-bit byte counter overflow for files > 2 GB.
let mediaServerPort = 0

function handleMediaRequest(req: IncomingMessage, res: ServerResponse): void {
  try {
    const urlObj = new URL(req.url ?? '/', 'http://localhost')
    const filePath = urlObj.searchParams.get('p')
    if (!filePath) { res.writeHead(400); res.end(); return }

    let stat: ReturnType<typeof statSync>
    try { stat = statSync(filePath) } catch { res.writeHead(404); res.end(); return }

    const fileSize = stat.size
    const mimeType = MEDIA_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = req.headers['range']

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` }); res.end(); return }

      let start: number, end: number
      if (m[1]) {
        start = parseInt(m[1], 10)
        end = m[2] ? parseInt(m[2], 10) : fileSize - 1
      } else {
        const n = parseInt(m[2], 10)
        start = Math.max(0, fileSize - n)
        end = fileSize - 1
      }
      end = Math.min(end, fileSize - 1)

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type':   mimeType,
      })
      const stream = createReadStream(filePath, { start, end })
      req.on('close', () => stream.destroy())
      stream.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': String(fileSize),
        'Content-Type':   mimeType,
        'Accept-Ranges':  'bytes',
      })
      const stream = createReadStream(filePath)
      req.on('close', () => stream.destroy())
      stream.pipe(res)
    }
  } catch (err) {
    console.error('Media server error:', err)
    if (!res.headersSent) { res.writeHead(500); res.end() }
  }
}

function startMediaServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer(handleMediaRequest)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      mediaServerPort = typeof addr === 'object' && addr ? addr.port : 0
      resolve()
    })
    app.on('quit', () => server.close())
  })
}

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
import { registerYouTubeHandlers } from '../services/youtubeService'
import { registerWordPressHandlers } from '../services/wordpressService'
import { registerOpusClipHandlers } from '../services/opusClipService'

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.talkeando.studio')

  await startMediaServer()
  ipcMain.handle('media:serverPort', () => mediaServerPort)

  // Serve local media files with proper Range support so <audio>/<video> can seek.
  protocol.handle('app-media', (request) => {
    const rawPath = decodeURIComponent(request.url.slice('app-media://'.length).split('?')[0].split('#')[0])
    const filePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    const mimeType = MEDIA_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

    let stat: ReturnType<typeof statSync>
    try { stat = statSync(filePath) } catch { return new Response(null, { status: 404 }) }

    const fileSize = stat.size
    const rangeHeader = request.headers.get('range')

    let start = 0
    let end = fileSize - 1
    let isRangeRequest = false

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (!m) return new Response(null, { status: 416 })
      isRangeRequest = true
      if (m[1]) {
        // standard range: bytes=start-end or bytes=start-
        start = parseInt(m[1], 10)
        end = m[2] ? parseInt(m[2], 10) : fileSize - 1
      } else if (m[2]) {
        // suffix range: bytes=-N means last N bytes
        const suffixLen = parseInt(m[2], 10)
        start = Math.max(0, fileSize - suffixLen)
        end = fileSize - 1
      }
      end = Math.min(end, fileSize - 1)
    }

    const chunkSize = end - start + 1
    const stream = createReadStream(filePath, { start, end })
    request.signal.addEventListener('abort', () => stream.destroy(), { once: true })
    return new Response(
      Readable.toWeb(stream) as ReadableStream,
      {
        status: isRangeRequest ? 206 : 200,
        headers: {
          'Content-Type':   mimeType,
          'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges':  'bytes',
          'Content-Length': String(chunkSize),
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
  registerYouTubeHandlers(ipcMain)
  registerWordPressHandlers(ipcMain)
  registerOpusClipHandlers(ipcMain)

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
