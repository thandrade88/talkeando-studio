import { IpcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { spawn } from 'child_process'
import { join, basename, extname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

function getFFmpegBinary(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static') as string
  } catch {
    return 'ffmpeg'
  }
}

function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = (seconds % 60).toFixed(3)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(parseFloat(s).toFixed(3)).padStart(6, '0')}`
}

export function registerClipHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('clips:getByEpisode', (_event, episodeId: number) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM clips WHERE episode_id = ? ORDER BY start_time ASC').all(episodeId)
  })

  ipcMain.handle('clips:create', (_event, episodeId: number, startTime: number, endTime: number, title: string) => {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO clips (episode_id, start_time, end_time, title)
      VALUES (?, ?, ?, ?)
    `).run(episodeId, startTime, endTime, title)
    return db.prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('clips:export', async (event, clipId: number) => {
    const db = getDatabase()
    const clip = db.prepare(`
      SELECT c.*, e.file_path as episode_path, e.title as episode_title
      FROM clips c JOIN episodes e ON c.episode_id = e.id
      WHERE c.id = ?
    `).get(clipId) as {
      id: number; start_time: number; end_time: number; title: string;
      episode_path: string; episode_title: string
    } | undefined

    if (!clip) throw new Error('Clip not found')

    if (!existsSync(clip.episode_path)) {
      throw new Error(`Arquivo de origem não encontrado: ${clip.episode_path}`)
    }

    const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'output_directory'").get() as { value: string } | undefined
    const outputDir = settingRow?.value || join(app.getPath('documents'), 'Talkeando Studio', 'Clips')
    mkdirSync(outputDir, { recursive: true })

    const safeTitle = clip.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')
    const ext = extname(clip.episode_path) || '.mp4'
    const outputPath = join(outputDir, `${safeTitle}${ext}`)

    const win = BrowserWindow.fromWebContents(event.sender)
    const ffmpeg = getFFmpegBinary()

    return new Promise((resolve, reject) => {
      const duration = clip.end_time - clip.start_time
      let lastProgress = 0
      let stderrBuf = ''

      // -ss before -i = fast input seek to nearest keyframe (required for -c copy to work)
      const proc = spawn(ffmpeg, [
        '-ss', secondsToTimestamp(clip.start_time),
        '-i', clip.episode_path,
        '-t', String(duration),
        '-c', 'copy',
        '-y',
        outputPath
      ])

      proc.stderr.on('data', (data: Buffer) => {
        const line = data.toString()
        stderrBuf += line
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/)
        if (timeMatch) {
          const [h, m, s] = timeMatch[1].split(':').map(parseFloat)
          const elapsed = h * 3600 + m * 60 + s
          const progress = Math.min(100, Math.round((elapsed / duration) * 100))
          if (progress !== lastProgress) {
            lastProgress = progress
            win?.webContents.send('clips:progress', progress)
          }
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg encerrou com código ${code}.\n${stderrBuf.slice(-500)}`))
          return
        }
        db.prepare('UPDATE clips SET file_path = ? WHERE id = ?').run(outputPath, clipId)
        win?.webContents.send('clips:progress', 100)
        resolve({ success: true, filePath: outputPath })
      })

      proc.on('error', reject)
    })
  })

  ipcMain.handle('clips:delete', (_event, clipId: number) => {
    const db = getDatabase()
    db.prepare('DELETE FROM clips WHERE id = ?').run(clipId)
    return { success: true }
  })

  ipcMain.handle('clips:deleteAll', (_event, episodeId: number) => {
    const db = getDatabase()
    db.prepare('DELETE FROM clips WHERE episode_id = ?').run(episodeId)
    return { success: true }
  })

  ipcMain.handle('clips:createFromKeyMoments', (_event, episodeId: number) => {
    const db = getDatabase()
    const moments = db.prepare(
      'SELECT * FROM key_moments WHERE episode_id = ? ORDER BY start_time ASC'
    ).all(episodeId) as { title: string; description: string; start_time: number; end_time: number }[]

    if (moments.length === 0) throw new Error('Nenhum momento-chave encontrado. Gere o Resumo primeiro.')

    const insert = db.prepare(
      'INSERT INTO clips (episode_id, start_time, end_time, title) VALUES (?, ?, ?, ?)'
    )
    for (const m of moments) insert.run(episodeId, m.start_time, m.end_time, m.title)

    return db.prepare('SELECT * FROM clips WHERE episode_id = ? ORDER BY start_time ASC').all(episodeId)
  })
}
