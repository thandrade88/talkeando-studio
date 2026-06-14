import { IpcMain, BrowserWindow, net } from 'electron'
import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDatabase } from './database'

const IS_WINDOWS = process.platform === 'win32'

// key = model name used in filenames (ggml-{key}.bin) and as the setting value
const MODELS: Record<string, { size: string; description: string }> = {
  tiny: { size: '75 MB', description: 'Mais rápido, menos preciso' },
  base: { size: '142 MB', description: 'Recomendado para testes' },
  small: { size: '466 MB', description: 'Boa precisão' },
  medium: { size: '1.5 GB', description: 'Muito preciso' },
  'large-v3-turbo': { size: '1.6 GB', description: 'Alta precisão (recomendado)' },
  'large-v3': { size: '3.1 GB', description: 'Máxima precisão' }
}

function getModelsDir(): string {
  return join(app.getPath('userData'), 'models')
}

// ── Windows helpers ────────────────────────────────────────────────────────────

function getWindowsBinDir(): string {
  return join(app.getPath('userData'), 'whisper-bin')
}

function findInDir(dir: string, names: string[]): string {
  if (!existsSync(dir)) return ''
  const walk = (d: string): string => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        const found = walk(full)
        if (found) return found
      } else if (names.includes(entry.name.toLowerCase())) {
        return full
      }
    }
    return ''
  }
  return walk(dir)
}

// ── Mac/Linux helpers ──────────────────────────────────────────────────────────

function getBrewPrefix(): string {
  if (existsSync('/opt/homebrew/bin/brew')) return '/opt/homebrew'  // Apple Silicon
  if (existsSync('/usr/local/bin/brew')) return '/usr/local'         // Intel Mac
  if (existsSync('/home/linuxbrew/.linuxbrew/bin/brew')) return '/home/linuxbrew/.linuxbrew'
  try {
    return execSync('brew --prefix', { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return ''
  }
}

// ── Cross-platform binary resolution ──────────────────────────────────────────

export function getWhisperBinaryPath(): string {
  if (IS_WINDOWS) {
    return findInDir(getWindowsBinDir(), ['whisper-cli.exe', 'main.exe', 'whisper.exe'])
  }
  const brewPrefix = getBrewPrefix()
  const candidates = brewPrefix
    ? [join(brewPrefix, 'bin', 'whisper-cli'), join(brewPrefix, 'bin', 'whisper-cpp')]
    : []
  candidates.push(
    '/usr/local/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cpp',
    '/opt/homebrew/bin/whisper-cpp'
  )
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return ''
}

export function getModelPath(model: string): string {
  return join(getModelsDir(), `ggml-${model}.bin`)
}

function isBrewInstalled(): boolean {
  if (IS_WINDOWS) return true  // not applicable; always pass this gate on Windows
  return getBrewPrefix() !== ''
}

function isWhisperInstalled(): boolean {
  return getWhisperBinaryPath() !== ''
}

function isModelDownloaded(model: string): boolean {
  return existsSync(getModelPath(model))
}

// ── Shared download helper ────────────────────────────────────────────────────

function downloadFile(
  url: string,
  destPath: string,
  onProgress: (percent: number, downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' })
    let file: ReturnType<typeof createWriteStream> | null = null
    let downloaded = 0
    let total = 0

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} downloading file`))
        return
      }

      total = parseInt((response.headers['content-length'] as string) ?? '0', 10)
      file = createWriteStream(destPath)

      file.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        reject(err)
      })

      response.on('data', (chunk: Buffer) => {
        file!.write(chunk)
        downloaded += chunk.length
        if (total > 0) onProgress(Math.round((downloaded / total) * 100), downloaded, total)
      })

      response.on('end', () => { file!.end(() => resolve()) })
      response.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        reject(err)
      })
    })

    request.on('error', (err) => {
      try { if (file) file.destroy(); unlinkSync(destPath) } catch {}
      reject(err)
    })

    request.end()
  })
}

// ── Windows: download binary from GitHub releases ────────────────────────────

function fetchLatestRelease(): Promise<{ assets: Array<{ name: string; browser_download_url: string }> }> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: 'https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest',
      headers: { 'User-Agent': 'TalkeandoStudio/1.0' },
      redirect: 'follow',
    })
    let body = ''
    request.on('response', (res) => {
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { reject(new Error('Resposta inválida da API do GitHub')) }
      })
      res.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // PowerShell is available on all modern Windows versions (8.1+)
    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`
    ])
    proc.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`PowerShell encerrou com código ${code}`))
    })
    proc.on('error', reject)
  })
}

async function installWhisperWindows(
  onProgress: (msg: string, pct: number) => void
): Promise<{ success: boolean; binaryPath: string }> {
  const binDir = getWindowsBinDir()
  mkdirSync(binDir, { recursive: true })

  onProgress('Buscando última versão do Whisper.cpp...', 5)

  const release = await fetchLatestRelease()

  // Prefer OpenBLAS build (fastest on CPU), fall back to any x64 Windows zip
  const asset =
    release.assets.find(a => /whisper-blas-bin-x64\.zip$/i.test(a.name)) ??
    release.assets.find(a => /whisper.*x64.*\.zip$/i.test(a.name)) ??
    release.assets.find(a => /whisper.*win.*\.zip$/i.test(a.name))

  if (!asset) {
    throw new Error(
      'Não foi possível encontrar o binário Windows na última release do whisper.cpp. ' +
      'Tente novamente ou baixe manualmente em github.com/ggerganov/whisper.cpp/releases'
    )
  }

  const zipPath = join(binDir, 'whisper-win.zip')

  onProgress(`Baixando ${asset.name}...`, 10)
  await downloadFile(asset.browser_download_url, zipPath, (pct) => {
    onProgress(`Baixando ${asset.name}... ${pct}%`, 10 + Math.round(pct * 0.75))
  })

  onProgress('Extraindo arquivos...', 88)
  await extractZip(zipPath, binDir)
  try { unlinkSync(zipPath) } catch {}

  const binaryPath = findInDir(binDir, ['whisper-cli.exe', 'main.exe', 'whisper.exe'])
  if (!binaryPath) {
    throw new Error(
      'whisper-cli.exe não encontrado após extração. ' +
      'Tente novamente ou instale manualmente.'
    )
  }

  onProgress('Whisper.cpp instalado!', 100)
  return { success: true, binaryPath }
}

// ── Status ────────────────────────────────────────────────────────────────────

function sendStatus(win: BrowserWindow | null, event: string, data: unknown): void {
  win?.webContents.send(event, data)
}

export function getWhisperStatus() {
  const db = getDatabase()
  const modelRow = db.prepare("SELECT value FROM settings WHERE key = 'whisper_model'").get() as { value: string } | undefined
  const currentModel = modelRow?.value ?? 'base'

  return {
    platform: process.platform,
    brewInstalled: isBrewInstalled(),
    whisperInstalled: isWhisperInstalled(),
    whisperBinaryPath: getWhisperBinaryPath(),
    currentModel,
    modelDownloaded: isModelDownloaded(currentModel),
    modelPath: getModelPath(currentModel),
    models: Object.entries(MODELS).map(([key, info]) => ({
      key,
      ...info,
      downloaded: isModelDownloaded(key)
    }))
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function registerWhisperSetupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:getStatus', () => getWhisperStatus())

  ipcMain.handle('whisper:install', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    if (isWhisperInstalled()) {
      return { success: true, message: 'Whisper.cpp já está instalado.' }
    }

    if (IS_WINDOWS) {
      sendStatus(win, 'whisper:setup-status', { step: 'install', message: 'Iniciando download...', progress: 0 })
      return installWhisperWindows((message, progress) => {
        sendStatus(win, 'whisper:setup-status', { step: 'install', message, progress })
      })
    }

    // Mac: install via Homebrew
    if (!isBrewInstalled()) {
      throw new Error('Homebrew não encontrado. Instale em https://brew.sh primeiro.')
    }

    sendStatus(win, 'whisper:setup-status', { step: 'install', message: 'Instalando whisper-cpp via Homebrew...', progress: 0 })

    return new Promise((resolve, reject) => {
      const brew = getBrewPrefix()
      const proc = spawn(`${brew}/bin/brew`, ['install', 'whisper-cpp'], {
        env: { ...process.env, PATH: `${brew}/bin:${process.env.PATH}` }
      })

      let lastLine = ''
      const handleData = (data: Buffer) => {
        lastLine = data.toString().trim().split('\n').pop() ?? lastLine
        sendStatus(win, 'whisper:setup-status', { step: 'install', message: lastLine, progress: 50 })
      }
      proc.stdout.on('data', handleData)
      proc.stderr.on('data', handleData)
      proc.on('close', (code) => {
        if (code !== 0) { reject(new Error(`Homebrew encerrou com código ${code}: ${lastLine}`)); return }
        sendStatus(win, 'whisper:setup-status', { step: 'install', message: 'Whisper.cpp instalado!', progress: 100 })
        resolve({ success: true, binaryPath: getWhisperBinaryPath() })
      })
      proc.on('error', reject)
    })
  })

  ipcMain.handle('whisper:downloadModel', async (event, model: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    if (!Object.keys(MODELS).includes(model)) throw new Error(`Modelo inválido: ${model}`)

    const modelsDir = getModelsDir()
    mkdirSync(modelsDir, { recursive: true })

    const destPath = getModelPath(model)
    if (existsSync(destPath)) {
      return { success: true, message: 'Modelo já baixado.', modelPath: destPath }
    }

    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`
    sendStatus(win, 'whisper:setup-status', {
      step: 'download',
      message: `Baixando modelo ${model} (${MODELS[model].size})...`,
      progress: 0,
      model
    })

    try {
      await downloadFile(url, destPath, (percent, dl, total) => {
        const dlMB = (dl / 1024 / 1024).toFixed(1)
        const totalMB = (total / 1024 / 1024).toFixed(1)
        sendStatus(win, 'whisper:setup-status', {
          step: 'download',
          message: `Baixando ${dlMB} MB / ${totalMB} MB...`,
          progress: percent,
          model
        })
      })

      const db = getDatabase()
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('whisper_model', model)

      sendStatus(win, 'whisper:setup-status', {
        step: 'download', message: `Modelo ${model} pronto!`, progress: 100, model
      })

      return { success: true, modelPath: destPath }
    } catch (err) {
      try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
      throw err
    }
  })

  ipcMain.handle('whisper:getModelsDir', () => getModelsDir())
}
