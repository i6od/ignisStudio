import { Badge } from '@/components/ui/badge'

export function ConnectionDot({ status }: { status: string }) {
  const color =
    status === 'Connected'
      ? 'bg-emerald-500'
      : status.includes('Connecting')
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500'
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
}

export function ConnectionStatusBadge({ status, label }: { status: string; label: string }) {
  const variant =
    status === 'Connected' ? 'default' : status.includes('Connecting') ? 'secondary' : 'destructive'
  return (
    <Badge variant={variant} className="gap-1.5">
      <ConnectionDot status={status} />
      {label}
    </Badge>
  )
}