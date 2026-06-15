import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() }
})

import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { setupDatabase, getDatabase } from '../../electron/services/database'
import { registerClipHandlers } from '../../electron/services/clipEngine'

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

describe('registerClipHandlers — channel registration', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('registers all expected IPC channels', () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    expect(Object.keys(handlers)).toEqual(expect.arrayContaining([
      'clips:getByEpisode',
      'clips:create',
      'clips:export',
      'clips:delete',
      'clips:deleteAll',
      'clips:createFromKeyMoments',
    ]))
  })
})

describe('clips:deleteAll', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('deletes all clips for the given episode and returns success', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const run = vi.fn().mockReturnValue({ changes: 3 })
    getDbInstance().prepare.mockReturnValue({ run })

    const result = await handlers['clips:deleteAll']({}, 42)

    expect(run).toHaveBeenCalledWith(42)
    expect(result).toEqual({ success: true })
  })
})

describe('clips:createFromKeyMoments', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('throws when no key moments exist for the episode', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    getDbInstance().prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    })

    expect(() => handlers['clips:createFromKeyMoments']({}, 1))
      .toThrow('Nenhum momento-chave encontrado')
  })

  it('inserts a clip for each key moment and returns all clips', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const moments = [
      { title: 'Momento 1', description: '', start_time: 10, end_time: 70 },
      { title: 'Momento 2', description: '', start_time: 120, end_time: 200 },
    ]
    const createdClips = [
      { id: 1, episode_id: 5, title: 'Momento 1', start_time: 10, end_time: 70 },
      { id: 2, episode_id: 5, title: 'Momento 2', start_time: 120, end_time: 200 },
    ]

    const insertRun = vi.fn()
    let callCount = 0
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.includes('key_moments')) return { all: vi.fn().mockReturnValue(moments) }
      if (sql.includes('INSERT')) return { run: insertRun }
      // final SELECT returns the created clips
      callCount++
      return { all: vi.fn().mockReturnValue(callCount === 1 ? createdClips : []) }
    })

    const result = await handlers['clips:createFromKeyMoments']({}, 5)

    expect(insertRun).toHaveBeenCalledTimes(2)
    expect(insertRun).toHaveBeenCalledWith(5, 10, 70, 'Momento 1')
    expect(insertRun).toHaveBeenCalledWith(5, 120, 200, 'Momento 2')
    expect(result).toEqual(createdClips)
  })
})

describe('clips:delete', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('deletes a single clip by id and returns success', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const run = vi.fn()
    getDbInstance().prepare.mockReturnValue({ run })

    const result = await handlers['clips:delete']({}, 7)

    expect(run).toHaveBeenCalledWith(7)
    expect(result).toEqual({ success: true })
  })
})

describe('clips:getByEpisode', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('returns all clips for an episode ordered by start_time', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const clips = [
      { id: 1, episode_id: 3, start_time: 0,  end_time: 60,  title: 'Intro' },
      { id: 2, episode_id: 3, start_time: 120, end_time: 200, title: 'Main point' },
    ]
    getDbInstance().prepare.mockReturnValue({ all: vi.fn().mockReturnValue(clips) })

    const result = await handlers['clips:getByEpisode']({}, 3)

    expect(result).toEqual(clips)
  })
})
