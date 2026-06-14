import { IpcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { spawn } from 'child_process'
import { existsSync, unlinkSync, readFileSync } from 'fs'
import { extname, join } from 'path'
import { tmpdir } from 'os'
import { getWhisperBinaryPath, getModelPath } from './whisperSetup'

// Formats whisper-cli cannot decode natively — need FFmpeg audio extraction first
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.m4a'])

function getFFmpeg(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static') as string
  } catch {
    return 'ffmpeg'
  }
}

// `alreadyClean` = source is the pre-extracted project MP3, so skip the highpass filter
// and pcm_s16le trick (we just need to seek + cut + decode to WAV for Whisper).
function extractAudio(
  ffmpeg: string, inputPath: string, outputPath: string,
  startSeconds = 0, endSeconds?: number, alreadyClean = false,
): Promise<void> {
  const args: string[] = []
  if (startSeconds > 0) args.push('-ss', String(startSeconds))
  if (endSeconds !== undefined && endSeconds > startSeconds) args.push('-to', String(endSeconds))
  if (alreadyClean) {
    args.push('-i', inputPath, '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-f', 'wav', '-y', outputPath)
  } else {
    args.push(
      '-i', inputPath,
      '-ar', '16000', '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-af', 'highpass=f=150',
      '-f', 'wav', '-y', outputPath,
    )
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args)
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`FFmpeg audio extraction failed (code ${code})`))
      else resolve()
    })
    proc.on('error', reject)
  })
}

function sendProgress(win: BrowserWindow | null, progress: number, status: string): void {
  win?.webContents.send('transcription:progress', progress, status)
}

// Whisper non-speech annotation pattern: e.g. [música de fundo], [Music], [Applause], (music), etc.
const NON_SPEECH_RE = /^\s*[\[(][\w\sÀ-ɏ]+[\])]\s*$/i

export function parseWhisperOutput(output: string): { start_time: number; end_time: number; text: string }[] {
  const segments: { start_time: number; end_time: number; text: string }[] = []
  const pattern = /\[(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(.+)/g
  let match
  while ((match = pattern.exec(output)) !== null) {
    const text = match[3].trim()
    if (!NON_SPEECH_RE.test(text)) {
      segments.push({
        start_time: timeToSeconds(match[1]),
        end_time: timeToSeconds(match[2]),
        text,
      })
    }
  }
  return segments
}

export function timeToSeconds(timeStr: string): number {
  const [hms, ms] = timeStr.split('.')
  const [h, m, s] = hms.split(':').map(Number)
  return h * 3600 + m * 60 + s + Number(ms) / 1000
}

// Parse the JSON file written by whisper-cli -oj. Offsets are in milliseconds.
function parseWhisperJSON(jsonStr: string): { start_time: number; end_time: number; text: string }[] {
  try {
    const data = JSON.parse(jsonStr)
    return ((data.transcription ?? []) as Array<{ offsets: { from: number; to: number }; text: string }>)
      .map((seg) => ({ start_time: seg.offsets.from / 1000, end_time: seg.offsets.to / 1000, text: seg.text.trim() }))
      .filter((seg) => seg.text.length > 0 && !NON_SPEECH_RE.test(seg.text))
  } catch {
    return []
  }
}

export function registerTranscriptHandlers(ipcMain: IpcMain): void {
  // Probe media duration in seconds via FFmpeg stderr output.
  ipcMain.handle('media:getDuration', (_event, filePath: string) => {
    return new Promise<number>((resolve) => {
      const ffmpeg = getFFmpeg()
      const proc = spawn(ffmpeg, ['-i', filePath, '-f', 'null', '-'])
      let stderr = ''
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', () => {
        const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
        if (!m) { resolve(0); return }
        resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
      })
      proc.on('error', () => resolve(0))
    })
  })

  // Extract a single video frame at `timeSeconds` → base64 JPEG data URL.
  // Falls back gracefully when the file has no video track (audio-only).
  ipcMain.handle('media:extractFrame', (_event, filePath: string, timeSeconds: number) => {
    return new Promise<string | null>((resolve) => {
      const ffmpeg = getFFmpeg()
      const proc = spawn(ffmpeg, [
        '-ss', String(Math.max(0, timeSeconds)),
        '-i', filePath,
        '-vframes', '1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-q:v', '4',
        'pipe:1',
      ])
      const chunks: Buffer[] = []
      proc.stdout.on('data', (d: Buffer) => chunks.push(d))
      proc.on('close', () => {
        const buf = Buffer.concat(chunks)
        if (buf.length === 0) { resolve(null); return }
        resolve(`data:image/jpeg;base64,${buf.toString('base64')}`)
      })
      proc.on('error', () => resolve(null))
    })
  })

  ipcMain.handle('transcripts:getByEpisode', (_event, episodeId: number) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM transcripts WHERE episode_id = ? ORDER BY start_time ASC').all(episodeId)
  })

  ipcMain.handle('transcripts:start', async (event, episodeId: number, startSeconds = 0, endSeconds?: number) => {
    const db = getDatabase()
    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as {
      id: number; file_path: string; title: string; audio_path: string
    } | undefined

    if (!episode) throw new Error('Episode not found')

    const win = BrowserWindow.fromWebContents(event.sender)
    const whisperBin = getWhisperBinaryPath()

    if (!whisperBin) {
      throw new Error('Whisper não instalado. Vá em Configurações → Setup Whisper para instalar.')
    }

    const modelSetting = db.prepare("SELECT value FROM settings WHERE key = 'whisper_model'").get() as { value: string } | undefined
    const model = modelSetting?.value ?? 'base'
    const modelPath = getModelPath(model)

    if (!existsSync(modelPath)) {
      throw new Error(`Modelo "${model}" não encontrado. Baixe-o em Configurações.`)
    }

    const langSetting = db.prepare("SELECT value FROM settings WHERE key = 'default_language'").get() as { value: string } | undefined
    const language = langSetting?.value ?? 'pt'

    db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('transcribing', episodeId)
    sendProgress(win, 0, 'Iniciando transcrição...')

    // Use the pre-extracted project audio when available (imported flow).
    // Only re-run FFmpeg if a start offset is requested or no pre-extracted audio exists.
    const preExtracted = episode.audio_path && existsSync(episode.audio_path) ? episode.audio_path : null
    let audioPath = preExtracted ?? episode.file_path
    let tempWav: string | null = null

    if (startSeconds > 0 || endSeconds !== undefined || !preExtracted) {
      const source = preExtracted ?? episode.file_path
      const fromLabel = startSeconds > 0 ? ` de ${new Date(startSeconds * 1000).toISOString().slice(11, 19)}` : ''
      const toLabel = endSeconds !== undefined ? ` até ${new Date(endSeconds * 1000).toISOString().slice(11, 19)}` : ''
      if (!preExtracted) {
        sendProgress(win, 0, `Extraindo áudio${fromLabel}${toLabel}...`)
      } else if (startSeconds > 0 || endSeconds !== undefined) {
        sendProgress(win, 0, `Cortando áudio${fromLabel}${toLabel}...`)
      }
      tempWav = join(tmpdir(), `talkeando_${episodeId}_${Date.now()}.wav`)
      try {
        await extractAudio(getFFmpeg(), source, tempWav, startSeconds, endSeconds, Boolean(preExtracted))
        audioPath = tempWav
      } catch (err) {
        db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
        throw new Error(`Falha ao preparar áudio: ${err}`)
      }
    }

    return new Promise((resolve, reject) => {
      let stdoutBuf = ''
      let stderrBuf = ''

      // NOTE: no --translate flag — always transcribe in the original language.
      // -l auto lets Whisper detect PT / EN / ES automatically from the first ~30 s of audio.
      const proc = spawn(whisperBin, [
        '-m', modelPath,
        '-f', audioPath,
        '-l', language,  // 'auto' | 'pt' | 'en' | ...
        '-pp',           // print progress % to stderr
      ])

      proc.stdout.on('data', (data: Buffer) => { stdoutBuf += data.toString() })
      proc.stderr.on('data', (data: Buffer) => {
        stderrBuf += data.toString()
        const progressMatch = data.toString().match(/progress\s*=\s*(\d+)%/)
        if (progressMatch) {
          sendProgress(win, parseInt(progressMatch[1], 10), `Transcrevendo... ${progressMatch[1]}%`)
        }
      })

      proc.on('close', (code) => {
        if (tempWav) try { unlinkSync(tempWav) } catch {}

        if (code !== 0) {
          db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
          reject(new Error(`Whisper encerrou com código ${code}.\nStderr: ${stderrBuf.slice(-400)}`))
          return
        }

        const rawSegments = parseWhisperOutput(stdoutBuf)

        // Shift timestamps back to absolute positions when a start offset was used
        const segments = startSeconds > 0
          ? rawSegments.map((s) => ({ ...s, start_time: s.start_time + startSeconds, end_time: s.end_time + startSeconds }))
          : rawSegments

        if (segments.length === 0) {
          db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
          reject(new Error(`Transcrição vazia.\nStdout (primeiros 300 chars): ${stdoutBuf.slice(0, 300) || '(vazio)'}\nStderr (últimos 300): ${stderrBuf.slice(-300)}`))
          return
        }

        // Verify episode still exists before writing — user may have deleted it while Whisper ran
        const stillExists = db.prepare('SELECT id FROM episodes WHERE id = ?').get(episodeId)
        if (!stillExists) {
          reject(new Error('Episódio foi removido durante a transcrição.'))
          return
        }

        sendProgress(win, 98, `Salvando ${segments.length} segmentos...`)
        db.prepare('DELETE FROM transcripts WHERE episode_id = ?').run(episodeId)

        const insert = db.prepare('INSERT INTO transcripts (episode_id, start_time, end_time, text) VALUES (?, ?, ?, ?)')
        db.transaction((segs: typeof segments) => {
          for (const seg of segs) insert.run(episodeId, seg.start_time, seg.end_time, seg.text)
        })(segments)

        db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('transcribed', episodeId)
        sendProgress(win, 100, `Transcrição concluída! ${segments.length} segmentos.`)
        resolve({ success: true, segmentCount: segments.length })
      })

      proc.on('error', (err) => {
        if (tempWav) try { unlinkSync(tempWav) } catch {}
        db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
        reject(err)
      })
    })
  })

  ipcMain.handle('transcripts:updateSegment', (_event, id: number, text: string) => {
    const db = getDatabase()
    db.prepare('UPDATE transcripts SET text = ? WHERE id = ?').run(text, id)
    return { success: true }
  })
}
