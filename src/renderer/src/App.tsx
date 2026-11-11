import { Cable, Coins, Info, Layers, LayoutDashboard, ListChecks, Rocket, Sparkles, Trophy } from 'lucide-react'
import { useState } from 'react'

import { ConnectionStatusBadge, EnabledToggle } from '@/components/bridge-parts'
import { Button } from '@/components/ui/button'
import { useTikfinity } from '@/hooks/use-tikfinity'
import { useYouTubeTracker } from '@/hooks/use-youtube-tracker'
import { AboutPage } from '@/pages/about'
import { GiftTrackerPage } from '@/pages/gift-tracker'
import { LiveActivityPage } from '@/pages/live-activity'
import { MappingsPage } from '@/pages/mappings'
import { OverviewPage } from '@/pages/overview'
import { SupportersPage } from '@/pages/supporters'
import { TitsMappingsPage } from '@/pages/tits-mappings'
import { TriggersPage } from '@/pages/triggers'
import { cn } from '@/lib/utils'
import {
  isYouTubePolling,
  isYouTubeSourceConfigured,
  toggleBridgeAndYouTube
} from '@/lib/bridge-controls'
import type { PageId } from '@/lib/pages'

const NAV: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'triggers', label: 'Triggers', icon: <ListChecks className="h-4 w-4" /> },
  { id: 'vconnect-mappings', label: 'VConnect Maps', icon: <Rocket className="h-4 w-4" /> },
  { id: 'tits-mappings', label: 'TITS Maps', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'gift-tracker', label: 'Youtube Maps', icon: <Coins className="h-4 w-4" /> },
  { id: 'live-activity', label: 'Live Activity', icon: <Layers className="h-4 w-4" /> },
  { id: 'supporters', label: 'Supporters', icon: <Trophy className="h-4 w-4" /> },
  { id: 'about', label: 'About', icon: <Info className="h-4 w-4" /> }
]

export default function App() {
  const tk = useTikfinity()
  // Mounted here rather than in the page: the main process owns the poll loop,
  // but trigger firing happens in the renderer, so it must survive tab changes.
  const yt = useYouTubeTracker(tk)
  const [page, setPage] = useState<PageId>('overview')

  // The YouTube source has no socket to watch: the main-process poller reports
  // its state, so the pill reads that instead.
  const ytRunning = isYouTubePolling(yt.status)
  const ytReadingChat = !!yt.status?.liveChatId
  const ytBusy = yt.status?.state === 'Resolving...' || yt.status?.state === 'Reading...'
  const ytStatus = ytRunning && ytReadingChat ? 'Connected' : ytRunning || ytBusy ? 'Connecting...' : 'Disconnected'
  const ytTitle = yt.status?.error
    ? `YouTube: ${yt.status.error}`
    : ytRunning && ytReadingChat
      ? `Reading ${yt.status?.channelTitle || yt.status?.handle || 'the live chat'}${
          yt.status?.streamTitle ? ` — ${yt.status.streamTitle}` : ''
        }`
      : ytRunning
        ? 'YouTube source running — waiting for a live chat to read'
        : 'YouTube source not started — turn it on in Overview'

  // Only auto-start the poller when there is something it could actually read,
  // otherwise Connect would just raise a "add a key / enter a target" error.
  const ytConfigured = isYouTubeSourceConfigured(yt.config)

  const vcConnected = tk.vconnectStatus === 'Connected'
  const titsConnected = tk.titsStatus === 'Connected'
  const ttConnected = tk.tiktokStatus === 'Connected'
  const anyConnected = vcConnected || titsConnected || ttConnected || ytRunning

  const toggleAll = () => toggleBridgeAndYouTube({ bridge: tk, youtube: yt, connected: anyConnected })

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/40">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500">
            <Cable className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Brij Studio</p>
            <p className="text-[10px] text-zinc-500">Tikfinity → VConnect / TITS</p>
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
          Local · v0.4
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4">
          <p className="text-xs font-medium text-zinc-500">
            {anyConnected ? 'Bridge active' : 'Bridge idle'}
          </p>
          <div className="flex items-center gap-2">
            <EnabledToggle label="VConnect" enabled={tk.vconnectEnabled} onToggle={tk.setVconnectEnabled} />
            <EnabledToggle label="TITS" enabled={tk.titsEnabled} onToggle={tk.setTitsEnabled} />
            <ConnectionStatusBadge
              status={tk.vconnectEnabled ? tk.vconnectStatus : 'Disabled'}
              label="VConnect"
            />
            <ConnectionStatusBadge
              status={tk.titsEnabled ? tk.titsStatus : 'Disabled'}
              label="TITS"
            />
            <ConnectionStatusBadge
              status={tk.tiktokStatus}
              label={tk.feedSource === 'builtin' ? 'TikTok Live' : 'Tikfinity'}
            />
            <ConnectionStatusBadge status={ytStatus} label="YouTube" title={ytTitle} />
            <Button
              size="sm"
              variant="outline"
              className="ml-1 h-7"
              title={
                anyConnected
                  ? 'Disconnect the TikTok feed, VConnect, TITS and the YouTube live poller'
                  : ytConfigured
                    ? 'Connect the bridge and start the YouTube live poller'
                    : 'Connect the bridge (add a YouTube key and target in Overview to include YouTube)'
              }
              onClick={toggleAll}
            >
              {anyConnected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {page === 'overview' && <OverviewPage tk={tk} yt={yt} onNavigate={setPage} />}
          {page === 'triggers' && <TriggersPage tk={tk} />}
          {page === 'vconnect-mappings' && <MappingsPage tk={tk} />}
          {page === 'tits-mappings' && <TitsMappingsPage tk={tk} />}
          {page === 'gift-tracker' && <GiftTrackerPage tk={tk} yt={yt} onNavigate={setPage} />}
          {page === 'live-activity' && <LiveActivityPage tk={tk} yt={yt} />}
          {page === 'supporters' && <SupportersPage tk={tk} />}
          {page === 'about' && <AboutPage />}
        </main>
      </div>
    </div>
  )
}
