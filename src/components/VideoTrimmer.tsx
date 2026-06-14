import { useRef, useState, useEffect, useCallback } from 'react'
import { SkipBack, SkipForward, Film } from 'lucide-react'
import { formatTimestamp } from '../lib/utils'

interface Props {
  filePath: string
  trimStart: number
  trimEnd: number
  onTrimStartChange: (t: number) => void
  onTrimEndChange: (t: number) => void
  onDurationLoaded: (d: number) => void
  seekRef?: React.MutableRefObject<((t: number) => void) | null>
}

export default function VideoTrimmer({
  filePath,
  trimStart,
  trimEnd,
  onTrimStartChange,
  onTrimEndChange,
  onDurationLoaded,
  seekRef,
}: Props) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | 'playhead' | null>(null)
  const durationRef = useRef(0)
  const extractTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSeekTime = useRef(0)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [frame, setFrame] = useState<string | null>(null)
  const [loadingFrame, setLoadingFrame] = useState(false)

  // Probe duration and extract first frame on mount / file change
  useEffect(() => {
    let cancelled = false
    setFrame(null)
    setDuration(0)
    setCurrentTime(0)
    durationRef.current = 0

    Promise.all([
      window.api.getMediaDuration(filePath),
      window.api.extractFrame(filePath, 0),
    ]).then(([d, dataUrl]) => {
      if (cancelled) return
      if (dataUrl) setFrame(dataUrl)
      if (d && isFinite(d) && d > 0) {
        durationRef.current = d
        setDuration(d)
        onDurationLoaded(d)
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [filePath])

  // Allow Transcription.tsx to seed the duration from episode.duration
  useEffect(() => {
    if (trimEnd > 0 && durationRef.current === 0) {
      durationRef.current = trimEnd
      setDuration(trimEnd)
    }
  }, [trimEnd])

  function extractFrame(t: number, delay = 150) {
    if (extractTimer.current) clearTimeout(extractTimer.current)
    latestSeekTime.current = t
    extractTimer.current = setTimeout(async () => {
      const target = latestSeekTime.current
      setLoadingFrame(true)
      const dataUrl = await window.api.extractFrame(filePath, target).catch(() => null)
      setLoadingFrame(false)
      setFrame(dataUrl)
    }, delay)
  }

  const seek = useCallback((t: number, immediate = false) => {
    const clamped = Math.max(0, Math.min(t, durationRef.current || trimEnd || 9999))
    setCurrentTime(clamped)
    extractFrame(clamped, immediate ? 0 : 150)
  }, [filePath, trimEnd])

  useEffect(() => {
    if (seekRef) seekRef.current = seek
    return () => { if (seekRef) seekRef.current = null }
  })

  function xToTime(clientX: number): number {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const d = durationRef.current
    if (d === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * d
  }

  function handleTimelinePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    const t = xToTime(e.clientX)
    seek(t)
    draggingRef.current = 'playhead'
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleHandlePointerDown(e: React.PointerEvent, which: 'start' | 'end') {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = which
    timelineRef.current?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const t = xToTime(e.clientX)
    if (draggingRef.current === 'start') {
      onTrimStartChange(Math.max(0, Math.min(t, trimEnd - 2)))
      setCurrentTime(t)
      extractFrame(t, 200)
    } else if (draggingRef.current === 'end') {
      onTrimEndChange(Math.max(trimStart + 2, Math.min(t, durationRef.current)))
      setCurrentTime(t)
      extractFrame(t, 200)
    } else {
      setCurrentTime(t)
      extractFrame(t, 150)
    }
  }

  function handlePointerUp() {
    draggingRef.current = null
  }

  const d = duration || trimEnd || 0
  const startPct = d > 0 ? (trimStart / d) * 100 : 0
  const endPct = d > 0 ? (trimEnd / d) * 100 : 100
  const playPct = d > 0 ? (currentTime / d) * 100 : 0

  return (
    <div className="border-t border-border bg-card shrink-0">
      {/* Frame preview */}
      <div className="relative w-full bg-black flex items-center justify-center" style={{ height: 180 }}>
        {frame ? (
          <img
            src={frame}
            alt="frame"
            className="max-h-full max-w-full object-contain"
            style={{ opacity: loadingFrame ? 0.6 : 1, transition: 'opacity 0.1s' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <Film className="w-8 h-8" />
            <span className="text-xs">Carregando preview...</span>
          </div>
        )}
        {loadingFrame && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        {/* Current time overlay */}
        <div className="absolute bottom-2 right-2 font-mono text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
          {formatTimestamp(currentTime)}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 pb-1" style={{ paddingTop: 20 }}>
        <div
          ref={timelineRef}
          className="relative select-none"
          style={{ height: 32, touchAction: 'none' }}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Track */}
          <div className="absolute left-0 right-0 bottom-0 rounded overflow-hidden" style={{ height: 20 }}>
            <div className="absolute inset-0 bg-secondary/70" />
            <div className="absolute top-0 bottom-0 left-0 bg-black/55" style={{ width: `${startPct}%` }} />
            <div
              className="absolute top-0 bottom-0 bg-primary/35"
              style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
            />
            <div className="absolute top-0 bottom-0 right-0 bg-black/55" style={{ width: `${100 - endPct}%` }} />
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{ left: `${playPct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white shadow-lg" />
            <div className="absolute left-1/2 -translate-x-px bg-white/90" style={{ top: 19, bottom: 0, width: 2 }} />
          </div>

          {/* Start handle */}
          <div
            className="absolute top-0 bottom-0 z-20"
            style={{ left: `${startPct}%`, transform: 'translateX(-50%)', touchAction: 'none', cursor: 'ew-resize' }}
            onPointerDown={(e) => handleHandlePointerDown(e, 'start')}
          >
            <div className="absolute inset-y-0 -inset-x-3" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-4 rounded-t bg-green-500 shadow flex items-center justify-center">
              <span className="text-white text-xs leading-none">▶</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-2.5 bg-green-500 rounded-b shadow" style={{ top: 16 }} />
          </div>

          {/* End handle */}
          <div
            className="absolute top-0 bottom-0 z-20"
            style={{ left: `${endPct}%`, transform: 'translateX(-50%)', touchAction: 'none', cursor: 'ew-resize' }}
            onPointerDown={(e) => handleHandlePointerDown(e, 'end')}
          >
            <div className="absolute inset-y-0 -inset-x-3" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-4 rounded-t bg-red-500 shadow flex items-center justify-center">
              <span className="text-white text-xs leading-none">■</span>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-2.5 bg-red-500 rounded-b shadow" style={{ top: 16 }} />
          </div>
        </div>

        {/* Time labels */}
        <div className="flex justify-between text-xs mt-2 px-0.5">
          <span className="font-mono text-green-400">▶ {formatTimestamp(trimStart)}</span>
          <span className="font-mono bg-secondary/80 px-1.5 py-0.5 rounded text-foreground">{formatTimestamp(currentTime)}</span>
          <span className="font-mono text-red-400">{formatTimestamp(trimEnd > 0 ? trimEnd : d)} ■</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 px-4 pb-3">
        <button onClick={() => seek(currentTime - 10, true)} title="-10s" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={() => seek(currentTime - 1, true)} title="-1s" className="px-1.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
          ‹1s
        </button>
        <button onClick={() => seek(currentTime - 0.1, true)} title="-0.1s" className="px-1.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
          ‹0.1s
        </button>

        <div className="flex gap-1.5 mx-2">
          <button
            onClick={() => { onTrimStartChange(currentTime); }}
            title="Definir início na posição atual"
            className="text-xs px-2 py-1 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors"
          >
            ▶ Início
          </button>
          <button
            onClick={() => { onTrimEndChange(currentTime); }}
            title="Definir fim na posição atual"
            className="text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
          >
            Fim ■
          </button>
        </div>

        <button onClick={() => seek(currentTime + 0.1, true)} title="+0.1s" className="px-1.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
          0.1s›
        </button>
        <button onClick={() => seek(currentTime + 1, true)} title="+1s" className="px-1.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
          1s›
        </button>
        <button onClick={() => seek(currentTime + 10, true)} title="+10s" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward className="w-4 h-4" />
        </button>

        {d > 0 && (
          <span className="ml-auto text-xs text-muted-foreground font-mono">{formatTimestamp(d)}</span>
        )}
      </div>
    </div>
  )
}
