import { Cable, Heart, LayoutDashboard, ListChecks, Rocket, ScrollText, Settings2, Trophy } from 'lucide-react'
import { useState } from 'react'

import { ConnectionStatusBadge } from '@/components/bridge-parts'
import { Button } from '@/components/ui/button'
import { useTikfinity } from '@/hooks/use-tikfinity'
import { LikeGoalsPage } from '@/pages/like-goals'
import { LogPage } from '@/pages/log'
import { MappingsPage } from '@/pages/mappings'
import { OverviewPage } from '@/pages/overview'
import { SettingsPage } from '@/pages/settings'
import { SupportersPage } from '@/pages/supporters'
import { TriggersPage } from '@/pages/triggers'
import { cn } from '@/lib/utils'
import type { PageId } from '@/lib/pages'

const NAV: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'triggers', label: 'Triggers', icon: <ListChecks className="h-4 w-4" /> },
  { id: 'mappings', label: 'Mappings', icon: <Rocket className="h-4 w-4" /> },
  { id: 'likes', label: 'Like Goals', icon: <Heart className="h-4 w-4" /> },
  { id: 'supporters', label: 'Supporters', icon: <Trophy className="h-4 w-4" /> },
  { id: 'logs', label: 'Logs', icon: <ScrollText className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> }
]

export default function App() {
  const tk = useTikfinity()
  const [page, setPage] = useState<PageId>('overview')

  const vcConnected = tk.vconnectStatus === 'Connected'
  const ttConnected = tk.tiktokStatus === 'Connected'

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/40">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
            <Cable className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">VConnect Bridge</p>
            <p className="text-[10px] text-zinc-500">Tikfinity → VConnect</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                page === item.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-1.5 px-4 py-3 text-[10px] text-zinc-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Local · v0.2
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4">
          <p className="text-xs font-medium text-zinc-500">
            {vcConnected || ttConnected ? 'Bridge active' : 'Bridge idle'}
          </p>
          <div className="flex items-center gap-2">
            <ConnectionStatusBadge status={tk.vconnectStatus} label="VConnect" />
            <ConnectionStatusBadge status={tk.tiktokStatus} label="TikTok" />
            <Button
              size="sm"
              variant="outline"
              className="ml-1 h-7"
              onClick={() => (vcConnected || ttConnected ? tk.disconnect() : tk.connect())}
            >
              {vcConnected || ttConnected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {page === 'overview' && <OverviewPage tk={tk} onNavigate={setPage} />}
          {page === 'triggers' && <TriggersPage tk={tk} />}
          {page === 'mappings' && <MappingsPage tk={tk} />}
          {page === 'likes' && <LikeGoalsPage tk={tk} />}
          {page === 'supporters' && <SupportersPage tk={tk} />}
          {page === 'settings' && <SettingsPage />}
          {page === 'logs' && <LogPage tk={tk} />}
        </main>
      </div>
    </div>
  )
}