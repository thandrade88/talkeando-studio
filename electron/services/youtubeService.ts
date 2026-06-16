import { IpcMain, BrowserWindow, shell } from 'electron'
import { createServer } from 'http'
import { google } from 'googleapis'
import { createReadStream, statSync } from 'fs'
import { getDatabase } from './database'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function buildOAuth2Client(redirectUri?: string) {
  const clientId     = getSetting('youtube_client_id')
  const clientSecret = getSetting('youtube_client_secret')
  if (!clientId || !clientSecret) throw new Error('Credenciais do YouTube não configuradas.')
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri ?? '')
}

function loadTokens(client: InstanceType<typeof google.auth.OAuth2>) {
  const access  = getSetting('youtube_access_token')
  const refresh = getSetting('youtube_refresh_token')
  const expiry  = getSetting('youtube_token_expiry')
  if (access && refresh) {
    client.setCredentials({
      access_token:  access,
      refresh_token: refresh,
      expiry_date:   expiry ? Number(expiry) : undefined,
    })
    client.on('tokens', tokens => {
      if (tokens.access_token)  setSetting('youtube_access_token',  tokens.access_token)
      if (tokens.expiry_date)   setSetting('youtube_token_expiry',  String(tokens.expiry_date))
    })
  }
  return !!access && !!refresh
}

// ─── OAuth flow (system browser + loopback HTTP server) ─────────────────────
// Opens Google's consent page in the user's default browser (shell.openExternal)
// so passkeys, saved passwords, and existing sessions all work normally.
// A one-shot local HTTP server captures the redirect code.
//
// Key implementation notes:
//  - `listenPort` is captured inside server.listen() BEFORE the server can ever
//    be closed, so server.address() is never called after close (which returns null).
//  - `settled` flag ensures the promise resolves/rejects exactly once even if the
//    browser fires extra requests (favicon, prefetch, etc.).
//  - Requests without `code` or `error` get a 204 and are ignored.

async function runOAuthFlow(
  clientId: string,
  clientSecret: string,
  mainWin: BrowserWindow
): Promise<{ access_token: string; refresh_token: string; expiry_date: number }> {
  return new Promise((resolve, reject) => {
    let listenPort  = 0
    let settled     = false

    const timer = setTimeout(() => settle(() => reject(new Error('OAuth timeout.'))), 300_000)

    function settle(fn: () => void) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { server.close() } catch { /* already closed */ }
      fn()
    }

    const server = createServer(async (req, res) => {
      // Already resolved — ignore any late-arriving browser requests
      if (settled) { res.writeHead(204).end(); return }

      let code: string | null = null
      let error: string | null = null
      try {
        const parsed = new URL(req.url ?? '/', `http://127.0.0.1:${listenPort}`)
        code  = parsed.searchParams.get('code')
        error = parsed.searchParams.get('error')
      } catch {
        res.writeHead(400).end(); return
      }

      // Ignore noise (favicon, browser pre-connect, etc.)
      if (!code && !error) { res.writeHead(204).end(); return }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<html lang="pt-BR"><body style="font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#eee">
        <h2 style="color:${code ? '#4ade80' : '#f87171'}">${code ? '✓ Autorizado!' : '✗ Erro'}</h2>
        <p style="color:#aaa">${code ? 'Pode fechar esta janela e voltar ao Talkeando Studio.' : `Erro: ${error}`}</p>
      </body></html>`)

      if (error || !code) {
        settle(() => reject(new Error(error ?? 'Autorização negada.')))
        return
      }

      const redirectUri  = `http://127.0.0.1:${listenPort}`
      const tempClient   = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
      try {
        const { tokens } = await tempClient.getToken(code)
        settle(() => resolve({
          access_token:  tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          expiry_date:   tokens.expiry_date ?? Date.now() + 3600_000,
        }))
      } catch (e) {
        settle(() => reject(e))
      }
    })

    server.listen(0, '127.0.0.1', () => {
      // Capture port HERE — before any close() can make address() return null
      listenPort = (server.address() as { port: number }).port

      const client  = new google.auth.OAuth2(clientId, clientSecret, `http://127.0.0.1:${listenPort}`)
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt:      'consent',
        scope: [
          'https://www.googleapis.com/auth/youtube',
          'https://www.googleapis.com/auth/youtube.upload',
        ],
      })

      shell.openExternal(authUrl)
      mainWin.webContents.send('youtube:authStarted', authUrl)
    })

    server.on('error', err => settle(() => reject(err)))
  })
}

// ─── channel helpers ─────────────────────────────────────────────────────────
// `mine: true` returns channels directly associated with the authenticated
// Google Account. Brand accounts (separate YouTube channels managed via
// YouTube Studio) may require the user to manually add the channel ID.

async function fetchChannels(client: InstanceType<typeof google.auth.OAuth2>) {
  const yt       = google.youtube({ version: 'v3', auth: client })
  const channels: { id: string; title: string; thumb: string | null }[] = []
  let pageToken: string | undefined

  do {
    const res = await yt.channels.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken })
    for (const ch of res.data.items ?? []) {
      channels.push({
        id:    ch.id!,
        title: ch.snippet?.title ?? ch.id!,
        thumb: ch.snippet?.thumbnails?.default?.url ?? null,
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return channels
}

async function fetchChannelById(
  client: InstanceType<typeof google.auth.OAuth2>,
  channelId: string
): Promise<{ id: string; title: string; thumb: string | null } | null> {
  const yt  = google.youtube({ version: 'v3', auth: client })
  const res = await yt.channels.list({ part: ['snippet'], id: [channelId] })
  const ch  = res.data.items?.[0]
  if (!ch) return null
  return {
    id:    ch.id!,
    title: ch.snippet?.title ?? ch.id!,
    thumb: ch.snippet?.thumbnails?.default?.url ?? null,
  }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

export function registerYouTubeHandlers(ipcMain: IpcMain): void {

  ipcMain.handle('youtube:getStatus', () => {
    const clientId  = getSetting('youtube_client_id')
    const connected = !!(getSetting('youtube_access_token') && getSetting('youtube_refresh_token'))
    return {
      clientId,
      connected,
      mainChannelId: getSetting('youtube_main_channel_id'),
      cutsChannelId: getSetting('youtube_cuts_channel_id'),
    }
  })

  ipcMain.handle('youtube:saveCredentials', (_event, clientId: string, clientSecret: string) => {
    setSetting('youtube_client_id',     clientId.trim())
    setSetting('youtube_client_secret', clientSecret.trim())
    setSetting('youtube_access_token',  '')
    setSetting('youtube_refresh_token', '')
    return { success: true }
  })

  ipcMain.handle('youtube:connect', async event => {
    const clientId     = getSetting('youtube_client_id')
    const clientSecret = getSetting('youtube_client_secret')
    if (!clientId || !clientSecret) throw new Error('Configure o Client ID e o Client Secret primeiro.')

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('Janela não encontrada.')

    const tokens = await runOAuthFlow(clientId, clientSecret, win)
    setSetting('youtube_access_token',  tokens.access_token)
    setSetting('youtube_refresh_token', tokens.refresh_token)
    setSetting('youtube_token_expiry',  String(tokens.expiry_date))

    const client   = buildOAuth2Client()
    loadTokens(client)
    const channels = await fetchChannels(client)
    return { success: true, channels }
  })

  ipcMain.handle('youtube:disconnect', () => {
    setSetting('youtube_access_token',  '')
    setSetting('youtube_refresh_token', '')
    setSetting('youtube_token_expiry',  '')
    return { success: true }
  })

  ipcMain.handle('youtube:listChannels', async () => {
    const client = buildOAuth2Client()
    if (!loadTokens(client)) throw new Error('Não autenticado.')
    return fetchChannels(client)
  })

  // Resolve a channel by ID — for adding brand accounts that don't appear
  // in the mine:true list (they must be fetched individually by channel ID).
  ipcMain.handle('youtube:resolveChannel', async (_event, channelId: string) => {
    const client = buildOAuth2Client()
    if (!loadTokens(client)) throw new Error('Não autenticado.')
    const ch = await fetchChannelById(client, channelId.trim())
    if (!ch) throw new Error('Canal não encontrado. Verifique o ID.')
    return ch
  })

  ipcMain.handle('youtube:saveChannelConfig', (_event, mainChannelId: string, cutsChannelId: string) => {
    setSetting('youtube_main_channel_id', mainChannelId)
    setSetting('youtube_cuts_channel_id', cutsChannelId)
    return { success: true }
  })

  ipcMain.handle('youtube:uploadVideo', async (event, opts: {
    filePath: string
    title: string
    description: string
    channelId: string
    tags?: string[]
    madeForKids?: boolean
    privacyStatus?: 'public' | 'unlisted' | 'private'
  }) => {
    const client = buildOAuth2Client()
    if (!loadTokens(client)) throw new Error('Não autenticado no YouTube.')

    const win = BrowserWindow.fromWebContents(event.sender)
    const yt  = google.youtube({ version: 'v3', auth: client })

    const fileSize = statSync(opts.filePath).size

    const res = await yt.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title:       opts.title,
            description: opts.description,
            tags:        opts.tags,
            channelId:   opts.channelId,
          },
          status: {
            privacyStatus: opts.privacyStatus ?? 'private',
            madeForKids:   opts.madeForKids ?? false,
          },
        },
        media: { body: createReadStream(opts.filePath) },
      },
      {
        onUploadProgress: evt => {
          const pct = Math.round((evt.bytesRead / fileSize) * 100)
          win?.webContents.send('youtube:uploadProgress', pct)
        },
      }
    )

    win?.webContents.send('youtube:uploadProgress', 100)
    return { videoId: res.data.id, videoUrl: `https://youtu.be/${res.data.id}` }
  })

  ipcMain.handle('youtube:updateVideoMetadata', async (_event, opts: {
    videoId: string
    title: string
    description: string
    tags?: string[]
  }) => {
    const client = buildOAuth2Client()
    if (!loadTokens(client)) throw new Error('Não autenticado no YouTube.')
    const yt = google.youtube({ version: 'v3', auth: client })

    const existing = await yt.videos.list({ part: ['snippet'], id: [opts.videoId] })
    const snippet  = existing.data.items?.[0]?.snippet
    if (!snippet) throw new Error(`Vídeo não encontrado: ${opts.videoId}`)

    await yt.videos.update({
      part: ['snippet'],
      requestBody: {
        id: opts.videoId,
        snippet: {
          ...snippet,
          title:       opts.title,
          description: opts.description,
          tags:        opts.tags ?? snippet.tags ?? [],
        },
      },
    })

    return { success: true, videoUrl: `https://youtu.be/${opts.videoId}` }
  })
}
