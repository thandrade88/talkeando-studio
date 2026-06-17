import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import SetupWizard from './components/SetupWizard'
import Dashboard from './pages/Dashboard'
import EpisodeWorkspace from './pages/EpisodeWorkspace'
import Settings from './pages/Settings'
import { useAppStore } from './store/useAppStore'

export default function App() {
  const loadEpisodes = useAppStore((s) => s.loadEpisodes)
  const [showSetup, setShowSetup] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)

  useEffect(() => {
    window.api.shouldShowSetup().then((show: boolean) => {
      setShowSetup(show)
      setSetupChecked(true)
    })
    loadEpisodes()
  }, [loadEpisodes])

  if (!setupChecked) return null

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {showSetup && (
        <SetupWizard onComplete={() => setShowSetup(false)} />
      )}
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/episode/:id" element={<EpisodeWorkspace />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
