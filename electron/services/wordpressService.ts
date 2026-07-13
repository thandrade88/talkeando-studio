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

function buildAuth(user: string, appPassword: string): string {
  // WordPress Application Passwords are displayed with spaces for readability
  // but must be sent without spaces in the Basic Auth header
  const cleanPass = appPassword.replace(/\s+/g, '')
  return 'Basic ' + Buffer.from(`${user}:${cleanPass}`).toString('base64')
}

function wpConfig() {
  const url = getSetting('wordpress_url')
  const user = getSetting('wordpress_user')
  const appPassword = getSetting('wordpress_app_password')
  if (!url || !user || !appPassword) {
    throw new Error('Configure as credenciais do WordPress em Configurações.')
  }
  const baseUrl = url.replace(/\/wp-admin\/?$/, '').replace(/\/$/, '')
  return { baseUrl, auth: buildAuth(user, appPassword) }
}

function wpPostType(): string {
  return getSetting('wordpress_post_type') || 'posts'
}

async function uploadMediaFromUrl(imageUrl: string, filename: string): Promise<number> {
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Download thumbnail: ${imgRes.status}`)
  const buffer = await imgRes.arrayBuffer()
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg'
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
  const mediaRes = await wpFetch('/media', {
    method: 'POST',
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': contentType,
    },
    body: buffer,
  })
  const media = await mediaRes.json() as { id: number }
  return media.id
}

async function wpFetch(path: string, init?: RequestInit) {
  const { baseUrl, auth } = wpConfig()
  const res = await fetch(`${baseUrl}/wp-json/wp/v2${path}`, {
    ...init,
    headers: { Authorization: auth, ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WordPress ${res.status}: ${text}`)
  }
  return res
}

interface WpRawPost {
  id: number
  title: { rendered: string; raw?: string }
  content: { rendered: string; raw?: string }
  excerpt: { rendered: string; raw?: string }
  modified: string
  link: string
  status: string
  slug: string
}

function mapPost(p: WpRawPost) {
  return {
    postId: p.id,
    title: p.title.raw ?? p.title.rendered,
    content: p.content.raw ?? p.content.rendered,
    excerpt: p.excerpt.raw ?? p.excerpt.rendered,
    modifiedAt: p.modified,
    link: p.link,
    status: p.status,
    slug: p.slug,
  }
}

export function registerWordPressHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('wordpress:isConfigured', () => {
    try { wpConfig(); return true } catch { return false }
  })

  ipcMain.handle('wordpress:testConnection', async (_event, opts?: {
    url: string; user: string; appPassword: string
  }) => {
    let baseUrl: string, auth: string
    if (opts) {
      baseUrl = opts.url.replace(/\/wp-admin\/?$/, '').replace(/\/$/, '')
      auth = buildAuth(opts.user, opts.appPassword)
    } else {
      const cfg = wpConfig()
      baseUrl = cfg.baseUrl
      auth = cfg.auth
    }

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=view`, {
      headers: { Authorization: auth },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WordPress ${res.status}: ${text}`)
    }
    const user = await res.json() as { name: string }

    // Auto-detect post type: prefer 'episode' CPT if available, else 'posts'
    let postType = 'posts'
    try {
      const epRes = await fetch(`${baseUrl}/wp-json/wp/v2/episode?per_page=1`, {
        headers: { Authorization: auth },
      })
      if (epRes.ok) postType = 'episode'
    } catch {}

    // Save credentials on success
    if (opts) {
      setSetting('wordpress_url', opts.url)
      setSetting('wordpress_user', opts.user)
      setSetting('wordpress_app_password', opts.appPassword)
    }
    setSetting('wordpress_post_type', postType)

    return { connected: true, siteName: baseUrl.replace(/^https?:\/\//, ''), userName: user.name, postType }
  })

  ipcMain.handle('wordpress:listPosts', async (_event, query?: string) => {
    const pt = wpPostType()
    const params = new URLSearchParams({
      per_page: '20',
      orderby: 'modified',
      order: 'desc',
    })
    if (query) params.set('search', query)

    // Try with edit context + all statuses first (requires editor role)
    const editParams = new URLSearchParams(params)
    editParams.set('context', 'edit')
    editParams.set('status', 'publish,draft,pending,private')
    const { baseUrl, auth } = wpConfig()
    const editRes = await fetch(`${baseUrl}/wp-json/wp/v2/${pt}?${editParams}`, {
      headers: { Authorization: auth },
    })
    if (editRes.ok) {
      const posts = await editRes.json() as WpRawPost[]
      return posts.map(mapPost)
    }

    // Fall back to view context (works for authors)
    const res = await wpFetch(`/${pt}?${params}`)
    const posts = await res.json() as WpRawPost[]
    return posts.map(mapPost)
  })

  ipcMain.handle('wordpress:getPost', async (_event, postId: number) => {
    const pt = wpPostType()
    const res = await wpFetch(`/${pt}/${postId}?context=edit`)
    const post = await res.json() as WpRawPost
    return mapPost(post)
  })

  ipcMain.handle('wordpress:linkPost', (_event, episodeId: number, postId: number) => {
    setSetting(`episode_${episodeId}_wp_post_id`, String(postId))
    return { success: true }
  })

  ipcMain.handle('wordpress:unlinkPost', (_event, episodeId: number) => {
    getDatabase().prepare("DELETE FROM settings WHERE key = ?").run(`episode_${episodeId}_wp_post_id`)
    return { success: true }
  })

  ipcMain.handle('wordpress:publish', async (_event, opts: {
    episodeId: number
    title: string
    content: string
    slug?: string
    status?: 'draft' | 'publish'
    featuredImageUrl?: string
  }) => {
    const pt = wpPostType()

    let featuredMedia: number | undefined
    if (opts.featuredImageUrl) {
      try {
        featuredMedia = await uploadMediaFromUrl(
          opts.featuredImageUrl,
          `episode-${opts.episodeId}-thumb.jpg`,
        )
      } catch (err) {
        console.error('WordPress featured image upload failed (continuing without it):', err)
      }
    }

    const res = await wpFetch(`/${pt}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts.title,
        content: opts.content,
        status: opts.status ?? 'draft',
        ...(opts.slug ? { slug: opts.slug } : {}),
        ...(featuredMedia !== undefined ? { featured_media: featuredMedia } : {}),
      }),
    })
    const post = await res.json() as { id: number; link: string }
    setSetting(`episode_${opts.episodeId}_wp_post_id`, String(post.id))
    return { postId: post.id, postUrl: post.link }
  })

  ipcMain.handle('wordpress:update', async (_event, opts: {
    postId: number
    title?: string
    content?: string
    slug?: string
    status?: 'draft' | 'publish'
  }) => {
    const body: Record<string, unknown> = {}
    if (opts.title !== undefined) body.title = opts.title
    if (opts.content !== undefined) body.content = opts.content
    if (opts.slug) body.slug = opts.slug
    if (opts.status) body.status = opts.status

    const pt = wpPostType()
    const res = await wpFetch(`/${pt}/${opts.postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const post = await res.json() as WpRawPost
    return mapPost(post)
  })

  ipcMain.handle('wordpress:delete', async (_event, postId: number) => {
    const pt = wpPostType()
    await wpFetch(`/${pt}/${postId}?force=true`, { method: 'DELETE' })
    return { success: true }
  })
}
