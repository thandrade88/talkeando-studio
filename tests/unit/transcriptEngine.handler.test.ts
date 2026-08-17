import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('ffmpeg-static', () => ({ default: '/mock/ffmpeg' }))
vi.mock('child_process', () => ({ spawn: vi.fn() }))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 200 * 1024 * 1024 })), // 200 MB — passes base model check
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
  }
})
vi.mock('../../electron/services/whisperSetup', () => ({
  getWhisperBinaryPath: vi.fn(() => '/mock/whisper-cli'),
  getModelPath: vi.fn((model: string) => `/mock/models/ggml-${model}.bin`),
}))

const mockStmt = {
  get: vi.fn(),
  run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
  all: vi.fn().mockReturnValue([]),
}
const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}
vi.mock('../../electron/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}))

import { spawn } from 'child_process'
import { ipcMain, BrowserWindow } from 'electron'
import { existsSync, statSync } from 'fs'
import { getWhisperBinaryPath } from '../../electron/services/whisperSetup'
import { registerTranscriptHandlers } from '../../electron/services/transcriptEngine'

// ── helpers ────────────────────────────────────────────────────────────────────

/** Create a fake child process that emits stdout/stderr then closes. */
function makeProc(stdout = '', stderr = '', exitCode = 0) {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  })
  setImmediate(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr))
    proc.emit('close', exitCode)
  })
  return proc
}

const WHISPER_OUT =
  '[00:00:00.000 --> 00:00:04.000]  Olá, bem-vindos ao Talkeando.\n' +
  '[00:00:04.000 --> 00:00:08.000]  Hoje vamos falar sobre inteligência artificial.'

const WHISPER_STDERR = 'progress = 50%\nprogress = 100%'

const DEFAULT_EPISODE = { id: 1, file_path: '/ep.mp4', title: 'Episode 1', audio_path: '/audio.mp3' }

/** Set up the 2 sequential .get() calls the handler makes in the success path
 *  (whisper_model/default_language are fetched together via a single .all() call,
 *  which defaults to [] → 'base'/'pt' unless overridden per-test).
 *  NOTE: mockReset() is called first to clear any leftover queue from previous tests,
 *  since vi.clearAllMocks() does NOT drain the mockReturnValueOnce stack. */
function setupDbGetSequence(episode = DEFAULT_EPISODE as unknown) {
  mockStmt.get.mockReset()
  mockStmt.get
    .mockReturnValueOnce(episode)    // call 1: episode lookup
    .mockReturnValueOnce({ id: 1 }) // call 2: stillExists check after whisper
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('transcripts:start IPC handler', () => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const mockWin = { webContents: { send: vi.fn() } }
  const mockEvent = { sender: {} }

  beforeAll(() => {
    vi.mocked(ipcMain.handle).mockImplementation(
      (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn },
    )
    registerTranscriptHandlers(ipcMain as Parameters<typeof registerTranscriptHandlers>[0])
  })

  beforeEach(() => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(mockWin as never)
    setupDbGetSequence()
    vi.mocked(spawn).mockReturnValue(makeProc(WHISPER_OUT, WHISPER_STDERR) as never)
  })

  // ── error paths ──────────────────────────────────────────────────────────────

  it('throws when episode is not found', async () => {
    mockStmt.get.mockReset().mockReturnValue(undefined)
    await expect(handlers['transcripts:start'](mockEvent, 99)).rejects.toThrow('Episode not found')
  })

  it('throws when whisper binary is not installed', async () => {
    vi.mocked(getWhisperBinaryPath).mockReturnValueOnce('')
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('Whisper não instalado')
  })

  it('throws when model file does not exist', async () => {
    // existsSync call order in handler: (1) modelPath, (2) episode.audio_path
    vi.mocked(existsSync).mockReturnValueOnce(false) // call 1: model → not found → throws
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('não encontrado')
  })

  it('throws a user-friendly message when model file is corrupted (0 bytes)', async () => {
    vi.mocked(statSync).mockReturnValueOnce({ size: 0 } as never)
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('corrompido')
  })

  it('throws when whisper exits with a non-zero code', async () => {
    vi.mocked(spawn).mockReturnValue(makeProc('', 'fatal error', 1) as never)
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('código 1')
  })

  it('includes model-corruption hint when whisper stderr contains "bad magic"', async () => {
    vi.mocked(spawn).mockReturnValue(
      makeProc('', 'invalid model data (bad magic)', 3) as never,
    )
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('corrompido')
  })

  it('throws "vazia" when whisper exits 0 but produces no stdout segments', async () => {
    vi.mocked(spawn).mockReturnValue(makeProc('', WHISPER_STDERR, 0) as never)
    await expect(handlers['transcripts:start'](mockEvent, 1)).rejects.toThrow('vazia')
  })

  it('resets episode status to "imported" when whisper fails', async () => {
    vi.mocked(spawn).mockReturnValue(makeProc('', '', 1) as never)
    try { await handlers['transcripts:start'](mockEvent, 1) } catch { /* expected */ }
    const statusArgs = mockStmt.run.mock.calls.map((c: unknown[]) => c[0])
    expect(statusArgs).toContain('imported')
  })

  // ── success path ─────────────────────────────────────────────────────────────

  it('returns { success: true, segmentCount } when transcription succeeds', async () => {
    const result = await handlers['transcripts:start'](mockEvent, 1)
    expect(result).toEqual({ success: true, segmentCount: 2 })
  })

  it('saves exactly one DB row per parsed segment', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    // INSERT calls have 4 args: (episodeId, start_time, end_time, text)
    const insertCalls = mockStmt.run.mock.calls.filter((c: unknown[]) => c.length === 4)
    expect(insertCalls).toHaveLength(2)
  })

  it('saves correct segment text to the database', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const insertCalls = mockStmt.run.mock.calls.filter((c: unknown[]) => c.length === 4)
    expect(insertCalls[0][3]).toBe('Olá, bem-vindos ao Talkeando.')
    expect(insertCalls[1][3]).toBe('Hoje vamos falar sobre inteligência artificial.')
  })

  it('saves correct timestamps to the database', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const insertCalls = mockStmt.run.mock.calls.filter((c: unknown[]) => c.length === 4)
    expect(insertCalls[0][1]).toBeCloseTo(0)  // seg 1 start
    expect(insertCalls[0][2]).toBeCloseTo(4)  // seg 1 end
    expect(insertCalls[1][1]).toBeCloseTo(4)  // seg 2 start
    expect(insertCalls[1][2]).toBeCloseTo(8)  // seg 2 end
  })

  it('sets episode status to "transcribed" after saving segments', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const statusArgs = mockStmt.run.mock.calls.map((c: unknown[]) => c[0])
    expect(statusArgs).toContain('transcribed')
  })

  // ── progress events ──────────────────────────────────────────────────────────

  it('sends ≥ 1% progress immediately when whisper starts', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const pcts = mockWin.webContents.send.mock.calls
      .filter((c: unknown[]) => c[0] === 'transcription:progress')
      .map((c: unknown[]) => c[1] as number)
    expect(pcts.some((p) => p >= 1 && p < 100)).toBe(true)
  })

  it('sends exactly 100% as the final progress event', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const pcts = mockWin.webContents.send.mock.calls
      .filter((c: unknown[]) => c[0] === 'transcription:progress')
      .map((c: unknown[]) => c[1] as number)
    expect(pcts[pcts.length - 1]).toBe(100)
  })

  it('relays whisper stderr progress % to the renderer', async () => {
    await handlers['transcripts:start'](mockEvent, 1)
    const pcts = mockWin.webContents.send.mock.calls
      .filter((c: unknown[]) => c[0] === 'transcription:progress')
      .map((c: unknown[]) => c[1] as number)
    expect(pcts).toContain(50) // whisper emitted "progress = 50%" in stderr
  })

  // ── timestamp offset (range transcription) ────────────────────────────────────

  it('shifts segment timestamps by startSeconds when a time range is requested', async () => {
    // startSeconds > 0 → FFmpeg cuts audio first, then whisper runs
    vi.mocked(spawn)
      .mockReturnValueOnce(makeProc('', '', 0) as never)          // FFmpeg: exits ok
      .mockReturnValueOnce(makeProc(WHISPER_OUT, '', 0) as never) // Whisper: outputs segments

    setupDbGetSequence() // reset queue for this test

    await handlers['transcripts:start'](mockEvent, 1, 60)

    const insertCalls = mockStmt.run.mock.calls.filter((c: unknown[]) => c.length === 4)
    expect(insertCalls[0][1]).toBeCloseTo(60)  // 0s + 60s offset
    expect(insertCalls[0][2]).toBeCloseTo(64)  // 4s + 60s offset
    expect(insertCalls[1][1]).toBeCloseTo(64)  // 4s + 60s offset
    expect(insertCalls[1][2]).toBeCloseTo(68)  // 8s + 60s offset
  })

  it('does NOT shift timestamps when startSeconds is 0 (full episode)', async () => {
    await handlers['transcripts:start'](mockEvent, 1, 0)

    const insertCalls = mockStmt.run.mock.calls.filter((c: unknown[]) => c.length === 4)
    expect(insertCalls[0][1]).toBeCloseTo(0)
    expect(insertCalls[0][2]).toBeCloseTo(4)
  })
})
