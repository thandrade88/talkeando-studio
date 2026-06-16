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

function buildOAuth2Client() {
  const clientId     = getSetting('youtube_client_id')
  const clientSecret = getSetting('youtube_client_secret')
  if (!clientId || !clientSecret) throw new Error('Credenciais do YouTube não configuradas.')
  return new google.auth.OAuth2(clientId, clientSecret, 'http://127.0.0.1')
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

// ─── OAuth flow (local redirect server) ─────────────────────────────────────

async function runOAuthFlow(
  clientId: string,
  clientSecret: string,
  win: BrowserWindow
): Promise<{ access_token: string; refresh_token: string; expiry_date: number }> {
  return new Promise((resolve, reject) => {
    // Spin up a one-shot local HTTP server to receive the redirect
    const server = createServer(async (req, res) => {
      const url  = new URL(req.url!, `http://127.0.0.1`)
      const code = url.searchParams.get('code')
      const err  = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body><h2 style="font-family:sans-serif">Autorizado! Pode fechar esta janela.</h2></body></html>')
      server.close()

      if (err || !code) { reject(new Error(err ?? 'Código de autorização não recebido.')); return }

      const tempClient = new google.auth.OAuth2(clientId, clientSecret, `http://127.0.0.1:${(server.address() as { port: number }).port}`)
      try {
        const { tokens } = await tempClient.getToken(code)
        resolve({
          access_token:  tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          expiry_date:   tokens.expiry_date ?? Date.now() + 3600_000,
        })
      } catch (e) { reject(e) }
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const client = new google.auth.OAuth2(clientId, clientSecret, `http://127.0.0.1:${port}`)
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt:      'consent',
        scope: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
        ],
      })

      // Open auth URL in system browser (less invasive than a new BrowserWindow)
      shell.openExternal(authUrl)
      win.webContents.send('youtube:authStarted', authUrl)
    })

    server.on('error', reject)
    // Auto-cancel after 5 minutes
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout.')) }, 300_000)
  })
}

// ─── channel helpers ─────────────────────────────────────────────────────────

async function fetchChannels(client: InstanceType<typeof google.auth.OAuth2>) {
  const yt  = google.youtube({ version: 'v3', auth: client })
  const res = await yt.channels.list({ part: ['snippet'], mine: true, maxResults: 50 })
  return (res.data.items ?? []).map(ch => ({
    id:    ch.id!,
    title: ch.snippet?.title ?? ch.id!,
    thumb: ch.snippet?.thumbnails?.default?.url ?? null,
  }))
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
    // Clear any existing tokens when credentials change
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

    const tokens   = await runOAuthFlow(clientId, clientSecret, win)
    setSetting('youtube_access_token',  tokens.access_token)
    setSetting('youtube_refresh_token', tokens.refresh_token)
    setSetting('youtube_token_expiry',  String(tokens.expiry_date))

    // Immediately fetch channels so the UI can show the picker
    const client = buildOAuth2Client()
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
        media: {
          body: createReadStream(opts.filePath),
        },
      },
      {
        onUploadProgress: evt => {
          const pct = Math.round((evt.bytesRead / fileSize) * 100)
          win?.webContents.send('youtube:uploadProgress', pct)
        },
      }
    )

    win?.webContents.send('youtube:uploadProgress', 100)
    return {
      videoId:  res.data.id,
      videoUrl: `https://youtu.be/${res.data.id}`,
    }
  })
}
