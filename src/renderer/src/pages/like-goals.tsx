import { Heart, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TriggerSelect } from '@/components/trigger-select'
import type { LikeMapping } from '@tikfinity'
import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

export function LikeGoalsPage({ tk }: { tk: Tk }) {
  const [count, setCount] = useState('')
  const [uid, setUid] = useState('')

  const n = parseInt(count, 10)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Heart className="h-4 w-4" />}
        title="Goal thresholds"
        description="First time a user crosses a like count, fire its trigger"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={count}
            onChange={e => setCount(e.target.value)}
            placeholder="Likes (e.g. 100)"
            type="number"
            min={1}
            className="h-8 w-28"
          />
          <TriggerSelect
            triggers={tk.triggers}
            value={uid}
            onChange={setUid}
            placeholder="Trigger…"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={isNaN(n) || n <= 0 || !uid}
            onClick={() => {
              tk.addLikeMapping(n, uid)
              setCount('')
              setUid('')
            }}
          >
            Add goal
          </Button>
        </div>
      </PageSection>

      <PageSection
        icon={<Heart className="h-4 w-4" />}
        title={`Like goals (${tk.likeMappings.length})`}
        description="Sorted by threshold, ascending"
        actions={
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-400" onClick={tk.clearLikeTracking}>
            <Trash2 className="h-4 w-4" /> Reset tracking
          </Button>
        }
      >
        <GoalTable
          mappings={tk.likeMappings}
          triggerName={tk.getTriggerName}
          onRemove={i => tk.removeLikeMapping(i)}
        />
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
    return <p className="text-sm text-zinc-500">No goals set yet.</p>
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