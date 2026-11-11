import { Gift, Heart, Rocket, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { DiamondRulesSection } from '@/components/diamond-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TriggerSelect } from '@/components/trigger-select'
import type { LikeMapping } from '@tikfinity'
import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

export function MappingsPage({ tk }: { tk: Tk }) {
  const [giftName, setGiftName] = useState('')
  const [giftUid, setGiftUid] = useState('')
  const [likeCount, setLikeCount] = useState('')
  const [likeUid, setLikeUid] = useState('')

  const n = parseInt(likeCount, 10)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs text-zinc-500">
        Mappings below fire <span className="font-semibold text-zinc-300">VConnect</span> triggers
        from Tikfinity events.
      </p>
      <PageSection
        icon={<Gift className="h-4 w-4" />}
        title="Gift → VConnect Trigger"
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

      <DiamondRulesSection
        title="Diamond value rules"
        rules={tk.diamondRules}
        triggers={tk.triggers}
        triggerName={tk.getTriggerName}
        onAdd={(op, min, max, uid) => tk.addDiamondRule(op, min, max, uid)}
        onRemove={i => tk.removeDiamondRule(i)}
        triggerPlaceholder="Trigger…"
      />

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
      </PageSection>

      <PageSection
        icon={<Heart className="h-4 w-4" />}
        title={`Like goals (${tk.likeMappings.length})`}
        description="First time a user crosses a like count, fire its trigger"
        actions={
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-400" onClick={tk.clearLikeTracking}>
            <Trash2 className="h-4 w-4" /> Reset tracking
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={likeCount}
            onChange={e => setLikeCount(e.target.value)}
            placeholder="Likes (e.g. 100)"
            type="number"
            min={1}
            className="h-8 w-28"
          />
          <TriggerSelect
            triggers={tk.triggers}
            value={likeUid}
            onChange={setLikeUid}
            placeholder="Trigger…"
            className="h-8 w-44"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={isNaN(n) || n <= 0 || !likeUid}
            onClick={() => {
              tk.addLikeMapping(n, likeUid)
              setLikeCount('')
              setLikeUid('')
            }}
          >
            Add goal
          </Button>
        </div>

        <div className="mt-2 max-h-56 overflow-y-auto">
          <GoalTable
            mappings={tk.likeMappings}
            triggerName={tk.getTriggerName}
            onRemove={i => tk.removeLikeMapping(i)}
          />
        </div>
        <div className="mt-2 flex items-center gap-4 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-emerald-400" /> Users tracked: {tk.usersTracked}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-pink-400" /> Top liker:{' '}
            {tk.topLiker ? `${tk.topLiker.name} (${tk.topLiker.count})` : '—'}
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

function GoalTable({
  mappings,
  triggerName,
  onRemove
}: {
  mappings: LikeMapping[]
  triggerName: (uid: string) => string
  onRemove: (index: number) => void
}) {
  if (mappings.length === 0) {
    return <p className="py-1 text-sm text-zinc-500">No goals set yet.</p>
  }
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium text-zinc-400">Threshold</th>
            <th className="px-2.5 py-1.5 text-left font-medium text-zinc-400">Trigger</th>
            <th className="w-12 px-2.5 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={`${m.likeCount}-${i}`} className="border-t border-zinc-800/60">
              <td className="px-2.5 py-1.5 font-medium">{m.likeCount}</td>
              <td className="px-2.5 py-1.5 text-zinc-400">{triggerName(m.triggerId)}</td>
              <td className="px-2.5 py-1.5 text-right">
                <button
                  className="text-zinc-600 transition-colors hover:text-red-400"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${m.likeCount} like goal`}
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