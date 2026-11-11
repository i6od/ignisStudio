import { Gem, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TriggerSelect } from '@/components/trigger-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { DiamondRule, DiamondRuleOp, Trigger } from '@tikfinity'

const OPS: { value: DiamondRuleOp; label: string }[] = [
  { value: 'above', label: 'Greater than' },
  { value: 'below', label: 'Less than' },
  { value: 'range', label: 'Between' }
]

/**
 * Value-based gift mappings: instead of matching the gift name, these match what
 * the gift was worth, so "anyone who drops 500+ diamonds" or "a small gift under
 * 10 diamonds" can fire its own trigger. Used by both the VConnect and TITS maps.
 */
export function DiamondRulesSection({
  rules,
  triggers,
  triggerName,
  onAdd,
  onRemove,
  title,
  triggerPlaceholder
}: {
  rules: DiamondRule[]
  triggers: Trigger[]
  triggerName: (uid: string) => string
  onAdd: (op: DiamondRuleOp, min: number, max: number | null, uid: string) => boolean
  onRemove: (index: number) => void
  title: string
  triggerPlaceholder: string
}) {
  const [op, setOp] = useState<DiamondRuleOp>('above')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [uid, setUid] = useState('')

  const minValue = parseInt(min, 10)
  const maxValue = max.trim() === '' ? null : parseInt(max, 10)
  const valid =
    !isNaN(minValue) &&
    minValue >= 0 &&
    !!uid &&
    (op !== 'range' || (maxValue != null && !isNaN(maxValue) && maxValue >= minValue))

  const submit = () => {
    if (!valid) return
    if (onAdd(op, minValue, op === 'range' ? maxValue : null, uid)) {
      setMin('')
      setMax('')
      setUid('')
    }
  }

  return (
    <PageSection
      icon={<Gem className="h-4 w-4" />}
      title={`${title} (${rules.length})`}
      description="Compared against a gift's total diamonds (gift value x combo count). Greater/less exclude the number; between includes both ends."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={op} onValueChange={v => setOp(v as DiamondRuleOp)}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={min}
          onChange={e => setMin(e.target.value)}
          placeholder="Diamonds"
          type="number"
          min={0}
          className="h-8 w-28"
        />
        {op === 'range' && (
          <>
            <span className="text-xs text-zinc-500">and</span>
            <Input
              value={max}
              onChange={e => setMax(e.target.value)}
              placeholder="Diamonds"
              type="number"
              min={0}
              className="h-8 w-28"
            />
          </>
        )}
        <TriggerSelect
          triggers={triggers}
          value={uid}
          onChange={setUid}
          placeholder={triggerPlaceholder}
          className="h-8 w-44"
        />
        <Button size="sm" className="h-8" disabled={!valid} onClick={submit}>
          Add rule
        </Button>
      </div>

      <div className="mt-2 max-h-56 overflow-y-auto">
        <RuleTable rules={rules} triggerName={triggerName} onRemove={onRemove} />
      </div>
    </PageSection>
  )
}

function ruleLabel(rule: DiamondRule): string {
  if (rule.op === 'above') return `more than ${rule.min} 💎`
  if (rule.op === 'below') return `under ${rule.min} 💎`
  return `${rule.min} – ${rule.max} 💎`
}

function RuleTable({
  rules,
  triggerName,
  onRemove
}: {
  rules: DiamondRule[]
  triggerName: (uid: string) => string
  onRemove: (index: number) => void
}) {
  if (rules.length === 0) {
    return <p className="py-1 text-sm text-zinc-500">No diamond value rules yet.</p>
  }
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium text-zinc-400">Diamond value</th>
            <th className="px-2.5 py-1.5 text-left font-medium text-zinc-400">Trigger</th>
            <th className="w-12 px-2.5 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={`${r.op}-${r.min}-${r.max ?? 0}-${i}`} className="border-t border-zinc-800/60">
              <td className="px-2.5 py-1.5 font-medium">{ruleLabel(r)}</td>
              <td className="px-2.5 py-1.5 text-zinc-400">{triggerName(r.triggerId)}</td>
              <td className="px-2.5 py-1.5 text-right">
                <button
                  className="text-zinc-600 transition-colors hover:text-red-400"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${ruleLabel(r)} rule`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
