import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')

// Two independent podcast_settings "rows" keyed by podcast_id, so isConfigured/
// testConnection can be proven to read the right podcast's WordPress site.
const podcastSettings: Record<number, Record<string, string>> = {
  1: { wordpress_url: 'https://podcast-a.example', wordpress_user: 'admin', wordpress_app_password: 'aaaa bbbb' },
  2: {},
}

const mockStmt = {
  get: vi.fn((podcastId: number, key: string) => {
    const value = podcastSettings[podcastId]?.[key]
    return value !== undefined ? { value } : undefined
  }),
  run: vi.fn(),
  all: vi.fn().mockReturnValue([]),
}
const mockDb = { prepare: vi.fn(() => mockStmt) }
vi.mock('../../electron/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}))

import { ipcMain } from 'electron'
import { registerWordPressHandlers } from '../../electron/services/wordpressService'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function captureHandlers() {
  const handlers: Record<string, Handler> = {}
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: Handler) => {
    handlers[channel] = fn
    return undefined as never
  })
  return handlers
}

describe('registerWordPressHandlers — channel registration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerWordPressHandlers(ipcMain as never)

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'wordpress:isConfigured', 'wordpress:testConnection', 'wordpress:listPosts',
      'wordpress:getPost', 'wordpress:linkPost', 'wordpress:unlinkPost',
      'wordpress:publish', 'wordpress:update', 'wordpress:delete',
    ]))
  })
})

describe('wordpress:isConfigured — per-podcast scoping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is true for a podcast with WordPress credentials saved', async () => {
    const handlers = captureHandlers()
    registerWordPressHandlers(ipcMain as never)

    expect(await handlers['wordpress:isConfigured']({}, 1)).toBe(true)
  })

  it('is false for a different podcast that has no credentials, even when another podcast is configured', async () => {
    const handlers = captureHandlers()
    registerWordPressHandlers(ipcMain as never)

    expect(await handlers['wordpress:isConfigured']({}, 2)).toBe(false)
  })
})

describe('wordpress:linkPost / unlinkPost', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores the linked post id under an episode-scoped settings key', async () => {
    const handlers = captureHandlers()
    registerWordPressHandlers(ipcMain as never)

    await handlers['wordpress:linkPost']({}, 42, 999)

    expect(mockStmt.run).toHaveBeenCalledWith('episode_42_wp_post_id', '999')
  })
})
