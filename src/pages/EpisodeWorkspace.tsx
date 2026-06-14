import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Sparkles, Scissors, Loader2, Clock,
  Save, Trash2, RefreshCw, ChevronDown, RotateCcw, Plus, Download, FolderOpen,
  Send, Copy, Check, ExternalLink, Globe, CheckCircle2, Circle, Volume2,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn, formatTimestamp, formatDuration } from '../lib/utils'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatEta(s: number) {
  if (s < 10) return 'menos de 10s'
  if (s < 60) return `~${Math.round(s)}s`
  return `~${Math.ceil(s / 60)} min`
}

function parseStartTime(v: string): number {
  const p = v.trim().split(':').map(Number)
  if (p.some(isNaN)) return 0
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  if (p.length === 2) return p[0] * 60 + p[1]
  return p[0] ?? 0
}

const STATUS_STYLE: Record<string, string> = {
  imported:    'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  transcribing:'text-blue-400  bg-blue-500/10  border-blue-500/20',
  transcribed: 'text-cyan-400  bg-cyan-500/10  border-cyan-500/20',
  ready:       'text-primary   bg-primary/10   border-primary/20',
}
const STATUS_LABEL: Record<string, string> = {
  imported: 'Importado', transcribing: 'Transcrevendo',
  transcribed: 'Transcrito', ready: 'Pronto',
}

type Tab = 'transcricao' | 'conteudo' | 'clips' | 'publicar'

// ─── Transcrição tab ──────────────────────────────────────────────────────────

function StepIcon({ status, n }: { status: 'pending' | 'active' | 'done'; n: number }) {
  if (status === 'done')
    return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
  if (status === 'active')
    return <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0 mt-0.5" />
  return (
    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/25 flex items-center justify-center shrink-0 mt-0.5">
      <span className="text-[10px] text-muted-foreground/40 font-mono leading-none">{n}</span>
    </div>
  )
}

function TranscriptionTab({
  episodeId,
  episode,
  progress,
  progressStatus,
  eta,
  onResetProgress,
}: {
  episodeId: number
  episode: Episode
  progress: number
  progressStatus: string
  eta: string | null
  onResetProgress: () => void
}) {
  const transcribingEpisodeId  = useAppStore(s => s.transcribingEpisodeId)
  const setTranscribingEpisode = useAppStore(s => s.setTranscribingEpisode)

  const [segments, setSegments]             = useState<TranscriptSegment[]>([])
  const [editingId, setEditingId]           = useState<number | null>(null)
  const [editText, setEditText]             = useState('')
  const [startAtInput, setStartAtInput]     = useState('')
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [segmentView, setSegmentView]       = useState<'list' | 'json'>('list')
  const [jsonCopied, setJsonCopied]         = useState(false)

  const isTranscribing = transcribingEpisodeId === episodeId
  const hasAudio       = Boolean(episode.audio_path)
  const hasDone        = segments.length > 0

  const step1 = hasAudio ? 'done' : 'pending'
  const step2 = isTranscribing ? 'active' : hasDone ? 'done' : 'pending'
  const step3 = hasDone ? 'done' : 'pending'

  // Reload segments whenever episodeId changes OR when episode.status flips to
  // 'transcribed'. This fires correctly whether the user is on this tab or not —
  // the parent workspace updates episode via Zustand when transcription completes.
  const episodeStatus = episode.status
  useEffect(() => {
    window.api.getTranscript(episodeId).then(setSegments)
  }, [episodeId, episodeStatus])

  function startTranscription() {
    onResetProgress(); setTranscribeError(null)
    setTranscribingEpisode(episodeId, Date.now())
    const startSeconds = parseStartTime(startAtInput) || undefined
    window.api.startTranscription(episodeId, startSeconds, undefined).catch(err => {
      setTranscribingEpisode(null)
      setTranscribeError(String(err).replace(/^Error:\s*/i, ''))
    })
  }

  async function saveSegment(segId: number) {
    await window.api.updateTranscriptSegment(segId, editText)
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, text: editText } : s))
    setEditingId(null)
  }

  const audioSrc = episode.audio_path ? `app-media://${episode.audio_path}` : null

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Pipeline steps ── */}
      <div className="px-6 py-5 border-b border-border shrink-0 space-y-5">

        {/* Step 1 – Extração de áudio */}
        <div className="flex gap-3">
          <StepIcon status={step1} n={1} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={cn('text-sm font-medium', step1 === 'done' ? 'text-foreground' : 'text-muted-foreground')}>
                  Extração de áudio
                </p>
                {hasAudio && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    audio.wav{episode.duration > 0 && ` · ${formatDuration(episode.duration)}`}
                  </p>
                )}
                {!hasAudio && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Áudio não extraído — importe o episódio novamente</p>
                )}
              </div>
              {hasAudio && (
                <button
                  onClick={() => window.api.revealInFinder(episode.audio_path)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 shrink-0"
                  title="Mostrar no Finder"
                >
                  <FolderOpen className="w-3 h-3" />
                  Finder
                </button>
              )}
            </div>

            {audioSrc && (
              <div className="mt-3 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <audio
                  src={audioSrc}
                  controls
                  className="flex-1 h-8 min-w-0"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Step 2 – Transcrição */}
        <div className="flex gap-3">
          <StepIcon status={step2} n={2} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={cn('text-sm font-medium', step2 !== 'pending' ? 'text-foreground' : 'text-muted-foreground')}>
                  Transcrição com Whisper
                </p>
                {hasDone && !isTranscribing && (
                  <p className="text-xs text-muted-foreground mt-0.5">{segments.length} segmentos encontrados</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Iniciar em</label>
                  <input
                    type="text" placeholder="0:00" value={startAtInput}
                    onChange={e => setStartAtInput(e.target.value)}
                    className="w-14 text-xs font-mono bg-secondary border border-border rounded px-2 py-1 text-center focus:outline-none focus:border-primary/50"
                    title="Pular intro (MM:SS ou HH:MM:SS)"
                  />
                </div>
                <button
                  onClick={startTranscription} disabled={isTranscribing}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {isTranscribing ? 'Transcrevendo...' : hasDone ? 'Re-transcrever' : 'Transcrever'}
                </button>
              </div>
            </div>

            {isTranscribing && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-400 truncate">{progressStatus || 'Iniciando...'}</span>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {eta && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />{eta}
                      </span>
                    )}
                    <span className="font-mono text-blue-400/80">{progress}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {transcribeError && !isTranscribing && (
              <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400 font-mono break-all">{transcribeError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Step 3 – Revisão */}
        <div className="flex gap-3">
          <StepIcon status={step3} n={3} />
          <div className="flex-1">
            <p className={cn('text-sm font-medium', step3 === 'done' ? 'text-foreground' : 'text-muted-foreground')}>
              Revisão dos segmentos
            </p>
            {hasDone && (
              <p className="text-xs text-muted-foreground mt-0.5">Duplo clique em qualquer segmento para editar</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Sub-tab bar ── */}
      {hasDone && (
        <div className="flex items-center justify-between border-b border-border px-6 shrink-0">
          <div className="flex">
            {(['list', 'json'] as const).map(v => (
              <button
                key={v}
                onClick={() => setSegmentView(v)}
                className={cn(
                  'px-3 py-2 text-xs border-b-2 transition-colors',
                  segmentView === v
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'list' ? `Segmentos (${segments.length})` : 'JSON'}
              </button>
            ))}
          </div>
          {segmentView === 'json' && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(segments, null, 2)).catch(() => {})
                setJsonCopied(true)
                setTimeout(() => setJsonCopied(false), 2000)
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
            >
              {jsonCopied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
              {jsonCopied ? 'Copiado!' : 'Copiar'}
            </button>
          )}
        </div>
      )}

      {/* ── Segments list ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0.5">
        {segments.length === 0 && !isTranscribing && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Circle className="w-8 h-8 opacity-15" />
            <p className="text-sm">Nenhuma transcrição ainda</p>
            <p className="text-xs opacity-50">Trechos de música são filtrados automaticamente</p>
          </div>
        )}

        {/* JSON view */}
        {segmentView === 'json' && hasDone && (
          <pre className="text-xs font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-all bg-secondary/40 rounded-lg p-4">
            {JSON.stringify(segments, null, 2)}
          </pre>
        )}

        {/* List view */}
        {segmentView === 'list' && segments.map(seg => (
          <div key={seg.id} className="flex gap-4 group py-2 px-3 rounded-lg hover:bg-secondary/50">
            <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5 w-12 select-none">
              {formatTimestamp(seg.start_time)}
            </span>
            {editingId === seg.id ? (
              <div className="flex-1">
                <textarea
                  autoFocus value={editText} onChange={e => setEditText(e.target.value)} rows={2}
                  className="w-full bg-secondary border border-primary/40 rounded px-2 py-1 text-sm resize-none focus:outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveSegment(seg.id) }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => saveSegment(seg.id)} className="text-xs text-primary">Salvar</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground">Cancelar</button>
                </div>
              </div>
            ) : (
              <p
                className="flex-1 text-sm text-foreground/90 leading-relaxed"
                onDoubleClick={() => { setEditingId(seg.id); setEditText(seg.text) }}
                title="Duplo clique para editar"
              >
                {seg.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Conteúdo tab ─────────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { key: 'blog_post',  label: 'Blog Post' },
  { key: 'youtube',   label: 'YouTube'   },
  { key: 'instagram', label: 'Instagram' },
]
const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude',  fullLabel: 'Claude (Anthropic)' },
  { value: 'openai', label: 'ChatGPT', fullLabel: 'ChatGPT (OpenAI)'  },
  { value: 'gemini', label: 'Gemini',  fullLabel: 'Gemini (Google)'    },
] as const
type ProviderValue = 'claude' | 'openai' | 'gemini'

function ContentTab({ episodeId }: { episodeId: number }) {
  const navigate = useNavigate()
  const [contents, setContents]             = useState<GeneratedContent[]>([])
  const [contentType, setContentType]       = useState('blog_post')
  const [isGenerating, setIsGenerating]     = useState(false)
  const [aiStatus, setAiStatus]             = useState('')
  const [editContent, setEditContent]       = useState('')
  const [isSaving, setIsSaving]             = useState(false)
  const [isDirty, setIsDirty]               = useState(false)
  const [provider, setProvider]             = useState<ProviderValue>('claude')
  const [providerLoaded, setProviderLoaded] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [promptTemplate, setPromptTemplate] = useState('')
  const [promptOpen, setPromptOpen]         = useState(false)
  const [promptDirty, setPromptDirty]       = useState(false)
  const [promptSaved, setPromptSaved]       = useState(false)
  const defaultPromptRef = useRef<string>('')

  const [ytPromptTemplate, setYtPromptTemplate] = useState('')
  const [ytPromptOpen, setYtPromptOpen]         = useState(false)
  const [ytPromptDirty, setYtPromptDirty]       = useState(false)
  const [ytPromptSaved, setYtPromptSaved]       = useState(false)
  const defaultYtPromptRef = useRef<string>('')

  const [igPromptTemplate, setIgPromptTemplate] = useState('')
  const [igPromptOpen, setIgPromptOpen]         = useState(false)
  const [igPromptDirty, setIgPromptDirty]       = useState(false)
  const [igPromptSaved, setIgPromptSaved]       = useState(false)
  const defaultIgPromptRef = useRef<string>('')

  const activeContent = contents.find(c => c.type === contentType)
  function parseMeta(raw: string): { provider?: ProviderValue; model?: string } {
    try { return JSON.parse(raw) } catch { return {} }
  }

  useEffect(() => {
    window.api.getGeneratedContent(episodeId).then(setContents)
    window.api.getSetting('ai_provider').then(v => {
      if (v && ['claude', 'openai', 'gemini'].includes(v)) setProvider(v as ProviderValue)
      setProviderLoaded(true)
    })
    Promise.all([
      window.api.getSetting('blog_post_prompt'), window.api.getDefaultBlogPrompt(),
      window.api.getSetting('youtube_prompt'),   window.api.getDefaultYoutubePrompt(),
      window.api.getSetting('instagram_prompt'), window.api.getDefaultInstagramPrompt(),
    ]).then(([savedBlog, defBlog, savedYt, defYt, savedIg, defIg]) => {
      defaultPromptRef.current = defBlog; setPromptTemplate(savedBlog || defBlog); setPromptDirty(false)
      defaultYtPromptRef.current = defYt; setYtPromptTemplate(savedYt || defYt); setYtPromptDirty(false)
      defaultIgPromptRef.current = defIg; setIgPromptTemplate(savedIg || defIg); setIgPromptDirty(false)
    })
  }, [episodeId])

  // Sync textarea only when the user switches tabs or the active item id changes from an
  // external source (e.g. initial load). Do NOT include generate() results here — generate()
  // sets editContent directly so only the regenerated type is affected.
  const activeContentId = activeContent?.id
  useEffect(() => {
    setEditContent(activeContent?.content ?? '')
    setIsDirty(false)
  }, [activeContentId, contentType])

  useEffect(() => window.api.onAIProgress(s => setAiStatus(s)), [])

  async function generate(type: string) {
    setIsGenerating(true); setAiStatus('')
    try {
      const c = await window.api.generateContent(episodeId, type, { provider })
      setContents(prev => [...prev.filter(x => x.type !== type), c])
      if (contentType === type) {
        setEditContent(c.content); setIsDirty(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Erro ao gerar com ${AI_PROVIDERS.find(p => p.value === provider)?.fullLabel ?? provider}:\n\n${msg}`)
    } finally { setIsGenerating(false) }
  }

  async function save() {
    if (!activeContent) return
    setIsSaving(true)
    try {
      await window.api.saveContent(activeContent.id, editContent)
      setContents(prev => prev.map(c => c.id === activeContent.id ? { ...c, content: editContent } : c))
      setIsDirty(false)
    } finally { setIsSaving(false) }
  }

  const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label ?? 'IA'
  const activeMeta    = activeContent ? parseMeta(activeContent.metadata) : null

  return (
    <div className="flex flex-col flex-1 overflow-hidden" onClick={() => providerMenuOpen && setProviderMenuOpen(false)}>
      {/* content-type sub-tabs + action buttons */}
      <div className="flex items-center border-b border-border shrink-0 px-4 gap-2">
        <div className="flex flex-1 items-end overflow-x-auto">
          {CONTENT_TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setContentType(key)}
              className={cn(
                'px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0',
                contentType === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              {contents.some(c => c.type === key) && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block align-middle" />
              )}
            </button>
          ))}
        </div>

      </div>

      {/* blog prompt editor */}
      {contentType === 'blog_post' && (
        <div className="border-b border-border shrink-0">
          <button onClick={() => setPromptOpen(v => !v)} className="flex items-center gap-2 w-full px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', promptOpen && 'rotate-180')} />
            Prompt do Blog Post
            {promptDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>
          {promptOpen && (
            <div className="px-6 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code>.</p>
              <textarea
                value={promptTemplate} rows={8} spellCheck={false}
                onChange={e => { setPromptTemplate(e.target.value); setPromptDirty(true); setPromptSaved(false) }}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:border-primary/40"
              />
              <div className="flex items-center justify-between">
                <button onClick={() => { setPromptTemplate(defaultPromptRef.current); setPromptDirty(true) }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3" />Resetar
                </button>
                <button
                  onClick={async () => { await window.api.setSetting('blog_post_prompt', promptTemplate); setPromptDirty(false); setPromptSaved(true); setTimeout(() => setPromptSaved(false), 2000) }}
                  disabled={!promptDirty}
                  className={cn('flex items-center gap-1 text-xs px-3 py-1.5 rounded-md', promptSaved ? 'bg-primary/20 text-primary' : promptDirty ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground opacity-40')}
                >
                  <Save className="w-3 h-3" />{promptSaved ? 'Salvo!' : 'Salvar prompt'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* youtube prompt editor */}
      {contentType === 'youtube' && (
        <div className="border-b border-border shrink-0">
          <button onClick={() => setYtPromptOpen(v => !v)} className="flex items-center gap-2 w-full px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', ytPromptOpen && 'rotate-180')} />
            Prompt do YouTube
            {ytPromptDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>
          {ytPromptOpen && (
            <div className="px-6 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code>.
                O <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code> já inclui os timestamps reais no formato <code className="bg-secondary px-1 rounded">[MM:SS]</code>.
              </p>
              <textarea
                value={ytPromptTemplate} rows={8} spellCheck={false}
                onChange={e => { setYtPromptTemplate(e.target.value); setYtPromptDirty(true); setYtPromptSaved(false) }}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:border-primary/40"
              />
              <div className="flex items-center justify-between">
                <button onClick={() => { setYtPromptTemplate(defaultYtPromptRef.current); setYtPromptDirty(true) }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3" />Resetar
                </button>
                <button
                  onClick={async () => { await window.api.setSetting('youtube_prompt', ytPromptTemplate); setYtPromptDirty(false); setYtPromptSaved(true); setTimeout(() => setYtPromptSaved(false), 2000) }}
                  disabled={!ytPromptDirty}
                  className={cn('flex items-center gap-1 text-xs px-3 py-1.5 rounded-md', ytPromptSaved ? 'bg-primary/20 text-primary' : ytPromptDirty ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground opacity-40')}
                >
                  <Save className="w-3 h-3" />{ytPromptSaved ? 'Salvo!' : 'Salvar prompt'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* instagram prompt editor */}
      {contentType === 'instagram' && (
        <div className="border-b border-border shrink-0">
          <button onClick={() => setIgPromptOpen(v => !v)} className="flex items-center gap-2 w-full px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', igPromptOpen && 'rotate-180')} />
            Prompt do Instagram
            {igPromptDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>
          {igPromptOpen && (
            <div className="px-6 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code>.</p>
              <textarea
                value={igPromptTemplate} rows={8} spellCheck={false}
                onChange={e => { setIgPromptTemplate(e.target.value); setIgPromptDirty(true); setIgPromptSaved(false) }}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:border-primary/40"
              />
              <div className="flex items-center justify-between">
                <button onClick={() => { setIgPromptTemplate(defaultIgPromptRef.current); setIgPromptDirty(true) }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3 h-3" />Resetar
                </button>
                <button
                  onClick={async () => { await window.api.setSetting('instagram_prompt', igPromptTemplate); setIgPromptDirty(false); setIgPromptSaved(true); setTimeout(() => setIgPromptSaved(false), 2000) }}
                  disabled={!igPromptDirty}
                  className={cn('flex items-center gap-1 text-xs px-3 py-1.5 rounded-md', igPromptSaved ? 'bg-primary/20 text-primary' : igPromptDirty ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground opacity-40')}
                >
                  <Save className="w-3 h-3" />{igPromptSaved ? 'Salvo!' : 'Salvar prompt'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* per-tab action toolbar — sits between prompt editor and content */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isGenerating ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />{aiStatus || 'Gerando conteúdo...'}
            </span>
          ) : activeMeta?.provider ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 px-2 py-1 rounded-full">
              <Sparkles className="w-3 h-3" />
              {AI_PROVIDERS.find(p => p.value === activeMeta.provider)?.fullLabel ?? activeMeta.provider}
              {activeMeta.model && <span className="opacity-60">· {activeMeta.model}</span>}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {activeContent && (
            <button
              onClick={async () => { if (!confirm('Remover?')) return; await window.api.deleteContent(activeContent.id); setContents(p => p.filter(c => c.id !== activeContent.id)); setEditContent('') }}
              className="p-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {activeContent && isDirty && (
            <button onClick={save} disabled={isSaving} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md">
              <Save className="w-3.5 h-3.5" />{isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          {/* split Regenerar button — type is passed explicitly, not inferred from closure */}
          <div className="relative flex rounded-md overflow-hidden border border-primary">
            <button
              onClick={() => generate(contentType)}
              disabled={isGenerating || !providerLoaded}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-1.5 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isGenerating
                ? 'Gerando...'
                : (activeContent
                  ? `Regenerar ${CONTENT_TYPES.find(t => t.key === contentType)?.label} · ${providerLabel}`
                  : `Gerar ${CONTENT_TYPES.find(t => t.key === contentType)?.label} · ${providerLabel}`)}
            </button>
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setProviderMenuOpen(v => !v) }}
                disabled={isGenerating || !providerLoaded}
                className="h-full px-2 bg-primary/90 hover:bg-primary/80 text-white border-l border-white/20 disabled:opacity-50"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {providerMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl py-1 z-50" onClick={e => e.stopPropagation()}>
                  <p className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Provedor de IA</p>
                  {AI_PROVIDERS.map(p => (
                    <button key={p.value}
                      onClick={() => { setProvider(p.value); setProviderMenuOpen(false); window.api.setSetting('ai_provider', p.value) }}
                      className={cn('w-full text-left px-3 py-2 text-sm flex items-center justify-between', provider === p.value ? 'text-primary bg-primary/5' : 'hover:bg-secondary')}
                    >
                      {p.fullLabel}
                      {provider === p.value && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1 px-3 pb-1 text-xs text-muted-foreground">
                    Chaves em{' '}
                    <button onClick={() => { setProviderMenuOpen(false); navigate('/settings') }} className="text-primary hover:underline">Configurações</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* content area */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        {!activeContent && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Sparkles className="w-10 h-10 opacity-20" />
            <p className="text-sm">Nenhum conteúdo para {CONTENT_TYPES.find(t => t.key === contentType)?.label} ainda.</p>
            <p className="text-xs opacity-60">Use o botão acima para gerar.</p>
          </div>
        )}
        {(activeContent || isGenerating) && (
          <textarea
            value={editContent} onChange={e => { setEditContent(e.target.value); setIsDirty(true) }}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-primary/40"
            placeholder="Conteúdo gerado aparecerá aqui..."
          />
        )}
      </div>
    </div>
  )
}

// ─── Clips tab ────────────────────────────────────────────────────────────────

function ClipsTab({ episodeId, episode }: { episodeId: number; episode: Episode }) {
  const [clips, setClips]                 = useState<Clip[]>([])
  const [selectedId, setSelectedId]       = useState<number | null>(null)
  const [newTitle, setNewTitle]           = useState('')
  const [startTime, setStartTime]         = useState(0)
  const [endTime, setEndTime]             = useState(30)
  const [isExporting, setIsExporting]     = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  const selected = clips.find(c => c.id === selectedId)

  useEffect(() => { window.api.getClips(episodeId).then(setClips) }, [episodeId])
  useEffect(() => window.api.onClipProgress(p => setExportProgress(p)), [])

  async function createClip() {
    if (!newTitle.trim()) return
    const clip = await window.api.createClip(episodeId, startTime, endTime, newTitle.trim())
    setClips(prev => [...prev, clip])
    setNewTitle('')
    setSelectedId(clip.id)
  }

  async function exportClip(clipId: number) {
    setIsExporting(true); setExportProgress(0)
    try {
      const r = await window.api.exportClip(clipId)
      if (r.success) alert(`Clipe exportado: ${r.filePath}`)
    } catch (err) { alert(`Erro ao exportar: ${err}`) }
    finally { setIsExporting(false) }
  }

  async function deleteClip(clipId: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remover este clipe?')) return
    await window.api.deleteClip(clipId)
    setClips(prev => prev.filter(c => c.id !== clipId))
    if (selectedId === clipId) setSelectedId(null)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* clip list */}
      <aside className="w-60 border-r border-border flex flex-col shrink-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <p className="text-sm font-medium text-muted-foreground">{clips.length} clipe(s)</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {clips.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 opacity-60">Nenhum clipe criado</p>
          )}
          {clips.map(clip => (
            <div
              key={clip.id}
              onClick={() => setSelectedId(clip.id)}
              className={cn('group px-3 py-2.5 rounded-lg cursor-pointer transition-colors', selectedId === clip.id ? 'bg-primary/15 border border-primary/30' : 'hover:bg-secondary')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate flex-1">{clip.title}</p>
                <button onClick={e => deleteClip(clip.id, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(clip.start_time)} → {formatTimestamp(clip.end_time)}
              </p>
            </div>
          ))}
        </div>
        {/* new clip form */}
        <div className="p-3 border-t border-border space-y-2 shrink-0">
          <input
            type="text" placeholder="Título do novo clipe" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createClip()}
            className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary/40"
          />
          <div className="flex gap-1.5">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-0.5">Início (s)</p>
              <input type="number" value={startTime} onChange={e => setStartTime(parseFloat(e.target.value))} step="0.1" min="0"
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-0.5">Fim (s)</p>
              <input type="number" value={endTime} onChange={e => setEndTime(parseFloat(e.target.value))} step="0.1" min="0"
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none" />
            </div>
          </div>
          <button onClick={createClip} disabled={!newTitle.trim()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />Novo Clipe
          </button>
        </div>
      </aside>

      {/* clip detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-semibold">{selected.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(selected.start_time)} → {formatTimestamp(selected.end_time)}
                  {' · '}{formatTimestamp(selected.end_time - selected.start_time)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selected.file_path && (
                  <button onClick={() => window.api.revealInFinder(selected.file_path)}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md">
                    <FolderOpen className="w-3.5 h-3.5" />Abrir
                  </button>
                )}
                <button onClick={() => exportClip(selected.id)} disabled={isExporting}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isExporting ? `Exportando ${exportProgress}%` : 'Exportar'}
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-lg space-y-4">
                <div className="aspect-video bg-black rounded-xl border border-border flex items-center justify-center overflow-hidden">
                  {episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? (
                    <video src={`app-media://${episode.file_path}#t=${selected.start_time},${selected.end_time}`} controls className="w-full h-full" />
                  ) : (
                    <div className="text-center text-muted-foreground p-6">
                      <Scissors className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <audio src={`app-media://${episode.file_path}`} controls className="w-full mt-3" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[['Início', selected.start_time], ['Fim', selected.end_time], ['Duração', selected.end_time - selected.start_time]].map(([label, t]) => (
                    <div key={String(label)} className="bg-card border border-border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-mono mt-0.5">{formatTimestamp(Number(t))}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Scissors className="w-10 h-10 opacity-20" />
            <p className="text-sm">Selecione ou crie um clipe</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Publicar tab ────────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    key: 'youtube',
    label: 'YouTube',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/20',
    url: 'https://studio.youtube.com/',
    urlLabel: 'Abrir YouTube Studio',
    hint: 'Cole o título e a descrição ao fazer upload do vídeo.',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10 border-pink-500/20',
    url: 'https://www.instagram.com/',
    urlLabel: 'Abrir Instagram',
    hint: 'Cole a legenda na criação do post ou Reels.',
  },
  {
    key: 'blog_post',
    label: 'WordPress / Blog',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    url: null,
    urlLabel: 'Abrir WordPress',
    hint: 'Publique no seu blog ou WordPress.',
  },
]

function PublishTab({ episodeId, onGoToContent }: { episodeId: number; onGoToContent: () => void }) {
  const [contents, setContents] = useState<GeneratedContent[]>([])
  const [wpUrl, setWpUrl]       = useState<string | null>(null)
  const [copied, setCopied]     = useState<string | null>(null)

  useEffect(() => {
    window.api.getGeneratedContent(episodeId).then(setContents)
    window.api.getSetting('wordpress_url').then(setWpUrl)
  }, [episodeId])

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function openUrl(url: string) {
    window.api.openExternal(url)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <p className="text-xs text-muted-foreground mb-4">
          Copie o conteúdo gerado e publique em cada plataforma. Gere o conteúdo primeiro na aba <strong className="text-foreground">Conteúdo</strong>.
        </p>

        {PLATFORMS.map(platform => {
          const content = contents.find(c => c.type === platform.key)
          const resolvedUrl = platform.key === 'blog_post' ? (wpUrl || null) : platform.url

          return (
            <div key={platform.key} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* card header */}
              <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border', content ? '' : 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', content ? platform.color.replace('text-', 'bg-') : 'bg-muted-foreground/30')} />
                  <span className={cn('text-sm font-semibold', content ? platform.color : 'text-muted-foreground')}>
                    {platform.label}
                  </span>
                  {content && <span className="text-xs text-muted-foreground">· pronto</span>}
                </div>

                <div className="flex items-center gap-2">
                  {content && (
                    <button
                      onClick={() => copy(content.content, platform.key)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors border',
                        copied === platform.key
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-secondary hover:bg-secondary/80 border-border'
                      )}
                    >
                      {copied === platform.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === platform.key ? 'Copiado!' : 'Copiar'}
                    </button>
                  )}

                  {content && resolvedUrl && (
                    <button
                      onClick={() => openUrl(resolvedUrl)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {platform.urlLabel}
                    </button>
                  )}

                  {content && platform.key === 'blog_post' && !wpUrl && (
                    <button
                      onClick={() => window.api.openExternal('https://wordpress.org/').then(() => {})}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground"
                    >
                      <Globe className="w-3 h-3" />
                      Configure URL em Configurações
                    </button>
                  )}

                  {!content && (
                    <button
                      onClick={onGoToContent}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Gerar conteúdo
                    </button>
                  )}
                </div>
              </div>

              {/* content preview */}
              {content ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-2">{platform.hint}</p>
                  <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto bg-secondary/40 rounded-lg px-3 py-2 scrollbar-thin">
                    {content.content.slice(0, 600)}{content.content.length > 600 ? '\n...' : ''}
                  </pre>
                </div>
              ) : (
                <div className="px-4 py-4 text-center text-muted-foreground/50">
                  <p className="text-xs">Conteúdo não gerado ainda</p>
                </div>
              )}
            </div>
          )
        })}

      </div>
    </div>
  )
}

// ─── Workspace shell ──────────────────────────────────────────────────────────

export default function EpisodeWorkspace() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const episodes  = useAppStore(s => s.episodes)
  const selectEpisode          = useAppStore(s => s.selectEpisode)
  const transcribingEpisodeId  = useAppStore(s => s.transcribingEpisodeId)
  const transcriptionStartedAt = useAppStore(s => s.transcriptionStartedAt)
  const setTranscribingEpisode = useAppStore(s => s.setTranscribingEpisode)
  const updateEpisode          = useAppStore(s => s.updateEpisode)

  const episodeId = id ? parseInt(id) : null
  const episode   = episodes.find(e => e.id === episodeId)

  const [tab, setTab] = useState<Tab>('transcricao')
  const [txProgress, setTxProgress]   = useState(0)
  const [txStatus, setTxStatus]       = useState('')
  const [txEta, setTxEta]             = useState<string | null>(null)

  useEffect(() => {
    if (!episodeId) return
    selectEpisode(episodeId)
    // Default to Conteúdo if already transcribed
    if (episode && episode.status !== 'imported' && episode.status !== 'transcribing') {
      setTab('conteudo')
    }
  }, [episodeId])

  // Transcription progress listener lives here so it survives tab switches
  useEffect(() => {
    if (!episodeId) return
    return window.api.onTranscriptionProgress((prog, status) => {
      setTxProgress(prog)
      setTxStatus(status)
      if (prog > 3 && prog < 100 && transcriptionStartedAt) {
        const elapsed = (Date.now() - transcriptionStartedAt) / 1000
        setTxEta(formatEta((elapsed * (100 - prog)) / prog))
      }
      if (prog >= 100) {
        setTxEta(null)
        setTranscribingEpisode(null)
        window.api.getEpisode(episodeId).then(ep => { if (ep) updateEpisode(ep) })
      }
    })
  }, [episodeId, transcriptionStartedAt])

  if (!episode || !episodeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FileText className="w-10 h-10" />
        <p>Episódio não encontrado</p>
        <button onClick={() => navigate('/dashboard')} className="text-primary text-sm underline">
          Voltar para Episódios
        </button>
      </div>
    )
  }

  const isTranscribing = transcribingEpisodeId === episodeId

  const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'transcricao', label: 'Transcrição', icon: FileText },
    { id: 'conteudo',    label: 'Conteúdo',    icon: Sparkles },
    { id: 'clips',       label: 'Clips',        icon: Scissors },
    { id: 'publicar',    label: 'Publicar',     icon: Send     },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* workspace header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card/50">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Episódios
        </button>

        <span className="text-muted-foreground/40 shrink-0">·</span>

        <h1 className="text-sm font-medium truncate flex-1 min-w-0">{episode.title}</h1>

        {episode.duration > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{formatDuration(episode.duration)}</span>
        )}

        <span className={cn('text-xs px-2 py-0.5 rounded-full border shrink-0', STATUS_STYLE[episode.status] ?? 'text-muted-foreground')}>
          {isTranscribing ? 'Transcrevendo' : (STATUS_LABEL[episode.status] ?? episode.status)}
          {isTranscribing && <Loader2 className="inline ml-1 w-3 h-3 animate-spin" />}
        </span>
      </header>

      {/* tab bar */}
      <div className="flex border-b border-border shrink-0 px-4">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors',
              tab === tabId
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {tabId === 'transcricao' && isTranscribing && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === 'transcricao' && (
        <TranscriptionTab
          episodeId={episodeId}
          episode={episode}
          progress={txProgress}
          progressStatus={txStatus}
          eta={txEta}
          onResetProgress={() => { setTxProgress(0); setTxStatus(''); setTxEta(null) }}
        />
      )}
      {tab === 'conteudo'    && <ContentTab       episodeId={episodeId} />}
      {tab === 'clips'       && <ClipsTab         episodeId={episodeId} episode={episode} />}
      {tab === 'publicar'    && <PublishTab        episodeId={episodeId} onGoToContent={() => setTab('conteudo')} />}
    </div>
  )
}
