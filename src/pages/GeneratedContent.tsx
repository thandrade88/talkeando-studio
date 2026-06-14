import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Save, Trash2, RefreshCw, ChevronDown, RotateCcw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn } from '../lib/utils'

const CONTENT_TYPES = [
  { key: 'blog_post', label: 'Blog Post' },
  { key: 'youtube',   label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'seo',       label: 'SEO' },
  { key: 'summary',   label: 'Resumo' },
]

const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude', fullLabel: 'Claude (Anthropic)' },
  { value: 'openai', label: 'ChatGPT', fullLabel: 'ChatGPT (OpenAI)' },
  { value: 'gemini', label: 'Gemini', fullLabel: 'Gemini (Google)' },
] as const

type ProviderValue = 'claude' | 'openai' | 'gemini'

export default function GeneratedContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const episodes = useAppStore((s) => s.episodes)
  const selectEpisode = useAppStore((s) => s.selectEpisode)

  const [contents, setContents] = useState<GeneratedContent[]>([])
  const [activeTab, setActiveTab] = useState('blog_post')
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [provider, setProvider] = useState<ProviderValue>('claude')
  const [providerLoaded, setProviderLoaded] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)

  const [promptTemplate, setPromptTemplate] = useState('')
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [promptDirty, setPromptDirty] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)
  const defaultPromptRef = useRef<string>('')

  const episodeId = id ? parseInt(id) : null
  const episode = episodes.find((e) => e.id === episodeId)
  const activeContent = contents.find((c) => c.type === activeTab)

  // Parse metadata stored with each content item
  function parseMeta(raw: string): { provider?: ProviderValue; model?: string } {
    try { return JSON.parse(raw) } catch { return {} }
  }

  // Load episode content + current provider + blog prompt
  useEffect(() => {
    if (!episodeId) return
    selectEpisode(episodeId)
    window.api.getGeneratedContent(episodeId).then(setContents)
    window.api.getSetting('ai_provider').then((v) => {
      if (v && ['claude', 'openai', 'gemini'].includes(v)) setProvider(v as ProviderValue)
      setProviderLoaded(true)
    })
    // Load the blog post prompt: use saved value if set, else fetch the default
    Promise.all([
      window.api.getSetting('blog_post_prompt'),
      window.api.getDefaultBlogPrompt(),
    ]).then(([saved, def]) => {
      defaultPromptRef.current = def
      setPromptTemplate(saved || def)
      setPromptDirty(false)
    })
  }, [episodeId])

  useEffect(() => {
    if (activeContent) {
      setEditContent(activeContent.content)
      setIsDirty(false)
    } else {
      setEditContent('')
      setIsDirty(false)
    }
  }, [activeContent?.id, activeTab])

  useEffect(() => {
    const unsub = window.api.onAIProgress((status) => setAiStatus(status))
    return unsub
  }, [])

  async function savePrompt() {
    await window.api.setSetting('blog_post_prompt', promptTemplate)
    setPromptDirty(false)
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
  }

  function resetPrompt() {
    setPromptTemplate(defaultPromptRef.current)
    setPromptDirty(true)
  }

  async function changeProvider(p: ProviderValue) {
    setProvider(p)
    setProviderMenuOpen(false)
    await window.api.setSetting('ai_provider', p)
  }

  async function generate() {
    if (!episodeId) return
    setIsGenerating(true)
    setAiStatus('')
    try {
      const content = await window.api.generateContent(episodeId, activeTab, { provider })
      setContents((prev) => {
        const filtered = prev.filter((c) => c.type !== activeTab)
        return [...filtered, content]
      })
      setEditContent(content.content)
      setIsDirty(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Erro ao gerar com ${AI_PROVIDERS.find(p => p.value === provider)?.fullLabel ?? provider}:\n\n${msg}`)
    } finally {
      setIsGenerating(false)
    }
  }

  async function save() {
    if (!activeContent) return
    setIsSaving(true)
    try {
      await window.api.saveContent(activeContent.id, editContent)
      setContents((prev) =>
        prev.map((c) => (c.id === activeContent.id ? { ...c, content: editContent } : c))
      )
      setIsDirty(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteContent() {
    if (!activeContent || !confirm('Remover este conteúdo?')) return
    await window.api.deleteContent(activeContent.id)
    setContents((prev) => prev.filter((c) => c.id !== activeContent.id))
    setEditContent('')
  }

  if (!episode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Sparkles className="w-10 h-10" />
        <p>Selecione um episódio no Dashboard</p>
        <button onClick={() => navigate('/dashboard')} className="text-primary text-sm underline">
          Ir para Dashboard
        </button>
      </div>
    )
  }

  const activeMeta = activeContent ? parseMeta(activeContent.metadata) : null
  const activeProviderLabel = AI_PROVIDERS.find((p) => p.value === provider)?.label ?? 'IA'

  return (
    <div className="flex flex-col h-full" onClick={() => providerMenuOpen && setProviderMenuOpen(false)}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-sm font-semibold truncate max-w-md">{episode.title}</h1>
          <p className="text-xs text-muted-foreground">Conteúdos gerados por IA</p>
        </div>
        <div className="flex items-center gap-2">
          {activeContent && isDirty && (
            <button
              onClick={save}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          {activeContent && (
            <button onClick={deleteContent} className="p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Provider selector + Generate button (split) */}
          <div className="flex rounded-md overflow-hidden border border-primary shadow-sm">
            <button
              onClick={generate}
              disabled={isGenerating || !providerLoaded}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isGenerating ? 'Gerando...' : (activeContent ? `Regenerar com ${activeProviderLabel}` : `Gerar com ${activeProviderLabel}`)}
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setProviderMenuOpen((v) => !v) }}
                disabled={isGenerating || !providerLoaded}
                className="h-full px-2 bg-primary/90 hover:bg-primary/80 text-white border-l border-white/20 disabled:opacity-50 transition-colors"
                title="Escolher provedor de IA"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {providerMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl py-1 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Provedor de IA
                  </p>
                  {AI_PROVIDERS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => changeProvider(p.value)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                        provider === p.value
                          ? 'text-primary bg-primary/5'
                          : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      {p.fullLabel}
                      {provider === p.value && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1 px-3 pb-1">
                    <p className="text-xs text-muted-foreground">
                      Configure as chaves em{' '}
                      <button
                        onClick={() => { setProviderMenuOpen(false); navigate('/settings') }}
                        className="text-primary hover:underline"
                      >
                        Configurações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content type tabs */}
      <div className="flex border-b border-border shrink-0 px-6 items-end">
        {CONTENT_TYPES.map(({ key, label }) => {
          const hasContent = contents.some((c) => c.type === key)
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'px-4 py-2.5 text-sm border-b-2 transition-colors',
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              {hasContent && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block align-middle" />
              )}
            </button>
          )
        })}
      </div>

      {/* Blog post prompt editor — only visible on blog_post tab */}
      {activeTab === 'blog_post' && (
        <div className="border-b border-border shrink-0">
          <button
            onClick={() => setPromptEditorOpen((v) => !v)}
            className="flex items-center gap-2 w-full px-6 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', promptEditorOpen && 'rotate-180')} />
            Prompt do Blog Post
            {promptDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
          </button>

          {promptEditorOpen && (
            <div className="px-6 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-secondary px-1 py-0.5 rounded text-xs">{'{{title}}'}</code> e{' '}
                <code className="bg-secondary px-1 py-0.5 rounded text-xs">{'{{transcript}}'}</code> como variáveis.
              </p>
              <textarea
                value={promptTemplate}
                onChange={(e) => { setPromptTemplate(e.target.value); setPromptDirty(true); setPromptSaved(false) }}
                rows={12}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2.5 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:border-primary/40"
                placeholder="Escreva o prompt aqui..."
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={resetPrompt}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar padrão
                </button>
                <button
                  onClick={savePrompt}
                  disabled={!promptDirty}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors',
                    promptSaved
                      ? 'bg-primary/20 text-primary'
                      : promptDirty
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-secondary text-muted-foreground opacity-40'
                  )}
                >
                  <Save className="w-3 h-3" />
                  {promptSaved ? 'Salvo!' : 'Salvar prompt'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
        {isGenerating && (
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {aiStatus || 'Gerando conteúdo...'}
          </div>
        )}

        {/* "Generated with" metadata badge */}
        {activeMeta?.provider && !isGenerating && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 px-2 py-1 rounded-full">
              <Sparkles className="w-3 h-3" />
              Gerado com {AI_PROVIDERS.find((p) => p.value === activeMeta.provider)?.fullLabel ?? activeMeta.provider}
              {activeMeta.model && (
                <span className="opacity-60">· {activeMeta.model}</span>
              )}
            </span>
          </div>
        )}

        {!activeContent && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Sparkles className="w-10 h-10" />
            <p className="text-sm">
              Nenhum conteúdo gerado para {CONTENT_TYPES.find((t) => t.key === activeTab)?.label}
            </p>
            <button
              onClick={generate}
              disabled={!providerLoaded}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              Gerar com {activeProviderLabel}
            </button>
          </div>
        )}

        {(activeContent || isGenerating) && (
          <div className="flex flex-col gap-3 h-full">
            {activeContent && (
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Conteúdo</label>
                <textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setIsDirty(true) }}
                  className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-primary/40"
                  placeholder="Conteúdo gerado aparecerá aqui..."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
