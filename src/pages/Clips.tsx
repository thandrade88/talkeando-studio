import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Scissors, Plus, Trash2, Download, Loader2, FolderOpen } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { formatTimestamp } from '../lib/utils'
import { cn } from '../lib/utils'

export default function Clips() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const episodes = useAppStore((s) => s.episodes)
  const selectEpisode = useAppStore((s) => s.selectEpisode)

  const [clips, setClips] = useState<Clip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(30)
  const [currentTime, setCurrentTime] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const episodeId = id ? parseInt(id) : null
  const episode = episodes.find((e) => e.id === episodeId)
  const selectedClip = clips.find((c) => c.id === selectedClipId)

  useEffect(() => {
    if (!episodeId) return
    selectEpisode(episodeId)
    window.api.getClips(episodeId).then(setClips)
  }, [episodeId])

  useEffect(() => {
    if (!episode?.file_path) return
    const audio = new Audio(`app-media://${episode.file_path}`)
    audioRef.current = audio
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime)
    return () => { audio.pause(); audio.src = '' }
  }, [episode?.file_path])

  useEffect(() => {
    const unsub = window.api.onClipProgress((prog) => setExportProgress(prog))
    return unsub
  }, [])

  async function createClip() {
    if (!episodeId || !newTitle.trim()) return
    const clip = await window.api.createClip(episodeId, startTime, endTime, newTitle.trim())
    setClips((prev) => [...prev, clip])
    setNewTitle('')
    setSelectedClipId(clip.id)
  }

  async function exportClip(clipId: number) {
    setIsExporting(true)
    setExportProgress(0)
    try {
      const result = await window.api.exportClip(clipId)
      if (result.success) {
        alert(`Clipe exportado: ${result.filePath}`)
      }
    } catch (err) {
      alert(`Erro ao exportar: ${err}`)
    } finally {
      setIsExporting(false)
    }
  }

  async function deleteClip(clipId: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remover este clipe?')) return
    await window.api.deleteClip(clipId)
    setClips((prev) => prev.filter((c) => c.id !== clipId))
    if (selectedClipId === clipId) setSelectedClipId(null)
  }

  function setMarkIn() {
    setStartTime(Math.floor(currentTime * 10) / 10)
  }
  function setMarkOut() {
    setEndTime(Math.ceil(currentTime * 10) / 10)
  }

  if (!episode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Scissors className="w-10 h-10" />
        <p>Selecione um episódio no Dashboard</p>
        <button onClick={() => navigate('/dashboard')} className="text-primary text-sm underline">
          Ir para Dashboard
        </button>
      </div>
    )
  }

  const duration = selectedClip ? selectedClip.end_time - selectedClip.start_time : endTime - startTime

  return (
    <div className="flex h-full">
      <aside className="w-64 border-r border-border flex flex-col shrink-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">{clips.length} clipe(s)</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {clips.map((clip) => (
            <div
              key={clip.id}
              onClick={() => setSelectedClipId(clip.id)}
              className={cn(
                'group px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                selectedClipId === clip.id
                  ? 'bg-primary/15 border border-primary/30'
                  : 'hover:bg-secondary'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate flex-1">{clip.title}</p>
                <button
                  onClick={(e) => deleteClip(clip.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(clip.start_time)} → {formatTimestamp(clip.end_time)}
              </p>
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-border">
          <div className="space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título do novo clipe"
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary/40"
              onKeyDown={(e) => e.key === 'Enter' && createClip()}
            />
            <div className="flex gap-1">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Início</span>
                <input
                  type="number"
                  value={startTime}
                  onChange={(e) => setStartTime(parseFloat(e.target.value))}
                  className="bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none"
                  step="0.1"
                  min="0"
                />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Fim</span>
                <input
                  type="number"
                  value={endTime}
                  onChange={(e) => setEndTime(parseFloat(e.target.value))}
                  className="bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none"
                  step="0.1"
                  min="0"
                />
              </div>
            </div>
            <button
              onClick={createClip}
              disabled={!newTitle.trim()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              Novo Clipe
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedClip ? (
          <>
            <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h1 className="text-sm font-semibold">{selectedClip.title}</h1>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(selectedClip.start_time)} → {formatTimestamp(selectedClip.end_time)}
                  {' · '}{formatTimestamp(duration)} de duração
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedClip.file_path && (
                  <button
                    onClick={() => window.api.revealInFinder(selectedClip.file_path)}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Abrir
                  </button>
                )}
                <button
                  onClick={() => exportClip(selectedClip.id)}
                  disabled={isExporting}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting ? `Exportando ${exportProgress}%` : 'Exportar'}
                </button>
              </div>
            </header>

            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-lg space-y-4">
                <div className="aspect-video bg-black rounded-xl border border-border flex items-center justify-center">
                  {episode.file_path.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? (
                    <video
                      src={`app-media://${episode.file_path}#t=${selectedClip.start_time},${selectedClip.end_time}`}
                      controls
                      className="w-full h-full rounded-xl"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Scissors className="w-12 h-12 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Arquivo de áudio</p>
                      <audio
                        src={`app-media://${episode.file_path}`}
                        controls
                        className="mt-3 w-full"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="text-sm font-mono mt-0.5">{formatTimestamp(selectedClip.start_time)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Fim</p>
                    <p className="text-sm font-mono mt-0.5">{formatTimestamp(selectedClip.end_time)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Duração</p>
                    <p className="text-sm font-mono mt-0.5">{formatTimestamp(duration)}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Scissors className="w-10 h-10" />
            <p className="text-sm">Selecione ou crie um clipe</p>
          </div>
        )}
      </div>
    </div>
  )
}
