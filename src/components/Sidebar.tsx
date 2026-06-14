import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings, Mic2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/useAppStore'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Episódios' },
  { to: '/settings',  icon: Settings,         label: 'Configurações' },
]

export default function Sidebar() {
  const location = useLocation()
  const transcribingEpisodeId = useAppStore((s) => s.transcribingEpisodeId)

  return (
    <aside className="w-48 flex flex-col bg-card border-r border-border shrink-0">
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

      <nav className="flex-1 px-2 space-y-0.5 no-drag">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || (to === '/dashboard' && location.pathname.startsWith('/episode'))
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {transcribingEpisodeId !== null && (
        <div className="px-3 py-2.5 mx-2 mb-2 bg-blue-500/10 border border-blue-500/20 rounded-lg no-drag">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span className="text-xs text-blue-400">Transcrevendo...</span>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border no-drag">
        <p className="text-xs text-muted-foreground">v0.1.0</p>
      </div>
    </aside>
  )
}
