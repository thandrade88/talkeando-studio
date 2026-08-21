import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const cols = (db.pragma(`table_info(${table})`) as { name: string }[]).map(r => r.name)
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function setupDatabase(dbPathOverride?: string): void {
  const userDataPath = app.getPath('userData')
  const dbPath = dbPathOverride ?? join(userDataPath, 'talkeando.db')

  mkdirSync(userDataPath, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS podcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS podcast_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      podcast_id INTEGER NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      UNIQUE(podcast_id, key)
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      status TEXT DEFAULT 'imported',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      text TEXT NOT NULL,
      speaker TEXT DEFAULT 'Speaker 1'
    );

    CREATE TABLE IF NOT EXISTS generated_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      title TEXT NOT NULL,
      reason TEXT DEFAULT '',
      file_path TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS key_moments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('anthropic_api_key', ''),
      ('openai_api_key', ''),
      ('gemini_api_key', ''),
      ('ai_provider', 'claude'),
      ('whisper_model', 'base'),
      ('default_language', 'auto'),
      ('output_directory', '');
  `)

  addColumnIfMissing(db, 'episodes', 'audio_path', "TEXT DEFAULT ''")
  addColumnIfMissing(db, 'episodes', 'thumbnail_url', "TEXT DEFAULT ''")
  addColumnIfMissing(db, 'episodes', 'podcast_id', 'INTEGER REFERENCES podcasts(id)')
  addColumnIfMissing(db, 'clips', 'thumbnail_path', "TEXT DEFAULT ''")
  addColumnIfMissing(db, 'clips', 'summary', "TEXT DEFAULT ''")
  addColumnIfMissing(db, 'clips', 'youtube_video_id', "TEXT DEFAULT ''")

  backfillDefaultPodcast(db)
}

// Multi-podcast support (2.0) added `podcasts` as the parent of `episodes`.
// Any episode left without a podcast_id (pre-2.0 installs, or an episode
// imported before the first podcast existed) is assigned to a single
// auto-created podcast so nothing becomes orphaned.
function backfillDefaultPodcast(db: Database.Database): void {
  const orphaned = db.prepare('SELECT COUNT(*) as n FROM episodes WHERE podcast_id IS NULL').get() as { n: number } | undefined
  if (!orphaned || orphaned.n === 0) return

  let target = db.prepare('SELECT id FROM podcasts ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined
  if (!target) {
    const result = db.prepare('INSERT INTO podcasts (name) VALUES (?)').run('Meu Podcast')
    target = { id: result.lastInsertRowid as number }
  }

  db.prepare('UPDATE episodes SET podcast_id = ? WHERE podcast_id IS NULL').run(target.id)
}
