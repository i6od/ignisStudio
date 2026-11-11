import { Power } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function ConnectionDot({ status }: { status: string }) {
  const color =
    status === 'Connected'
      ? 'bg-emerald-500'
      : status.includes('Connecting')
        ? 'bg-amber-400 animate-pulse'
        : status === 'Disabled'
          ? 'bg-zinc-600'
          : 'bg-red-500'
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
}

export function ConnectionStatusBadge({
  status,
  label,
  title
}: {
  status: string
  label: string
  title?: string
}) {
  const variant =
    status === 'Connected'
      ? 'default'
      : status.includes('Connecting') || status === 'Disabled'
        ? 'secondary'
        : 'destructive'
  return (
    <Badge variant={variant} className="gap-1.5" title={title}>
      <ConnectionDot status={status} />
      {label}
    </Badge>
  )
}

export function EnabledToggle({
  label,
  enabled,
  onToggle
}: {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      title={`${label} API mappings ${enabled ? 'enabled' : 'disabled'} — click to ${enabled ? 'disable' : 'enable'}`}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
        enabled
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
      )}
    >
      <Power className="h-3 w-3" />
      {label} {enabled ? 'on' : 'off'}
    </button>
  )
}
