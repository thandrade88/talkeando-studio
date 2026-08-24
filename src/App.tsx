import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import SetupWizard from './components/SetupWizard'
import Dashboard from './pages/Dashboard'
import EpisodeWorkspace from './pages/EpisodeWorkspace'
import Settings from './pages/Settings'
import PodcastSettings from './pages/PodcastSettings'
import { useAppStore } from './store/useAppStore'
import { formatEta } from './lib/utils'

export default function App() {
  const loadPodcasts = useAppStore((s) => s.loadPodcasts)
  const loadEdition = useAppStore((s) => s.loadEdition)
  const transcribingEpisodeId  = useAppStore(s => s.transcribingEpisodeId)
  const transcriptionStartedAt = useAppStore(s => s.transcriptionStartedAt)
  const setTranscribingEpisode = useAppStore(s => s.setTranscribingEpisode)
  const setTxProgress          = useAppStore(s => s.setTxProgress)
  const updateEpisode          = useAppStore(s => s.updateEpisode)

  const [showSetup, setShowSetup] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)

  useEffect(() => {
    window.api.shouldShowSetup().then((show: boolean) => {
      setShowSetup(show)
      setSetupChecked(true)
    })
    loadPodcasts()
    loadEdition()
  }, [loadPodcasts, loadEdition])

  // Global transcription progress listener — survives all navigation
  useEffect(() => {
    return window.api.onTranscriptionProgress((prog, status) => {
      const startedAt = useAppStore.getState().transcriptionStartedAt
      let eta: string | null = null
      if (prog > 3 && prog < 100 && startedAt) {
        const elapsed = (Date.now() - startedAt) / 1000
        eta = formatEta((elapsed * (100 - prog)) / prog)
      }
      setTxProgress(prog, status, eta)
      if (prog >= 100) {
        const epId = useAppStore.getState().transcribingEpisodeId
        setTranscribingEpisode(null)
        if (epId) window.api.getEpisode(epId).then(ep => { if (ep) updateEpisode(ep) })
      }
    })
  }, [])

  if (!setupChecked) return null

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {showSetup && (
        <SetupWizard onComplete={() => { setShowSetup(false); loadPodcasts() }} />
      )}
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/episode/:id" element={<EpisodeWorkspace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/podcast/:podcastId/settings" element={<PodcastSettings />} />
        </Routes>
      </main>
    </div>
  )
}
