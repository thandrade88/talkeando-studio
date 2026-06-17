import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Sparkles, Scissors, Loader2, Clock,
  Save, Trash2, RefreshCw, ChevronDown, RotateCcw, Plus, Download, FolderOpen,
  Send, Copy, Check, ExternalLink, Globe, CheckCircle2, Circle, Volume2, Image as ImageIcon, Camera,
  MoveHorizontal, ZoomIn, Youtube, Upload, Settings,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn, formatTimestamp, formatDuration } from '../lib/utils'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseTimestamp(v: string): number | null {
  const parts = v.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

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
    <div className="flex flex-col flex-1 overflow-y-auto">

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
  { key: 'resumo',    label: 'Resumo'    },
  { key: 'blog_post', label: 'Blog Post' },
  { key: 'youtube',   label: 'YouTube'   },
  { key: 'instagram', label: 'Instagram' },
]
const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude',  fullLabel: 'Claude (Anthropic)' },
  { value: 'openai', label: 'ChatGPT', fullLabel: 'ChatGPT (OpenAI)'  },
  { value: 'gemini', label: 'Gemini',  fullLabel: 'Gemini (Google)'    },
] as const
type ProviderValue = 'claude' | 'openai' | 'gemini'

function ResumoTab({ episodeId, provider }: { episodeId: number; provider: ProviderValue }) {
  const [summary, setSummary]               = useState('')
  const [contentRow, setContentRow]         = useState<GeneratedContent | null>(null)
  const [keyMoments, setKeyMoments]         = useState<KeyMoment[]>([])
  const [isGenerating, setIsGenerating]     = useState(false)
  const [aiStatus, setAiStatus]             = useState('')
  const [promptTemplate, setPromptTemplate] = useState('')
  const [promptOpen, setPromptOpen]         = useState(false)
  const [promptDirty, setPromptDirty]       = useState(false)
  const [promptSaved, setPromptSaved]       = useState(false)
  const defaultPromptRef                    = useRef<string>('')

  useEffect(() => {
    window.api.getGeneratedContent(episodeId).then(all => {
      const row = all.find(c => c.type === 'resume') ?? null
      setContentRow(row); setSummary(row?.content ?? '')
    })
    window.api.getKeyMoments(episodeId).then(setKeyMoments)
    Promise.all([window.api.getSetting('resume_prompt'), window.api.getDefaultResumePrompt()])
      .then(([saved, def]) => {
        defaultPromptRef.current = def
        setPromptTemplate(saved || def)
        setPromptDirty(false)
      })
  }, [episodeId])

  useEffect(() => window.api.onAIProgress(s => setAiStatus(s)), [])

  async function generate() {
    setIsGenerating(true); setAiStatus('')
    try {
      const r = await window.api.generateResume(episodeId, { provider })
      setContentRow(r.content); setSummary(r.content.content)
      setKeyMoments(r.keyMoments)
    } catch (err) {
      alert(`Erro ao gerar resumo:\n\n${err instanceof Error ? err.message : String(err)}`)
    } finally { setIsGenerating(false) }
  }

  const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label ?? 'IA'

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* prompt editor */}
      <div className="border-b border-border shrink-0">
        <button
          onClick={() => setPromptOpen(v => !v)}
          className="flex items-center gap-2 w-full px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', promptOpen && 'rotate-180')} />
          Prompt do Resumo
          {promptDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />}
        </button>
        {promptOpen && (
          <div className="px-6 pb-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code>.
              O transcript inclui timestamps no formato <code className="bg-secondary px-1 rounded">[início-fim]</code>.
            </p>
            <textarea
              value={promptTemplate} rows={8} spellCheck={false}
              onChange={e => { setPromptTemplate(e.target.value); setPromptDirty(true); setPromptSaved(false) }}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:border-primary/40"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setPromptTemplate(defaultPromptRef.current); setPromptDirty(true) }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3" />Resetar
              </button>
              <button
                onClick={async () => {
                  await window.api.setSetting('resume_prompt', promptTemplate)
                  setPromptDirty(false); setPromptSaved(true)
                  setTimeout(() => setPromptSaved(false), 2000)
                }}
                disabled={!promptDirty}
                className={cn(
                  'flex items-center gap-1 text-xs px-3 py-1.5 rounded-md',
                  promptSaved ? 'bg-primary/20 text-primary' : promptDirty ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground opacity-40'
                )}
              >
                <Save className="w-3 h-3" />{promptSaved ? 'Salvo!' : 'Salvar prompt'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* action bar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground">
          {isGenerating
            ? <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />{aiStatus || 'Gerando...'}</span>
            : keyMoments.length > 0
              ? `${keyMoments.length} momentos-chave identificados`
              : 'Gere o resumo para identificar os momentos-chave do episódio'}
        </span>
        <button
          onClick={generate}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {contentRow ? `Regenerar Resumo · ${providerLabel}` : `Gerar Resumo · ${providerLabel}`}
        </button>
      </div>

      <div className="flex flex-1 overflow-y-auto">
        {/* left: summary text */}
        <div className="flex flex-col w-80 shrink-0 border-r border-border overflow-y-auto">
          <p className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border uppercase tracking-wider">Resumo</p>
          <div className="flex-1 overflow-y-auto p-4">
            {summary
              ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
              : <p className="text-xs text-muted-foreground text-center py-8 opacity-60">O resumo aparecerá aqui após a geração.</p>
            }
          </div>
        </div>

        {/* right: key moments */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <p className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border uppercase tracking-wider">Momentos-chave</p>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {keyMoments.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8 opacity-60">
                Os momentos-chave aparecem aqui após gerar o resumo.<br />Eles são usados para criar os clipes automaticamente.
              </p>
            )}
            {keyMoments.map((m, i) => (
              <div key={m.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{m.title}</p>
                    {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <span className="inline-flex items-center gap-1 text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(m.start_time)} → {formatTimestamp(m.end_time)}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-60">
                    {formatDuration(m.end_time - m.start_time)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContentTab({ episodeId }: { episodeId: number }) {
  const navigate = useNavigate()
  const [contents, setContents]             = useState<GeneratedContent[]>([])
  const [contentType, setContentType]       = useState('resumo')
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
    <div className="flex flex-col flex-1 overflow-y-auto" onClick={() => providerMenuOpen && setProviderMenuOpen(false)}>
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

      {/* resumo tab — self-contained, replaces the shared action bar + textarea */}
      {contentType === 'resumo' && <ResumoTab episodeId={episodeId} provider={provider} />}

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

      {/* per-tab action toolbar + content area — only for non-resumo tabs */}
      {contentType !== 'resumo' && <div className="flex items-center justify-between px-6 py-2 border-b border-border shrink-0">
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
      </div>}

      {contentType !== 'resumo' && (
        <div className="flex-1 overflow-y-auto flex flex-col px-6 py-4">
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
      )}
    </div>
  )
}

// ─── Clip timeline ────────────────────────────────────────────────────────────

function ClipTimeline({
  duration, startTime, endTime, onStartChange, onEndChange, videoRef,
}: {
  duration: number
  startTime: number
  endTime: number
  onStartChange: (t: number) => void
  onEndChange: (t: number) => void
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging  = useRef<'start' | 'end' | null>(null)
  // Use refs so the mousemove handler never goes stale
  const stateRef  = useRef({ startTime, endTime, duration })
  stateRef.current = { startTime, endTime, duration }

  useEffect(() => {
    function getTime(clientX: number) {
      if (!trackRef.current) return 0
      const rect  = trackRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * stateRef.current.duration
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const { startTime, endTime, duration } = stateRef.current
      const raw = getTime(e.clientX)
      if (dragging.current === 'start') {
        const v = Math.round(Math.max(0, Math.min(raw, endTime - 1)) * 10) / 10
        onStartChange(v)
        if (videoRef.current) videoRef.current.currentTime = v
      } else {
        const v = Math.round(Math.max(startTime + 1, Math.min(raw, duration)) * 10) / 10
        onEndChange(v)
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, v - 0.5)
      }
    }

    function onMouseUp() { dragging.current = null }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onStartChange, onEndChange, videoRef])

  const max      = duration || 1
  const startPct = (startTime / max) * 100
  const endPct   = (endTime   / max) * 100

  return (
    <div
      ref={trackRef}
      className="relative h-8 select-none"
      onMouseDown={e => e.preventDefault()}
    >
      {/* track */}
      <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1.5 bg-secondary rounded-full" />
      {/* active region */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-primary/50 rounded-full"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      {/* start handle */}
      <div
        title={`Início: ${formatTimestamp(startTime)}`}
        className="absolute top-1/2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-grab z-10"
        style={{ left: `${startPct}%`, transform: 'translate(-50%, -50%)' }}
        onMouseDown={() => { dragging.current = 'start' }}
      />
      {/* end handle */}
      <div
        title={`Fim: ${formatTimestamp(endTime)}`}
        className="absolute top-1/2 w-4 h-4 rounded-full bg-orange-500 border-2 border-white shadow-md cursor-grab z-10"
        style={{ left: `${endPct}%`, transform: 'translate(-50%, -50%)' }}
        onMouseDown={() => { dragging.current = 'end' }}
      />
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
  const [isImporting, setIsImporting]     = useState(false)
  const [importMsg, setImportMsg]         = useState<string | null>(null)

  // Editable clip bounds
  const [editStart, setEditStart]         = useState(0)
  const [editEnd, setEditEnd]             = useState(30)
  const [isSavingClip, setIsSavingClip]   = useState(false)
  const [mediaDuration, setMediaDuration] = useState(episode.duration || 0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Vertical (9:16) preview, manually recentered on the speaker
  const verticalVideoRef = useRef<HTMLVideoElement>(null)
  const [vCropX, setVCropX] = useState(50)
  const [vZoom, setVZoom]   = useState(1)

  // Thumbnail upload
  const [isSettingThumb, setIsSettingThumb] = useState(false)
  const [isCapturingFrame, setIsCapturingFrame] = useState(false)
  const [thumbCopied, setThumbCopied]       = useState(false)
  const [thumbError, setThumbError]         = useState<string | null>(null)

  // Clip summary
  const [summaryDraft, setSummaryDraft]     = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [summaryError, setSummaryError]     = useState<string | null>(null)

  const selected    = clips.find(c => c.id === selectedId)
  const isDirtyClip = selected && (editStart !== selected.start_time || editEnd !== selected.end_time)

  useEffect(() => { window.api.getClips(episodeId).then(setClips) }, [episodeId])
  useEffect(() => window.api.onClipProgress(p => setExportProgress(p)), [])

  // Reset edit state and seek video when selected clip changes
  useEffect(() => {
    if (!selected) return
    setEditStart(selected.start_time)
    setEditEnd(selected.end_time)
    setThumbError(null)
    setSummaryDraft(selected.summary ?? ''); setSummaryError(null)
    setVCropX(50); setVZoom(1)
    setTimeout(() => {
      if (videoRef.current) videoRef.current.currentTime = selected.start_time
      if (verticalVideoRef.current) verticalVideoRef.current.currentTime = selected.start_time
    }, 50)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveClipBounds() {
    if (!selected) return
    setIsSavingClip(true)
    try {
      const updated = await window.api.updateClip(selected.id, editStart, editEnd)
      setClips(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      alert(`Erro ao salvar: ${err}`)
    } finally {
      setIsSavingClip(false)
    }
  }

  async function chooseThumbnail() {
    if (!selected) return
    setThumbError(null)
    const filePath = await window.api.openFileDialog([
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ])
    if (!filePath) return
    setIsSettingThumb(true)
    try {
      const updated = await window.api.setClipThumbnail(selected.id, filePath)
      setClips(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSettingThumb(false)
    }
  }

  async function captureCurrentFrame() {
    if (!selected || !videoRef.current) return
    setThumbError(null)
    setIsCapturingFrame(true)
    try {
      const dataUrl = await window.api.extractFrame(episode.file_path, videoRef.current.currentTime)
      if (!dataUrl) throw new Error('Não foi possível capturar o frame atual.')
      const updated = await window.api.setClipThumbnailFromFrame(selected.id, dataUrl)
      setClips(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCapturingFrame(false)
    }
  }

  async function copyThumbnail() {
    if (!selected?.thumbnail_path) return
    setThumbError(null)
    try {
      await window.api.copyImageToClipboard(selected.thumbnail_path)
      setThumbCopied(true)
      setTimeout(() => setThumbCopied(false), 2000)
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : String(err))
    }
  }

  async function downloadThumbnail() {
    if (!selected?.thumbnail_path) return
    setThumbError(null)
    try {
      const safeName = selected.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')
      await window.api.downloadFile(selected.thumbnail_path, `${safeName}_thumb.jpg`)
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : String(err))
    }
  }

  async function generateSummary() {
    if (!selected) return
    setIsGeneratingSummary(true); setSummaryError(null)
    try {
      const updated = await window.api.generateClipSummary(selected.id)
      setClips(prev => prev.map(c => c.id === updated.id ? updated : c))
      setSummaryDraft(updated.summary ?? '')
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  async function saveSummary() {
    if (!selected) return
    setIsSavingSummary(true)
    try {
      const updated = await window.api.updateClipSummary(selected.id, summaryDraft)
      setClips(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingSummary(false)
    }
  }

  async function importFromResume() {
    setIsImporting(true); setImportMsg(null)
    try {
      const updated = await window.api.createClipsFromKeyMoments(episodeId)
      setClips(updated)
      setImportMsg(`${updated.length} clipe(s) criado(s) do Resumo`)
      setTimeout(() => setImportMsg(null), 4000)
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err))
      setTimeout(() => setImportMsg(null), 6000)
    } finally {
      setIsImporting(false)
    }
  }

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
    <div className="flex flex-1 overflow-y-auto">
      {/* clip list */}
      <aside className="w-60 border-r border-border flex flex-col shrink-0 overflow-y-auto">
        <div className="px-3 py-3 border-b border-border shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{clips.length} clipe(s)</p>
            {clips.length > 0 && (
              <button
                onClick={async () => {
                  if (!confirm('Remover todos os clipes?')) return
                  await window.api.deleteAllClips(episodeId)
                  setClips([]); setSelectedId(null)
                }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={importFromResume}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isImporting ? 'Importando...' : 'Criar clipes do Resumo'}
          </button>
          {importMsg && (
            <p className="text-xs text-center text-primary">{importMsg}</p>
          )}
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
              <p className="text-xs text-muted-foreground mb-0.5">Início</p>
              <input type="text" value={formatTimestamp(startTime)}
                onChange={e => { const v = parseTimestamp(e.target.value); if (v !== null) setStartTime(v) }}
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-0.5">Fim</p>
              <input type="text" value={formatTimestamp(endTime)}
                onChange={e => { const v = parseTimestamp(e.target.value); if (v !== null) setEndTime(v) }}
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none" />
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
      <div className="flex-1 flex flex-col overflow-y-auto">
        {selected ? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-semibold">{selected.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(editStart)} → {formatTimestamp(editEnd)}
                  {' · '}{formatDuration(editEnd - editStart)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isDirtyClip && (
                  <button onClick={saveClipBounds} disabled={isSavingClip}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-md disabled:opacity-50">
                    {isSavingClip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar
                  </button>
                )}
                {selected.file_path && (
                  <button onClick={() => window.api.revealInFinder(selected.file_path)}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md">
                    <FolderOpen className="w-3.5 h-3.5" />Abrir
                  </button>
                )}
                <button onClick={() => exportClip(selected.id)} disabled={isExporting}
                  className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 border border-border text-sm px-4 py-2 rounded-md disabled:opacity-50">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isExporting ? `Exportando ${exportProgress}%` : 'Exportar'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-[7fr_3fr] gap-4 h-full">

                {/* ── Left: editing area (60%) ── */}
                <div className="flex flex-col gap-4 min-w-0">

                  {/* main player */}
                  {episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? (
                    <div className="aspect-video bg-black rounded-xl border border-border overflow-hidden">
                      <video
                        ref={videoRef}
                        src={`app-media://${episode.file_path}`}
                        controls
                        className="w-full h-full"
                        onLoadedMetadata={e => setMediaDuration(e.currentTarget.duration || episode.duration || 0)}
                        onPlay={() => verticalVideoRef.current?.play().catch(() => {})}
                        onPause={() => verticalVideoRef.current?.pause()}
                        onSeeked={e => { if (verticalVideoRef.current) verticalVideoRef.current.currentTime = e.currentTarget.currentTime }}
                        onTimeUpdate={e => {
                          const t = e.currentTarget.currentTime
                          if (verticalVideoRef.current && Math.abs(verticalVideoRef.current.currentTime - t) > 0.3)
                            verticalVideoRef.current.currentTime = t
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-black rounded-xl border border-border flex items-center justify-center">
                      <div className="text-center text-muted-foreground p-6 w-full">
                        <Scissors className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <audio src={`app-media://${episode.file_path}`} controls className="w-full mt-3" />
                      </div>
                    </div>
                  )}

                  {/* trim controls */}
                  <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corte do clipe</p>
                    <ClipTimeline
                      duration={mediaDuration}
                      startTime={editStart}
                      endTime={editEnd}
                      onStartChange={setEditStart}
                      onEndChange={setEditEnd}
                      videoRef={videoRef}
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary inline-block" />Início
                        </p>
                        <input
                          type="text" value={formatTimestamp(editStart)}
                          onChange={e => {
                            const v = parseTimestamp(e.target.value)
                            if (v !== null && v < editEnd) { setEditStart(v); if (videoRef.current) videoRef.current.currentTime = v }
                          }}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Fim
                        </p>
                        <input
                          type="text" value={formatTimestamp(editEnd)}
                          onChange={e => {
                            const v = parseTimestamp(e.target.value)
                            if (v !== null && v > editStart) { setEditEnd(v); if (videoRef.current) videoRef.current.currentTime = Math.max(0, v - 0.5) }
                          }}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Duração</p>
                        <p className="px-3 py-1.5 text-sm font-mono text-muted-foreground bg-secondary/50 rounded-lg border border-border">
                          {formatDuration(editEnd - editStart)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* summary */}
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3 flex-1 flex flex-col">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" />Resumo do clipe (IA)
                    </p>
                    <textarea
                      value={summaryDraft}
                      placeholder="Gere um resumo com IA ou escreva o seu…"
                      onChange={e => setSummaryDraft(e.target.value)}
                      className="flex-1 min-h-[120px] w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-primary/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={generateSummary} disabled={isGeneratingSummary}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50"
                      >
                        {isGeneratingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isGeneratingSummary ? 'Gerando…' : selected.summary ? 'Regenerar' : 'Gerar com IA'}
                      </button>
                      {summaryDraft !== (selected.summary ?? '') && (
                        <button
                          onClick={saveSummary} disabled={isSavingSummary}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50"
                        >
                          {isSavingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Salvar
                        </button>
                      )}
                    </div>
                    {summaryError && <p className="text-xs text-destructive">{summaryError}</p>}
                  </div>
                </div>

                {/* ── Right: metadata sidebar ── */}
                {/* ── Right: metadata sidebar (40%) ── */}
                <div className="flex flex-col gap-4">

                  {/* 9:16 preview */}
                  {episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) && (
                    <div className="bg-card border border-border rounded-xl p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview 9:16</p>
                      <div className="aspect-[9/16] bg-black rounded-lg border border-border overflow-hidden">
                        <video
                          ref={verticalVideoRef}
                          src={`app-media://${episode.file_path}`}
                          muted playsInline
                          className="w-full h-full object-cover"
                          style={{ objectPosition: `${vCropX}% center`, transform: `scale(${vZoom})` }}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><MoveHorizontal className="w-3 h-3" />Posição</span>
                            <span className="font-mono tabular-nums">{vCropX}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={vCropX}
                            onChange={e => setVCropX(Number(e.target.value))}
                            className="w-full accent-primary" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" />Zoom</span>
                            <span className="font-mono tabular-nums">{vZoom.toFixed(1)}x</span>
                          </div>
                          <input type="range" min={100} max={200} value={vZoom * 100}
                            onChange={e => setVZoom(Number(e.target.value) / 100)}
                            className="w-full accent-primary" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* thumbnail */}
                  <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />Thumbnail
                    </p>
                    {selected.thumbnail_path ? (
                      <>
                        <img
                          src={`app-media://${selected.thumbnail_path}?t=${selected.thumbnail_path}`}
                          alt="Thumbnail"
                          className="w-full aspect-video object-cover rounded-lg border border-border"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={copyThumbnail}
                            className="flex items-center justify-center gap-1 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
                            {thumbCopied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                            {thumbCopied ? 'Copiado!' : 'Copiar'}
                          </button>
                          <button onClick={downloadThumbnail}
                            className="flex items-center justify-center gap-1 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
                            <Download className="w-3 h-3" />Baixar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full aspect-video rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      {episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) && (
                        <button onClick={captureCurrentFrame} disabled={isCapturingFrame}
                          className="flex items-center justify-center gap-1 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50">
                          {isCapturingFrame ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                          {isCapturingFrame ? '…' : 'Frame'}
                        </button>
                      )}
                      <button onClick={chooseThumbnail} disabled={isSettingThumb}
                        className={cn(
                          'flex items-center justify-center gap-1 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50',
                          !episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) && 'col-span-2'
                        )}>
                        {isSettingThumb ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                        {isSettingThumb ? '…' : selected.thumbnail_path ? 'Trocar' : 'Selecionar'}
                      </button>
                    </div>
                    {thumbError && <p className="text-xs text-destructive">{thumbError}</p>}
                  </div>
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


function PublishTab({ episode, episodeId, onGoToContent }: {
  episode: Episode; episodeId: number; onGoToContent: () => void
}) {
  const navigate = useNavigate()
  const [contents, setContents]   = useState<GeneratedContent[]>([])
  const [clips, setClips]         = useState<Clip[]>([])
  const [wpUrl, setWpUrl]         = useState<string | null>(null)
  const [copied, setCopied]       = useState<string | null>(null)
  const [ytStatus, setYtStatus]   = useState<{
    connected: boolean; mainChannelId: string | null; cutsChannelId: string | null
  }>({ connected: false, mainChannelId: null, cutsChannelId: null })
  // episode: stores the live-stream YouTube video ID for metadata updates
  const [episodeVideoId, setEpisodeVideoId]   = useState('')
  const [metaUpdating, setMetaUpdating]       = useState(false)
  const [metaUpdated, setMetaUpdated]         = useState(false)
  const [metaError, setMetaError]             = useState<string | null>(null)
  // clips: full upload to cuts channel
  const [uploading, setUploading]             = useState<`clip:${number}` | null>(null)
  const [uploadPct, setUploadPct]             = useState(0)
  const [uploadedUrls, setUploadedUrls]       = useState<Record<string, string>>({})
  const [uploadError, setUploadError]         = useState<string | null>(null)
  const [privacyStatus, setPrivacyStatus]     = useState<'private' | 'unlisted' | 'public'>('private')

  useEffect(() => {
    window.api.getGeneratedContent(episodeId).then(setContents)
    window.api.getClips(episodeId).then(setClips)
    window.api.getSetting('wordpress_url').then(setWpUrl)
    window.api.getYouTubeStatus().then(s => setYtStatus({
      connected: s.connected,
      mainChannelId: s.mainChannelId,
      cutsChannelId: s.cutsChannelId,
    }))
    // Restore saved video ID for this episode
    window.api.getSetting(`episode_${episodeId}_youtube_id`).then(v => { if (v) setEpisodeVideoId(v) })
    return window.api.onYouTubeUploadProgress(pct => setUploadPct(pct))
  }, [episodeId])

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function extractVideoId(input: string): string {
    // Accept bare ID or full URL
    const m = input.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : input.trim()
  }

  async function updateEpisodeMetadata() {
    const videoId = extractVideoId(episodeVideoId)
    if (!videoId) return
    const ytContent = contents.find(c => c.type === 'youtube')
    setMetaUpdating(true); setMetaError(null); setMetaUpdated(false)
    try {
      await window.api.updateYouTubeVideoMetadata({
        videoId,
        title:       episode.title,
        description: ytContent?.content ?? '',
      })
      // Persist the video ID for next time
      await window.api.setSetting(`episode_${episodeId}_youtube_id`, videoId)
      setEpisodeVideoId(videoId)
      setMetaUpdated(true)
      setTimeout(() => setMetaUpdated(false), 3000)
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : String(err))
    } finally {
      setMetaUpdating(false)
    }
  }

  async function uploadClip(clip: Clip) {
    if (!ytStatus.cutsChannelId || !clip.file_path) return
    const key = `clip:${clip.id}` as `clip:${number}`
    setUploading(key); setUploadPct(0); setUploadError(null)
    try {
      const result = await window.api.uploadToYouTube({
        filePath:      clip.file_path,
        title:         clip.title,
        description:   clip.summary ?? '',
        channelId:     ytStatus.cutsChannelId,
        privacyStatus,
      })
      setUploadedUrls(prev => ({ ...prev, [key]: result.videoUrl }))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(null)
    }
  }

  const ytContent    = contents.find(c => c.type === 'youtube')
  const blogContent  = contents.find(c => c.type === 'blog_post')
  const igContent    = contents.find(c => c.type === 'instagram')

  const ytCutsNotConfigured = !ytStatus.connected || !ytStatus.cutsChannelId

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── YouTube — Canal Principal ── */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Youtube className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Canal Principal</p>
                <p className="text-xs text-muted-foreground">Atualizar metadados do episódio</p>
              </div>
            </div>
            {!ytStatus.connected && (
              <button onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary border border-border rounded-lg text-muted-foreground">
                <Settings className="w-3 h-3" />Configurar
              </button>
            )}
          </div>

          <div className="p-5">
            {!ytStatus.connected ? (
              <p className="text-xs text-muted-foreground/60 text-center py-1">Conecte sua conta do YouTube nas configurações.</p>
            ) : !ytStatus.mainChannelId ? (
              <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Configure o canal principal em <strong>Configurações → YouTube</strong>.
              </p>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-muted-foreground">
                  Cole o link ou ID do vídeo do YouTube para atualizar título e descrição com o conteúdo gerado.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={episodeVideoId}
                    onChange={e => setEpisodeVideoId(e.target.value)}
                    placeholder="https://youtu.be/... ou ID do vídeo"
                    className="flex-1 text-xs bg-secondary border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
                  />
                  <button
                    onClick={updateEpisodeMetadata}
                    disabled={metaUpdating || !episodeVideoId.trim()}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 shrink-0">
                    {metaUpdating
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Atualizando...</>
                      : metaUpdated
                        ? <><Check className="w-3 h-3" />Atualizado!</>
                        : <>Atualizar metadados</>}
                  </button>
                  {ytContent && (
                    <button onClick={() => copy(ytContent.content, 'yt_episode')}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 bg-secondary border border-border rounded-lg shrink-0">
                      {copied === 'yt_episode' ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      {copied === 'yt_episode' ? 'Copiado!' : 'Copiar descrição'}
                    </button>
                  )}
                </div>
                {metaError && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{metaError}</p>
                )}
                {episodeVideoId && !metaUpdating && (
                  <button
                    onClick={() => window.api.openExternal(`https://youtu.be/${extractVideoId(episodeVideoId)}`)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-3 h-3" />Ver vídeo no YouTube
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── YouTube — Canal de Cortes ── */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Scissors className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Canal de Cortes</p>
                <p className="text-xs text-muted-foreground">Upload dos clipes</p>
              </div>
            </div>
            {ytStatus.cutsChannelId && (
              <select value={privacyStatus} onChange={e => setPrivacyStatus(e.target.value as typeof privacyStatus)}
                className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 focus:outline-none">
                <option value="private">Privado</option>
                <option value="unlisted">Não listado</option>
                <option value="public">Público</option>
              </select>
            )}
          </div>

          <div className="p-5">
            {!ytStatus.connected ? (
              <p className="text-xs text-muted-foreground/60 text-center py-1">Conecte sua conta do YouTube nas configurações.</p>
            ) : !ytStatus.cutsChannelId ? (
              <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Configure o canal de cortes em <strong>Configurações → YouTube</strong>.
              </p>
            ) : clips.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-2">Nenhum clipe criado ainda</p>
            ) : (
              <div className="space-y-1.5">
                {clips.map(clip => {
                  const key = `clip:${clip.id}` as `clip:${number}`
                  return (
                    <div key={clip.id} className="flex items-center gap-4 py-2.5 px-3 bg-secondary/30 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{clip.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(clip.start_time)} → {formatTimestamp(clip.end_time)}
                          {!clip.file_path && <span className="text-amber-500 ml-2">· exportar antes de publicar</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {uploadedUrls[key] ? (
                          <button onClick={() => window.api.openExternal(uploadedUrls[key])}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg">
                            <ExternalLink className="w-3 h-3" />Ver no YouTube
                          </button>
                        ) : (
                          <button onClick={() => uploadClip(clip)}
                            disabled={!!uploading || ytCutsNotConfigured || !clip.file_path}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50">
                            {uploading === key
                              ? <><Loader2 className="w-3 h-3 animate-spin" />{uploadPct}%</>
                              : <><Upload className="w-3 h-3" />Upload</>}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {uploadError && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{uploadError}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Instagram ── */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Globe className="w-4 h-4 text-pink-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Instagram</p>
                <p className="text-xs text-muted-foreground">Copie a legenda e publique manualmente</p>
              </div>
            </div>
            {igContent && (
              <div className="flex items-center gap-2">
                <button onClick={() => copy(igContent.content, 'instagram')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary border border-border rounded-lg">
                  {copied === 'instagram' ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  {copied === 'instagram' ? 'Copiado!' : 'Copiar legenda'}
                </button>
                <button onClick={() => window.api.openExternal('https://www.instagram.com/')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white rounded-lg">
                  <ExternalLink className="w-3 h-3" />Abrir Instagram
                </button>
              </div>
            )}
            {!igContent && (
              <button onClick={onGoToContent}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary border border-border rounded-lg text-muted-foreground">
                <Sparkles className="w-3 h-3" />Gerar conteúdo
              </button>
            )}
          </div>
          {igContent ? (
            <pre className="px-5 py-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {igContent.content.slice(0, 800)}{igContent.content.length > 800 ? '\n…' : ''}
            </pre>
          ) : (
            <p className="px-5 py-4 text-xs text-muted-foreground/50 text-center">Legenda não gerada ainda</p>
          )}
        </section>

        {/* ── WordPress / Blog ── */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Globe className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">WordPress / Blog</p>
                <p className="text-xs text-muted-foreground">Copie o conteúdo e publique no seu blog</p>
              </div>
            </div>
            {blogContent && (
              <div className="flex items-center gap-2">
                <button onClick={() => copy(blogContent.content, 'blog')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary border border-border rounded-lg">
                  {copied === 'blog' ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  {copied === 'blog' ? 'Copiado!' : 'Copiar post'}
                </button>
                {wpUrl && (
                  <button onClick={() => window.api.openExternal(wpUrl)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg">
                    <ExternalLink className="w-3 h-3" />Abrir WordPress
                  </button>
                )}
              </div>
            )}
            {!blogContent && (
              <button onClick={onGoToContent}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary border border-border rounded-lg text-muted-foreground">
                <Sparkles className="w-3 h-3" />Gerar conteúdo
              </button>
            )}
          </div>
          {blogContent ? (
            <pre className="px-5 py-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {blogContent.content.slice(0, 800)}{blogContent.content.length > 800 ? '\n…' : ''}
            </pre>
          ) : (
            <p className="px-5 py-4 text-xs text-muted-foreground/50 text-center">Post não gerado ainda</p>
          )}
        </section>

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
      {tab === 'publicar'    && <PublishTab        episode={episode} episodeId={episodeId} onGoToContent={() => setTab('conteudo')} />}
    </div>
  )
}
