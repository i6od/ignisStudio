import { Activity, Database, Gift, Heart, ListChecks, Radio, Settings2, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { EnabledToggle } from '@/components/bridge-parts'
import { PageSection } from '@/components/page-section'
import { YouTubeSetupCard } from '@/components/youtube-setup'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { useTikfinity } from '@/hooks/use-tikfinity'
import type { YouTubeTracker } from '@/hooks/use-youtube-tracker'
import { isYouTubePolling, toggleBridgeAndYouTube } from '@/lib/bridge-controls'
import type { PageId } from '@/lib/pages'

type Tk = ReturnType<typeof useTikfinity>

export function OverviewPage({
  tk,
  yt,
  onNavigate
}: {
  tk: Tk
  yt: YouTubeTracker
  onNavigate: (p: PageId) => void
}) {
  const vcConnected = tk.vconnectStatus === 'Connected'
  const titsConnected = tk.titsStatus === 'Connected'
  const ttConnected = tk.tiktokStatus === 'Connected'
  const ytRunning = isYouTubePolling(yt.status)
  const anyConnected = vcConnected || titsConnected || ttConnected || ytRunning

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Database className="h-4 w-4" />}
        title="Connections"
        description="TikTok event source and the bridge WebSocket endpoints"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                tk.refreshTriggers()
                tk.refreshTitsTriggers()
              }}
            >
              Refresh Triggers
            </Button>
            <Button
              size="sm"
              title={
                anyConnected
                  ? 'Disconnect the TikTok feed, VConnect, TITS and the YouTube live poller'
                  : 'Connect the bridge, and start the YouTube live poller when it is configured'
              }
              onClick={() => toggleBridgeAndYouTube({ bridge: tk, youtube: yt, connected: anyConnected })}
            >
              {anyConnected ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
              {anyConnected ? 'Disconnect' : 'Connect All'}
            </Button>
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <EnabledToggle
            label="VConnect"
            enabled={tk.vconnectEnabled}
            onToggle={tk.setVconnectEnabled}
          />
          <EnabledToggle label="TITS" enabled={tk.titsEnabled} onToggle={tk.setTitsEnabled} />
          <span className="text-[10px] text-zinc-600">
            Disabled APIs disconnect and stop firing their mappings
          </span>
        </div>
        <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Radio className="h-3.5 w-3.5" /> TikTok event source
            </p>
            <SourceToggle value={tk.feedSource} onChange={tk.setFeedSource} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            {tk.feedSource === 'tikfinity'
              ? 'Events come from the Tikfinity relay WebSocket. Gifts, follows, likes, comments and subscribes are all bridged.'
              : 'Brij Studio joins the TikTok LIVE stream itself — no relay to install and no port to keep open. Gifts, likes, comments and follows are bridged; subscribe events still need the relay.'}
          </p>
          {tk.feedSource === 'builtin' ? <BuiltinFeedForm tk={tk} /> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <ConnCard
            label="VConnect API"
            status={tk.vconnectEnabled ? tk.vconnectStatus : 'Disabled'}
            url={tk.urls.vconnectUrl}
            connected={vcConnected}
          />
          <ConnCard
            label="TITS API"
            status={tk.titsEnabled ? tk.titsStatus : 'Disabled'}
            url={tk.urls.titsUrl}
            connected={titsConnected}
          />
          <ConnCard
            label={tk.feedSource === 'builtin' ? 'Built-in TikTok LIVE' : 'Tikfinity feed'}
            status={tk.tiktokStatus}
            url={tk.feedSource === 'builtin' ? `@${tk.tiktokUsername}` : tk.urls.tiktokUrl}
            connected={ttConnected}
          />
        </div>
        <AdvancedEndpoints tk={tk} />
      </PageSection>

      <YouTubeSetupCard yt={yt} onOpenTracker={() => onNavigate('gift-tracker')} />

      <PageSection
        icon={<Activity className="h-4 w-4" />}
        title="Live feed"
        description="Most recent TikTok events from the active source"
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
          value={tk.giftMappings.length + tk.titsGiftMappings.length}
          onClick={() => onNavigate('vconnect-mappings')}
        />
        <StatCard
          icon={<Heart className="h-4 w-4" />}
          label="Like goals"
          value={tk.likeMappings.length + tk.titsLikeMappings.length}
          onClick={() => onNavigate('vconnect-mappings')}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Tracked users"
          value={tk.usersTracked}
          onClick={() => onNavigate('vconnect-mappings')}
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
  const color = connected
    ? 'bg-emerald-500'
    : status === 'Disabled'
      ? 'bg-zinc-600'
      : status.includes('Connecting')
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500'
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

type TikTokSource = Tk['feedSource']

function SourceToggle({
  value,
  onChange
}: {
  value: TikTokSource
  onChange: (source: TikTokSource) => void
}) {
  const options: { id: TikTokSource; label: string }[] = [
    { id: 'tikfinity', label: 'Tikfinity relay' },
    { id: 'builtin', label: 'Built into app' }
  ]
  return (
    <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === option.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, '')
}

function BuiltinFeedForm({ tk }: { tk: Tk }) {
  const [draft, setDraft] = useState(tk.tiktokUsername)
  const dirty = normalizeUsername(draft) !== tk.tiktokUsername

  const commit = () => {
    if (!normalizeUsername(draft)) return
    tk.setTiktokUsername(draft)
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[190px] flex-1 space-y-1">
          <Label className="text-[11px] text-zinc-400">TikTok username</Label>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
            placeholder="username, without the @"
            className="h-8 font-mono text-xs"
          />
        </div>
        <Button size="sm" variant={dirty ? 'default' : 'outline'} className="h-8" disabled={!dirty} onClick={commit}>
          {dirty ? 'Reconnect' : 'Saved'}
        </Button>
      </div>
      <p className="text-[10px] text-zinc-600">
        Watching <span className="font-mono text-zinc-400">@{tk.tiktokUsername}</span>
        {tk.tiktokLiveError ? <span className="text-red-400"> · {tk.tiktokLiveError}</span> : null}
      </p>
    </div>
  )
}

const DEFAULT_ENDPOINTS = {
  vconnect: { host: 'localhost', port: '39542', path: '' },
  tits: { host: 'localhost', port: '42069', path: '/websocket' },
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
  const [tits, setTits] = useState(() => parseWsUrl(tk.urls.titsUrl))
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
        label="TITS API"
        value={tits}
        onChange={setTits}
      />
      <EndpointRow
        label={tk.feedSource === 'builtin' ? 'Tikfinity feed (idle — built-in source)' : 'Tikfinity feed'}
        value={tt}
        onChange={setTt}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7"
          onClick={() => {
            tk.applyUrls(
              buildWsUrl(vc.host, vc.port, vc.path),
              buildWsUrl(tits.host, tits.port, tits.path),
              buildWsUrl(tt.host, tt.port, tt.path)
            )
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
            setTits(DEFAULT_ENDPOINTS.tits)
            setTt(DEFAULT_ENDPOINTS.tiktok)
            tk.applyUrls(
              buildWsUrl(DEFAULT_ENDPOINTS.vconnect.host, DEFAULT_ENDPOINTS.vconnect.port, DEFAULT_ENDPOINTS.vconnect.path),
              buildWsUrl(DEFAULT_ENDPOINTS.tits.host, DEFAULT_ENDPOINTS.tits.port, DEFAULT_ENDPOINTS.tits.path),
              buildWsUrl(DEFAULT_ENDPOINTS.tiktok.host, DEFAULT_ENDPOINTS.tiktok.port, DEFAULT_ENDPOINTS.tiktok.path)
            )
            setOpen(false)
          }}
        >
          Reset to defaults
        </Button>
        <span className="ml-auto text-[10px] text-zinc-600">VConnect serves on the bare port; TITS uses path /websocket · saved to localStorage</span>
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