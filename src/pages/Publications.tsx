import { Youtube, Instagram, Music2, ExternalLink } from 'lucide-react'
import { cn } from '../lib/utils'

const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    status: 'coming_soon',
    features: ['Upload de vídeo / Shorts', 'Título, descrição, tags', 'Thumbnail', 'Publicar']
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    status: 'coming_soon',
    features: ['Carrossel', 'Reels', 'Legenda', 'Postar']
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: Music2,
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
    status: 'coming_soon',
    features: ['Upload de vídeo', 'Legenda', 'Publicar']
  }
]

const FUTURE_PLUGINS = ['LinkedIn', 'X (Twitter)', 'Threads', 'Blog (WordPress)', 'Email Marketing', 'E mais...']

export default function Publications() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold">Publicações</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gerencie plugins de publicação por plataforma</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-4 mb-8">
          {PLATFORMS.map(({ id, name, icon: Icon, color, bg, border, features }) => (
            <div key={id} className={cn('rounded-xl border p-5', border, bg)}>
              <div className="flex items-center gap-2 mb-4">
                <Icon className={cn('w-5 h-5', color)} />
                <span className="font-semibold">{name}</span>
                <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  Em breve
                </span>
              </div>
              <ul className="space-y-1.5 mb-5">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={cn('w-1 h-1 rounded-full', color.replace('text-', 'bg-'))} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled
                className="w-full py-2 text-sm bg-secondary/50 text-muted-foreground rounded-lg cursor-not-allowed opacity-60"
              >
                Conectar
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold mb-3">Outros Plugins Futuros</h2>
          <div className="flex flex-wrap gap-2">
            {FUTURE_PLUGINS.map((p) => (
              <span key={p} className="px-3 py-1 text-sm bg-secondary rounded-full text-muted-foreground">
                {p}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            O sistema de plugins permite adicionar novas plataformas sem alterar o código principal.
            Cada plugin é responsável por formatar e publicar o conteúdo gerado.
          </p>
        </div>
      </div>
    </div>
  )
}
