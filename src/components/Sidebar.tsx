import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Settings, Mic2, Loader2, ChevronDown, ChevronRight, FileText, SlidersHorizontal, Plus } from 'lucide-react'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/useAppStore'

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  const podcasts           = useAppStore((s) => s.podcasts)
  const selectedPodcastId  = useAppStore((s) => s.selectedPodcastId)
  const selectPodcast      = useAppStore((s) => s.selectPodcast)
  const addPodcast         = useAppStore((s) => s.addPodcast)

  const transcribingEpisodeId = useAppStore((s) => s.transcribingEpisodeId)
  const txProgress = useAppStore((s) => s.txProgress)
  const txStatus   = useAppStore((s) => s.txStatus)
  const txEta      = useAppStore((s) => s.txEta)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function openPodcast(id: number) {
    selectPodcast(id)
    navigate('/dashboard')
  }

  function openPodcastSettings(id: number) {
    selectPodcast(id)
    navigate(`/podcast/${id}/settings`)
  }

  async function createPodcast() {
    const name = newName.trim()
    if (!name) { setCreating(false); return }
    const podcast = await window.api.createPodcast(name)
    addPodcast(podcast)
    selectPodcast(podcast.id)
    setNewName('')
    setCreating(false)
    navigate('/dashboard')
  }

  return (
    <aside className="w-56 flex flex-col bg-card border-r border-border shrink-0">
      <div className="drag-region h-8 shrink-0" />

      <div className="px-4 pb-5 no-drag">
        <div className="flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm tracking-wide">
            <span className="text-foreground">TALKEANDO</span>{' '}
            <span className="text-primary">STUDIO</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 no-drag overflow-y-auto">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Podcasts
        </p>

        {podcasts.map((podcast) => {
          const isSelected = podcast.id === selectedPodcastId
          const onDashboard = isSelected && location.pathname.startsWith('/episode') === false && location.pathname === '/dashboard'
          const onWorkspace = isSelected && location.pathname.startsWith('/episode')
          const episodesActive = onDashboard || onWorkspace
          const settingsActive = location.pathname === `/podcast/${podcast.id}/settings`

          return (
            <div key={podcast.id}>
              <button
                onClick={() => openPodcast(podcast.id)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                  episodesActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-foreground hover:bg-secondary'
                )}
              >
                {isSelected ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                <span className="flex-1 truncate">{podcast.name}</span>
              </button>

              {isSelected && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  <button
                    onClick={() => openPodcast(podcast.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                      episodesActive
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    Episódios
                  </button>
                  <button
                    onClick={() => openPodcastSettings(podcast.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                      settingsActive
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    Configurações do podcast
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={createPodcast}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createPodcast()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            placeholder="Nome do podcast"
            className="w-full px-2 py-1.5 rounded-md text-sm bg-secondary border border-primary/40 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo podcast
          </button>
        )}

        <div className="pt-3 mt-2 border-t border-border">
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Configurações do app
          </NavLink>
        </div>
      </nav>

      {transcribingEpisodeId !== null && (
        <div className="px-3 py-2.5 mx-2 mb-2 bg-blue-500/10 border border-blue-500/20 rounded-lg no-drag">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span className="text-xs text-blue-400 truncate">
              {txProgress > 0 ? `${txProgress}%` : 'Transcrevendo...'}
            </span>
          </div>
          {txProgress > 0 && (
            <div className="mt-1.5">
              <div className="h-1 bg-blue-500/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all duration-300"
                  style={{ width: `${txProgress}%` }}
                />
              </div>
              {txEta && <p className="text-[10px] text-blue-400/70 mt-1">{txEta}</p>}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border no-drag">
        <p className="text-xs text-muted-foreground">v2.0.0</p>
      </div>
    </aside>
  )
}
