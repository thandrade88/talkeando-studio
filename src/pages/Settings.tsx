import React, { useEffect, useRef, useState } from 'react'
import {
  Settings as SettingsIcon,
  Key,
  Cpu,
  Globe,
  FolderOpen,
  Check,
  Eye,
  EyeOff,
  Download,
  Loader2,
  CheckCircle2,
  Terminal,
  Sparkles,
  RotateCcw,
  Youtube,
  Link,
  Unlink,
} from 'lucide-react'
import { cn } from '../lib/utils'

const AI_PROVIDERS = [
  { value: 'claude', label: 'Claude (Anthropic)', hint: 'console.anthropic.com → API Keys' },
  { value: 'openai', label: 'ChatGPT (OpenAI)',   hint: 'platform.openai.com → API Keys' },
  { value: 'gemini', label: 'Gemini (Google)',    hint: 'aistudio.google.com → Get API Key' },
] as const

type AIProviderValue = 'claude' | 'openai' | 'gemini'

const LANGUAGES = [
  { value: 'auto', label: 'Automático (PT / EN / ES...)' },
  { value: 'pt',   label: 'Português (forçar)' },
  { value: 'en',   label: 'English (force)' },
  { value: 'es',   label: 'Español (forzar)' },
]

const PROMPT_CONFIGS = [
  {
    key: 'resume_prompt' as const,
    label: 'Resumo',
    hint: 'Gerado na aba Conteúdo → Resumo. O {{transcript}} inclui timestamps [início-fim] em segundos. O JSON de saída deve conter "summary" e "keyMoments".',
  },
  {
    key: 'blog_post_prompt' as const,
    label: 'Blog Post',
    hint: 'Gerado na aba Conteúdo → Blog Post',
  },
  {
    key: 'youtube_prompt' as const,
    label: 'YouTube',
    hint: 'Gerado na aba Conteúdo → YouTube. O {{transcript}} inclui timestamps reais [MM:SS].',
  },
  {
    key: 'instagram_prompt' as const,
    label: 'Instagram',
    hint: 'Gerado na aba Conteúdo → Instagram',
  },
] as const

type SettingsTab = 'geral' | 'transcricao' | 'prompts'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'geral',       label: 'Geral',        icon: Sparkles },
  { id: 'transcricao', label: 'Transcrição',  icon: Cpu      },
  { id: 'prompts',     label: 'Prompts de IA', icon: SettingsIcon },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('geral')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)

  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(null)
  const [setupStatus, setSetupStatus] = useState<WhisperSetupStatus | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)

  // YouTube
  const [ytClientId, setYtClientId]         = useState('')
  const [ytClientSecret, setYtClientSecret] = useState('')
  const [ytConnected, setYtConnected]       = useState(false)
  const [ytChannels, setYtChannels]         = useState<YouTubeChannel[]>([])
  const [ytMainChannel, setYtMainChannel]   = useState('')
  const [ytCutsChannel, setYtCutsChannel]   = useState('')
  const [ytConnecting, setYtConnecting]     = useState(false)
  const [ytSavedChannels, setYtSavedChannels] = useState(false)
  const [ytError, setYtError]               = useState<string | null>(null)
  const [ytExtraId, setYtExtraId]           = useState('')
  const [ytExtraLoading, setYtExtraLoading] = useState(false)
  const [ytExtraError, setYtExtraError]     = useState<string | null>(null)
  const [ytAuthChannelId, setYtAuthChannelId] = useState<string | null>(null)
  const [ytMainAuthed, setYtMainAuthed]     = useState(false)
  const [ytCutsAuthed, setYtCutsAuthed]     = useState(false)
  const [ytConnectingCh, setYtConnectingCh] = useState<string | null>(null)

  const defaultPromptsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    window.api.getYouTubeStatus().then(async s => {
      if (s.clientId) setYtClientId(s.clientId)
      setYtConnected(s.connected)
      if (s.authChannelId) setYtAuthChannelId(s.authChannelId)
      if (s.mainChannelId) setYtMainChannel(s.mainChannelId)
      if (s.cutsChannelId) setYtCutsChannel(s.cutsChannelId)
      if (s.connected) {
        try {
          const channels = await window.api.listYouTubeChannels()
          const ids = new Set(channels.map(c => c.id))
          const missing = [s.mainChannelId, s.cutsChannelId]
            .filter((id): id is string => !!id && !ids.has(id))
            .filter((id, i, a) => a.indexOf(id) === i)
          for (const id of missing) {
            try {
              const ch = await window.api.resolveYouTubeChannel(id)
              channels.push(ch)
            } catch { /* channel no longer accessible */ }
          }
          setYtChannels(channels)
        } catch { /* not authenticated */ }
        if (s.mainChannelId) {
          const isAuth = s.mainChannelId === s.authChannelId
          if (isAuth) setYtMainAuthed(true)
          else window.api.getChannelAuthStatus(s.mainChannelId).then(r => setYtMainAuthed(r.authenticated))
        }
        if (s.cutsChannelId) {
          const isAuth = s.cutsChannelId === s.authChannelId
          if (isAuth) setYtCutsAuthed(true)
          else window.api.getChannelAuthStatus(s.cutsChannelId).then(r => setYtCutsAuthed(r.authenticated))
        }
      }
    })
    window.api.getAllSettings().then(setSettings)
    loadWhisperStatus()
    Promise.all([
      window.api.getDefaultResumePrompt(),
      window.api.getDefaultBlogPrompt(),
      window.api.getDefaultYoutubePrompt(),
      window.api.getDefaultInstagramPrompt(),
    ]).then(([resume, blog, youtube, instagram]) => {
      defaultPromptsRef.current = {
        resume_prompt: resume,
        blog_post_prompt: blog,
        youtube_prompt: youtube,
        instagram_prompt: instagram,
      }
    })
  }, [])

  useEffect(() => {
    return window.api.onWhisperSetupStatus((data) => setSetupStatus(data))
  }, [])

  async function loadWhisperStatus() {
    setWhisperStatus(await window.api.getWhisperStatus())
  }

  async function saveSetting(key: string, value: string) {
    await window.api.setSetting(key, value)
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved((prev) => ({ ...prev, [key]: true }))
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000)
  }

  async function chooseOutputDir() {
    const dir = await window.api.openSaveDialog()
    if (dir) saveSetting('output_directory', dir)
  }

  async function installWhisper() {
    setIsInstalling(true); setSetupStatus(null)
    try {
      await window.api.installWhisper()
      await loadWhisperStatus()
    } catch (err) {
      alert(`Erro ao instalar Whisper: ${err}`)
    } finally {
      setIsInstalling(false); setSetupStatus(null)
    }
  }

  async function downloadModel(model: string) {
    setDownloadingModel(model); setSetupStatus(null)
    try {
      await window.api.downloadWhisperModel(model)
      await loadWhisperStatus()
    } catch (err) {
      alert(`Erro ao baixar modelo: ${err}`)
    } finally {
      setDownloadingModel(null); setSetupStatus(null)
    }
  }

  async function saveYtCredentials() {
    if (!ytClientId.trim() || !ytClientSecret.trim()) return
    setYtError(null)
    await window.api.saveYouTubeCredentials(ytClientId.trim(), ytClientSecret.trim())
    setSaved(p => ({ ...p, yt_creds: true }))
    setTimeout(() => setSaved(p => ({ ...p, yt_creds: false })), 2000)
  }

  async function connectYouTube() {
    setYtConnecting(true); setYtError(null)
    try {
      const result = await window.api.connectYouTube()
      setYtConnected(true)
      setYtChannels(result.channels)
    } catch (err) {
      setYtError(err instanceof Error ? err.message : String(err))
    } finally {
      setYtConnecting(false)
    }
  }

  async function disconnectYouTube() {
    await window.api.disconnectYouTube()
    setYtConnected(false); setYtChannels([])
    setYtMainChannel(''); setYtCutsChannel('')
  }

  async function saveChannelConfig() {
    await window.api.saveYouTubeChannelConfig(ytMainChannel, ytCutsChannel)
    setYtSavedChannels(true)
    setTimeout(() => setYtSavedChannels(false), 2000)
  }

  async function connectForChannel(channelId: string) {
    setYtConnectingCh(channelId); setYtError(null)
    try {
      await window.api.connectForChannel(channelId)
      if (channelId === ytMainChannel) setYtMainAuthed(true)
      if (channelId === ytCutsChannel) setYtCutsAuthed(true)
    } catch (err) {
      setYtError(err instanceof Error ? err.message : String(err))
    } finally {
      setYtConnectingCh(null)
    }
  }

  function onMainChannelChange(id: string) {
    setYtMainChannel(id)
    if (!id) { setYtMainAuthed(false); return }
    if (id === ytAuthChannelId) setYtMainAuthed(true)
    else window.api.getChannelAuthStatus(id).then(r => setYtMainAuthed(r.authenticated))
  }

  function onCutsChannelChange(id: string) {
    setYtCutsChannel(id)
    if (!id) { setYtCutsAuthed(false); return }
    if (id === ytAuthChannelId) setYtCutsAuthed(true)
    else window.api.getChannelAuthStatus(id).then(r => setYtCutsAuthed(r.authenticated))
  }

  async function addChannelById() {
    if (!ytExtraId.trim()) return
    setYtExtraLoading(true); setYtExtraError(null)
    try {
      const ch = await window.api.resolveYouTubeChannel(ytExtraId.trim())
      setYtChannels(prev => prev.some(c => c.id === ch.id) ? prev : [...prev, ch])
      setYtExtraId('')
    } catch (err) {
      setYtExtraError(err instanceof Error ? err.message : String(err))
    } finally {
      setYtExtraLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          Configurações
        </h1>
      </header>

      {/* sub-tabs */}
      <div className="flex items-end border-b border-border shrink-0 px-6">
        {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap',
              activeTab === id
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── Geral ── */}
        {activeTab === 'geral' && (
          <div className="space-y-5 max-w-2xl">
            {/* AI Provider */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Geração de Conteúdo com IA
              </h2>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Provedor ativo</label>
                <div className="flex flex-col gap-2">
                  {AI_PROVIDERS.map((p) => {
                    const isActive = (settings.ai_provider ?? 'claude') === p.value
                    return (
                      <label
                        key={p.value}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                          isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                        )}
                      >
                        <input
                          type="radio" name="ai_provider" value={p.value} checked={isActive}
                          onChange={() => { setSettings(prev => ({ ...prev, ai_provider: p.value })); saveSetting('ai_provider', p.value) }}
                          className="accent-primary"
                        />
                        <span className={cn('text-sm', isActive ? 'text-primary font-medium' : 'text-foreground')}>
                          {p.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <ApiKeyField
                label="Claude API Key"
                active={(settings.ai_provider ?? 'claude') === 'claude'}
                value={settings.anthropic_api_key ?? ''}
                placeholder="sk-ant-..."
                show={showApiKey}
                onToggleShow={() => setShowApiKey(v => !v)}
                onChange={v => setSettings(p => ({ ...p, anthropic_api_key: v }))}
                onSave={() => saveSetting('anthropic_api_key', settings.anthropic_api_key ?? '')}
                saved={saved.anthropic_api_key}
                hint="console.anthropic.com → API Keys"
              />
              <ApiKeyField
                label="OpenAI API Key"
                active={settings.ai_provider === 'openai'}
                value={settings.openai_api_key ?? ''}
                placeholder="sk-..."
                show={showOpenAIKey}
                onToggleShow={() => setShowOpenAIKey(v => !v)}
                onChange={v => setSettings(p => ({ ...p, openai_api_key: v }))}
                onSave={() => saveSetting('openai_api_key', settings.openai_api_key ?? '')}
                saved={saved.openai_api_key}
                hint="platform.openai.com → API Keys"
              />
              <ApiKeyField
                label="Gemini API Key"
                active={settings.ai_provider === 'gemini'}
                value={settings.gemini_api_key ?? ''}
                placeholder="AIza..."
                show={showGeminiKey}
                onToggleShow={() => setShowGeminiKey(v => !v)}
                onChange={v => setSettings(p => ({ ...p, gemini_api_key: v }))}
                onSave={() => saveSetting('gemini_api_key', settings.gemini_api_key ?? '')}
                saved={saved.gemini_api_key}
                hint="aistudio.google.com → Get API Key"
              />
            </section>

            {/* WordPress URL */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                URL do WordPress
              </h2>
              <p className="text-xs text-muted-foreground">Usado para abrir o painel ao publicar conteúdo.</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={settings.wordpress_url ?? ''}
                  onChange={e => setSettings(p => ({ ...p, wordpress_url: e.target.value }))}
                  placeholder="https://meusite.com/wp-admin"
                  className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40"
                />
                <SaveButton onClick={() => saveSetting('wordpress_url', settings.wordpress_url ?? '')} saved={saved.wordpress_url} />
              </div>
            </section>

            {/* YouTube */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  YouTube
                </h2>
                {ytConnected && (
                  <button onClick={disconnectYouTube}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                    <Unlink className="w-3.5 h-3.5" />Desconectar
                  </button>
                )}
              </div>

              {/* Step 1: credentials */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Crie credenciais OAuth 2.0 (tipo <strong className="text-foreground">Aplicativo para computador</strong>) no{' '}
                  <button onClick={() => window.api.openExternal('https://console.cloud.google.com/apis/credentials')}
                    className="text-primary underline underline-offset-2">Google Cloud Console</button>{' '}
                  e ative a <strong className="text-foreground">YouTube Data API v3</strong>.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Client ID</label>
                    <input type="text" value={ytClientId} onChange={e => setYtClientId(e.target.value)}
                      placeholder="*.apps.googleusercontent.com"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Client Secret</label>
                    <input type="password" value={ytClientSecret} onChange={e => setYtClientSecret(e.target.value)}
                      placeholder="GOCSPX-…"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/40" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveYtCredentials}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
                    {saved.yt_creds ? <Check className="w-3 h-3 text-primary" /> : <Key className="w-3 h-3" />}
                    {saved.yt_creds ? 'Salvo!' : 'Salvar credenciais'}
                  </button>
                  {!ytConnected && (
                    <button onClick={connectYouTube} disabled={ytConnecting || !ytClientId || !ytClientSecret}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50">
                      {ytConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                      {ytConnecting ? 'Aguardando autorização…' : 'Conectar conta Google'}
                    </button>
                  )}
                  {ytConnected && (
                    <span className="flex items-center gap-1.5 text-xs text-green-500">
                      <CheckCircle2 className="w-3.5 h-3.5" />Conta conectada
                    </span>
                  )}
                </div>
                {ytError && <p className="text-xs text-destructive">{ytError}</p>}
              </div>

              {/* Step 2: channel config — shown whenever connected */}
              {ytConnected && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">Escolha qual canal recebe cada tipo de conteúdo.</p>

                  {/* Channels found automatically */}
                  {ytChannels.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {ytChannels.length} canal{ytChannels.length > 1 ? 'is encontrados' : ' encontrado'} automaticamente.
                      {ytChannels.length < 3 && (
                        <> Canais adicionais (brand accounts) precisam ser adicionados pelo ID — veja abaixo.</>
                      )}
                    </p>
                  )}

                  {/* Manual channel-by-ID for brand accounts */}
                  <div className="space-y-1.5 p-3 bg-secondary/30 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">Adicionar canal por ID</p>
                      <button
                        onClick={() => window.api.openExternal('https://studio.youtube.com')}
                        className="text-xs text-primary underline underline-offset-2">
                        Abrir YouTube Studio
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Canais criados via "Criar canal" no YouTube Studio são brand accounts e não aparecem automaticamente.
                      No YouTube Studio: <strong className="text-foreground">Configurações → Canal → Configurações avançadas</strong> — copie o ID do canal.
                    </p>
                    <div className="flex gap-2 pt-0.5">
                      <input
                        type="text" value={ytExtraId} onChange={e => setYtExtraId(e.target.value)}
                        placeholder="UCxxxxxxxxxxxxxxxxxxxxx"
                        className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40"
                        onKeyDown={e => { if (e.key === 'Enter') addChannelById() }}
                      />
                      <button onClick={addChannelById} disabled={ytExtraLoading || !ytExtraId.trim()}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50 shrink-0">
                        {ytExtraLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                        Adicionar
                      </button>
                    </div>
                    {ytExtraError && <p className="text-xs text-destructive">{ytExtraError}</p>}
                  </div>

                  {ytChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 text-center py-1">
                      Nenhum canal encontrado automaticamente. Adicione pelo ID acima.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Canal principal (episódios)</label>
                        <select value={ytMainChannel} onChange={e => onMainChannelChange(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40">
                          <option value="">Selecionar canal…</option>
                          {ytChannels.map(ch => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
                        </select>
                        {ytMainChannel && !ytMainAuthed && (
                          <button onClick={() => connectForChannel(ytMainChannel)}
                            disabled={ytConnectingCh === ytMainChannel}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg disabled:opacity-50">
                            {ytConnectingCh === ytMainChannel
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Link className="w-3 h-3" />}
                            Autenticar canal
                          </button>
                        )}
                        {ytMainChannel && ytMainAuthed && (
                          <span className="flex items-center gap-1 text-xs text-green-500">
                            <CheckCircle2 className="w-3 h-3" />Autenticado
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Canal de cortes (clipes)</label>
                        <select value={ytCutsChannel} onChange={e => onCutsChannelChange(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40">
                          <option value="">Selecionar canal…</option>
                          {ytChannels.map(ch => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
                        </select>
                        {ytCutsChannel && !ytCutsAuthed && (
                          <button onClick={() => connectForChannel(ytCutsChannel)}
                            disabled={ytConnectingCh === ytCutsChannel}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg disabled:opacity-50">
                            {ytConnectingCh === ytCutsChannel
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Link className="w-3 h-3" />}
                            Autenticar canal
                          </button>
                        )}
                        {ytCutsChannel && ytCutsAuthed && (
                          <span className="flex items-center gap-1 text-xs text-green-500">
                            <CheckCircle2 className="w-3 h-3" />Autenticado
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <button onClick={saveChannelConfig} disabled={!ytMainChannel || !ytCutsChannel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50">
                    {ytSavedChannels ? <Check className="w-3 h-3 text-primary" /> : <Check className="w-3 h-3" />}
                    {ytSavedChannels ? 'Salvo!' : 'Salvar canais'}
                  </button>
                </div>
              )}
            </section>

            {/* Output dir */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                Pasta de saída (clipes exportados)
              </h2>
              <div className="flex gap-2">
                <input
                  type="text" readOnly
                  value={settings.output_directory ?? ''}
                  placeholder="Padrão: ~/Documents/Talkeando Studio"
                  className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none text-muted-foreground"
                />
                <button onClick={chooseOutputDir} className="px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
                  Escolher
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada episódio terá sua própria subpasta: <span className="font-mono">episodes/{'{'}nome-do-episódio{'}'}</span>
              </p>
            </section>
          </div>
        )}

        {/* ── Transcrição ── */}
        {activeTab === 'transcricao' && (
          <div className="space-y-5 max-w-2xl">
            {/* Language */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Idioma padrão da transcrição
              </h2>
              <div className="flex gap-2">
                <select
                  value={settings.default_language ?? 'auto'}
                  onChange={(e) => setSettings((p) => ({ ...p, default_language: e.target.value }))}
                  className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40"
                >
                  {LANGUAGES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <SaveButton onClick={() => saveSetting('default_language', settings.default_language ?? 'auto')} saved={saved.default_language} />
              </div>
            </section>

            {/* Whisper */}
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                Transcrição — Whisper.cpp
              </h2>

              {whisperStatus === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />Verificando...
                </div>
              ) : (
                <div className="space-y-4">
                  {whisperStatus.platform === 'win32' ? (
                    /* ── Windows: download binary directly ── */
                    <>
                      <SetupStep number={1} title="Whisper CLI" done={whisperStatus.whisperInstalled} doneText={whisperStatus.whisperBinaryPath} pendingText="Não instalado">
                        {!whisperStatus.whisperInstalled && (
                          <button onClick={installWhisper} disabled={isInstalling}
                            className="mt-2 flex items-center gap-2 text-xs bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-md disabled:opacity-50">
                            {isInstalling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            {isInstalling ? 'Baixando...' : 'Baixar whisper-cli.exe'}
                          </button>
                        )}
                        {isInstalling && setupStatus?.step === 'install' && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground truncate">{setupStatus.message}</p>
                            <ProgressBar value={setupStatus.progress} />
                          </div>
                        )}
                      </SetupStep>

                      <ModelsStep
                        stepNumber={2}
                        whisperStatus={whisperStatus}
                        setupStatus={setupStatus}
                        downloadingModel={downloadingModel}
                        onDownload={downloadModel}
                        onModelChange={loadWhisperStatus}
                      />
                    </>
                  ) : (
                    /* ── Mac / Linux: Homebrew flow ── */
                    <>
                      <SetupStep number={1} title="Homebrew" done={whisperStatus.brewInstalled} doneText="Instalado" pendingText="Não encontrado">
                        {!whisperStatus.brewInstalled && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Instale em <code className="text-yellow-400">brew.sh</code> e reinicie o app.
                          </p>
                        )}
                      </SetupStep>

                      <SetupStep number={2} title="Whisper.cpp binary" done={whisperStatus.whisperInstalled} doneText={whisperStatus.whisperBinaryPath} pendingText="Não instalado" disabled={!whisperStatus.brewInstalled}>
                        {!whisperStatus.whisperInstalled && whisperStatus.brewInstalled && (
                          <button onClick={installWhisper} disabled={isInstalling}
                            className="mt-2 flex items-center gap-2 text-xs bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-md disabled:opacity-50">
                            {isInstalling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
                            {isInstalling ? 'Instalando via Homebrew...' : 'Instalar whisper-cpp'}
                          </button>
                        )}
                        {isInstalling && setupStatus?.step === 'install' && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground truncate">{setupStatus.message}</p>
                            <ProgressBar value={setupStatus.progress} />
                          </div>
                        )}
                      </SetupStep>

                      <ModelsStep
                        stepNumber={3}
                        whisperStatus={whisperStatus}
                        setupStatus={setupStatus}
                        downloadingModel={downloadingModel}
                        onDownload={downloadModel}
                        onModelChange={loadWhisperStatus}
                      />
                    </>
                  )}

                  {whisperStatus.whisperInstalled && whisperStatus.modelDownloaded && (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm text-primary font-medium">Whisper pronto para usar</p>
                        <p className="text-xs text-muted-foreground">Modelo ativo: <strong>{whisperStatus.currentModel}</strong></p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Prompts de IA ── */}
        {activeTab === 'prompts' && (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e{' '}
              <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code> como variáveis.
              Alterações aqui valem como padrão global para todos os episódios.
            </p>
            <div className="grid grid-cols-2 gap-5">
              {PROMPT_CONFIGS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">{label}</label>
                    <button
                      onClick={() => {
                        const def = defaultPromptsRef.current[key] ?? ''
                        setSettings(p => ({ ...p, [key]: def }))
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Resetar para o padrão"
                    >
                      <RotateCcw className="w-3 h-3" />Resetar
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
                  <textarea
                    value={settings[key] ?? ''}
                    onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                    rows={14}
                    spellCheck={false}
                    className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:border-primary/40 leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <SaveButton
                      onClick={() => saveSetting(key, settings[key] ?? '')}
                      saved={saved[key]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function ModelsStep({
  stepNumber, whisperStatus, setupStatus, downloadingModel, onDownload, onModelChange,
}: {
  stepNumber: number
  whisperStatus: WhisperStatus
  setupStatus: WhisperSetupStatus | null
  downloadingModel: string | null
  onDownload: (model: string) => void
  onModelChange: () => void
}) {
  return (
    <div className={cn('space-y-3', !whisperStatus.whisperInstalled && 'opacity-40 pointer-events-none')}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs font-medium shrink-0">
          {stepNumber}
        </div>
        <span className="text-sm font-medium">Modelos</span>
      </div>

      {whisperStatus.models.some(m => m.downloaded) && (
        <div className="ml-7 space-y-1.5">
          <label className="text-xs text-muted-foreground">Modelo ativo para transcrição</label>
          <select
            value={whisperStatus.currentModel}
            onChange={async (e) => { await window.api.setSetting('whisper_model', e.target.value); onModelChange() }}
            className="w-full bg-secondary border border-primary/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            {whisperStatus.models.filter(m => m.downloaded).map(m => (
              <option key={m.key} value={m.key}>{m.key} — {m.description} ({m.size})</option>
            ))}
          </select>
        </div>
      )}

      <div className="ml-7 space-y-2">
        {whisperStatus.models.map((m) => {
          const isDownloading = downloadingModel === m.key
          const isOtherDownloading = downloadingModel !== null && !isDownloading
          return (
            <div key={m.key} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-secondary/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.key}</span>
                  <span className="text-xs text-muted-foreground">{m.size}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.description}</p>
                {isDownloading && setupStatus?.step === 'download' && (
                  <div className="mt-1.5">
                    <p className="text-xs text-muted-foreground">{setupStatus.message}</p>
                    <ProgressBar value={setupStatus.progress} />
                  </div>
                )}
              </div>
              {m.downloaded ? (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <button onClick={() => onDownload(m.key)} disabled={isDownloading || isOtherDownloading}
                  className="flex items-center gap-1.5 text-xs bg-secondary hover:bg-secondary/70 border border-border px-2.5 py-1 rounded disabled:opacity-40 shrink-0">
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {isDownloading ? 'Baixando...' : 'Baixar'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ApiKeyField({
  label, active, value, placeholder, show, hint,
  onToggleShow, onChange, onSave, saved,
}: {
  label: string; active: boolean; value: string; placeholder: string
  show: boolean; hint: string
  onToggleShow: () => void; onChange: (v: string) => void
  onSave: () => void; saved?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Key className="w-3 h-3" />
        {label}
        {active && <span className="text-primary text-xs">(ativo)</span>}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:border-primary/40"
          />
          <button type="button" onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <SaveButton onClick={onSave} saved={saved} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function SetupStep({ number, title, done, doneText, pendingText, disabled, children }: {
  number: number; title: string; done: boolean; doneText: string
  pendingText: string; disabled?: boolean; children?: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', disabled && 'opacity-40')}>
      <div className="flex items-center gap-2">
        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
          done ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground')}>
          {done ? <Check className="w-3 h-3" /> : number}
        </div>
        <span className="text-sm font-medium">{title}</span>
        <span className={cn('text-xs', done ? 'text-primary' : 'text-muted-foreground')}>
          {done ? '— ' + doneText : pendingText}
        </span>
      </div>
      {children && <div className="ml-7">{children}</div>}
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${value}%` }} />
    </div>
  )
}

function SaveButton({ onClick, saved }: { onClick: () => void; saved?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('px-3 py-2 text-sm rounded-lg transition-colors',
        saved ? 'bg-primary/20 text-primary' : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border')}>
      {saved ? <Check className="w-4 h-4" /> : 'Salvar'}
    </button>
  )
}
