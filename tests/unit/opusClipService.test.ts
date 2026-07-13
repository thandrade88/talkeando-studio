import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')

vi.mock('https', () => ({ request: vi.fn() }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    statSync: vi.fn(() => ({ size: 2048 })),
    createReadStream: vi.fn(),
  }
})

import { ipcMain } from 'electron'
import { statSync, createReadStream } from 'fs'
import { request as httpsRequest } from 'https'
import Database from 'better-sqlite3'
import { setupDatabase } from '../../electron/services/database'
import { registerOpusClipHandlers } from '../../electron/services/opusClipService'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

function getDbInstance() {
  return vi.mocked(Database).mock.instances[0] as InstanceType<typeof Database> & {
    prepare: ReturnType<typeof vi.fn>
  }
}

// Minimal stream-like mock — does not emit 'data', so progress events are never sent
function mockReadStream() {
  const s = { on: vi.fn().mockReturnThis(), pipe: vi.fn().mockReturnThis() }
  return s
}

// Helper: mock one https.request call that fires the callback with `mockRes` on next tick
function mockHttpsCall(mockRes: object) {
  return (_opts: unknown, cb: unknown) => {
    setTimeout(() => (cb as (r: unknown) => void)(mockRes), 0)
    return { on: vi.fn(), end: vi.fn(), pipe: vi.fn() } as never
  }
}

// ─── Channel registration ─────────────────────────────────────────────────────

describe('registerOpusClipHandlers — channel registration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('registers opusclip:isConfigured and opusclip:sendClip', () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)
    expect(Object.keys(handlers)).toContain('opusclip:isConfigured')
    expect(Object.keys(handlers)).toContain('opusclip:sendClip')
  })
})

// ─── opusclip:isConfigured ────────────────────────────────────────────────────

describe('opusclip:isConfigured', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('returns false when opusclip_api_key setting is absent', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)
    getDbInstance().prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })

    expect(await handlers['opusclip:isConfigured']({})).toBe(false)
  })

  it('returns true when opusclip_api_key setting is present', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)
    getDbInstance().prepare.mockReturnValue({ get: vi.fn().mockReturnValue({ value: 'op_live_abc' }) })

    expect(await handlers['opusclip:isConfigured']({})).toBe(true)
  })
})

// ─── opusclip:sendClip — error paths ─────────────────────────────────────────

describe('opusclip:sendClip — error paths', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('throws when API key is not configured', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)
    getDbInstance().prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })

    await expect(handlers['opusclip:sendClip']({ sender: {} }, 1))
      .rejects.toThrow('API key não configurada')
  })

  it('throws when clip does not exist', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) }) // settings
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue(undefined) })                // clip

    await expect(handlers['opusclip:sendClip']({ sender: {} }, 99))
      .rejects.toThrow('Clip não encontrado')
  })

  it('throws when clip has no exported file_path', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 1, file_path: '', title: 'T' }) })

    await expect(handlers['opusclip:sendClip']({ sender: {} }, 1))
      .rejects.toThrow('Exporte o clipe')
  })

  it('throws when OpusClip upload-links request returns non-OK status', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 1, file_path: '/tmp/c.mp4', title: 'T' }) })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }))

    await expect(handlers['opusclip:sendClip']({ sender: {} }, 1))
      .rejects.toThrow('upload-link')
  })

  it('throws when GCS session does not return location header', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 1, file_path: '/tmp/c.mp4', title: 'T' }) })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://storage.googleapis.com/upload', uploadId: 'uid_1' }),
    }))

    // GCS session response with NO location header
    vi.mocked(httpsRequest).mockImplementationOnce(mockHttpsCall({ resume: vi.fn(), headers: {} }))

    await expect(handlers['opusclip:sendClip']({ sender: {} }, 1))
      .rejects.toThrow('location header')
  })
})

// ─── opusclip:sendClip — happy path ──────────────────────────────────────────

describe('opusclip:sendClip — happy path', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('completes 4-step upload and returns projectId + dashboardUrl', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    // DB: API key + clip
    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 7, file_path: '/tmp/clip.mp4', title: 'My Clip' }) })

    // Step 1 (upload-links) and Step 4 (clip-projects) via fetch
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://storage.googleapis.com/upload', uploadId: 'uid_xyz' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'proj_456' }),
      }),
    )

    // Step 2: GCS session init → returns location header
    // Step 3: GCS file PUT → returns 200
    vi.mocked(httpsRequest)
      .mockImplementationOnce(mockHttpsCall({
        resume: vi.fn(),
        headers: { location: 'https://storage.googleapis.com/session/abc' },
      }))
      .mockImplementationOnce(mockHttpsCall({ resume: vi.fn(), statusCode: 200 }))

    vi.mocked(createReadStream).mockReturnValue(mockReadStream() as never)
    vi.mocked(statSync).mockReturnValue({ size: 2048 } as never)

    const result = await handlers['opusclip:sendClip']({ sender: {} }, 7) as {
      projectId: string; dashboardUrl: string
    }

    expect(result.projectId).toBe('proj_456')
    expect(result.dashboardUrl).toBe('https://clip.opus.pro/dashboard')

    // Verify both fetch calls were made with correct endpoints
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][0] as string)).toContain('/api/upload-links')
    expect((fetchMock.mock.calls[1][0] as string)).toContain('/api/clip-projects')

    // Verify 2 https.request calls (GCS session + file upload)
    expect(httpsRequest).toHaveBeenCalledTimes(2)
  })

  it('passes uploadId and clip title to clip-projects request', async () => {
    const handlers = captureHandlers()
    registerOpusClipHandlers(ipcMain as never)

    getDbInstance().prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ value: 'op_live_key' }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 3, file_path: '/tmp/c.mp4', title: 'Episódio 42' }) })

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://storage.googleapis.com/upload', uploadId: 'uid_episode42' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'proj_episode42' }),
      }),
    )

    vi.mocked(httpsRequest)
      .mockImplementationOnce(mockHttpsCall({
        resume: vi.fn(),
        headers: { location: 'https://storage.googleapis.com/session/ep42' },
      }))
      .mockImplementationOnce(mockHttpsCall({ resume: vi.fn(), statusCode: 200 }))

    vi.mocked(createReadStream).mockReturnValue(mockReadStream() as never)
    vi.mocked(statSync).mockReturnValue({ size: 512 } as never)

    await handlers['opusclip:sendClip']({ sender: {} }, 3)

    const fetchMock = vi.mocked(fetch)
    const projectCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(projectCallBody.videoUrl).toBe('uid_episode42')
    expect(projectCallBody.uploadedVideoAttr.title).toBe('Episódio 42')
  })
})
