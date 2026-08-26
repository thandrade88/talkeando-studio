import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Mic2, FileText, Sparkles, Scissors, Trash2, ChevronRight, Loader2, LayoutList, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn, formatDuration, formatRelativeDate, statusLabel } from '../lib/utils'

const STATUS_COLOR: Record<string, string> = {
  imported: 'text-yellow-500',
  transcribing: 'text-blue-500 animate-pulse',
  transcribed: 'text-cyan-400',
  ready: 'text-primary'
}

type ViewMode = 'list' | 'grid'
const VIEW_STORAGE_KEY = 'talkeando_dashboard_view'

export default function Dashboard() {
  const navigate = useNavigate()
  const { episodes, podcasts, selectedPodcastId, addEpisode, removeEpisode, selectEpisode, updateEpisode, transcribingEpisodeId } = useAppStore()
  const podcast = podcasts.find(p => p.id === selectedPodcastId)
  const [importing, setImporting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [importStatus, setImportStatus] = useState<Record<number, string>>({})
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || 'list'
  )

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  useEffect(() => {
    return window.api.onImportProgress((episodeId, status) => {
      if (status === null) {
        setImportStatus(prev => { const n = { ...prev }; delete n[episodeId]; return n })
        window.api.getEpisode(episodeId).then(ep => { if (ep) updateEpisode(ep) })
      } else {
        setImportStatus(prev => ({ ...prev, [episodeId]: status }))
      }
    })
  }, [])

  async function handleImport() {
    if (!selectedPodcastId) return
    const filePath = await window.api.openFileDialog()
    if (!filePath) return
    setImporting(true)
    try {
      const episode = await window.api.importEpisode(filePath, selectedPodcastId)
      addEpisode(episode)
    } catch (err) {
      alert(`Erro ao importar: ${err}`)
    } finally {
      setImporting(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave() {
    setIsDragOver(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file || !selectedPodcastId) return
    setImporting(true)
    try {
      const episode = await window.api.importEpisode(file.path, selectedPodcastId)
      addEpisode(episode)
    } catch (err) {
      alert(`Erro ao importar: ${err}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (importStatus[id]) return
    if (transcribingEpisodeId === id) return
    if (!confirm('Remover este episódio?')) return
    await window.api.deleteEpisode(id)
    removeEpisode(id)
  }

  function openEpisode(episode: Episode) {
    selectEpisode(episode.id)
    navigate(`/episode/${episode.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold">{podcast?.name ?? 'Episódios'}</h1>
          <p className="text-xs text-muted-foreground">{episodes.length} episódio(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 bg-secondary border border-border rounded-md p-0.5">
            <button
              onClick={() => setView('list')}
              title="Ver como lista"
              aria-pressed={view === 'list'}
              className={cn(
                'p-1.5 rounded transition-colors',
                view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              title="Ver em grade"
              aria-pressed={view === 'grid'}
              className={cn(
                'p-1.5 rounded transition-colors',
                view === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleImport}
            disabled={importing || !selectedPodcastId}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {episodes.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl transition-colors cursor-pointer',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
            onClick={handleImport}
          >
            <Mic2 className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">Arraste um episódio aqui</p>
            <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-3">MP3, MP4, WAV, M4A, OGG, FLAC</p>
          </div>
        ) : (
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'mb-4 flex items-center gap-3 p-3 border-2 border-dashed rounded-lg text-sm text-muted-foreground transition-colors cursor-pointer',
                isDragOver
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              )}
              onClick={handleImport}
            >
              <Upload className="w-4 h-4 shrink-0" />
              Solte um arquivo de áudio/vídeo aqui para importar
            </div>

            {view === 'list' ? (
              <div className="space-y-2">
                {episodes.map((ep) => {
                  const extracting = Boolean(importStatus[ep.id])
                  const busy = extracting || transcribingEpisodeId === ep.id
                  return (
                  <div
                    key={ep.id}
                    onClick={() => !extracting && openEpisode(ep)}
                    className={cn(
                      'group flex items-center gap-4 p-4 bg-card border rounded-lg transition-all',
                      extracting
                        ? 'border-primary/30 bg-primary/5 cursor-default'
                        : 'border-border hover:border-primary/40 hover:bg-card/80 cursor-pointer'
                    )}
                  >
                    <div className={cn('w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0', extracting ? 'bg-primary/20' : 'bg-primary/10')}>
                      {ep.thumbnail_url ? (
                        <img src={ep.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : extracting ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : (
                        <Mic2 className="w-5 h-5 text-primary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ep.title}</p>
                      {extracting ? (
                        <div className="mt-1.5 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-primary/80 truncate">{importStatus[ep.id]}</span>
                          </div>
                          <div className="h-1 bg-primary/10 rounded-full overflow-hidden w-48 max-w-full">
                            <div className="h-full bg-primary/40 rounded-full animate-pulse" style={{ width: '60%' }} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={cn('text-xs', STATUS_COLOR[ep.status] ?? 'text-muted-foreground')}>
                            {statusLabel(ep.status)}
                          </span>
                          {ep.duration > 0 && (
                            <span className="text-xs text-muted-foreground">{formatDuration(ep.duration)}</span>
                          )}
                          {ep.audio_path && (
                            <span className="text-xs text-green-500/70">áudio pronto</span>
                          )}
                          <span className="text-xs text-muted-foreground">{formatRelativeDate(ep.created_at)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {ep.transcript_count != null && ep.transcript_count > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {ep.transcript_count}
                        </span>
                      )}
                      {ep.content_count != null && ep.content_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {ep.content_count}
                        </span>
                      )}
                      {ep.clip_count != null && ep.clip_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          {ep.clip_count}
                        </span>
                      )}
                      <button
                        onClick={(e) => handleDelete(ep.id, e)}
                        disabled={busy}
                        title={busy ? 'Aguarde o processo terminar antes de remover' : undefined}
                        className={cn(
                          'p-1 transition-all',
                          busy
                            ? 'opacity-20 cursor-not-allowed'
                            : 'opacity-0 group-hover:opacity-100 hover:text-destructive'
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {episodes.map((ep) => {
                  const extracting = Boolean(importStatus[ep.id])
                  const busy = extracting || transcribingEpisodeId === ep.id
                  return (
                  <div
                    key={ep.id}
                    onClick={() => !extracting && openEpisode(ep)}
                    className={cn(
                      'group flex flex-col bg-card border rounded-lg overflow-hidden transition-all',
                      extracting
                        ? 'border-primary/30 bg-primary/5 cursor-default'
                        : 'border-border hover:border-primary/40 hover:bg-card/80 cursor-pointer'
                    )}
                  >
                    <div className="relative aspect-video bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {ep.thumbnail_url ? (
                        <img src={ep.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : extracting ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      ) : (
                        <Mic2 className="w-8 h-8 text-primary/50" />
                      )}
                      <button
                        onClick={(e) => handleDelete(ep.id, e)}
                        disabled={busy}
                        title={busy ? 'Aguarde o processo terminar antes de remover' : undefined}
                        className={cn(
                          'absolute top-1.5 right-1.5 p-1.5 rounded-md bg-black/60 text-white backdrop-blur-sm transition-all',
                          busy ? 'hidden' : 'opacity-0 group-hover:opacity-100 hover:text-destructive'
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 p-3 min-w-0">
                      <p className="text-sm font-medium truncate">{ep.title}</p>
                      {extracting ? (
                        <span className="text-xs text-primary/80 truncate">{importStatus[ep.id]}</span>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-xs', STATUS_COLOR[ep.status] ?? 'text-muted-foreground')}>
                            {statusLabel(ep.status)}
                          </span>
                          {ep.duration > 0 && (
                            <span className="text-xs text-muted-foreground">{formatDuration(ep.duration)}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                        {ep.transcript_count != null && ep.transcript_count > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {ep.transcript_count}
                          </span>
                        )}
                        {ep.content_count != null && ep.content_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {ep.content_count}
                          </span>
                        )}
                        {ep.clip_count != null && ep.clip_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Scissors className="w-3 h-3" />
                            {ep.clip_count}
                          </span>
                        )}
                        <span className="ml-auto shrink-0">{formatRelativeDate(ep.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
