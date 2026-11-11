import { Crown, Gem, MessageSquare, RefreshCcw, ThumbsUp, Trash2, Trophy, Video } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'
import type { useTikfinity } from '@/hooks/use-tikfinity'

type Tk = ReturnType<typeof useTikfinity>

type Tab = 'gifts' | 'jewels' | 'likes' | 'comments'

interface Supporter {
  user_key: string
  unique_id: string | null
  nickname: string | null
  avatar: string | null
  diamonds: number
  jewels: number
  likes_count: number
  comments_count: number
  source: 'tiktok' | 'youtube'
}

export function SupportersPage({ tk }: { tk: Tk }) {
  const [tab, setTab] = useState<Tab>('gifts')
  const [rows, setRows] = useState<Supporter[]>([])

  // tk is a new object on every render; the function itself is stable, so hold
  // onto it instead of the whole hook or the refresh effect would re-run forever.
  const getTopSupporters = tk.getTopSupporters
  const load = useCallback(async () => {
    setRows(await getTopSupporters(tab, 20))
  }, [getTopSupporters, tab])

  useEffect(() => {
    void load()
  }, [load])

  // The hook re-summarises after every recorded event, so the board follows a
  // live stream without hammering SQLite: coalesce the burst into one reload.
  const summary = tk.supporterSummary
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 900)
    return () => window.clearTimeout(timer)
  }, [load, summary])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Trophy className="h-4 w-4" />}
        title="Top Supporters"
        description="Persisted leaderboard from the local SQLite database"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-500 hover:text-red-400"
              onClick={async () => {
                await window.vconnect?.supporters.reset()
                tk.refreshSupporterSummary()
                load()
              }}
            >
              <Trash2 className="h-4 w-4" /> Reset DB
            </Button>
          </div>
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <TabButton
            active={tab === 'gifts'}
            onClick={() => setTab('gifts')}
            icon={<Gem className="h-3.5 w-3.5" />}
            label="Top TikTok gifters"
            sub={tk.supporterSummary?.topGifter ? `${tk.supporterSummary.topGifter.nickname} · ${tk.supporterSummary.topGifter.count} 💎` : 'No data'}
          />
          <TabButton
            active={tab === 'jewels'}
            onClick={() => setTab('jewels')}
            icon={<Video className="h-3.5 w-3.5" />}
            label="Top YouTube gifters"
            sub={tk.supporterSummary?.topJeweler ? `${tk.supporterSummary.topJeweler.nickname} · ${tk.supporterSummary.topJeweler.count} ◆ jewels` : 'No data'}
          />
          <TabButton
            active={tab === 'likes'}
            onClick={() => setTab('likes')}
            icon={<ThumbsUp className="h-3.5 w-3.5" />}
            label="Top Likers"
            sub={tk.supporterSummary?.topLiker ? `${tk.supporterSummary.topLiker.nickname} · ${tk.supporterSummary.topLiker.count}` : 'No data'}
          />
          <TabButton
            active={tab === 'comments'}
            onClick={() => setTab('comments')}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Top Commenters"
            sub={tk.supporterSummary?.topCommenter ? `${tk.supporterSummary.topCommenter.nickname} · ${tk.supporterSummary.topCommenter.count}` : 'No data'}
          />
        </div>

        <div className="max-h-96 space-y-1 overflow-y-auto">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">
              No supporters recorded yet — events will be tracked here automatically.
            </p>
          )}
          {rows.map((r, i) => (
            <SupporterRow key={r.user_key} row={r} rank={i + 1} tab={tab} />
          ))}
        </div>

        {tk.supporterSummary && (
          <p className="mt-2 text-xs text-zinc-500">
            {tk.supporterSummary.total} unique supporter{tk.supporterSummary.total === 1 ? '' : 's'} tracked
          </p>
        )}
      </PageSection>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  sub
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  sub: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-violet-500/60 bg-violet-500/10'
          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className="max-w-full truncate text-[10px] text-zinc-500">{sub}</span>
    </button>
  )
}

function SupporterRow({ row, rank, tab }: { row: Supporter; rank: number; tab: Tab }) {
  const count =
    tab === 'gifts'
      ? `${row.diamonds} 💎`
      : tab === 'jewels'
        ? `${row.jewels} ◆`
        : tab === 'likes'
          ? `${row.likes_count} ❤`
          : `${row.comments_count} 💬`
  const name = row.nickname ?? row.unique_id ?? row.user_key ?? 'anonymous'

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
      <span
        className={`w-6 shrink-0 text-center text-sm font-semibold ${
          rank === 1 ? 'text-amber-300' : 'text-zinc-500'
        }`}
      >
        {rank}
      </span>
      {row.avatar ? (
        <img src={row.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400">
          {(name[0] ?? '?').toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="flex items-center gap-1.5 truncate text-[10px] text-zinc-500">
          <span className="truncate">@{row.unique_id ?? row.user_key}</span>
          {row.source === 'youtube' ? (
            <span className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-1 text-[9px] text-red-300">
              YouTube
            </span>
          ) : null}
        </p>
      </div>
      {rank <= 3 && (
        <Crown
          className={`h-4 w-4 ${
            rank === 1
              ? 'text-amber-400'
              : rank === 2
                ? 'text-zinc-300'
                : 'text-orange-400'
          }`}
        />
      )}
      <span className={`shrink-0 text-xs font-semibold ${rank === 1 ? 'text-amber-300' : 'text-zinc-300'}`}>
        {count}
      </span>
    </div>
  )
}