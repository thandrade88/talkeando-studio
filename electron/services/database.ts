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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('anthropic_api_key', ''),
      ('openai_api_key', ''),
      ('gemini_api_key', ''),
      ('ai_provider', 'claude'),
      ('blog_post_prompt', ''),
      ('whisper_model', 'base'),
      ('default_language', 'auto'),
      ('output_directory', ''),
      ('wordpress_url', ''),
      ('youtube_prompt', ''),
      ('instagram_prompt', '');
  `)

  addColumnIfMissing(db, 'episodes', 'audio_path', "TEXT DEFAULT ''")
}
