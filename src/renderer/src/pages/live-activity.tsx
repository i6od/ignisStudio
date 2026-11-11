import { Heart, Layers, RefreshCcw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { useTikfinity } from '@/hooks/use-tikfinity'
import type { YouTubeTracker } from '@/hooks/use-youtube-tracker'

type Tk = ReturnType<typeof useTikfinity>

type SourceFilter = 'all' | 'tiktok' | 'youtube'
type KindFilter = 'all' | 'gift' | 'comment' | 'paid' | 'social'

interface ActivityItem {
  key: string
  source: 'tiktok' | 'youtube'
  kind: string
  ts: number
  sender: string | null
  avatar: string | null
  text: string
  giftName: string | null
  jewels: number
  combo: number
  repeat: number
}

const INT = new Intl.NumberFormat('en-US')

// Like events are the loudest thing in a busy room, so the timeline lets them be
// switched off without losing anything: the rows stay in the log, they are just
// not shown.
const PREF_KEY = 'vconnectLiveActivityPrefs'

interface Prefs {
  showLikes: boolean
  /** Rows at or before this stamp are hidden: what "Clear timeline" just emptied. */
  clearedAt: number
}

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return { showLikes: true, clearedAt: 0 }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      showLikes: parsed.showLikes !== false,
      clearedAt: typeof parsed.clearedAt === 'number' && parsed.clearedAt > 0 ? parsed.clearedAt : 0
    }
  } catch {
    return { showLikes: true, clearedAt: 0 }
  }
}

/**
 * One timeline for both platforms: TikTok comments / gifts / likes / follows
 * from the live bridge, and YouTube chat / gifts / Super Chats from the stored
 * chat log. TikTok events are mirrored into the main-process event log as they
 * arrive, so the feed survives a restart instead of only showing what this
 * window happened to see.
 */
export function LiveActivityPage({ tk, yt }: { tk: Tk; yt: YouTubeTracker }) {
  const [stored, setStored] = useState<EventLogRow[]>([])
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [showLikes, setShowLikes] = useState(() => readPrefs().showLikes)
  const [clearedAt, setClearedAt] = useState(() => readPrefs().clearedAt)
  const [loaded, setLoaded] = useState(false)
  const refreshTimer = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ showLikes, clearedAt }))
    } catch {
      // Best-effort: the controls still work for this session without storage.
    }
  }, [showLikes, clearedAt])

  const api = window.vconnect?.events

  const reload = useCallback(async () => {
    if (!api) return
    const rows = await api.list(500).catch(() => [])
    if (rows) setStored(rows)
  }, [api])

  useEffect(() => {
    void reload().finally(() => setLoaded(true))
  }, [reload])

  // TikTok rows are written from the renderer, so pull the stored timeline back
  // a beat after a burst instead of re-querying for every single event.
  const tiktokCount = tk.events.length
  useEffect(() => {
    if (!api || tiktokCount === 0) return
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => void reload(), 1500)
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [api, tiktokCount, reload])

  // The timeline is not only the stored log: the bridge's live TikTok events and
  // the YouTube tracker's in-memory chat both feed it too. Clearing has to hide
  // those as well, otherwise the rows you just deleted are still on screen.
  const items = useMemo(
    () =>
      mergeItems(stored, tk.events, yt.messages).filter(
        item => !clearedAt || item.ts > clearedAt
      ),
    [stored, tk.events, yt.messages, clearedAt]
  )

  const visible = useMemo(
    () => filterItems(items, { query, sourceFilter, kindFilter, showLikes }),
    [items, query, sourceFilter, kindFilter, showLikes]
  )

  const counts = useMemo(() => {
    let tiktok = 0
    let youtube = 0
    let gifts = 0
    let comments = 0
    for (const item of items) {
      if (item.source === 'tiktok') tiktok++
      else youtube++
      if (item.kind === 'gift' || item.kind === 'superchat' || item.kind === 'membership') gifts++
      if (item.kind === 'comment') comments++
    }
    return { tiktok, youtube, gifts, comments, total: items.length }
  }, [items])

  const clear = () => {
    if (!api) return
    // Everything already in the timeline is older than this stamp, so the
    // watermark hides the stored rows plus the live copies of the same events.
    const stamp = Date.now()
    const showCleared = (): Promise<void> => {
      setClearedAt(stamp)
      return reload()
    }
    void api.clear().then(showCleared).catch(showCleared)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageSection
        icon={<Layers className="h-4 w-4" />}
        title="Live activity"
        description="Comments and gift events from TikTok and YouTube in one timeline, newest first."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={() => void reload()}>
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-zinc-500 hover:text-red-400"
              onClick={clear}
              disabled={items.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear timeline
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sender or message…"
              className="h-8 w-56 pl-7"
            />
          </div>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Both platforms</SelectItem>
              <SelectItem value="tiktok">TikTok only</SelectItem>
              <SelectItem value="youtube">YouTube only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              <SelectItem value="gift">Gifts</SelectItem>
              <SelectItem value="comment">Comments</SelectItem>
              <SelectItem value="paid">Super Chats + memberships</SelectItem>
              <SelectItem value="social">Likes, follows, subscribes</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={showLikes}
            title="Show or hide like events in this timeline"
            onClick={() => setShowLikes((prev) => !prev)}
            className={`h-8 ${
              showLikes
                ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            {showLikes ? 'Likes shown' : 'Likes hidden'}
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
            <Chip tone="violet">TikTok {INT.format(counts.tiktok)}</Chip>
            <Chip tone="red">YouTube {INT.format(counts.youtube)}</Chip>
            <Chip tone="amber">Gifts {INT.format(counts.gifts)}</Chip>
            <Chip tone="sky">Comments {INT.format(counts.comments)}</Chip>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              {loaded
                ? clearedAt > 0 && items.length === 0
                  ? 'Timeline cleared. New events will show up here.'
                  : 'Nothing yet. Connect the TikTok feed or start the YouTube source and events from both will land here.'
                : 'Loading timeline…'}
            </p>
          ) : (
            visible.slice(0, 300).map((item) => <ActivityRow key={item.key} item={item} />)
          )}
          {visible.length > 300 ? (
            <p className="pt-1 text-center text-[11px] text-zinc-600">
              Showing the most recent 300 of {INT.format(visible.length)} matching events.
            </p>
          ) : null}
        </div>

        <p className="mt-3 text-[11px] text-zinc-600">
          TikTok events are written to the timeline as the bridge receives them; YouTube events are
          mirrored from the live-chat log. The timeline keeps the newest 2,000 events and is separate
          from the YouTube gift log, the supporter totals and your trigger mappings.
        </p>
      </PageSection>
    </div>
  )
}

/* ---------------- merging ---------------- */

function mergeItems(
  stored: EventLogRow[],
  tiktokEvents: ReturnType<typeof useTikfinity>['events'],
  youtubeMessages: YouTubeMessageRow[]
): ActivityItem[] {
  const map = new Map<string, ActivityItem>()

  for (const row of stored) {
    const item = fromStored(row)
    if (item) map.set(item.key, item)
  }

  // Live rows win over stored rows: they are the same events, but the in-memory
  // copy is guaranteed current even before the write lands.
  for (const evt of tiktokEvents) {
    if (evt.type === 'trigger') continue
    const meta = evt.meta ?? {}
    const item: ActivityItem = {
      key: `tk:${evt.type}:${evt.ts}:${evt.detail}`,
      source: 'tiktok',
      kind: evt.type,
      ts: evt.ts,
      sender: meta.sender ?? null,
      avatar: meta.avatar ?? null,
      text: meta.text ?? evt.detail,
      giftName: meta.giftName ?? null,
      jewels: meta.jewels ?? 0,
      combo: meta.combo ?? 0,
      repeat: meta.repeat ?? 0
    }
    map.set(item.key, item)
  }

  for (const row of youtubeMessages) {
    const item = fromYouTube(row)
    if (item) map.set(item.key, item)
  }

  return Array.from(map.values()).sort((a, b) => b.ts - a.ts)
}

function fromStored(row: EventLogRow): ActivityItem | null {
  const source = row.source === 'youtube' ? 'youtube' : 'tiktok'
  const key = row.ref_id
    ? source === 'youtube'
      ? `yt:${row.ref_id}`
      : row.ref_id
    : `${source}:#${row.id}`
  return {
    key,
    source,
    kind: row.kind,
    ts: row.ts,
    sender: row.sender,
    avatar: row.avatar,
    text: row.text ?? '',
    giftName: row.gift_name,
    jewels: row.jewels,
    combo: row.combo,
    repeat: row.repeat
  }
}

/**
 * First value that actually has characters. YouTube reports an empty
 * user_comment on plain chat messages, and ?? would accept that blank.
 */
function firstText(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const text = (value ?? '').trim()
    if (text) return text
  }
  return ''
}

function fromYouTube(row: YouTubeMessageRow): ActivityItem {
  return {
    key: `yt:${row.id}`,
    source: 'youtube',
    kind: kindFromYouTubeType(row.type),
    ts: row.published_at ?? row.captured_at,
    sender: row.author ?? row.author_channel_id,
    avatar: row.avatar,
    text: firstText(
      row.user_comment,
      row.text,
      row.display_message,
      row.alt_text,
      row.amount_display_string ? `paid ${row.amount_display_string}` : null
    ),
    giftName: row.gift_name,
    jewels: row.jewels,
    combo: row.combo_count,
    repeat: row.gift_memberships_count
  }
}

function kindFromYouTubeType(type: string): string {
  switch (type) {
    case 'giftEvent':
      return 'gift'
    case 'textMessageEvent':
      return 'comment'
    case 'superChatEvent':
    case 'superStickerEvent':
    case 'fanFundingEvent':
      return 'superchat'
    case 'membershipGiftingEvent':
    case 'giftMembershipReceivedEvent':
    case 'memberMilestoneChatEvent':
    case 'newSponsorEvent':
      return 'membership'
    default:
      return 'other'
  }
}

function filterItems(
  items: ActivityItem[],
  opts: { query: string; sourceFilter: SourceFilter; kindFilter: KindFilter; showLikes: boolean }
): ActivityItem[] {
  const q = opts.query.trim().toLowerCase()
  return items.filter((item) => {
    if (opts.sourceFilter !== 'all' && item.source !== opts.sourceFilter) return false
    if (item.kind === 'like' && !opts.showLikes) return false
    if (opts.kindFilter === 'gift' && item.kind !== 'gift') return false
    if (opts.kindFilter === 'comment' && item.kind !== 'comment') return false
    if (opts.kindFilter === 'paid' && item.kind !== 'superchat' && item.kind !== 'membership') return false
    if (
      opts.kindFilter === 'social' &&
      item.kind !== 'like' &&
      item.kind !== 'follow' &&
      item.kind !== 'subscribe'
    )
      return false
    if (!q) return true
    return [item.sender, item.text, item.giftName, item.kind]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  })
}

/* ---------------- row ---------------- */

const KIND_LABEL: Record<string, string> = {
  gift: 'gift',
  comment: 'comment',
  like: 'like',
  follow: 'follow',
  subscribe: 'subscribe',
  superchat: 'super chat',
  membership: 'membership',
  other: 'event'
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const time = new Date(item.ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const label = item.sender ?? item.text ?? 'unknown'

  return (
    <div className="flex items-start gap-3 rounded-md border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
      {item.avatar ? (
        <img src={item.avatar} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
          {(label[0] ?? '?').toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="text-[11px] text-zinc-500">{time}</span>
          <Chip tone={item.source === 'youtube' ? 'red' : 'violet'}>{item.source}</Chip>
          <Chip tone="zinc">{KIND_LABEL[item.kind] ?? item.kind}</Chip>
        </div>
        <p className="mt-0.5 line-clamp-3 text-xs text-zinc-300">
          {item.giftName ? (
            <>
              sent <span className="font-semibold">{item.giftName}</span>
              {item.repeat > 1 ? <span className="text-zinc-400"> x{INT.format(item.repeat)}</span> : null}
            </>
          ) : item.source === 'tiktok' ? (
            <span>{item.text}</span>
          ) : (
            <span>{item.text || item.kind}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.jewels > 0 ? <Chip tone="violet">💎 {INT.format(item.jewels)}</Chip> : null}
        {item.combo > 1 ? <Chip tone="amber">combo x{INT.format(item.combo)}</Chip> : null}
        {item.kind === 'gift' && item.jewels === 0 ? <Chip tone="zinc">gift</Chip> : null}
      </div>
    </div>
  )
}

function Chip({ tone, children }: { tone: 'amber' | 'zinc' | 'violet' | 'sky' | 'red'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    zinc: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
    violet: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
    sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    red: 'border-red-500/40 bg-red-500/10 text-red-300'
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>
  )
}
