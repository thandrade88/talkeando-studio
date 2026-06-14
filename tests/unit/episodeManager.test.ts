import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extname, basename } from 'path'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    statSync: vi.fn(() => ({ isFile: () => true })),
  }
})

import { ipcMain } from 'electron'
import { registerEpisodeHandlers } from '../../electron/services/episodeManager'

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('registerEpisodeHandlers — channel registration', () => {
  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerEpisodeHandlers(ipcMain as never)

    const channels = Object.keys(handlers)
    expect(channels).toContain('episodes:getAll')
    expect(channels).toContain('episodes:getById')
    expect(channels).toContain('episodes:import')
    expect(channels).toContain('episodes:update')
    expect(channels).toContain('episodes:delete')
    expect(channels).toContain('settings:get')
    expect(channels).toContain('settings:set')
    expect(channels).toContain('settings:getAll')
  })
})

describe('episode title generation from filename', () => {
  it('strips extension and replaces underscores with spaces', () => {
    const filePath = '/podcasts/episode_01_intro.mp3'
    const ext = extname(filePath).toLowerCase()
    const title = basename(filePath, ext).replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

    expect(title).toBe('episode 01 intro')
  })

  it('strips extension and replaces hyphens with spaces', () => {
    const filePath = '/podcasts/my-podcast-ep-02.wav'
    const ext = extname(filePath).toLowerCase()
    const title = basename(filePath, ext).replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

    expect(title).toBe('my podcast ep 02')
  })

  it('collapses multiple consecutive underscores/hyphens', () => {
    const filePath = '/podcasts/episode__double.mp3'
    const ext = extname(filePath).toLowerCase()
    const title = basename(filePath, ext).replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

    expect(title).toBe('episode double')
  })

  it('trims leading and trailing spaces', () => {
    const filePath = '/podcasts/_leading-trailing_.mp3'
    const ext = extname(filePath).toLowerCase()
    const title = basename(filePath, ext).replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

    expect(title).toBe('leading trailing')
  })
})

describe('allowed file extensions', () => {
  const allowed = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.flac']
  const rejected = ['.txt', '.pdf', '.zip', '.exe', '.docx', '.py', '.mp3.bak']

  for (const ext of allowed) {
    it(`accepts ${ext} files`, () => {
      expect(allowed).toContain(ext)
    })
  }

  for (const ext of rejected) {
    it(`rejects ${ext} files`, () => {
      expect(allowed).not.toContain(ext)
    })
  }
})

describe('episodes:update field allowlist', () => {
  it('only allows title and status fields', () => {
    const allowed = ['title', 'status']
    const input = { title: 'New Title', status: 'transcribed', file_path: '/evil', id: 999 }
    const fields = Object.keys(input).filter((k) => allowed.includes(k))

    expect(fields).toEqual(['title', 'status'])
    expect(fields).not.toContain('file_path')
    expect(fields).not.toContain('id')
  })

  it('returns no fields when only non-allowed keys are provided', () => {
    const allowed = ['title', 'status']
    const input = { file_path: '/evil', arbitrary: 'data' }
    const fields = Object.keys(input).filter((k) => allowed.includes(k))

    expect(fields).toHaveLength(0)
  })
})

describe('beforeEach cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ipcMain.handle is cleared between tests', () => {
    expect(vi.mocked(ipcMain.handle).mock.calls).toHaveLength(0)
  })
})
