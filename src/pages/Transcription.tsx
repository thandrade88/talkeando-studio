import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FileText, Loader2, Plus, Clock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { formatTimestamp } from '../lib/utils'

interface Block {
  id: string
  label: string
  segmentIds: number[]
}

function formatEta(seconds: number): string {
  if (seconds < 10) return 'menos de 10s'
  if (seconds < 60) return `~${Math.round(seconds)}s`
  return `~${Math.ceil(seconds / 60)} min`
}

function parseStartTime(value: string): number {
  const parts = value.trim().split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

export default function Transcription() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const episodes = useAppStore((s) => s.episodes)
  const selectEpisode = useAppStore((s) => s.selectEpisode)
  const transcribingEpisodeId = useAppStore((s) => s.transcribingEpisodeId)
  const transcriptionStartedAt = useAppStore((s) => s.transcriptionStartedAt)
  const setTranscribingEpisode = useAppStore((s) => s.setTranscribingEpisode)
  const updateEpisode = useAppStore((s) => s.updateEpisode)

  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressStatus, setProgressStatus] = useState('')
  const [eta, setEta] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [startAtInput, setStartAtInput] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([
    { id: '1', label: 'Bloco 1', segmentIds: [] }
  ])

  const episodeId = id ? parseInt(id) : null
  const episode = episodes.find((e) => e.id === episodeId)

  useEffect(() => {
    if (!episodeId) return
    selectEpisode(episodeId)
    window.api.getTranscript(episodeId).then(setSegments)
    if (transcribingEpisodeId === episodeId) setIsTranscribing(true)
  }, [episodeId])

  useEffect(() => {
    const unsubscribe = window.api.onTranscriptionProgress((prog, status) => {
      setProgress(prog)
      setProgressStatus(status)

      if (prog > 3 && prog < 100 && transcriptionStartedAt) {
        const elapsed = (Date.now() - transcriptionStartedAt) / 1000
        setEta(formatEta((elapsed * (100 - prog)) / prog))
      }

      if (prog >= 100) {
        setIsTranscribing(false)
        setEta(null)
        setTranscribingEpisode(null)
        if (episodeId) {
          window.api.getTranscript(episodeId).then(setSegments)
          window.api.getEpisode(episodeId).then((ep) => { if (ep) updateEpisode(ep) })
        }
      }
    })
    return unsubscribe
  }, [episodeId, transcriptionStartedAt])

  async function startTranscription() {
    if (!episodeId) return
    setIsTranscribing(true)
    setProgress(0)
    setEta(null)
    setTranscribingEpisode(episodeId, Date.now())

    const startSeconds = parseStartTime(startAtInput) || undefined

    window.api.startTranscription(episodeId, startSeconds, undefined).catch((err) => {
      setIsTranscribing(false)
      setTranscribingEpisode(null)
      setEta(null)
      alert(`Erro na transcrição: ${err}`)
    })
  }

  async function saveSegment(segId: number) {
    await window.api.updateTranscriptSegment(segId, editText)
    setSegments((prev) => prev.map((s) => (s.id === segId ? { ...s, text: editText } : s)))
    setEditingId(null)
  }

  if (!episode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FileText className="w-10 h-10" />
        <p>Selecione um episódio no Dashboard</p>
        <button onClick={() => navigate('/dashboard')} className="text-primary text-sm underline">
          Ir para Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate max-w-md">{episode.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{segments.length} segmentos</p>
          </div>

          {segments.length === 0 && !isTranscribing && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Optional start-time skip for known music intros */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Iniciar em</label>
                <input
                  type="text"
                  placeholder="0:00"
                  value={startAtInput}
                  onChange={(e) => setStartAtInput(e.target.value)}
                  className="w-16 text-xs font-mono bg-secondary border border-border rounded px-2 py-1 text-center focus:outline-none focus:border-primary/50"
                  title="Pular intro musical (MM:SS ou HH:MM:SS)"
                />
              </div>
              <button
                onClick={startTranscription}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm px-4 py-2 rounded-md"
              >
                <FileText className="w-4 h-4" />
                Transcrever
              </button>
            </div>
          )}

          {segments.length > 0 && !isTranscribing && (
            <button
              onClick={startTranscription}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5"
            >
              Re-transcrever
            </button>
          )}
        </header>

        {isTranscribing && (
          <div className="px-6 py-3 border-b border-border bg-blue-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                <span className="text-sm text-blue-400 truncate">{progressStatus || 'Iniciando...'}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {eta && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {eta} restante
                  </span>
                )}
                <span className="text-xs font-mono text-blue-400/80">{progress}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode navegar para outras telas — a transcrição continua em segundo plano.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {segments.length === 0 && !isTranscribing && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <FileText className="w-8 h-8" />
              <p className="text-sm">Nenhuma transcrição ainda</p>
              <p className="text-xs opacity-60">Whisper ignora automaticamente trechos de música</p>
            </div>
          )}

          {segments.map((seg) => (
            <div key={seg.id} className="flex gap-4 group py-2 px-3 rounded-lg hover:bg-secondary/50">
              <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5 select-none">
                {formatTimestamp(seg.start_time)}
              </span>
              {editingId === seg.id ? (
                <div className="flex-1">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-secondary border border-primary/40 rounded px-2 py-1 text-sm resize-none focus:outline-none"
                    rows={2}
                    onKeyDown={(e) => {
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

      <aside className="w-44 border-l border-border flex flex-col shrink-0 overflow-hidden">
        <div className="px-3 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Blocos</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {blocks.map((block) => (
            <div key={block.id} className="px-3 py-2 rounded bg-secondary/50 text-sm cursor-pointer hover:bg-secondary">
              {block.label}
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-border">
          <button
            onClick={() => setBlocks((prev) => [...prev, { id: String(Date.now()), label: `Bloco ${prev.length + 1}`, segmentIds: [] }])}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded hover:border-primary/40 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Novo Bloco
          </button>
        </div>
      </aside>
    </div>
  )
}
