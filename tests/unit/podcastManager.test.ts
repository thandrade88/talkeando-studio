import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')

const mockStmt = {
  get: vi.fn(),
  all: vi.fn().mockReturnValue([]),
  run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
}
const mockDb = { prepare: vi.fn(() => mockStmt) }
vi.mock('../../electron/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}))

import { ipcMain } from 'electron'
import {
  registerPodcastHandlers,
  getPodcastSetting,
  setPodcastSetting,
  getAllPodcastSettings,
} from '../../electron/services/podcastManager'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

describe('registerPodcastHandlers — channel registration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'podcasts:getAll', 'podcasts:getById', 'podcasts:create',
      'podcasts:update', 'podcasts:delete', 'podcasts:getSettings', 'podcasts:setSetting',
    ]))
  })
})

describe('podcasts:create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trims the name and inserts it', async () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)
    mockStmt.get.mockReturnValue({ id: 1, name: 'Café com Dev' })

    await handlers['podcasts:create']({}, '  Café com Dev  ')

    expect(mockStmt.run).toHaveBeenCalledWith('Café com Dev')
  })

  it('rejects an empty (or whitespace-only) name', () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)

    expect(() => handlers['podcasts:create']({}, '   ')).toThrow('Nome do podcast não pode estar vazio')
  })
})

describe('podcasts:delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses to delete the last remaining podcast', () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)
    mockStmt.get.mockReturnValue({ n: 1 })

    expect(() => handlers['podcasts:delete']({}, 1)).toThrow('ao menos um podcast')
  })

  it('refuses to delete a podcast that still has episodes', () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)
    mockStmt.get
      .mockReturnValueOnce({ n: 2 })  // remaining podcasts count
      .mockReturnValueOnce({ n: 3 })  // episode count for this podcast

    expect(() => handlers['podcasts:delete']({}, 1)).toThrow('3 episódio(s)')
  })

  it('deletes a podcast with no episodes when others remain', async () => {
    const handlers = captureHandlers()
    registerPodcastHandlers(ipcMain as never)
    mockStmt.get
      .mockReturnValueOnce({ n: 2 })  // remaining podcasts count
      .mockReturnValueOnce({ n: 0 })  // episode count for this podcast

    const result = await handlers['podcasts:delete']({}, 1)

    expect(result).toEqual({ success: true })
    expect(mockStmt.run).toHaveBeenCalled()
  })
})

describe('podcast-scoped settings helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getPodcastSetting returns empty string when the key is unset', () => {
    mockStmt.get.mockReturnValue(undefined)
    expect(getPodcastSetting(1, 'wordpress_url')).toBe('')
  })

  it('getPodcastSetting returns the stored value scoped by podcast_id and key', () => {
    mockStmt.get.mockReturnValue({ value: 'https://example.com' })
    expect(getPodcastSetting(1, 'wordpress_url')).toBe('https://example.com')
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('podcast_settings'))
  })

  it('setPodcastSetting upserts by (podcast_id, key)', () => {
    setPodcastSetting(1, 'wordpress_url', 'https://example.com')
    expect(mockStmt.run).toHaveBeenCalledWith(1, 'wordpress_url', 'https://example.com')
  })

  it('getAllPodcastSettings maps rows into a flat key/value object', () => {
    mockStmt.all.mockReturnValue([
      { key: 'wordpress_url', value: 'https://example.com' },
      { key: 'youtube_main_channel_id', value: 'UC123' },
    ])
    expect(getAllPodcastSettings(1)).toEqual({
      wordpress_url: 'https://example.com',
      youtube_main_channel_id: 'UC123',
    })
  })
})
