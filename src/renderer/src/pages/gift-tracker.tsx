import {
  AlertTriangle,
  Download,
  Gift,
  Search,
  Settings2,
  Trash2,
  WandSparkles
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageSection } from '@/components/page-section'
import { TriggerSelect } from '@/components/trigger-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { YouTubeTracker } from '@/hooks/use-youtube-tracker'
import type { useTikfinity } from '@/hooks/use-tikfinity'
import type { PageId } from '@/lib/pages'

type Tk = ReturnType<typeof useTikfinity>

type SortKey = 'recent' | 'oldest' | 'jewels' | 'combo' | 'gift' | 'author'

const INT = new Intl.NumberFormat('en-US')

function fmtInt(value: number): string {
  return INT.format(Math.trunc(value) || 0)
}

function fmtTime(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`
}

function jewelLabel(value: number): string {
  return `💎 ${fmtInt(value)}`
}

/**
 * Youtube Maps. The feed itself (keys, video, poll interval) is configured on
 * the Overview page under "YouTube live source"; this tab is the working surface:
 * gift-to-trigger mappings first, then status, stats and the captured log.
 */
export function GiftTrackerPage({
  tk,
  yt,
  onNavigate
}: {
  tk: Tk
  yt: YouTubeTracker
  onNavigate: (p: PageId) => void
}) {
  const [query, setQuery] = useState('')
  const [giftFilter, setGiftFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('recent')

  const rows = useMemo(() => filterRows(yt.messages, { query, giftFilter, typeFilter, sort }), [
    yt.messages,
    query,
    giftFilter,
    typeFilter,
    sort
  ])

  if (!yt.available) {
    return (
      <PageSection icon={<AlertTriangle className="h-4 w-4" />} title="Youtube Maps unavailable">
        <p className="text-sm text-zinc-400">
          The YouTube bridge is not exposed in this window. Restart the app (npm run dev) so the
          preload script loads the youtube API.
        </p>
      </PageSection>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {yt.notice.kind === 'err' ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            {yt.notice.text}
            <button
              className="ml-2 underline-offset-2 hover:underline"
              onClick={() => onNavigate('overview')}
            >
              Check the YouTube source settings
            </button>
          </span>
        </p>
      ) : null}
      <MappingCard tk={tk} yt={yt} />
      <LogCard
        yt={yt}
        onNavigate={onNavigate}
        rows={rows}
        query={query}
        setQuery={setQuery}
        giftFilter={giftFilter}
        setGiftFilter={setGiftFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        sort={sort}
        setSort={setSort}
      />
    </div>
  )
}

/* ---------------- mappings ---------------- */

function MappingCard({ tk, yt }: { tk: Tk; yt: YouTubeTracker }) {
  const [giftName, setGiftName] = useState('')
  const [vconnectUid, setVconnectUid] = useState('')
  const [titsUid, setTitsUid] = useState('')

  const add = () => {
    if (!giftName.trim() || (!vconnectUid && !titsUid)) return
    void yt.setMapping(giftName.trim(), vconnectUid || null, titsUid || null)
    setGiftName('')
    setVconnectUid('')
    setTitsUid('')
  }

  return (
    <PageSection
      icon={<WandSparkles className="h-4 w-4" />}
      title="YouTube gifts → triggers"
      description="Map a YouTube gift name to a VConnect or TITS trigger. A mapped gift fires once, when the gift message is first seen."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          list="yt-gift-names"
          value={giftName}
          onChange={(e) => setGiftName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Gift name (e.g. Heart)"
          className="h-8 w-44"
        />
        <datalist id="yt-gift-names">
          {yt.giftNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">VConnect</span>
          <TriggerSelect triggers={tk.triggers} value={vconnectUid} onChange={setVconnectUid} placeholder="None" className="w-40" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">TITS</span>
          <TriggerSelect triggers={tk.titsTriggers} value={titsUid} onChange={setTitsUid} placeholder="None" className="w-40" />
        </div>
        <Button size="sm" className="h-8" disabled={!giftName.trim() || (!vconnectUid && !titsUid)} onClick={add}>
          Save mapping
        </Button>
      </div>

      <div className="mt-2 max-h-56 overflow-y-auto">
        {yt.mappings.length === 0 ? (
          <Empty>No YouTube gift mappings yet</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-2 py-1">Gift</th>
                <th className="px-2 py-1">VConnect</th>
                <th className="px-2 py-1">TITS</th>
                <th className="w-10 px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {yt.mappings.map((row) => (
                <tr key={row.gift_name} className="border-t border-zinc-800/60">
                  <td className="px-2 py-1.5 font-medium">{row.gift_name}</td>
                  <td className="px-2 py-1.5 text-zinc-400">
                    {row.vconnect_uid ? tk.getTriggerName(row.vconnect_uid) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-400">
                    {row.tits_uid ? tk.getTitsTriggerName(row.tits_uid) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      className="text-zinc-600 transition-colors hover:text-red-400"
                      onClick={() => void yt.deleteMapping(row.gift_name)}
                      aria-label={`Remove mapping for ${row.gift_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Trigger firing uses the same VConnect / TITS sockets as TikTok gifts, so the bridge has to be
        connected for a YouTube gift to produce an effect. Mappings here are independent from your
        TikTok gift maps.
      </p>
    </PageSection>
  )
}

/* ---------------- gift log ---------------- */

function LogCard({
  yt,
  onNavigate,
  rows,
  query,
  setQuery,
  giftFilter,
  setGiftFilter,
  typeFilter,
  setTypeFilter,
  sort,
  setSort
}: {
  yt: YouTubeTracker
  onNavigate: (p: PageId) => void
  rows: YouTubeMessageRow[]
  query: string
  setQuery: (v: string) => void
  giftFilter: string
  setGiftFilter: (v: string) => void
  typeFilter: string
  setTypeFilter: (v: string) => void
  sort: SortKey
  setSort: (v: SortKey) => void
}) {
  const gifts = Array.from(new Set(yt.messages.map((m) => m.gift_name).filter(Boolean))) as string[]

  return (
    <PageSection
      icon={<Gift className="h-4 w-4" />}
      title="Gift log"
      description={`${fmtInt(yt.stats.messageCount)} stored message(s) · showing ${fmtInt(rows.length)}`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => void yt.exportLog('csv')}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => void yt.exportLog('json')}>
            <Download className="h-3.5 w-3.5" />
            JSON
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
            placeholder="Search sender, gift, comment…"
            className="h-8 w-56 pl-7"
          />
        </div>
        <Select value={giftFilter} onValueChange={setGiftFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gifts</SelectItem>
            {gifts.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="gifts">Gifts only</SelectItem>
            <SelectItem value="money">Paid events</SelectItem>
            <SelectItem value="chat">Chat / memberships</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="jewels">Most jewels</SelectItem>
            <SelectItem value="combo">Highest combo</SelectItem>
            <SelectItem value="gift">Gift name A-Z</SelectItem>
            <SelectItem value="author">Sender A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-zinc-500">Nothing captured yet.</p>
            <Button size="sm" variant="outline" className="h-8" onClick={() => onNavigate('overview')}>
              <Settings2 className="h-3.5 w-3.5" />
              Start the YouTube source from Overview
            </Button>
          </div>
        ) : (
          rows.map((row) => <MessageRow key={row.id} row={row} mapped={!!yt.mappingFor(row.gift_name ?? '')} />)
        )}
      </div>
    </PageSection>
  )
}

const PAID = new Set([
  'giftEvent',
  'superChatEvent',
  'superStickerEvent',
  'membershipGiftingEvent',
  'giftMembershipReceivedEvent'
])

function MessageRow({ row, mapped }: { row: YouTubeMessageRow; mapped: boolean }) {
  const name = row.author || row.author_channel_id || 'unknown'
  const time = fmtTime(row.published_at ?? row.captured_at)
  const comment = row.user_comment || row.text || row.display_message || ''

  return (
    <div className="flex items-start gap-3 rounded-md border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
      {row.avatar ? (
        <img src={row.avatar} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
          {(name[0] ?? '?').toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-[11px] text-zinc-500">{time}</span>
          <span className="text-[11px] text-zinc-600">{row.type}</span>
          {row.is_chat_owner ? <Tag tone="sky">owner</Tag> : null}
          {row.is_chat_moderator ? <Tag tone="violet">mod</Tag> : null}
        </div>
        <p className="mt-0.5 text-xs text-zinc-300">
          {row.gift_name ? (
            <>
              sent <span className="font-semibold">{row.gift_name}</span>
              {row.jewels > 0 ? <span className="ml-1 text-violet-300">{jewelLabel(row.jewels)}</span> : null}
            </>
          ) : row.amount_display_string ? (
            <>
              paid <span className="font-semibold">{row.amount_display_string}</span>
            </>
          ) : (
            <span className="text-zinc-400">{row.display_message || row.type}</span>
          )}
          {row.member_level_name ? <span className="ml-1 text-zinc-500">({row.member_level_name})</span> : null}
          {row.gift_memberships_count ? <span className="ml-1 text-zinc-500">×{row.gift_memberships_count}</span> : null}
        </p>
        {comment ? <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">“{comment}”</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {row.combo_count > 0 ? <Tag tone="amber">combo x{fmtInt(row.combo_count)}</Tag> : null}
        {row.has_visual_effect ? <Tag tone="emerald">visual effect</Tag> : null}
        {row.gift_seconds ? <Tag tone="zinc">{row.gift_seconds}s</Tag> : null}
        {mapped ? <Tag tone="violet">mapped</Tag> : null}
      </div>
    </div>
  )
}

function Tag({ tone, children }: { tone: 'amber' | 'emerald' | 'zinc' | 'violet' | 'sky'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    zinc: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
    violet: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
    sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  }
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-zinc-500">{children}</p>
}

/* ---------------- filtering ---------------- */

function filterRows(
  rows: YouTubeMessageRow[],
  opts: { query: string; giftFilter: string; typeFilter: string; sort: SortKey }
): YouTubeMessageRow[] {
  const q = opts.query.trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (opts.giftFilter !== 'all' && row.gift_name !== opts.giftFilter) return false
    if (opts.typeFilter === 'gifts' && row.type !== 'giftEvent') return false
    if (opts.typeFilter === 'money' && !PAID.has(row.type)) return false
    if (opts.typeFilter === 'chat' && PAID.has(row.type)) return false
    if (!q) return true
    return [row.author, row.gift_name, row.user_comment, row.text, row.display_message, row.type, row.member_level_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  })

  const time = (row: YouTubeMessageRow) => row.published_at ?? row.captured_at
  const sorted = filtered.slice()
  switch (opts.sort) {
    case 'oldest':
      sorted.sort((a, b) => time(a) - time(b))
      break
    case 'jewels':
      sorted.sort((a, b) => b.jewels - a.jewels || time(b) - time(a))
      break
    case 'combo':
      sorted.sort((a, b) => b.combo_count - a.combo_count || time(b) - time(a))
      break
    case 'gift':
      sorted.sort((a, b) => String(a.gift_name ?? '').localeCompare(String(b.gift_name ?? '')))
      break
    case 'author':
      sorted.sort((a, b) => String(a.author ?? '').localeCompare(String(b.author ?? '')))
      break
    default:
      sorted.sort((a, b) => time(b) - time(a))
  }
  return sorted
}
