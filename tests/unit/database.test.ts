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

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS episodes')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS transcripts')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS generated_content')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS clips')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS key_moments')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS settings')
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

  it('seeds default settings rows', () => {
    setupDatabase(':memory:')
    const sql: string = getInstance().exec.mock.calls[0][0] as string

    expect(sql).toContain("('anthropic_api_key', '')")
    expect(sql).toContain("('whisper_model', 'base')")
    expect(sql).toContain("('default_language', 'auto')")
    expect(sql).toContain("('output_directory', '')")
    expect(sql).toContain("('resume_prompt', '')")
  })
})

describe('getDatabase', () => {
  it('returns the database instance after setup', () => {
    setupDatabase(':memory:')
    expect(() => getDatabase()).not.toThrow()
    expect(getDatabase()).toBeDefined()
  })
})
