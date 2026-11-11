import { Coins, Radio, Square } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { YouTubeTracker } from '@/hooks/use-youtube-tracker'

const INT = new Intl.NumberFormat('en-US')

/**
 * YouTube source setup. It lives on the Overview page next to the TikTok event
 * source because it is a second feed the bridge can listen to - the YT Live
 * Tracker tab is where the captured gifts and their mappings are managed.
 *
 * The feed behaviour itself is fixed (30s poll, 100 messages per page, every
 * chat event type, 10,000 quota units per key per day), so only the keys and
 * the stream to watch are asked for here.
 */
export function YouTubeSetupCard({
  yt,
  onOpenTracker
}: {
  yt: YouTubeTracker
  onOpenTracker: () => void
}) {
  const [keys, setKeys] = useState(yt.config.keys.join('\n'))
  const [hl, setHl] = useState(yt.config.hl)
  const [handle, setHandle] = useState(yt.config.handle)
  const [video, setVideo] = useState(yt.config.videoInput)
  const [chatId, setChatId] = useState(yt.config.liveChatId)

  // The card renders before the saved config arrives from the main process, so
  // seed the fields once - otherwise a restart shows empty boxes even though the
  // key and handle are stored.
  const [seeded, setSeeded] = useState(yt.loaded)
  useEffect(() => {
    if (seeded || !yt.loaded) return
    setSeeded(true)
    setKeys(yt.config.keys.join('\n'))
    setHl(yt.config.hl)
    setHandle(yt.config.handle)
    setVideo(yt.config.videoInput)
    setChatId(yt.config.liveChatId)
  }, [seeded, yt.loaded, yt.config])

  const draft = {
    keys: keys.split(/[\s,;]+/).filter(Boolean),
    hl,
    handle,
    videoInput: video,
    liveChatId: chatId
  }

  const status = yt.status
  const quota = yt.quota
  const total = quota?.total ?? 0
  const cap = quota?.cap ?? 10000
  const pct = Math.min(100, (total / Math.max(1, cap)) * 100)
  const barClass = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  const cooling = quota?.cooling ?? []

  return (
    <PageSection
      icon={<Coins className="h-4 w-4" />}
      title="YouTube live source"
      description="Optional second feed: watches a YouTube live chat and picks up gifts, Super Chats and chat messages. Polling, API keys and quota accounting run in the app's main process, so tracking keeps running while you browse other tabs."
      actions={
        <div className="flex gap-2">
          {status?.polling ? (
            <Button size="sm" variant="outline" className="h-8" onClick={() => void yt.stop()}>
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : null}
          <Button size="sm" className="h-8" disabled={yt.busy} onClick={() => void yt.start(draft)}>
            <Radio className="h-3.5 w-3.5" />
            {yt.busy ? 'Working…' : 'Start tracking'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="yt-keys">YouTube Data API v3 keys (one per line or comma separated)</Label>
          <textarea
            id="yt-keys"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'AIza…\nAIza…'}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600"
          />
          <p className="text-[11px] text-zinc-500">
            Enable <span className="text-zinc-300">YouTube Data API v3</span> in your Google Cloud
            project first. A plain web-client key is enough. Keys rotate automatically: a rate-limited
            or exhausted key is cooled down and the next one takes over, so more keys means more
            daily quota and no downtime.
          </p>
        </div>

        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="yt-handle">Channel handle — follow whoever is live</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="yt-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@channelname (or a UC… channel id)"
              className="h-8 min-w-56 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={yt.busy || !handle.trim()}
              onClick={() => void yt.preview(draft)}
            >
              <Radio className="h-3.5 w-3.5" />
              Find live now
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Leave the video box empty and this alone: the app asks YouTube who that channel is
            streaming right now, follows that stream, and when the stream ends it keeps looking for
            their next live - every 60 seconds at first, easing off to every 15 minutes while they stay
            offline. Each lookup is 2-3 quota units and uses API-key endpoints only.
          </p>
        </div>

        <Field label="Live video URL or ID">
          <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
        <Field label="Or paste a liveChatId directly">
          <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Eg. ZG93Z2… (resolved automatically from the video)" />
        </Field>

        <Field label="Chat language">
          <Select value={hl} onValueChange={setHl}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['en', 'ja', 'ko', 'pt', 'es', 'de', 'fr', 'id', 'th', 'vi', 'zh-CN'].map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8" disabled={yt.busy} onClick={() => void yt.saveConfig(draft)}>
          Save settings
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-zinc-400 hover:text-zinc-100" onClick={onOpenTracker}>
          Open Youtube Maps
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-zinc-500 hover:text-red-400" onClick={() => void yt.clearLog()}>
          Clear gift log
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status?.polling ? 'bg-emerald-500' : status?.error ? 'bg-red-500' : 'bg-zinc-600'
            }`}
          />
          <span className="font-semibold">{status?.state ?? 'Idle'}</span>
          <span className="text-zinc-500">
            {status?.watchMode
              ? `Following ${status.handle || yt.previewTarget?.channelTitle || 'the handle'}`
              : status?.liveChatId
                ? `liveChatId ${status.liveChatId}`
                : 'no live chat resolved'}
            {status?.channelTitle ? ` · ${status.channelTitle}` : ''}
            {status?.streamTitle ? ` · ${status.streamTitle}` : ''}
            {status?.state === 'Waiting' && status?.nextLiveCheckAt
              ? ` · next check in ${Math.max(0, Math.round((status.nextLiveCheckAt - Date.now()) / 1000))}s`
              : ''}
          </span>
          <span className="ml-auto text-zinc-500">
            Keys ready {status?.keysReady ?? 0}/{status?.keysTotal ?? 0} · stored {INT.format(yt.stats.messageCount)}
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className={`h-full transition-all ${barClass}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Quota meter (per key, per Pacific day): {INT.format(total)} / {INT.format(cap)} units
          {quota?.day ? ` · day ${quota.day}` : ''} · liveChatMessages.list = 5 units, lookups = 1,
          failed calls still cost 1
          <button
            className="ml-2 text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
            onClick={() => void yt.resetQuota()}
          >
            reset counter
          </button>
        </p>

        {cooling.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cooling.map((entry) => (
              <span
                key={entry.key}
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
              >
                {entry.reason} · retry in {Math.max(0, Math.round((entry.until - Date.now()) / 1000))}s
              </span>
            ))}
          </div>
        ) : null}

        {yt.notice.text ? (
          <p
            className={`mt-1 text-[11px] ${
              yt.notice.kind === 'err' ? 'text-red-400' : yt.notice.kind === 'ok' ? 'text-emerald-400' : 'text-zinc-400'
            }`}
          >
            {yt.notice.text}
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-zinc-600">
        Fixed feed behaviour: polls every 30 seconds, 100 messages per page, stores every chat event
        type (gifts, Super Chats, Super Stickers, memberships, chat text), 10,000 quota units per key
        per day, reset at midnight Pacific time. Which stream to watch is picked in this order:
        a liveChatId you pasted, then a video URL, then the channel handle.
      </p>
    </PageSection>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-zinc-400">{label}</Label>
      {children}
    </div>
  )
}
