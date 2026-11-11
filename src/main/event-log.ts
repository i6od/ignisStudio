/**
 * Shared timeline storage for the "Live activity" tab.
 *
 * TikTok events arrive from the renderer (the bridge lives there), YouTube
 * events are mirrored from the YouTube poller in the main process. Both land in
 * one table so a single query returns a chronological feed of comments and gift
 * events across both platforms.
 *
 * This is a display timeline, not the source of truth for the gift log:
 * youtube_messages keeps the detailed YouTube record, supporters keeps the
 * per-user totals. Rows here are pruned to the most recent MAX_ROWS entries.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

import type { YouTubeMessageRow } from './youtube-db'

export type EventLogSource = 'tiktok' | 'youtube'

export type EventLogKind =
  | 'gift'
  | 'comment'
  | 'like'
  | 'follow'
  | 'subscribe'
  | 'superchat'
  | 'membership'
  | 'other'

export interface EventLogRow {
  id: number
  source: EventLogSource | string
  kind: EventLogKind | string
  ts: number
  sender: string | null
  sender_id: string | null
  avatar: string | null
  text: string | null
  gift_name: string | null
  jewels: number
  combo: number
  repeat: number
  ref_id: string | null
}

export interface EventLogInput {
  source: EventLogSource
  kind: EventLogKind
  ts: number
  sender?: string | null
  senderId?: string | null
  avatar?: string | null
  text?: string | null
  giftName?: string | null
  jewels?: number
  combo?: number
  repeat?: number
  refId?: string | null
}

export interface EventLogStats {
  total: number
  tiktok: number
  youtube: number
  gifts: number
  comments: number
}

const MAX_ROWS = 2000
const PRUNE_EVERY = 100

let db: Database.Database | null = null
let writesSincePrune = 0

function getDb(): Database.Database {
  if (!db) {
    const file = process.env.VCONNECT_DB_PATH ?? join(app.getPath('userData'), 'supporters.db')
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        source    TEXT NOT NULL,
        kind      TEXT NOT NULL,
        ts        INTEGER NOT NULL,
        sender    TEXT,
        sender_id TEXT,
        avatar    TEXT,
        text      TEXT,
        gift_name TEXT,
        jewels    INTEGER NOT NULL DEFAULT 0,
        combo     INTEGER NOT NULL DEFAULT 0,
        repeat    INTEGER NOT NULL DEFAULT 0,
        ref_id    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_event_log_ts ON event_log(ts DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_event_log_ref ON event_log(source, ref_id) WHERE ref_id IS NOT NULL;
    `)
    backfillYouTubeText()
  }
  return db
}

/** YouTube reports one message id whose comboCount grows; keep the highest value. */
const upsertStatement = (): Database.Statement =>
  getDb().prepare(`
    INSERT INTO event_log (
      source, kind, ts, sender, sender_id, avatar, text, gift_name, jewels, combo, repeat, ref_id
    ) VALUES (
      @source, @kind, @ts, @sender, @senderId, @avatar, @text, @giftName, @jewels, @combo, @repeat, @refId
    )
    ON CONFLICT (source, ref_id) WHERE ref_id IS NOT NULL DO UPDATE SET
      ts        = MAX(ts, excluded.ts),
      kind      = excluded.kind,
      sender    = COALESCE(excluded.sender, sender),
      avatar    = COALESCE(excluded.avatar, avatar),
      text      = COALESCE(excluded.text, text),
      gift_name = COALESCE(excluded.gift_name, gift_name),
      jewels    = MAX(jewels, excluded.jewels),
      combo     = MAX(combo, excluded.combo),
      repeat    = MAX(repeat, excluded.repeat)
  `)

function afterWrite(): void {
  writesSincePrune += 1
  if (writesSincePrune < PRUNE_EVERY) return
  writesSincePrune = 0
  const { c } = getDb().prepare('SELECT COUNT(*) AS c FROM event_log').get() as { c: number }
  if (c <= MAX_ROWS) return
  getDb()
    .prepare(
      `DELETE FROM event_log WHERE id NOT IN (
        SELECT id FROM event_log ORDER BY ts DESC, id DESC LIMIT ?
      )`
    )
    .run(MAX_ROWS)
}

export function appendEvent(input: EventLogInput): EventLogRow | null {
  const text = truncate(input.text ?? null)
  const statement = upsertStatement()
  const refId = input.refId ? String(input.refId).slice(0, 200) : null

  statement.run({
    source: input.source,
    kind: input.kind,
    ts: Number.isFinite(input.ts) ? Math.trunc(input.ts) : Date.now(),
    sender: clampText(input.sender ?? null),
    senderId: clampText(input.senderId ?? null),
    avatar: clampText(input.avatar ?? null),
    text,
    giftName: clampText(input.giftName ?? null),
    jewels: Math.max(0, Math.trunc(input.jewels ?? 0) || 0),
    combo: Math.max(0, Math.trunc(input.combo ?? 0) || 0),
    repeat: Math.max(0, Math.trunc(input.repeat ?? 0) || 0),
    refId
  })
  afterWrite()

  if (!refId) return null
  return getDb()
    .prepare('SELECT * FROM event_log WHERE source = ? AND ref_id = ?')
    .get(input.source, refId) as EventLogRow
}

/** Mirror one captured YouTube chat message into the shared timeline. */
export function mirrorYouTubeMessage(row: YouTubeMessageRow): void {
  appendEvent({
    source: 'youtube',
    kind: kindFromYouTubeType(row.type),
    ts: row.published_at ?? row.captured_at,
    sender: row.author ?? row.author_channel_id ?? null,
    senderId: row.author_channel_id ?? null,
    avatar: row.avatar ?? null,
    // YouTube leaves user_comment as an empty string on plain chat messages, and
    // ?? would happily accept that - which is what made every comment row blank.
    text: firstText(
      row.user_comment,
      row.text,
      row.display_message,
      row.alt_text,
      row.amount_display_string ? `paid ${row.amount_display_string}` : null
    ),
    giftName: row.gift_name ?? null,
    jewels: row.jewels,
    combo: row.combo_count,
    repeat: row.gift_memberships_count,
    refId: row.id
  })
}

export function kindFromYouTubeType(type: string): EventLogKind {
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

export function listEventLog(limit = 300): EventLogRow[] {
  const capped = Math.min(1000, Math.max(1, Math.trunc(limit) || 300))
  return getDb()
    .prepare('SELECT * FROM event_log ORDER BY ts DESC, id DESC LIMIT ?')
    .all(capped) as EventLogRow[]
}

export function getEventLogStats(): EventLogStats {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN source = 'tiktok' THEN 1 ELSE 0 END) AS tiktok,
         SUM(CASE WHEN source = 'youtube' THEN 1 ELSE 0 END) AS youtube,
         SUM(CASE WHEN kind IN ('gift', 'superchat', 'membership') THEN 1 ELSE 0 END) AS gifts,
         SUM(CASE WHEN kind = 'comment' THEN 1 ELSE 0 END) AS comments
       FROM event_log`
    )
    .get() as Record<string, number | null>

  return {
    total: row.total ?? 0,
    tiktok: row.tiktok ?? 0,
    youtube: row.youtube ?? 0,
    gifts: row.gifts ?? 0,
    comments: row.comments ?? 0
  }
}

export function clearEventLog(): void {
  getDb().prepare('DELETE FROM event_log').run()
  writesSincePrune = 0
}

function clampText(value: string | null): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, 400)
}

/** First value that actually has characters - empty strings do not count. */
function firstText(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const text = clampText(value === null || value === undefined ? null : String(value))
    if (text) return text
  }
  return null
}

/**
 * Older builds mirrored YouTube comments with a blank text (user_comment is ""
 * on plain chat messages), which made the timeline show the bare word
 * "comment". Refill those rows from the message log once so an existing
 * timeline reads properly again.
 */
export function backfillYouTubeText(): void {
  if (!db) return
  try {
    db.prepare(`
      UPDATE event_log
         SET text = COALESCE(
           (SELECT NULLIF(TRIM(m.user_comment), '') FROM youtube_messages m WHERE m.id = event_log.ref_id),
           (SELECT NULLIF(TRIM(m.text), '') FROM youtube_messages m WHERE m.id = event_log.ref_id),
           (SELECT NULLIF(TRIM(m.display_message), '') FROM youtube_messages m WHERE m.id = event_log.ref_id),
           (SELECT NULLIF(TRIM(m.alt_text), '') FROM youtube_messages m WHERE m.id = event_log.ref_id)
         )
       WHERE source = 'youtube' AND (text IS NULL OR TRIM(text) = '')
    `).run()
  } catch {
    // A fresh profile has no youtube_messages table yet - nothing to refill.
  }
}

function truncate(value: string | null): string | null {
  if (!value) return null
  return value.length > 600 ? `${value.slice(0, 597)}...` : value
}
