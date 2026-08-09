import { Activity, Database, Gift, Heart, ListChecks, Settings2, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { useTikfinity } from '@/hooks/use-tikfinity'
import type { PageId } from '@/lib/pages'

type Tk = ReturnType<typeof useTikfinity>

export function OverviewPage({ tk, onNavigate }: { tk: Tk; onNavigate: (p: PageId) => void }) {
  const vcConnected = tk.vconnectStatus === 'Connected'
  const ttConnected = tk.tiktokStatus === 'Connected'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Database className="h-4 w-4" />}
        title="Connections"
        description="Both WebSocket endpoints for the bridge"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={tk.refreshTriggers}>
              Refresh Triggers
            </Button>
            <Button
              size="sm"
              onClick={() => (vcConnected || ttConnected ? tk.disconnect() : tk.connect())}
            >
              {vcConnected || ttConnected ? (
                <WifiOff className="h-4 w-4" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {vcConnected || ttConnected ? 'Disconnect' : 'Connect All'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <ConnCard
            label="VConnect API"
            status={tk.vconnectStatus}
            url={tk.urls.vconnectUrl}
            connected={vcConnected}
          />
          <ConnCard
            label="TikTok feed"
            status={tk.tiktokStatus}
            url={tk.urls.tiktokUrl}
            connected={ttConnected}
          />
        </div>
        <AdvancedEndpoints tk={tk} />
      </PageSection>

      <PageSection
        icon={<Activity className="h-4 w-4" />}
        title="Live feed"
        description="Most recent TikTok events"
      >
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {tk.events.length === 0 && <p className="text-sm text-zinc-500">Waiting for events…</p>}
          {[...tk.events].reverse().map((e, i) => (
            <div
              key={`${e.ts}-${i}`}
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs"
            >
              <span className="shrink-0 text-zinc-500">{new Date(e.ts).toLocaleTimeString()}</span>
              <EventTypeBadge type={e.type} />
              <span className="truncate">{e.detail}</span>
            </div>
          ))}
        </div>
      </PageSection>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="Triggers"
          value={tk.triggers.length}
          onClick={() => onNavigate('triggers')}
        />
        <StatCard
          icon={<Gift className="h-4 w-4" />}
          label="Gift maps"
          value={tk.giftMappings.length}
          onClick={() => onNavigate('mappings')}
        />
        <StatCard
          icon={<Heart className="h-4 w-4" />}
          label="Like goals"
          value={tk.likeMappings.length}
          onClick={() => onNavigate('mappings')}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Tracked users"
          value={tk.usersTracked}
          onClick={() => onNavigate('mappings')}
        />
      </div>
    </div>
  )
}

function ConnCard({
  label,
  status,
  url,
  connected
}: {
  label: string
  status: string
  url: string
  connected: boolean
}) {
  const color = connected ? 'bg-emerald-500' : status.includes('Connecting') ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate font-mono text-[10px] text-zinc-500">
          {status} · {url}
        </p>
      </div>
    </div>
  )
}

const DEFAULT_ENDPOINTS = {
  vconnect: { host: 'localhost', port: '39542', path: '' },
  tiktok: { host: 'localhost', port: '21213', path: '' }
}

function parseWsUrl(url: string): { host: string; port: string; path: string } {
  try {
    const u = new URL(url)
    return { host: u.hostname, port: u.port || (u.protocol === 'wss:' ? '443' : '80'), path: u.pathname === '/' ? '' : u.pathname }
  } catch {
    return { host: '', port: '', path: '/websocket' }
  }
}

function buildWsUrl(host: string, port: string, path: string): string {
  return `ws://${host}:${port}${path ? path : ''}`
}

function AdvancedEndpoints({ tk }: { tk: Tk }) {
  const [open, setOpen] = useState(false)
  const [vc, setVc] = useState(() => parseWsUrl(tk.urls.vconnectUrl))
  const [tt, setTt] = useState(() => parseWsUrl(tk.urls.tiktokUrl))

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Advanced: edit endpoints
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Settings2 className="h-3.5 w-3.5" /> Custom endpoints
        </p>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-300" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <EndpointRow
        label="VConnect API"
        value={vc}
        onChange={setVc}
      />
      <EndpointRow
        label="TikTok feed"
        value={tt}
        onChange={setTt}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7"
          onClick={() => {
            tk.applyUrls(buildWsUrl(vc.host, vc.port, vc.path), buildWsUrl(tt.host, tt.port, tt.path))
            setOpen(false)
          }}
        >
          Save endpoints
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => {
            setVc(DEFAULT_ENDPOINTS.vconnect)
            setTt(DEFAULT_ENDPOINTS.tiktok)
            tk.applyUrls(buildWsUrl(DEFAULT_ENDPOINTS.vconnect.host, DEFAULT_ENDPOINTS.vconnect.port, DEFAULT_ENDPOINTS.vconnect.path), buildWsUrl(DEFAULT_ENDPOINTS.tiktok.host, DEFAULT_ENDPOINTS.tiktok.port, DEFAULT_ENDPOINTS.tiktok.path))
            setOpen(false)
          }}
        >
          Reset to defaults
        </Button>
        <span className="ml-auto text-[10px] text-zinc-600">{vc.path || tt.path ? 'Saved to localStorage · takes effect on next Connect' : 'Leave Path empty — VConnect serves on the bare port'}</span>
      </div>
    </div>
  )
}

function EndpointRow({
  label,
  value,
  onChange
}: {
  label: string
  value: { host: string; port: string; path: string }
  onChange: (v: { host: string; port: string; path: string }) => void
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr_5.5rem_1fr] items-center gap-2">
      <Label className="text-[11px] text-zinc-400">{label}</Label>
      <div>
        <Label className="text-[10px] text-zinc-600">Host</Label>
        <Input
          className="h-7 font-mono text-xs"
          value={value.host}
          onChange={e => onChange({ ...value, host: e.target.value })}
          placeholder="localhost"
        />
      </div>
      <div>
        <Label className="text-[10px] text-zinc-600">Port</Label>
        <Input
          className="h-7 font-mono text-xs"
          value={value.port}
          onChange={e => onChange({ ...value, port: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) })}
          placeholder="39542"
          inputMode="numeric"
        />
      </div>
      <div>
        <Label className="text-[10px] text-zinc-600">Path</Label>
        <Input
          className="h-7 font-mono text-xs"
          value={value.path}
          onChange={e => onChange({ ...value, path: e.target.value.startsWith('/') ? e.target.value : '/' + e.target.value })}
          placeholder="/websocket"
        />
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-left transition-colors hover:bg-zinc-800/60"
    >
      <div className="text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="truncate text-xs text-zinc-500">{label}</p>
      </div>
    </button>
  )
}

function EventTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    gift: 'text-amber-400',
    follow: 'text-emerald-400',
    subscribe: 'text-sky-400',
    like: 'text-pink-400',
    trigger: 'text-violet-400'
  }
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold normal-case">
      <span className={colors[type] ?? 'text-zinc-400'}>{type}</span>
    </Badge>
  )
}