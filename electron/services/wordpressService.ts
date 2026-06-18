import { IpcMain } from 'electron'
import { getDatabase } from './database'

function getSetting(key: string): string | null {
  try {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch { return null }
}

function setSetting(key: string, value: string): void {
  getDatabase().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

function wpConfig() {
  const url = getSetting('wordpress_url')
  const user = getSetting('wordpress_user')
  const appPassword = getSetting('wordpress_app_password')
  if (!url || !user || !appPassword) {
    throw new Error('Configure as credenciais do WordPress em Configurações.')
  }
  const baseUrl = url.replace(/\/wp-admin\/?$/, '').replace(/\/$/, '')
  const auth = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64')
  return { baseUrl, auth }
}

export function registerWordPressHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('wordpress:publish', async (_event, opts: {
    episodeId: number
    title: string
    content: string
    slug?: string
    status?: 'draft' | 'publish'
  }) => {
    const { baseUrl, auth } = wpConfig()

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        title: opts.title,
        content: opts.content,
        status: opts.status ?? 'draft',
        ...(opts.slug ? { slug: opts.slug } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WordPress ${res.status}: ${text}`)
    }

    const post = await res.json() as { id: number; link: string }
    setSetting(`episode_${opts.episodeId}_wp_post_id`, String(post.id))

    return { postId: post.id, postUrl: post.link }
  })

  ipcMain.handle('wordpress:update', async (_event, opts: {
    postId: number
    title: string
    content: string
    slug?: string
  }) => {
    const { baseUrl, auth } = wpConfig()

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${opts.postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        title: opts.title,
        content: opts.content,
        ...(opts.slug ? { slug: opts.slug } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WordPress ${res.status}: ${text}`)
    }

    const post = await res.json() as { id: number; link: string }
    return { postId: post.id, postUrl: post.link }
  })
}
