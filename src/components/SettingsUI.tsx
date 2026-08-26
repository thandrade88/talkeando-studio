import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

export function SaveButton({ onClick, saved }: { onClick: () => void; saved?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('px-3 py-2 text-sm rounded-lg transition-colors',
        saved ? 'bg-primary/20 text-primary' : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border')}>
      {saved ? <Check className="w-4 h-4" /> : 'Salvar'}
    </button>
  )
}
