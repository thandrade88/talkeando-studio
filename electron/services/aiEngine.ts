import { IpcMain, BrowserWindow } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDatabase } from './database'

export type AIProvider = 'claude' | 'openai' | 'gemini'

export const DEFAULT_BLOG_POST_PROMPT = `Você é um especialista em criação de conteúdo para blogs de podcasts em português brasileiro.
Seu trabalho é transformar transcrições de episódios de podcast em posts de blog completos, envolventes e otimizados para SEO.
Escreva sempre em português brasileiro, com tom conversacional mas profissional.

Com base na transcrição abaixo do episódio do Talkeando Podcast, crie um post de blog completo em português brasileiro.

**Título do Episódio:** {{title}}

**Transcrição:**
{{transcript}}

---

Gere um JSON com exatamente esta estrutura (sem markdown, apenas o JSON puro):

{
  "seoTitle": "Título SEO otimizado (máx 60 caracteres, inclua palavra-chave principal)",
  "metaDescription": "Meta description atrativa (máx 155 caracteres, inclua CTA e palavra-chave)",
  "slug": "url-amigavel-do-post-sem-acentos",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "categories": ["Categoria Principal"],
  "keyPoints": [
    "1. Primeiro ponto chave do episódio com detalhes",
    "2. Segundo ponto chave do episódio com detalhes",
    "3. Terceiro ponto chave do episódio com detalhes",
    "4. Quarto ponto chave do episódio com detalhes",
    "5. Quinto ponto chave do episódio com detalhes"
  ],
  "htmlContent": "O HTML completo do post conforme especificações abaixo"
}

**Especificações do htmlContent:**
- Parágrafo de introdução cativante (2-3 frases) que apresenta o tema e o convidado
- Seção <h2>Os 5 Pontos Principais do Episódio</h2> com os 5 pontos em <h3> cada um com um parágrafo explicativo
- Seção <h2>Por Que Você Deve Ouvir Este Episódio</h2> com 2-3 parágrafos
- Bloco de CTA com classe "cta-block": convide o leitor a ouvir o episódio completo, assinar o podcast e seguir nas redes sociais (@talkeandopodcast)
- Use <strong> para destacar conceitos importantes
- Tom: inspirador, direto, em português brasileiro`

export const DEFAULT_INSTAGRAM_PROMPT = `Você é um especialista em Instagram para podcasts em português brasileiro.
Com base na transcrição do episódio "{{title}}", crie:

1. **Legenda para feed** (até 2200 caracteres):
   - Gancho forte na primeira linha (sem hashtag, sem emoji excessivo)
   - Valor entregue em bullet points com os principais aprendizados
   - Call-to-action para ouvir o episódio completo
   - 20-30 hashtags relevantes ao final

2. **Roteiro para Reels** (30-60 segundos):
   - Gancho impactante (0-3s): frase que para o scroll
   - Conteúdo principal (3-50s): o insight mais valioso do episódio
   - CTA final (últimos 5s): direcionar para o podcast

3. **Slides para Carrossel** (5-7 slides):
   - Slide 1: Título/Gancho visual
   - Slides 2-6: Um ponto importante por slide (curto e direto)
   - Slide final: CTA + @talkeandopodcast

Em português brasileiro, tom dinâmico e direto.

**Título do Episódio:** {{title}}

**Transcrição:**
{{transcript}}`

export const DEFAULT_YOUTUBE_PROMPT = `Você é um especialista em YouTube e SEO para podcasts em português brasileiro.
Com base na transcrição do episódio "{{title}}" — que inclui timestamps reais — crie:

1. **Título do vídeo** (máx 60 caracteres, inclua palavras-chave)

2. **Descrição completa** com:
   - Parágrafo inicial chamativo (2-3 frases)
   - Tópicos principais abordados (bullet points)
   - Capítulos com timestamps (use os timestamps reais da transcrição — formato MM:SS ou H:MM:SS)
   - Call-to-action para se inscrever no canal
   - 10-15 hashtags relevantes

3. **Tags** (20-30 tags separadas por vírgula, sem #)

IMPORTANTE para os capítulos: utilize EXATAMENTE os timestamps presentes na transcrição abaixo. Não invente horários. O primeiro capítulo deve começar em 0:00.

**Título do Episódio:** {{title}}

**Transcrição com timestamps:**
{{transcript}}`

function applyPromptTemplate(template: string, title: string, transcript: string): string {
  return template
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{transcript\}\}/g, transcript)
}

export const PROVIDER_META: Record<AIProvider, { name: string; model: string; keySettingKey: string }> = {
  claude: { name: 'Claude (Anthropic)',  model: 'claude-sonnet-4-6',  keySettingKey: 'anthropic_api_key' },
  openai: { name: 'ChatGPT (OpenAI)',   model: 'gpt-4o',             keySettingKey: 'openai_api_key' },
  gemini: { name: 'Gemini (Google)',    model: 'gemini-1.5-pro',     keySettingKey: 'gemini_api_key' },
}

function getSetting(key: string): string {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? ''
}

function formatTs(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function getTranscriptText(episodeId: number): string {
  const db = getDatabase()
  const segments = db.prepare(
    'SELECT text FROM transcripts WHERE episode_id = ? ORDER BY start_time ASC'
  ).all(episodeId) as { text: string }[]
  return segments.map((s) => s.text).join(' ')
}

function getTranscriptWithTimestamps(episodeId: number): string {
  const db = getDatabase()
  const segments = db.prepare(
    'SELECT start_time, text FROM transcripts WHERE episode_id = ? ORDER BY start_time ASC'
  ).all(episodeId) as { start_time: number; text: string }[]
  return segments.map((s) => `[${formatTs(s.start_time)}] ${s.text}`).join('\n')
}

// For YouTube chapters we need timestamps spread across the full episode,
// not just the first N characters. Sample one segment per minute window.
function getTranscriptSampledByMinute(episodeId: number): string {
  const db = getDatabase()
  const segments = db.prepare(
    'SELECT start_time, text FROM transcripts WHERE episode_id = ? ORDER BY start_time ASC'
  ).all(episodeId) as { start_time: number; text: string }[]

  const seen = new Set<number>()
  const sampled: typeof segments = []
  for (const seg of segments) {
    const minute = Math.floor(seg.start_time / 60)
    if (!seen.has(minute)) {
      seen.add(minute)
      sampled.push(seg)
    }
  }
  return sampled.map((s) => `[${formatTs(s.start_time)}] ${s.text}`).join('\n')
}

async function generateText(provider: AIProvider, prompt: string): Promise<string> {
  const meta = PROVIDER_META[provider]
  const apiKey = getSetting(meta.keySettingKey)
  if (!apiKey) throw new Error(`${meta.name} API key not configured. Please add it in Settings.`)

  switch (provider) {
    case 'claude': {
      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model: meta.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      return (message.content[0] as { type: string; text: string }).text
    }

    case 'openai': {
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model: meta.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      return response.choices[0].message.content ?? ''
    }

    case 'gemini': {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: meta.model })
      const result = await model.generateContent(prompt)
      return result.response.text()
    }

    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

const CONTENT_PROMPTS: Record<string, (transcript: string, title: string) => string> = {
  blog_post: (transcript, title) => `
Você é um redator especialista em tecnologia e podcasts. Com base na transcrição do episódio de podcast "${title}", escreva um post de blog completo e envolvente em português brasileiro.

O post deve ter:
- Título atraente com SEO
- Introdução que prenda a atenção
- Desenvolvimento com os principais pontos abordados
- Conclusão com call-to-action
- Use markdown com headings, listas e destaques
- Tom: conversacional mas profissional
- Tamanho: 800-1200 palavras

TRANSCRIÇÃO:
${transcript}
`,

  youtube: (transcript, title) => `
Você é um especialista em YouTube e SEO. Com base na transcrição do episódio "${title}", crie:

1. **Título do vídeo** (máx 60 caracteres, inclua palavras-chave)
2. **Descrição completa** (2000 caracteres) com:
   - Parágrafo inicial chamativo
   - Tópicos abordados
   - Timestamps (crie baseado no conteúdo)
   - Links e CTAs
   - Hashtags
3. **Tags** (20-30 tags separadas por vírgula)

Em português brasileiro. Foco em SEO do YouTube.

TRANSCRIÇÃO:
${transcript}
`,

  instagram: (transcript, title) => `
Você é um especialista em Instagram. Com base na transcrição do episódio "${title}", crie:

1. **Legenda para feed** (até 2200 caracteres):
   - Gancho forte na primeira linha
   - Valor entregue em bullet points
   - Call-to-action para ouvir o episódio completo
   - 20-30 hashtags relevantes

2. **Roteiro para Reels** (30-60 segundos):
   - Gancho (0-3s)
   - Conteúdo principal (3-25s)
   - CTA final (25-30s)

3. **Slides para Carrossel** (5-7 slides):
   - Slide 1: Título/Gancho
   - Slides 2-6: Um ponto importante cada
   - Slide final: CTA

Em português brasileiro com tom dinâmico.

TRANSCRIÇÃO:
${transcript}
`,

  tiktok: (transcript, title) => `
Você é um especialista em TikTok e conteúdo viral. Com base na transcrição do episódio "${title}", crie:

1. **Roteiro de vídeo TikTok** (15-60 segundos):
   - Gancho impactante nos primeiros 2 segundos
   - Desenvolvimento rápido
   - Fim com surpresa ou CTA forte

2. **Legenda** (máx 150 caracteres) + hashtags virais

3. **3 variações de gancho** para testar

Em português brasileiro, tom informal e direto.

TRANSCRIÇÃO:
${transcript}
`,

  seo: (transcript, title) => `
Você é um especialista em SEO. Com base na transcrição do episódio "${title}", crie um relatório SEO completo:

1. **Palavras-chave principais** (10 palavras com volume estimado e dificuldade)
2. **Meta title** (60 caracteres)
3. **Meta description** (155 caracteres)
4. **Slug sugerido** para URL
5. **Headings H1, H2, H3** sugeridos
6. **Oportunidades de link interno e externo**
7. **Schema markup** sugerido (JSON-LD)

Em português brasileiro.

TRANSCRIÇÃO:
${transcript}
`,

  summary: (transcript, title) => `
Com base na transcrição do episódio de podcast "${title}", crie um resumo executivo em português brasileiro:

1. **Resumo em 3 frases** do episódio
2. **Principais tópicos** (bullet points)
3. **Citações marcantes** (3-5 frases impactantes)
4. **Takeaways principais** (o que o ouvinte deve aprender)
5. **Recursos mencionados** (livros, ferramentas, pessoas)

Tom: objetivo e claro.

TRANSCRIÇÃO:
${transcript}
`,
}

export function registerAIHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:getContent', (_event, episodeId: number) => {
    const db = getDatabase()
    return db.prepare(
      'SELECT * FROM generated_content WHERE episode_id = ? ORDER BY created_at DESC'
    ).all(episodeId)
  })

  ipcMain.handle('ai:generate', async (event, episodeId: number, type: string, opts?: { provider?: AIProvider }) => {
    const db = getDatabase()
    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as { title: string } | undefined
    if (!episode) throw new Error('Episode not found')

    const transcript = getTranscriptText(episodeId)
    if (!transcript) throw new Error('No transcript found. Please transcribe the episode first.')

    const promptFn = CONTENT_PROMPTS[type]
    if (!promptFn && type !== 'blog_post') throw new Error(`Unknown content type: ${type}`)

    // Provider from call-site override → settings → default
    const provider: AIProvider = opts?.provider ?? (getSetting('ai_provider') as AIProvider) ?? 'claude'
    const meta = PROVIDER_META[provider]

    console.log(`[AI] Generating "${type}" with provider="${provider}" (opts.provider=${opts?.provider}, db_setting=${getSetting('ai_provider')})`)

    const win = BrowserWindow.fromWebContents(event.sender)
    win?.webContents.send('ai:progress', `Gerando com ${meta.name}...`)

    let prompt: string
    if (type === 'blog_post') {
      const customTemplate = getSetting('blog_post_prompt')
      const template = customTemplate || DEFAULT_BLOG_POST_PROMPT
      prompt = applyPromptTemplate(template, episode.title, transcript.substring(0, 12000))
    } else if (type === 'youtube') {
      const customTemplate = getSetting('youtube_prompt')
      const template = customTemplate || DEFAULT_YOUTUBE_PROMPT
      const transcriptTs = getTranscriptSampledByMinute(episodeId)
      prompt = applyPromptTemplate(template, episode.title, transcriptTs)
    } else if (type === 'instagram') {
      const customTemplate = getSetting('instagram_prompt')
      const template = customTemplate || DEFAULT_INSTAGRAM_PROMPT
      prompt = applyPromptTemplate(template, episode.title, transcript.substring(0, 8000))
    } else {
      prompt = promptFn!(transcript.substring(0, 8000), episode.title)
    }
    const text = await generateText(provider, prompt)

    const row = db.prepare(`
      INSERT INTO generated_content (episode_id, type, content, metadata)
      VALUES (?, ?, ?, ?)
    `).run(episodeId, type, text, JSON.stringify({ provider, model: meta.model }))

    win?.webContents.send('ai:progress', 'Conteúdo gerado!')

    return db.prepare('SELECT * FROM generated_content WHERE id = ?').get(row.lastInsertRowid)
  })

  ipcMain.handle('ai:saveContent', (_event, contentId: number, content: string) => {
    const db = getDatabase()
    db.prepare('UPDATE generated_content SET content = ? WHERE id = ?').run(content, contentId)
    return { success: true }
  })

  ipcMain.handle('ai:deleteContent', (_event, contentId: number) => {
    const db = getDatabase()
    db.prepare('DELETE FROM generated_content WHERE id = ?').run(contentId)
    return { success: true }
  })

  ipcMain.handle('ai:getDefaultBlogPrompt', () => DEFAULT_BLOG_POST_PROMPT)
  ipcMain.handle('ai:getDefaultYoutubePrompt', () => DEFAULT_YOUTUBE_PROMPT)
  ipcMain.handle('ai:getDefaultInstagramPrompt', () => DEFAULT_INSTAGRAM_PROMPT)
}
