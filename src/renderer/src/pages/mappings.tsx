import { Gift, Rocket, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { TriggerSelect } from '@/components/trigger-select'
import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

export function MappingsPage({ tk }: { tk: Tk }) {
  const [giftName, setGiftName] = useState('')
  const [giftUid, setGiftUid] = useState('')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Gift className="h-4 w-4" />}
        title="Gift → Trigger"
        description="Case-insensitive match on gift name"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={giftName}
            onChange={e => setGiftName(e.target.value)}
            placeholder="Gift name (e.g. rose)"
            className="h-8 w-44"
          />
          <TriggerSelect
            triggers={tk.triggers}
            value={giftUid}
            onChange={setGiftUid}
            placeholder="Trigger…"
            className="h-8 w-44"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!giftName.trim() || !giftUid}
            onClick={() => {
              tk.addGiftMapping(giftName.trim(), giftUid)
              setGiftName('')
              setGiftUid('')
            }}
          >
            Add
          </Button>
        </div>

        <div className="mt-2 max-h-56 overflow-y-auto">
          <MappingList
            rows={tk.giftMappings.map(([name, uid]) => ({
              key: name,
              label: name,
              trigger: tk.getTriggerName(uid),
              onRemove: () => tk.removeGiftMapping(name)
            }))}
            empty="No gift mappings yet"
          />
        </div>
      </PageSection>

      <PageSection
        icon={<Rocket className="h-4 w-4" />}
        title="Social events"
        description="Follow / Subscribe fire one shot each"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-emerald-400" /> Follow → Trigger
            </Label>
            <TriggerSelect
              triggers={tk.triggers}
              value={tk.followUid ?? ''}
              onChange={v => tk.setFollowUid(v || null)}
              placeholder="None selected"
            />
            {tk.followUid && (
              <ClearButton label="Follow mapping" onClear={() => tk.setFollowUid(null)} />
            )}
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5 text-sky-400" /> Subscribe → Trigger
            </Label>
            <TriggerSelect
              triggers={tk.triggers}
              value={tk.subscribeUid ?? ''}
              onChange={v => tk.setSubscribeUid(v || null)}
              placeholder="None selected"
            />
            {tk.subscribeUid && (
              <ClearButton label="Subscribe mapping" onClear={() => tk.setSubscribeUid(null)} />
            )}
          </div>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
          <span>
            Tips: gift names match case-insensitively; social events fire on every occurrence.
          </span>
        </div>
      </PageSection>
    </div>
  )
}

function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 justify-start px-1.5 text-xs text-zinc-500 hover:text-red-400"
      onClick={onClear}
    >
      <Trash2 className="h-3.5 w-3.5" /> Clear {label}
    </Button>
  )
}

function MappingList({
  rows,
  empty
}: {
  rows: { key: string; label: string; trigger: string; onRemove: () => void }[]
  empty: string
}) {
  if (rows.length === 0) return <p className="py-1 text-sm text-zinc-500">{empty}</p>
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-b border-zinc-800/60 last:border-0">
              <td className="px-2.5 py-1.5 font-medium">{r.label}</td>
              <td className="px-2.5 py-1.5 text-zinc-400">{r.trigger}</td>
              <td className="w-10 px-2 py-1.5 text-right">
                <button
                  className="text-zinc-600 transition-colors hover:text-red-400"
                  onClick={r.onRemove}
                  aria-label={`Remove ${r.label}`}
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