import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon, Globe, Check, Loader2, CheckCircle2, RotateCcw,
  Youtube, Link, Unlink, ArrowLeft, Key,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { SaveButton } from '../components/SettingsUI'

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

type Tab = 'wordpress' | 'youtube' | 'prompts'
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'wordpress', label: 'WordPress', icon: Globe },
  { id: 'youtube',   label: 'YouTube',   icon: Youtube },
  { id: 'prompts',   label: 'Prompts de IA', icon: SettingsIcon },
]

export default function PodcastSettings() {
  const { podcastId: podcastIdParam } = useParams<{ podcastId: string }>()
  const podcastId = Number(podcastIdParam)
  const navigate = useNavigate()

  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('wordpress')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, string>>({})

  // WordPress
  const [wpConnected, setWpConnected] = useState(false)
  const [wpTesting, setWpTesting]     = useState(false)
  const [wpSiteName, setWpSiteName]   = useState<string | null>(null)
  const [wpUserName, setWpUserName]   = useState<string | null>(null)
  const [wpError, setWpError]         = useState<string | null>(null)

  // YouTube
  const [ytClientId, setYtClientId]         = useState('')
  const [ytClientSecret, setYtClientSecret] = useState('')
  const [ytConnecting, setYtConnecting]     = useState(false)
  const [ytCredsSaved, setYtCredsSaved]     = useState(false)
  const [ytClientConfigured, setYtClientConfigured] = useState(false)
  const [ytConnected, setYtConnected] = useState(false)
  const [ytChannels, setYtChannels]   = useState<YouTubeChannel[]>([])
  const [ytMainChannel, setYtMainChannel] = useState('')
  const [ytCutsChannel, setYtCutsChannel] = useState('')
  const [ytSavedChannels, setYtSavedChannels] = useState(false)
  const [ytMainAuthed, setYtMainAuthed] = useState(false)
  const [ytCutsAuthed, setYtCutsAuthed] = useState(false)
  const [ytAuthChannelId, setYtAuthChannelId] = useState<string | null>(null)
  const [ytConnectingCh, setYtConnectingCh]   = useState<string | null>(null)
  const [ytError, setYtError] = useState<string | null>(null)
  const [ytExtraId, setYtExtraId]           = useState('')
  const [ytExtraLoading, setYtExtraLoading] = useState(false)
  const [ytExtraError, setYtExtraError]     = useState<string | null>(null)

  useEffect(() => {
    if (!podcastId) return
    window.api.getPodcast(podcastId).then(setPodcast).catch(() => setPodcast(null))
    window.api.getPodcastSettings(podcastId).then(setSettings)

    window.api.getYouTubeStatus(podcastId).then(async s => {
      if (s.clientId) setYtClientId(s.clientId)
      setYtClientConfigured(!!s.clientId)
      setYtConnected(s.connected)
      if (s.authChannelId) setYtAuthChannelId(s.authChannelId)
      if (s.mainChannelId) setYtMainChannel(s.mainChannelId)
      if (s.cutsChannelId) setYtCutsChannel(s.cutsChannelId)
      if (!s.connected) return
      try {
        const channels = await window.api.listYouTubeChannels()
        const ids = new Set(channels.map(c => c.id))
        const missing = [s.mainChannelId, s.cutsChannelId]
          .filter((id): id is string => !!id && !ids.has(id))
          .filter((id, i, a) => a.indexOf(id) === i)
        for (const id of missing) {
          try { channels.push(await window.api.resolveYouTubeChannel(id)) } catch { /* no longer accessible */ }
        }
        setYtChannels(channels)
      } catch { /* not authenticated */ }
      if (s.mainChannelId) {
        if (s.mainChannelId === s.authChannelId) setYtMainAuthed(true)
        else window.api.getChannelAuthStatus(s.mainChannelId).then(r => setYtMainAuthed(r.authenticated))
      }
      if (s.cutsChannelId) {
        if (s.cutsChannelId === s.authChannelId) setYtCutsAuthed(true)
        else window.api.getChannelAuthStatus(s.cutsChannelId).then(r => setYtCutsAuthed(r.authenticated))
      }
    })

    window.api.isWordPressConfigured(podcastId).then(async configured => {
      if (!configured) return
      try {
        const result = await window.api.testWordPressConnection(podcastId)
        setWpConnected(result.connected)
        setWpSiteName(result.siteName)
        setWpUserName(result.userName)
      } catch { /* saved but unreachable — user can retry */ }
    })

    Promise.all([
      window.api.getDefaultResumePrompt(),
      window.api.getDefaultBlogPrompt(),
      window.api.getDefaultYoutubePrompt(),
      window.api.getDefaultInstagramPrompt(),
    ]).then(([resume, blog, youtube, instagram]) => {
      setDefaultPrompts({
        resume_prompt: resume, blog_post_prompt: blog,
        youtube_prompt: youtube, instagram_prompt: instagram,
      })
    })
  }, [podcastId])

  async function saveSetting(key: string, value: string) {
    await window.api.setPodcastSetting(podcastId, key, value)
    setSettings(p => ({ ...p, [key]: value }))
    setSaved(p => ({ ...p, [key]: true }))
    setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000)
  }

  async function connectWordPress() {
    const url = settings.wordpress_url?.trim()
    const user = settings.wordpress_user?.trim()
    const appPassword = settings.wordpress_app_password?.trim()
    if (!url || !user || !appPassword) { setWpError('Preencha todos os campos.'); return }
    setWpTesting(true); setWpError(null)
    try {
      const result = await window.api.testWordPressConnection(podcastId, { url, user, appPassword })
      setWpConnected(result.connected)
      setWpSiteName(result.siteName)
      setWpUserName(result.userName)
    } catch (err) {
      setWpConnected(false); setWpSiteName(null); setWpUserName(null)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rest_not_logged_in') || msg.includes('rest_forbidden'))
        setWpError('Autenticação falhou. Verifique se Application Passwords estão ativadas no WordPress e se o usuário/senha estão corretos.')
      else if (msg.includes('401'))
        setWpError('Credenciais inválidas. Verifique usuário e Application Password.')
      else if (msg.includes('404') || msg.includes('ENOTFOUND'))
        setWpError('URL não encontrada. Verifique o endereço do site.')
      else if (msg.includes('fetch') || msg.includes('ECONNREFUSED'))
        setWpError('Não foi possível conectar. Verifique a URL e se o site está online.')
      else setWpError(msg)
    } finally { setWpTesting(false) }
  }

  async function disconnectWordPress() {
    await window.api.setPodcastSetting(podcastId, 'wordpress_url', '')
    await window.api.setPodcastSetting(podcastId, 'wordpress_user', '')
    await window.api.setPodcastSetting(podcastId, 'wordpress_app_password', '')
    setSettings(p => ({ ...p, wordpress_url: '', wordpress_user: '', wordpress_app_password: '' }))
    setWpConnected(false); setWpSiteName(null); setWpUserName(null)
  }

  async function saveYtCredentials() {
    if (!ytClientId.trim() || !ytClientSecret.trim()) return
    setYtError(null)
    await window.api.saveYouTubeCredentials(ytClientId.trim(), ytClientSecret.trim())
    setYtClientConfigured(true)
    setYtCredsSaved(true)
    setTimeout(() => setYtCredsSaved(false), 2000)
  }

  async function connectYouTube() {
    setYtConnecting(true); setYtError(null)
    try {
      const { channels } = await window.api.connectYouTube()
      setYtConnected(true)
      setYtChannels(channels)
    } catch (err) {
      setYtError(err instanceof Error ? err.message : String(err))
    } finally {
      setYtConnecting(false)
    }
  }

  async function disconnectYouTube() {
    await window.api.disconnectYouTube()
    setYtConnected(false)
    setYtChannels([])
    setYtMainAuthed(false)
    setYtCutsAuthed(false)
  }

  async function saveChannelConfig() {
    await window.api.saveYouTubeChannelConfig(podcastId, ytMainChannel, ytCutsChannel)
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
    } finally { setYtConnectingCh(null) }
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
    } finally { setYtExtraLoading(false) }
  }

  if (!podcastId) return null

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border shrink-0">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />Voltar
        </button>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          Configurações — {podcast?.name ?? '...'}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          WordPress, YouTube e prompts de IA valem só para este podcast.
        </p>
      </header>

      <div className="flex items-end border-b border-border shrink-0 px-6">
        {TABS.map(({ id, label, icon: Icon }) => (
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
        {activeTab === 'wordpress' && (
          <div className="max-w-2xl">
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />WordPress
                </h2>
                {wpConnected && (
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />Conectado
                  </span>
                )}
              </div>

              {wpConnected && wpSiteName ? (
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{wpSiteName}</p>
                    {wpUserName && <p className="text-xs text-muted-foreground">Logado como {wpUserName}</p>}
                  </div>
                  <button onClick={disconnectWordPress}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                    <Unlink className="w-3.5 h-3.5" />Desconectar
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Conecte o WordPress deste podcast para publicar e gerenciar posts diretamente do Studio.
                    Crie uma <strong className="text-foreground">Application Password</strong> em
                    wp-admin → Usuários → Perfil → Senhas de aplicação.
                  </p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">URL do site</label>
                    <input
                      type="url"
                      value={settings.wordpress_url ?? ''}
                      onChange={e => setSettings(p => ({ ...p, wordpress_url: e.target.value }))}
                      placeholder="https://meusite.com"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Usuário</label>
                      <input
                        type="text"
                        value={settings.wordpress_user ?? ''}
                        onChange={e => setSettings(p => ({ ...p, wordpress_user: e.target.value }))}
                        placeholder="admin"
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Application Password</label>
                      <input
                        type="password"
                        value={settings.wordpress_app_password ?? ''}
                        onChange={e => setSettings(p => ({ ...p, wordpress_app_password: e.target.value }))}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/40"
                      />
                    </div>
                  </div>
                  {wpError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <p className="text-xs text-destructive">{wpError}</p>
                    </div>
                  )}
                  <button onClick={connectWordPress} disabled={wpTesting}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                    {wpTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                    {wpTesting ? 'Conectando...' : 'Conectar ao WordPress'}
                  </button>
                </>
              )}
            </section>
          </div>
        )}

        {activeTab === 'youtube' && (
          <div className="max-w-2xl">
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />YouTube
                </h2>
                {ytConnected && (
                  <button onClick={disconnectYouTube}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                    <Unlink className="w-3.5 h-3.5" />Desconectar
                  </button>
                )}
              </div>

              {!ytConnected && (
                <>
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
                      {ytCredsSaved ? <Check className="w-3 h-3 text-primary" /> : <Key className="w-3 h-3" />}
                      {ytCredsSaved ? 'Salvo!' : 'Salvar credenciais'}
                    </button>
                    <button onClick={connectYouTube} disabled={ytConnecting || !ytClientConfigured}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50">
                      {ytConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                      {ytConnecting ? 'Aguardando autorização…' : 'Conectar conta Google'}
                    </button>
                  </div>
                  {ytError && <p className="text-xs text-destructive">{ytError}</p>}
                </>
              )}

              {ytConnected && (
                <>
                  <p className="text-xs text-muted-foreground">Escolha qual canal recebe cada tipo de conteúdo deste podcast.</p>

                  <div className="space-y-1.5 p-3 bg-secondary/30 rounded-lg border border-border/50">
                    <p className="text-xs font-medium text-foreground">Adicionar canal por ID</p>
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

                  {ytChannels.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 text-center py-1">
                      Nenhum canal encontrado automaticamente. Adicione pelo ID acima.
                    </p>
                  )}

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
                          {ytConnectingCh === ytMainChannel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
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
                          {ytConnectingCh === ytCutsChannel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
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
                  {ytError && <p className="text-xs text-destructive">{ytError}</p>}
                  <button onClick={saveChannelConfig} disabled={!ytMainChannel || !ytCutsChannel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-50">
                    {ytSavedChannels ? <Check className="w-3 h-3 text-primary" /> : <Check className="w-3 h-3" />}
                    {ytSavedChannels ? 'Salvo!' : 'Salvar canais'}
                  </button>
                </>
              )}
            </section>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-secondary px-1 rounded">{'{{title}}'}</code> e{' '}
              <code className="bg-secondary px-1 rounded">{'{{transcript}}'}</code> como variáveis.
              Valem só para os episódios deste podcast.
            </p>
            <div className="grid grid-cols-2 gap-5">
              {PROMPT_CONFIGS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">{label}</label>
                    <button
                      onClick={() => setSettings(p => ({ ...p, [key]: defaultPrompts[key] ?? '' }))}
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
                    <SaveButton onClick={() => saveSetting(key, settings[key] ?? '')} saved={saved[key]} />
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
