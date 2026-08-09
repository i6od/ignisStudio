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

export function TriggersPage({ tk }: { tk: Tk }) {
  const [filter, setFilter] = useState('')

  const triggers = tk.triggers.filter(t =>
    filter.trim() === '' || t.name.toLowerCase().includes(filter.trim().toLowerCase())
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<ListChecks className="h-4 w-4" />}
        title={`Triggers (${tk.triggers.length})`}
        description="Loaded from VConnect via TriggerListRequest"
        actions={
          <Button variant="outline" size="sm" onClick={tk.refreshTriggers}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      >
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
                    {tk.triggers.length === 0
                      ? 'No triggers loaded — connect to VConnect and refresh.'
                      : 'No triggers match your filter.'}
                  </TableCell>
                </TableRow>
              )}
              {triggers.map(t => {
                const result = tk.fireResults[t.uid]
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
                          onClick={() => tk.activateTrigger(t.uid)}
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