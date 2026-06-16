import { IpcMain, BrowserWindow } from 'electron'
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

// Desktop-app redirect URI — registered in Google Cloud Console as "http://127.0.0.1".
// Port is intentionally omitted; Google allows any port on loopback for Desktop app clients.
const REDIRECT_URI = 'http://127.0.0.1'

function buildOAuth2Client() {
  const clientId     = getSetting('youtube_client_id')
  const clientSecret = getSetting('youtube_client_secret')
  if (!clientId || !clientSecret) throw new Error('Credenciais do YouTube não configuradas.')
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
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

// ─── OAuth flow (Electron BrowserWindow) ────────────────────────────────────
// Opens a modal BrowserWindow so Google's consent page renders inside the app.
// We intercept the redirect to http://127.0.0.1 via `will-redirect` BEFORE
// Chromium tries to load it — no local HTTP server required.

async function runOAuthFlow(
  clientId: string,
  clientSecret: string,
  mainWin: BrowserWindow
): Promise<{ access_token: string; refresh_token: string; expiry_date: number }> {
  return new Promise((resolve, reject) => {
    const client  = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope: [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.upload',
      ],
    })

    const authWin = new BrowserWindow({
      width:           860,
      height:          680,
      parent:          mainWin,
      modal:           true,
      title:           'Conectar ao YouTube',
      autoHideMenuBar: true,
      webPreferences:  { nodeIntegration: false, contextIsolation: true, sandbox: true },
    })

    let settled = false

    function finish(fn: () => void) {
      if (settled) return
      settled = true
      if (!authWin.isDestroyed()) authWin.destroy()
      fn()
    }

    async function handleCallback(url: string) {
      if (!url.startsWith(REDIRECT_URI)) return
      const parsed = new URL(url)
      const code   = parsed.searchParams.get('code')
      const error  = parsed.searchParams.get('error')

      if (error || !code) {
        finish(() => reject(new Error(error ?? 'Autorização negada ou cancelada.')))
        return
      }

      try {
        const { tokens } = await client.getToken(code)
        finish(() => resolve({
          access_token:  tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          expiry_date:   tokens.expiry_date ?? Date.now() + 3600_000,
        }))
      } catch (e) {
        finish(() => reject(e))
      }
    }

    // Primary: intercept BEFORE Chromium loads the redirect URI
    authWin.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(REDIRECT_URI)) {
        event.preventDefault()
        handleCallback(url)
      }
    })

    // Fallback for Chromium versions that fire did-navigate instead
    authWin.webContents.on('did-navigate', (_, url) => {
      if (url.startsWith(REDIRECT_URI)) handleCallback(url)
    })

    authWin.on('closed', () => {
      finish(() => reject(new Error('Autenticação cancelada.')))
    })

    authWin.loadURL(authUrl)
    mainWin.webContents.send('youtube:authStarted', authUrl)
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
