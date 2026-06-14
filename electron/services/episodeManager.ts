import { IpcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { statSync, mkdirSync, rmSync, existsSync } from 'fs'
import { basename, extname, join } from 'path'
import { spawn } from 'child_process'
import { app } from 'electron'

function getFFmpeg(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static') as string
  } catch {
    return 'ffmpeg'
  }
}

function getProjectDir(episodeId: number): string {
  return join(app.getPath('userData'), 'projects', String(episodeId))
}

function extractAudioForProject(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  onProgress?: (msg: string) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-ar', '16000', '-ac', '1',
      '-af', 'highpass=f=150',
      '-acodec', 'libmp3lame', '-b:a', '64k',
      '-f', 'mp3', '-y', outputPath,
    ]
    const proc = spawn(ffmpeg, args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      const m = stderr.match(/time=(\d+):(\d+):(\d+)/)
      if (m && onProgress) {
        onProgress(`Extraindo áudio... ${m[1]}h${m[2]}m${m[3]}s processados`)
      }
    })
    proc.on('close', (code) => {
      if (code !== 0) { reject(new Error(`FFmpeg falhou (código ${code})`)); return }
      // Parse duration from stderr
      const dm = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      const duration = dm
        ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3])
        : 0
      resolve(duration)
    })
    proc.on('error', reject)
  })
}

export function registerEpisodeHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('episodes:getAll', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM transcripts WHERE episode_id = e.id) as transcript_count,
        (SELECT COUNT(*) FROM clips WHERE episode_id = e.id) as clip_count,
        (SELECT COUNT(*) FROM generated_content WHERE episode_id = e.id) as content_count
      FROM episodes e
      ORDER BY e.created_at DESC
    `).all()
  })

  ipcMain.handle('episodes:getById', (_event, id: number) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM episodes WHERE id = ?').get(id)
  })

  ipcMain.handle('episodes:import', async (event, filePath: string) => {
    const db = getDatabase()
    const ext = extname(filePath).toLowerCase()
    const allowedExts = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.flac', '.mov', '.avi', '.mkv', '.webm']

    if (!allowedExts.includes(ext)) {
      throw new Error(`Formato não suportado: ${ext}`)
    }

    const stats = statSync(filePath)
    if (!stats.isFile()) throw new Error('Caminho inválido')

    const title = basename(filePath, ext)
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Insert record and return immediately so the UI can show the episode card right away.
    const result = db.prepare(`
      INSERT INTO episodes (title, file_path, status, audio_path)
      VALUES (?, ?, 'imported', '')
    `).run(title, filePath)
    const episodeId = result.lastInsertRowid as number
    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId)

    const win = BrowserWindow.fromWebContents(event.sender)

    // Run audio extraction in the background — do NOT await here.
    // The renderer receives the episode immediately and tracks progress via importProgress events.
    setImmediate(async () => {
      const projectDir = getProjectDir(episodeId)
      mkdirSync(projectDir, { recursive: true })
      const audioPath = join(projectDir, 'audio.mp3')

      win?.webContents.send('episodes:importProgress', episodeId, 'Extraindo áudio...')
      try {
        const duration = await extractAudioForProject(
          getFFmpeg(),
          filePath,
          audioPath,
          (msg) => win?.webContents.send('episodes:importProgress', episodeId, msg),
        )
        db.prepare('UPDATE episodes SET audio_path = ?, duration = ? WHERE id = ?')
          .run(audioPath, Math.round(duration), episodeId)
      } catch (err) {
        console.error('Audio extraction failed during import:', err)
      } finally {
        win?.webContents.send('episodes:importProgress', episodeId, null)
      }
    })

    return episode
  })

  ipcMain.handle('episodes:update', (_event, id: number, data: Record<string, unknown>) => {
    const db = getDatabase()
    const allowed = ['title', 'status']
    const fields = Object.keys(data).filter(k => allowed.includes(k))
    if (fields.length === 0) throw new Error('No valid fields to update')

    const setClauses = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => data[f])

    db.prepare(`
      UPDATE episodes SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(...values, id)

    return db.prepare('SELECT * FROM episodes WHERE id = ?').get(id)
  })

  ipcMain.handle('episodes:delete', (_event, id: number) => {
    const db = getDatabase()
    db.prepare('DELETE FROM episodes WHERE id = ?').run(id)

    // Clean up project folder
    const projectDir = getProjectDir(id)
    if (existsSync(projectDir)) {
      try { rmSync(projectDir, { recursive: true, force: true }) } catch {}
    }

    return { success: true }
  })

  ipcMain.handle('settings:get', (_event, key: string) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    const db = getDatabase()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
    return { success: true }
  })

  ipcMain.handle('settings:getAll', () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })
}
