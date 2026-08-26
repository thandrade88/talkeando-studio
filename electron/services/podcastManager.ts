import { IpcMain } from 'electron'
import { getDatabase } from './database'
import { EDITION, IS_MULTI_PODCAST } from '../config/edition'

// ─── podcast-scoped settings ─────────────────────────────────────────────────
// Mirrors the flat `settings` table's get/set shape, but keyed per podcast —
// used by wordpressService/youtubeService/aiEngine for anything that differs
// per show (site credentials, channel selection, content prompts).

export function getPodcastSetting(podcastId: number, key: string): string {
  const row = getDatabase().prepare(
    'SELECT value FROM podcast_settings WHERE podcast_id = ? AND key = ?'
  ).get(podcastId, key) as { value: string } | undefined
  return row?.value ?? ''
}

export function setPodcastSetting(podcastId: number, key: string, value: string): void {
  getDatabase().prepare(`
    INSERT INTO podcast_settings (podcast_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(podcast_id, key) DO UPDATE SET value = excluded.value
  `).run(podcastId, key, value)
}

export function getAllPodcastSettings(podcastId: number): Record<string, string> {
  const rows = getDatabase().prepare(
    'SELECT key, value FROM podcast_settings WHERE podcast_id = ?'
  ).all(podcastId) as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

export function registerPodcastHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('app:getEdition', () => EDITION)

  ipcMain.handle('podcasts:getAll', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM episodes WHERE podcast_id = p.id) as episode_count
      FROM podcasts p
      ORDER BY p.created_at ASC
    `).all()
  })

  ipcMain.handle('podcasts:getById', (_event, id: number) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM podcasts WHERE id = ?').get(id)
  })

  ipcMain.handle('podcasts:create', (_event, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Nome do podcast não pode estar vazio.')
    const db = getDatabase()
    if (!IS_MULTI_PODCAST) {
      const existing = db.prepare('SELECT COUNT(*) as n FROM podcasts').get() as { n: number }
      if (existing.n >= 1) throw new Error('Esta edição do Talkeando Studio suporta apenas um podcast.')
    }
    const result = db.prepare('INSERT INTO podcasts (name) VALUES (?)').run(trimmed)
    return db.prepare('SELECT * FROM podcasts WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('podcasts:update', (_event, id: number, data: { name?: string }) => {
    const db = getDatabase()
    if (data.name !== undefined) {
      const trimmed = data.name.trim()
      if (!trimmed) throw new Error('Nome do podcast não pode estar vazio.')
      db.prepare('UPDATE podcasts SET name = ? WHERE id = ?').run(trimmed, id)
    }
    return db.prepare('SELECT * FROM podcasts WHERE id = ?').get(id)
  })

  ipcMain.handle('podcasts:delete', (_event, id: number) => {
    const db = getDatabase()
    const remaining = db.prepare('SELECT COUNT(*) as n FROM podcasts').get() as { n: number }
    if (remaining.n <= 1) throw new Error('O Studio precisa de ao menos um podcast.')

    const episodeCount = db.prepare('SELECT COUNT(*) as n FROM episodes WHERE podcast_id = ?').get(id) as { n: number }
    if (episodeCount.n > 0) {
      throw new Error(`Este podcast tem ${episodeCount.n} episódio(s). Mova ou remova os episódios antes de excluir o podcast.`)
    }

    db.prepare('DELETE FROM podcasts WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('podcasts:getSettings', (_event, podcastId: number) => getAllPodcastSettings(podcastId))

  ipcMain.handle('podcasts:setSetting', (_event, podcastId: number, key: string, value: string) => {
    setPodcastSetting(podcastId, key, value)
    return { success: true }
  })
}
