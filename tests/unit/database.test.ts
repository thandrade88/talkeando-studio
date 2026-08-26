import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')

import Database from 'better-sqlite3'
import { setupDatabase, getDatabase } from '../../electron/services/database'

function getInstance() {
  // Vitest captures instances in .mock.instances after using `new`
  return vi.mocked(Database).mock.instances[0] as InstanceType<typeof Database> & {
    exec: ReturnType<typeof vi.fn>
    pragma: ReturnType<typeof vi.fn>
    prepare: ReturnType<typeof vi.fn>
  }
}

describe('setupDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a database at the given path override', () => {
    setupDatabase(':memory:')
    expect(Database).toHaveBeenCalledWith(':memory:')
  })

  it('defaults to the Electron userData path when no override given', () => {
    setupDatabase()
    expect(Database).toHaveBeenCalledWith(expect.stringContaining('talkeando.db'))
  })

  it('enables WAL journal mode', () => {
    setupDatabase(':memory:')
    expect(getInstance().pragma).toHaveBeenCalledWith('journal_mode = WAL')
  })

  it('enables foreign keys', () => {
    setupDatabase(':memory:')
    expect(getInstance().pragma).toHaveBeenCalledWith('foreign_keys = ON')
  })

  it('executes the schema CREATE TABLE statements', () => {
    setupDatabase(':memory:')
    const sql: string = getInstance().exec.mock.calls[0][0] as string

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS podcasts')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS podcast_settings')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS episodes')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS transcripts')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS generated_content')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS clips')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS key_moments')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS settings')
  })

  it('podcast_settings table is scoped per podcast with a unique (podcast_id, key)', () => {
    setupDatabase(':memory:')
    const sql: string = getInstance().exec.mock.calls[0][0] as string
    const start = sql.indexOf('CREATE TABLE IF NOT EXISTS podcast_settings')
    const end   = sql.indexOf('CREATE TABLE IF NOT EXISTS episodes')
    const block = sql.slice(start, end)

    expect(block).toContain('podcast_id')
    expect(block).toContain('REFERENCES podcasts(id)')
    expect(block).toContain('UNIQUE(podcast_id, key)')
  })

  it('key_moments table has the required columns', () => {
    setupDatabase(':memory:')
    const sql: string = getInstance().exec.mock.calls[0][0] as string
    const start = sql.indexOf('CREATE TABLE IF NOT EXISTS key_moments')
    const end   = sql.indexOf('CREATE TABLE IF NOT EXISTS settings')
    const block = sql.slice(start, end)

    expect(block).toContain('episode_id')
    expect(block).toContain('title')
    expect(block).toContain('description')
    expect(block).toContain('start_time')
    expect(block).toContain('end_time')
  })

  it('seeds default settings rows (app-level only — prompts/WordPress/YouTube are per-podcast)', () => {
    setupDatabase(':memory:')
    const sql: string = getInstance().exec.mock.calls[0][0] as string

    expect(sql).toContain("('anthropic_api_key', '')")
    expect(sql).toContain("('whisper_model', 'base')")
    expect(sql).toContain("('default_language', 'auto')")
    expect(sql).toContain("('output_directory', '')")
    expect(sql).not.toContain("('resume_prompt'")
    expect(sql).not.toContain("('wordpress_url'")
  })
})

describe('backfillDefaultPodcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // db.prepare's default mock returns a fresh stub per call regardless of SQL,
  // so to assert on migration behavior we replace the Database constructor
  // itself for one `new Database()` call — this makes `.prepare` branch on
  // the SQL text instead of ignoring it.
  function mockDbWithPrepare(prepareImpl: (sql: string) => { get?: () => unknown; run?: (...a: unknown[]) => unknown }) {
    vi.mocked(Database).mockImplementationOnce(function (this: Record<string, unknown>) {
      this.exec = vi.fn()
      this.pragma = vi.fn().mockReturnValue([])
      this.prepare = vi.fn().mockImplementation((sql: string) => ({
        get: vi.fn(), run: vi.fn(), all: vi.fn(() => []), iterate: vi.fn(() => []),
        ...prepareImpl(sql),
      }))
      this.transaction = vi.fn().mockImplementation((fn: (...a: unknown[]) => unknown) => fn)
      this.close = vi.fn()
    } as unknown as typeof Database)
  }

  it('does nothing when every episode already has a podcast_id', () => {
    const insertPodcast = vi.fn()
    mockDbWithPrepare((sql) => {
      if (sql.includes('SELECT COUNT(*) as n FROM episodes')) return { get: () => ({ n: 0 }) }
      if (sql.includes('INSERT INTO podcasts')) return { run: insertPodcast }
      return {}
    })

    setupDatabase(':memory:')

    expect(insertPodcast).not.toHaveBeenCalled()
  })

  it('creates a default podcast and backfills orphaned episodes when some exist', () => {
    const insertPodcast = vi.fn(() => ({ lastInsertRowid: 1 }))
    const updateEpisodes = vi.fn()
    mockDbWithPrepare((sql) => {
      if (sql.includes('SELECT COUNT(*) as n FROM episodes')) return { get: () => ({ n: 2 }) }
      if (sql.includes('SELECT id FROM podcasts')) return { get: () => undefined }
      if (sql.includes('INSERT INTO podcasts')) return { run: insertPodcast }
      if (sql.includes('UPDATE episodes SET podcast_id')) return { run: updateEpisodes }
      return {}
    })

    setupDatabase(':memory:')

    expect(insertPodcast).toHaveBeenCalledWith('Meu Podcast')
    expect(updateEpisodes).toHaveBeenCalledWith(1)
  })

  it('assigns orphaned episodes to the existing podcast instead of creating a new one', () => {
    const insertPodcast = vi.fn()
    const updateEpisodes = vi.fn()
    mockDbWithPrepare((sql) => {
      if (sql.includes('SELECT COUNT(*) as n FROM episodes')) return { get: () => ({ n: 1 }) }
      if (sql.includes('SELECT id FROM podcasts')) return { get: () => ({ id: 7 }) }
      if (sql.includes('INSERT INTO podcasts')) return { run: insertPodcast }
      if (sql.includes('UPDATE episodes SET podcast_id')) return { run: updateEpisodes }
      return {}
    })

    setupDatabase(':memory:')

    expect(insertPodcast).not.toHaveBeenCalled()
    expect(updateEpisodes).toHaveBeenCalledWith(7)
  })
})

describe('getDatabase', () => {
  it('returns the database instance after setup', () => {
    setupDatabase(':memory:')
    expect(() => getDatabase()).not.toThrow()
    expect(getDatabase()).toBeDefined()
  })
})
