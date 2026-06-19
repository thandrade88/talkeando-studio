import { IpcMain, BrowserWindow } from 'electron'
import { getDatabase } from './database'
import { spawn } from 'child_process'
import { existsSync, unlinkSync, readFileSync } from 'fs'
import { extname, join } from 'path'
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

// ─── Parallel chunked transcription ───────────────────────────────────────────

const CHUNK_DURATION = 300   // 5 minutes per chunk
const OVERLAP = 10           // 10-second overlap between chunks
const MAX_WORKERS = Math.max(1, Math.min(cpus().length - 1, 4))

type Segment = { start_time: number; end_time: number; text: string }

function probeDuration(ffmpeg: string, filePath: string): Promise<number> {
  return new Promise((resolve) => {
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
}

function splitAudioIntoChunks(
  ffmpeg: string, sourcePath: string, totalDuration: number,
  episodeId: number, alreadyClean: boolean,
): { chunkPath: string; offsetSeconds: number; promise: Promise<void> }[] {
  const chunks: { chunkPath: string; offsetSeconds: number; promise: Promise<void> }[] = []
  let offset = 0
  let index = 0
  while (offset < totalDuration) {
    const end = Math.min(offset + CHUNK_DURATION + OVERLAP, totalDuration)
    const chunkPath = join(tmpdir(), `talkeando_${episodeId}_chunk${index}_${Date.now()}.wav`)
    const promise = extractAudio(ffmpeg, sourcePath, chunkPath, offset, end, alreadyClean)
    chunks.push({ chunkPath, offsetSeconds: offset, promise })
    offset += CHUNK_DURATION
    index++
  }
  return chunks
}

function transcribeChunk(
  whisperBin: string, modelPath: string, language: string,
  chunkPath: string, offsetSeconds: number,
): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    let stdoutBuf = ''
    let stderrBuf = ''
    const proc = spawn(whisperBin, [
      '-m', modelPath, '-f', chunkPath, '-l', language, '-pp',
    ])
    proc.stdout.on('data', (d: Buffer) => { stdoutBuf += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })
    proc.on('close', (code) => {
      try { unlinkSync(chunkPath) } catch {}
      if (code !== 0) {
        reject(new Error(`Whisper chunk failed (code ${code}): ${stderrBuf.slice(-200)}`))
        return
      }
      const segs = parseWhisperOutput(stdoutBuf).map(s => ({
        start_time: s.start_time + offsetSeconds,
        end_time: s.end_time + offsetSeconds,
        text: s.text,
      }))
      resolve(segs)
    })
    proc.on('error', (err) => {
      try { unlinkSync(chunkPath) } catch {}
      reject(err)
    })
  })
}

// Merge segments from all chunks, deduplicating the overlap regions.
// In the overlap window, keep only segments from the earlier chunk
// (they have more left-context and tend to produce cleaner sentence endings).
export function mergeChunkSegments(chunkResults: { offsetSeconds: number; segments: Segment[] }[]): Segment[] {
  if (chunkResults.length === 0) return []
  if (chunkResults.length === 1) return chunkResults[0].segments

  const sorted = [...chunkResults].sort((a, b) => a.offsetSeconds - b.offsetSeconds)
  const merged: Segment[] = []

  for (let i = 0; i < sorted.length; i++) {
    const { offsetSeconds, segments } = sorted[i]
    const overlapBoundary = offsetSeconds + OVERLAP

    for (const seg of segments) {
      if (i > 0 && seg.start_time < overlapBoundary) continue
      merged.push(seg)
    }
  }

  return merged.sort((a, b) => a.start_time - b.start_time)
}

async function runParallelTranscription(
  ffmpeg: string, whisperBin: string, modelPath: string, language: string,
  audioPath: string, totalDuration: number, episodeId: number,
  alreadyClean: boolean, globalOffset: number,
  onProgress: (pct: number, msg: string) => void,
): Promise<Segment[]> {
  const chunks = splitAudioIntoChunks(ffmpeg, audioPath, totalDuration, episodeId, alreadyClean)
  const totalChunks = chunks.length
  onProgress(0, `Dividindo áudio em ${totalChunks} partes...`)

  // Wait for all FFmpeg splits to finish
  await Promise.all(chunks.map(c => c.promise))
  onProgress(5, `${totalChunks} partes prontas. Transcrevendo em paralelo (${Math.min(totalChunks, MAX_WORKERS)} workers)...`)

  // Run Whisper in parallel with concurrency limit
  const chunkResults: { offsetSeconds: number; segments: Segment[] }[] = []
  let completed = 0
  const queue = [...chunks]

  async function runWorker(): Promise<void> {
    while (queue.length > 0) {
      const chunk = queue.shift()!
      const segs = await transcribeChunk(whisperBin, modelPath, language, chunk.chunkPath, chunk.offsetSeconds)
      chunkResults.push({ offsetSeconds: chunk.offsetSeconds, segments: segs })
      completed++
      const pct = Math.round(5 + (completed / totalChunks) * 90)
      onProgress(pct, `Transcrito ${completed}/${totalChunks} partes...`)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_WORKERS, totalChunks) }, () => runWorker())
  await Promise.all(workers)

  let merged = mergeChunkSegments(chunkResults)

  if (globalOffset > 0) {
    merged = merged.map(s => ({
      ...s,
      start_time: s.start_time + globalOffset,
      end_time: s.end_time + globalOffset,
    }))
  }

  return merged
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

    const ffmpeg = getFFmpeg()
    const preExtracted = episode.audio_path && existsSync(episode.audio_path) ? episode.audio_path : null
    const source = preExtracted ?? episode.file_path
    const alreadyClean = Boolean(preExtracted)

    // Prepare the audio source (extract/cut if needed)
    let audioPath = preExtracted ?? episode.file_path
    let tempWav: string | null = null

    if (startSeconds > 0 || endSeconds !== undefined || !preExtracted) {
      const fromLabel = startSeconds > 0 ? ` de ${new Date(startSeconds * 1000).toISOString().slice(11, 19)}` : ''
      const toLabel = endSeconds !== undefined ? ` até ${new Date(endSeconds * 1000).toISOString().slice(11, 19)}` : ''
      if (!preExtracted) {
        sendProgress(win, 0, `Extraindo áudio${fromLabel}${toLabel}...`)
      } else if (startSeconds > 0 || endSeconds !== undefined) {
        sendProgress(win, 0, `Cortando áudio${fromLabel}${toLabel}...`)
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
      const duration = endSeconds !== undefined
        ? (endSeconds - startSeconds)
        : await probeDuration(ffmpeg, audioPath)

      // Use parallel chunked transcription for audio longer than one chunk
      const useParallel = duration > CHUNK_DURATION + OVERLAP
      let segments: Segment[]

      if (useParallel) {
        sendProgress(win, 0, `Áudio de ${Math.round(duration / 60)} min — usando transcrição paralela...`)
        segments = await runParallelTranscription(
          ffmpeg, whisperBin, modelPath, language,
          audioPath, duration, episodeId, alreadyClean, startSeconds,
          (pct, msg) => sendProgress(win, pct, msg),
        )
      } else {
        // Single-process path for short audio
        segments = await new Promise<Segment[]>((resolve, reject) => {
          let stdoutBuf = ''
          let stderrBuf = ''
          const proc = spawn(whisperBin, [
            '-m', modelPath, '-f', audioPath, '-l', language, '-pp',
          ])
          proc.stdout.on('data', (d: Buffer) => { stdoutBuf += d.toString() })
          proc.stderr.on('data', (d: Buffer) => {
            stderrBuf += d.toString()
            const m = d.toString().match(/progress\s*=\s*(\d+)%/)
            if (m) sendProgress(win, parseInt(m[1], 10), `Transcrevendo... ${m[1]}%`)
          })
          proc.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Whisper encerrou com código ${code}.\nStderr: ${stderrBuf.slice(-400)}`))
              return
            }
            const raw = parseWhisperOutput(stdoutBuf)
            const shifted = startSeconds > 0
              ? raw.map(s => ({ ...s, start_time: s.start_time + startSeconds, end_time: s.end_time + startSeconds }))
              : raw
            resolve(shifted)
          })
          proc.on('error', reject)
        })
      }

      if (tempWav) try { unlinkSync(tempWav) } catch {}

      if (segments.length === 0) {
        db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('imported', episodeId)
        throw new Error('Transcrição vazia — nenhum segmento de fala detectado.')
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
