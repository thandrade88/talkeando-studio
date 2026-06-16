import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn(), writeFileSync: vi.fn() }
})

import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { setupDatabase, getDatabase } from '../../electron/services/database'
import { registerClipHandlers } from '../../electron/services/clipEngine'

vi.mock('child_process', () => ({ spawn: vi.fn() }))

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
      'clips:update',
      'clips:delete',
      'clips:deleteAll',
      'clips:createFromKeyMoments',
      'clips:setThumbnail',
      'clips:setThumbnailFromFrame',
      'clips:updateSummary',
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

describe('clips:export', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  function mockFfmpegProcess() {
    const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    proc.stderr = new EventEmitter()
    vi.mocked(spawn).mockReturnValue(proc as never)
    return proc
  }

  it('creates a per-episode output folder under episodes/{slug} using the default base dir', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const clip = {
      id: 1, start_time: 0, end_time: 30, title: 'Melhor Momento',
      episode_path: '/media/ep.mp4', episode_title: 'Episódio Nº 1: O Início!',
    }
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.includes('JOIN episodes')) return { get: vi.fn().mockReturnValue(clip) }
      if (sql.includes('output_directory')) return { get: vi.fn().mockReturnValue(undefined) }
      return { run: vi.fn() }
    })

    const proc = mockFfmpegProcess()
    const resultPromise = handlers['clips:export']({ sender: {} }, 1)
    proc.emit('close', 0)
    const result = await resultPromise as { success: boolean; filePath: string }

    expect(result.success).toBe(true)
    expect(result.filePath).toContain('/tmp/documents/Talkeando Studio/episodes/episodio-n-1-o-inicio/')
    expect(mkdirSync).toHaveBeenCalledWith(
      '/tmp/documents/Talkeando Studio/episodes/episodio-n-1-o-inicio',
      { recursive: true }
    )
  })

  it('respects a custom output_directory setting as the base dir', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const clip = {
      id: 2, start_time: 0, end_time: 30, title: 'Clipe',
      episode_path: '/media/ep.mp4', episode_title: 'Meu Episódio',
    }
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.includes('JOIN episodes')) return { get: vi.fn().mockReturnValue(clip) }
      if (sql.includes('output_directory')) return { get: vi.fn().mockReturnValue({ value: '/custom/base' }) }
      return { run: vi.fn() }
    })

    const proc = mockFfmpegProcess()
    const resultPromise = handlers['clips:export']({ sender: {} }, 2)
    proc.emit('close', 0)
    const result = await resultPromise as { success: boolean; filePath: string }

    expect(result.filePath).toContain('/custom/base/episodes/meu-episodio/')
  })
})

describe('clips:setThumbnail', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('throws when the file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    expect(() => handlers['clips:setThumbnail']({}, 1, '/missing/file.jpg'))
      .toThrow('Arquivo não encontrado')
  })

  it('updates thumbnail_path and returns the updated clip when the file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const run = vi.fn()
    const updatedClip = { id: 1, thumbnail_path: '/path/to/thumb.jpg' }
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) return { run }
      return { get: vi.fn().mockReturnValue(updatedClip) }
    })

    const result = await handlers['clips:setThumbnail']({}, 1, '/path/to/thumb.jpg')

    expect(run).toHaveBeenCalledWith('/path/to/thumb.jpg', 1)
    expect(result).toEqual(updatedClip)
  })
})

describe('clips:setThumbnailFromFrame', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('throws when the clip does not exist', () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    getDbInstance().prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })

    expect(() => handlers['clips:setThumbnailFromFrame']({}, 1, 'data:image/jpeg;base64,QQ=='))
      .toThrow('Clip not found')
  })

  it('throws when the dataUrl is not a base64 jpeg', () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.includes('JOIN episodes')) return { get: vi.fn().mockReturnValue({ title: 'Clipe', episode_title: 'Episódio' }) }
      return { get: vi.fn() }
    })

    expect(() => handlers['clips:setThumbnailFromFrame']({}, 1, 'not-a-data-url'))
      .toThrow('Frame inválido')
  })

  it('decodes the frame, saves it under the episode folder and updates thumbnail_path', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const clip = { title: 'Melhor Momento', episode_title: 'Meu Episódio' }
    const updatedClip = { id: 9, thumbnail_path: '/tmp/documents/Talkeando Studio/episodes/meu-episodio/Melhor_Momento_thumb.jpg' }
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.includes('JOIN episodes')) return { get: vi.fn().mockReturnValue(clip) }
      if (sql.includes('output_directory')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.startsWith('UPDATE')) return { run: vi.fn() }
      return { get: vi.fn().mockReturnValue(updatedClip) }
    })

    const result = await handlers['clips:setThumbnailFromFrame']({}, 9, 'data:image/jpeg;base64,QQ==')

    expect(writeFileSync).toHaveBeenCalledWith(
      '/tmp/documents/Talkeando Studio/episodes/meu-episodio/Melhor_Momento_thumb.jpg',
      expect.any(Buffer)
    )
    expect(result).toEqual(updatedClip)
  })
})

describe('clips:updateSummary', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDatabase(':memory:') })

  it('updates the summary and returns the updated clip', async () => {
    const handlers = captureHandlers()
    registerClipHandlers(ipcMain as never)

    const run = vi.fn()
    const updatedClip = { id: 3, summary: 'Um resumo qualquer.' }
    getDbInstance().prepare.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) return { run }
      return { get: vi.fn().mockReturnValue(updatedClip) }
    })

    const result = await handlers['clips:updateSummary']({}, 3, 'Um resumo qualquer.')

    expect(run).toHaveBeenCalledWith('Um resumo qualquer.', 3)
    expect(result).toEqual(updatedClip)
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
