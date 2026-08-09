import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { Trigger } from '@tikfinity'
import { cn } from '@/lib/utils'

export function TriggerSelect({
  triggers,
  value,
  onChange,
  placeholder = 'Select…',
  className,
  disabled
}: {
  triggers: Trigger[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn('w-48', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {triggers.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-zinc-500">No triggers loaded…</div>
        )}
        {triggers.map(t => (
          <SelectItem key={t.uid} value={t.uid}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}