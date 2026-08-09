import { ScrollText, Trash2 } from 'lucide-react'
import { useRef, useEffect } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

export function LogPage({ tk }: { tk: Tk }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [tk.logs.length])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<ScrollText className="h-4 w-4" />}
        title={`Log (${tk.logs.length})`}
        description="Bridge activity — newest at the bottom"
        actions={
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-400" onClick={() => tk.clearLogs()}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        }
      >
        <div className="max-h-105 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
          {tk.logs.length === 0 && <span className="text-zinc-600">No log entries yet.</span>}
          {tk.logs.map((l, i) => (
            <div key={i} className={l.isError ? 'text-red-400' : 'text-zinc-300'}>
              <span className="text-zinc-600">{new Date(l.ts).toLocaleTimeString()} </span>
              {l.message}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </PageSection>
    </div>
  )
}