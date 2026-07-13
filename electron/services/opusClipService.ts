import { ipcMain, BrowserWindow } from 'electron'
import { createReadStream, statSync } from 'fs'
import { request as httpsRequest } from 'https'
import { getDatabase } from './database'

function getSetting(key: string): string | null {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function registerOpusClipHandlers(ipc: typeof ipcMain): void {
  ipc.handle('opusclip:isConfigured', () => !!getSetting('opusclip_api_key'))

  ipc.handle('opusclip:sendClip', async (event, clipId: number) => {
    const apiKey = getSetting('opusclip_api_key')
    if (!apiKey) throw new Error('OpusClip API key não configurada. Configure em Configurações.')

    const db = getDatabase()
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as {
      id: number; file_path: string; title: string
    } | undefined
    if (!clip) throw new Error('Clip não encontrado')
    if (!clip.file_path) throw new Error('Exporte o clipe antes de enviar ao OpusClip.')

    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (msg: string, pct: number) => win?.webContents.send('opusclip:progress', msg, pct)

    // Step 1: get GCS upload link from OpusClip
    send('Obtendo link de upload...', 5)
    const linkRes = await fetch('https://api.opus.pro/api/upload-links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video: { usecase: 'LocalUpload' } }),
    })
    if (!linkRes.ok) throw new Error(`OpusClip upload-link: ${linkRes.status} ${await linkRes.text()}`)
    const { url: gcsUrl, uploadId } = await linkRes.json() as { url: string; uploadId: string }

    // Step 2: initiate GCS resumable upload session, capture location header
    send('Iniciando sessão de upload...', 10)
    const gcsUri = new URL(gcsUrl)
    const uploadLocation = await new Promise<string>((resolve, reject) => {
      const req = httpsRequest(
        {
          method: 'POST',
          hostname: gcsUri.hostname,
          path: gcsUri.pathname + gcsUri.search,
          headers: {
            'x-goog-resumable': 'start',
            'Content-Length': '0',
            'Content-Type': 'application/octet-stream',
          },
        },
        (res) => {
          res.resume()
          const loc = res.headers['location']
          if (loc) resolve(Array.isArray(loc) ? loc[0] : loc)
          else reject(new Error('GCS não retornou location header'))
        },
      )
      req.on('error', reject)
      req.end()
    })

    // Step 3: stream file binary to GCS
    const fileSize = statSync(clip.file_path).size
    await new Promise<void>((resolve, reject) => {
      const locUri = new URL(uploadLocation)
      const req = httpsRequest(
        {
          method: 'PUT',
          hostname: locUri.hostname,
          path: locUri.pathname + locUri.search,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileSize,
          },
        },
        (res) => {
          res.resume()
          if (res.statusCode === 200 || res.statusCode === 201) resolve()
          else reject(new Error(`Upload falhou: HTTP ${res.statusCode}`))
        },
      )
      req.on('error', reject)

      let uploaded = 0
      const stream = createReadStream(clip.file_path)
      stream.on('data', (chunk: Buffer) => {
        uploaded += chunk.length
        // map bytes progress to 10–90% of overall range
        const pct = 10 + Math.round((uploaded / fileSize) * 80)
        send(`Enviando clipe (${pct}%)...`, pct)
      })
      stream.on('error', reject)
      stream.pipe(req)
    })

    // Step 4: create OpusClip project referencing the uploaded file
    send('Criando projeto no OpusClip...', 92)
    const projectRes = await fetch('https://api.opus.pro/api/clip-projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoUrl: uploadId,
        uploadedVideoAttr: { title: clip.title },
        curationPref: {
          clipDurations: [[15, 90]],
          genre: 'Auto',
          skipCurate: false,
        },
        importPref: { sourceLang: 'auto' },
      }),
    })
    if (!projectRes.ok) throw new Error(`OpusClip projeto: ${projectRes.status} ${await projectRes.text()}`)
    const project = await projectRes.json() as { id?: string; projectId?: string }
    const projectId = project.id ?? project.projectId ?? ''

    send('Clipe enviado com sucesso!', 100)
    return { projectId, dashboardUrl: 'https://clip.opus.pro/dashboard' }
  })
}
