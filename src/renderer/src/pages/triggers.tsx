import { ListChecks, Loader2, RefreshCcw, XCircle, Zap } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import type { useTikfinity } from '@/hooks/use-tikfinity'
import { cn } from '@/lib/utils'

type Tk = ReturnType<typeof useTikfinity>
type ApiTab = 'vconnect' | 'tits'

export function TriggersPage({ tk }: { tk: Tk }) {
  const [tab, setTab] = useState<ApiTab>('vconnect')
  const [filter, setFilter] = useState('')

  const isVconnect = tab === 'vconnect'
  const allTriggers = isVconnect ? tk.triggers : tk.titsTriggers
  const fireResults = isVconnect ? tk.fireResults : tk.fireResultsTits

  const triggers = allTriggers.filter(
    t => filter.trim() === '' || t.name.toLowerCase().includes(filter.trim().toLowerCase())
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<ListChecks className="h-4 w-4" />}
        title={`Triggers (${allTriggers.length})`}
        description={
          isVconnect
            ? 'Loaded from VConnect via TriggerListRequest'
            : 'Loaded from TITS via TITSTriggerListRequest'
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => (isVconnect ? tk.refreshTriggers() : tk.refreshTitsTriggers())}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      >
        <div className="mb-2 flex gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
          <TabButton active={isVconnect} onClick={() => setTab('vconnect')} label="VConnect" count={tk.triggers.length} />
          <TabButton active={!isVconnect} onClick={() => setTab('tits')} label="TITS" count={tk.titsTriggers.length} />
        </div>
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="mb-2 h-8"
        />
        <div className="max-h-105 overflow-y-auto rounded-md border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead className="w-20 text-right">Fire</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {triggers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-zinc-500">
                    {allTriggers.length === 0
                      ? `No triggers loaded — connect to ${isVconnect ? 'VConnect' : 'TITS'} and refresh.`
                      : 'No triggers match your filter.'}
                  </TableCell>
                </TableRow>
              )}
              {triggers.map(t => {
                const result = fireResults[t.uid]
                return (
                  <TableRow key={t.uid} className={cn(result?.status === 'error' && 'bg-red-500/5')}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="max-w-52 truncate font-medium">{t.name}</span>
                        {!t.enabled && <Badge variant="secondary">off</Badge>}
                      </div>
                      <p className="max-w-52 truncate font-mono text-[10px] text-zinc-600" title={t.uid}>
                        {t.uid}
                      </p>
                    </TableCell>
                    <TableCell>{t.nodeCount ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <FireStatusIndicator status={result?.status} error={result?.error} />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() =>
                            isVconnect ? tk.activateTrigger(t.uid) : tk.activateTitsTrigger(t.uid)
                          }
                          title={`Fire ${t.name}`}
                          disabled={result?.status === 'pending'}
                        >
                          {result?.status === 'pending' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </PageSection>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  count
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
      )}
    >
      {label}
      <span className="text-[10px] text-zinc-500">{count}</span>
    </button>
  )
}

function FireStatusIndicator({ status, error }: { status?: string; error?: string }) {
  if (!status || status === 'idle') return null
  if (status === 'pending') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-red-400" title={error ?? 'Failed to fire'}>
        <XCircle className="h-3.5 w-3.5" />
        <span className="max-w-28 truncate">{error ?? 'failed'}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-400" title="Trigger activated">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      fired
    </span>
  )
}
