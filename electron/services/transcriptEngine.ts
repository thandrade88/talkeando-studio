import { IpcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { spawn } from 'child_process'
import { existsSync, unlinkSync, statSync } from 'fs'
import { join, extname } from 'path'
import { tmpdir, cpus } from 'os'
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
  const args: string[] = ['-threads', '0']  // use all available CPU cores for extraction
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

// ─── Whisper execution ────────────────────────────────────────────────────────

// Divide available cores evenly: half as parallel processors, rest as threads each.
// e.g. 8 cores → 3 processors × 2 threads; 4 cores → 1 processor × 3 threads.
const AVAILABLE_CORES = Math.max(1, cpus().length - 1)
const MAX_WORKERS = Math.max(1, Math.min(Math.floor(AVAILABLE_CORES / 2), 6))
const THREADS_PER_WORKER = Math.max(1, Math.floor(AVAILABLE_CORES / MAX_WORKERS))

// Minimum expected bytes per model — anything smaller means a corrupt/partial download.
const MIN_MODEL_BYTES: Record<string, number> = {
  tiny: 70e6, base: 130e6, small: 400e6, medium: 1400e6,
  'large-v3-turbo': 1400e6, 'large-v3': 2900e6,
}

// Cap processors for large models to avoid running out of memory
// (each processor loads an independent copy of the model).
function processorsForModel(model: string): number {
  if (model.startsWith('large') || model === 'medium') return Math.min(2, MAX_WORKERS)
  return MAX_WORKERS
}

type Segment = { start_time: number; end_time: number; text: string }

// Single whisper invocation using the built-in -p flag for parallel segment processing.
// Replaces manual FFmpeg chunking: whisper handles splitting and timestamp merging internally.
function runWhisper(
  whisperBin: string, modelPath: string, audioPath: string, language: string,
  processors: number, onProgress: (pct: number, msg: string) => void,
): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    let stdoutBuf = ''
    let stderrBuf = ''
    onProgress(1, `Transcrevendo com ${processors} processador${processors > 1 ? 'es' : ''} (${THREADS_PER_WORKER} threads/cada)...`)
    const proc = spawn(whisperBin, [
      '-m', modelPath, '-f', audioPath, '-l', language, '-pp',
      '-t', String(THREADS_PER_WORKER),
      '-p', String(processors),
    ])
    proc.stdout.on('data', (d: Buffer) => { stdoutBuf += d.toString() })
    proc.stderr.on('data', (d: Buffer) => {
      stderrBuf += d.toString()
      const m = d.toString().match(/progress\s*=\s*(\d+)%/)
      if (m) onProgress(Math.max(1, parseInt(m[1], 10)), `Transcrevendo... ${m[1]}%`)
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        const isModelErr = stderrBuf.includes('bad magic') || stderrBuf.includes('invalid model')
        const hint = isModelErr
          ? ' Modelo corrompido — vá em Configurações → Whisper, delete e baixe novamente.'
          : ''
        reject(new Error(`Whisper encerrou com código ${code}.${hint}\nStderr: ${stderrBuf.slice(-400)}`))
        return
      }
      const segments = parseWhisperOutput(stdoutBuf)
      if (segments.length === 0) {
        reject(new Error(
          `Transcrição vazia — nenhum segmento de fala detectado.\n` +
          `Stdout (primeiros 300): ${stdoutBuf.slice(0, 300) || '(vazio)'}\n` +
          `Stderr (últimos 300): ${stderrBuf.slice(-300)}`,
        ))
        return
      }
      resolve(segments)
    })
    proc.on('error', reject)
  })
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

    // Catch corrupt/partial downloads before whisper prints a cryptic "bad magic" error
    const { size: modelBytes } = statSync(modelPath)
    const minBytes = MIN_MODEL_BYTES[model] ?? 70e6
    if (modelBytes < minBytes) {
      throw new Error(
        `Modelo "${model}" corrompido (${Math.round(modelBytes / 1e6)} MB — esperado > ${Math.round(minBytes / 1e6)} MB). ` +
        'Vá em Configurações → Whisper, delete o modelo e baixe novamente.'
      )
    }

    const langSetting = db.prepare("SELECT value FROM settings WHERE key = 'default_language'").get() as { value: string } | undefined
    const language = langSetting?.value ?? 'pt'

    db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('transcribing', episodeId)
    sendProgress(win, 1, 'Iniciando transcrição...')

    const ffmpeg = getFFmpeg()

    // Only treat as pre-extracted if the file exists AND is not a video container
    // (whisper-cli may not decode video formats without full FFmpeg codec support).
    const isVideoSource = VIDEO_EXTS.has(extname(episode.audio_path ?? '').toLowerCase())
    const preExtracted = episode.audio_path && existsSync(episode.audio_path) && !isVideoSource
      ? episode.audio_path
      : null
    const source = preExtracted ?? episode.file_path
    const alreadyClean = Boolean(preExtracted)

    // Only run FFmpeg when we need to cut a time range or the source is a video container.
    // For full-episode transcription, feed the pre-extracted MP3 directly to whisper-cli.
    let audioPath = preExtracted ?? episode.file_path
    let tempWav: string | null = null

    if (startSeconds > 0 || endSeconds !== undefined || !preExtracted) {
      const fromLabel = startSeconds > 0 ? ` de ${new Date(startSeconds * 1000).toISOString().slice(11, 19)}` : ''
      const toLabel = endSeconds !== undefined ? ` até ${new Date(endSeconds * 1000).toISOString().slice(11, 19)}` : ''
      if (!preExtracted) {
        sendProgress(win, 1, `Extraindo áudio${fromLabel}${toLabel}...`)
      } else if (startSeconds > 0 || endSeconds !== undefined) {
        sendProgress(win, 1, `Cortando áudio${fromLabel}${toLabel}...`)
      }
      tempWav = join(tmpdir(), `talkeando_${episodeId}_${Date.now()}.wav`)
      try {
        await extractAudio(ffmpeg, source, tempWav, startSeconds, endSeconds, alreadyClean)
        audioPath = tempWav
      } catch (err) {
        db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
        throw new Error(`Falha ao preparar áudio: ${err}`)
      }
    }

    try {
      const processors = processorsForModel(model)
      let segments: Segment[] = await runWhisper(
        whisperBin, modelPath, audioPath, language, processors,
        (pct, msg) => sendProgress(win, pct, msg),
      )

      if (tempWav) try { unlinkSync(tempWav) } catch {}

      // Timestamps from whisper are relative to the cut start; shift back to episode time.
      if (startSeconds > 0) {
        segments = segments.map(s => ({
          ...s, start_time: s.start_time + startSeconds, end_time: s.end_time + startSeconds,
        }))
      }

      const stillExists = db.prepare('SELECT id FROM episodes WHERE id = ?').get(episodeId)
      if (!stillExists) throw new Error('Episódio foi removido durante a transcrição.')

      sendProgress(win, 98, `Salvando ${segments.length} segmentos...`)
      db.prepare('DELETE FROM transcripts WHERE episode_id = ?').run(episodeId)

      const insert = db.prepare('INSERT INTO transcripts (episode_id, start_time, end_time, text) VALUES (?, ?, ?, ?)')
      db.transaction((segs: typeof segments) => {
        for (const seg of segs) insert.run(episodeId, seg.start_time, seg.end_time, seg.text)
      })(segments)

      db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('transcribed', episodeId)
      sendProgress(win, 100, `Transcrição concluída! ${segments.length} segmentos.`)
      return { success: true, segmentCount: segments.length }
    } catch (err) {
      if (tempWav) try { unlinkSync(tempWav) } catch {}
      db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
      throw err
    }
  })

  ipcMain.handle('transcripts:updateSegment', (_event, id: number, text: string) => {
    const db = getDatabase()
    db.prepare('UPDATE transcripts SET text = ? WHERE id = ?').run(text, id)
    return { success: true }
  })
}
