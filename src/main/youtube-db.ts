/**
 * SQLite layer for the YouTube gift tracker.
 *
 * Everything the tracker needs to survive a restart lives here: captured chat
 * messages, the per-key quota meter, the setup form, and the YouTube gift ->
 * trigger mappings. The YouTube API is polled from the main process, so the
 * main process owns the storage too.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

export type YouTubeMessageType =
  | 'giftEvent'
  | 'superChatEvent'
  | 'superStickerEvent'
  | 'membershipGiftingEvent'
  | 'giftMembershipReceivedEvent'
  | 'memberMilestoneChatEvent'
  | 'newSponsorEvent'
  | 'textMessageEvent'
  | 'pollEvent'
  | 'userBannedEvent'
  | 'tombstone'
  | 'chatEndedEvent'
  | 'sponsorOnlyModeStartedEvent'
  | 'sponsorOnlyModeEndedEvent'
  | 'fanFundingEvent'

export interface YouTubeMessageRow {
  id: string
  live_chat_id: string | null
  type: YouTubeMessageType | string
  published_at: number | null
  captured_at: number
  updated_at: number
  jewels: number
  gift_name: string | null
  gift_url: string | null
  gift_seconds: number
  has_visual_effect: number
  combo_count: number
  alt_text: string | null
  language: string | null
  amount_display_string: string | null
  amount_micros: number
  currency: string | null
  user_comment: string | null
  gift_memberships_count: number
  member_level_name: string | null
  display_message: string | null
  text: string | null
  author: string | null
  author_channel_id: string | null
  author_url: string | null
  avatar: string | null
  is_chat_owner: number
  is_chat_moderator: number
  trigger_fired: number
}

export interface YouTubeMessageInput {
  id: string
  liveChatId?: string
  type: string
  publishedAt?: number
  jewels?: number
  giftName?: string
  giftUrl?: string
  giftSeconds?: number
  hasVisualEffect?: boolean
  comboCount?: number
  altText?: string
  language?: string
  amountDisplayString?: string
  amountMicros?: number
  currency?: string
  userComment?: string
  giftMembershipsCount?: number
  memberLevelName?: string
  displayMessage?: string
  text?: string
  author?: string
  authorChannelId?: string
  authorUrl?: string
  avatar?: string
  isChatOwner?: boolean
  isChatModerator?: boolean
}

export interface YouTubeMappingRow {
  gift_name: string
  vconnect_uid: string | null
  tits_uid: string | null
}

export interface YouTubeStats {
  giftCount: number
  totalJewels: number
  uniqueSenders: number
  maxCombo: number
  messageCount: number
  byGift: { label: string; count: number; jewels: number; comboSeen: number }[]
  bySender: { label: string; count: number; jewels: number }[]
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const file =
      process.env.VCONNECT_DB_PATH ?? join(app.getPath('userData'), 'supporters.db')
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_messages (
        id                     TEXT PRIMARY KEY,
        live_chat_id           TEXT,
        type                   TEXT NOT NULL,
        published_at           INTEGER,
        captured_at            INTEGER NOT NULL,
        updated_at             INTEGER NOT NULL,
        jewels                 INTEGER NOT NULL DEFAULT 0,
        gift_name              TEXT,
        gift_url               TEXT,
        gift_seconds           INTEGER NOT NULL DEFAULT 0,
        has_visual_effect      INTEGER NOT NULL DEFAULT 0,
        combo_count            INTEGER NOT NULL DEFAULT 0,
        alt_text               TEXT,
        language               TEXT,
        amount_display_string  TEXT,
        amount_micros          INTEGER NOT NULL DEFAULT 0,
        currency               TEXT,
        user_comment           TEXT,
        gift_memberships_count INTEGER NOT NULL DEFAULT 0,
        member_level_name      TEXT,
        display_message        TEXT,
        text                   TEXT,
        author                 TEXT,
        author_channel_id      TEXT,
        author_url             TEXT,
        avatar                 TEXT,
        is_chat_owner          INTEGER NOT NULL DEFAULT 0,
        is_chat_moderator      INTEGER NOT NULL DEFAULT 0,
        trigger_fired          INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_yt_messages_published ON youtube_messages(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_yt_messages_type ON youtube_messages(type);
      CREATE INDEX IF NOT EXISTS idx_yt_messages_gift ON youtube_messages(gift_name);

      CREATE TABLE IF NOT EXISTS youtube_quota (
        day      TEXT NOT NULL,
        api_key  TEXT NOT NULL,
        units    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, api_key)
      );

      CREATE TABLE IF NOT EXISTS youtube_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS youtube_mappings (
        gift_name    TEXT PRIMARY KEY,
        vconnect_uid TEXT,
        tits_uid     TEXT
      );
    `)
  }
  return db
}

/* ---------------- messages ---------------- */

/**
 * Insert a captured message. Returns 'added' for a new message, or 'merged'
 * when the API reused an existing message id to raise comboCount (documented
 * behaviour for giftEvent). A merge never changes jewels - the message was
 * already counted once.
 */
export function upsertMessage(input: YouTubeMessageInput): 'added' | 'merged' | 'unchanged' {
  const d = getDb()
  const now = Date.now()
  const existing = d.prepare('SELECT id, combo_count FROM youtube_messages WHERE id = ?').get(input.id) as
    | { id: string; combo_count: number }
    | undefined

  if (existing) {
    const combo = input.comboCount ?? 0
    if (combo > existing.combo_count) {
      d.prepare('UPDATE youtube_messages SET combo_count = ?, updated_at = ? WHERE id = ?').run(
        combo,
        now,
        input.id
      )
      return 'merged'
    }
    return 'unchanged'
  }

  d.prepare(
    `INSERT INTO youtube_messages (
      id, live_chat_id, type, published_at, captured_at, updated_at,
      jewels, gift_name, gift_url, gift_seconds, has_visual_effect, combo_count,
      alt_text, language, amount_display_string, amount_micros, currency, user_comment,
      gift_memberships_count, member_level_name, display_message, text,
      author, author_channel_id, author_url, avatar, is_chat_owner, is_chat_moderator
    ) VALUES (
      @id, @liveChatId, @type, @publishedAt, @now, @now,
      @jewels, @giftName, @giftUrl, @giftSeconds, @hasVisualEffect, @comboCount,
      @altText, @language, @amountDisplayString, @amountMicros, @currency, @userComment,
      @giftMembershipsCount, @memberLevelName, @displayMessage, @text,
      @author, @authorChannelId, @authorUrl, @avatar, @isChatOwner, @isChatModerator
    )`
  ).run({
    id: input.id,
    liveChatId: input.liveChatId ?? null,
    type: input.type,
    publishedAt: input.publishedAt ?? null,
    now,
    jewels: input.jewels ?? 0,
    giftName: input.giftName ?? null,
    giftUrl: input.giftUrl ?? null,
    giftSeconds: input.giftSeconds ?? 0,
    hasVisualEffect: input.hasVisualEffect ? 1 : 0,
    comboCount: input.comboCount ?? 0,
    altText: input.altText ?? null,
    language: input.language ?? null,
    amountDisplayString: input.amountDisplayString ?? null,
    amountMicros: input.amountMicros ?? 0,
    currency: input.currency ?? null,
    userComment: input.userComment ?? null,
    giftMembershipsCount: input.giftMembershipsCount ?? 0,
    memberLevelName: input.memberLevelName ?? null,
    displayMessage: input.displayMessage ?? null,
    text: input.text ?? null,
    author: input.author ?? null,
    authorChannelId: input.authorChannelId ?? null,
    authorUrl: input.authorUrl ?? null,
    avatar: input.avatar ?? null,
    isChatOwner: input.isChatOwner ? 1 : 0,
    isChatModerator: input.isChatModerator ? 1 : 0
  })

  return 'added'
}

export function listMessages(limit = 1000): YouTubeMessageRow[] {
  const d = getDb()
  const capped = Math.max(1, Math.min(5000, Math.trunc(limit) || 1000))
  return d
    .prepare('SELECT * FROM youtube_messages ORDER BY COALESCE(published_at, captured_at) DESC LIMIT ?')
    .all(capped) as YouTubeMessageRow[]
}

export function getMessage(id: string): YouTubeMessageRow | undefined {
  return getDb().prepare('SELECT * FROM youtube_messages WHERE id = ?').get(id) as
    | YouTubeMessageRow
    | undefined
}

export function markTriggerFired(id: string): void {
  getDb().prepare('UPDATE youtube_messages SET trigger_fired = 1 WHERE id = ?').run(id)
}

export function clearMessages(): void {
  // The gift log only. `supporters` is a cross-source leaderboard and is
  // reset from the Supporters page instead.
  getDb().prepare('DELETE FROM youtube_messages').run()
}

export function getStats(): YouTubeStats {
  const d = getDb()
  const totals = d
    .prepare(
      `SELECT COUNT(*) AS gift_count,
              COALESCE(SUM(jewels), 0) AS jewels,
              COUNT(DISTINCT COALESCE(author_channel_id, author, 'unknown')) AS senders,
              COALESCE(MAX(combo_count), 0) AS max_combo
       FROM youtube_messages WHERE type = 'giftEvent'`
    )
    .get() as { gift_count: number; jewels: number; senders: number; max_combo: number }

  const messageCount = (d.prepare('SELECT COUNT(*) AS c FROM youtube_messages').get() as { c: number }).c

  const byGift = d
    .prepare(
      `SELECT COALESCE(gift_name, '(unnamed gift)') AS label,
              COUNT(*) AS count,
              COALESCE(SUM(jewels), 0) AS jewels,
              MAX(CASE WHEN combo_count > 0 THEN 1 ELSE 0 END) AS combo_seen
       FROM youtube_messages WHERE type = 'giftEvent'
       GROUP BY label ORDER BY jewels DESC, count DESC LIMIT 25`
    )
    .all() as { label: string; count: number; jewels: number; combo_seen: number }[]

  const bySender = d
    .prepare(
      `SELECT COALESCE(author, author_channel_id, 'unknown') AS label,
              COUNT(*) AS count,
              COALESCE(SUM(jewels), 0) AS jewels
       FROM youtube_messages WHERE type = 'giftEvent'
       GROUP BY label ORDER BY jewels DESC, count DESC LIMIT 10`
    )
    .all() as { label: string; count: number; jewels: number }[]

  return {
    giftCount: totals.gift_count,
    totalJewels: totals.jewels,
    uniqueSenders: totals.senders,
    maxCombo: totals.max_combo,
    messageCount,
    byGift: byGift.map((r) => ({ label: r.label, count: r.count, jewels: r.jewels, comboSeen: r.combo_seen })),
    bySender
  }
}

export function getGiftNames(): string[] {
  return (
    getDb()
      .prepare(
        `SELECT DISTINCT gift_name AS name FROM youtube_messages
         WHERE type = 'giftEvent' AND gift_name IS NOT NULL AND gift_name <> ''
         ORDER BY name`
      )
      .all() as { name: string }[]
  ).map((r) => r.name)
}

/* ---------------- quota ---------------- */

export function getQuotaUsed(day: string): Record<string, number> {
  const rows = getDb().prepare('SELECT api_key, units FROM youtube_quota WHERE day = ?').all(day) as {
    api_key: string
    units: number
  }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.api_key] = r.units
  return out
}

export function addQuotaUnits(day: string, apiKey: string, units: number): void {
  if (!apiKey) return
  getDb()
    .prepare(
      `INSERT INTO youtube_quota (day, api_key, units) VALUES (?, ?, ?)
       ON CONFLICT(day, api_key) DO UPDATE SET units = units + excluded.units`
    )
    .run(day, apiKey, units)
}

export function resetQuota(day: string): void {
  getDb().prepare('DELETE FROM youtube_quota WHERE day = ?').run(day)
}

/* ---------------- settings ---------------- */

export function getSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM youtube_settings').all() as {
    key: string
    value: string | null
  }[]
  const out: Record<string, string> = {}
  for (const r of rows) if (r.value !== null) out[r.key] = r.value
  return out
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO youtube_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

/* ---------------- mappings ---------------- */

export function listMappings(): YouTubeMappingRow[] {
  return getDb()
    .prepare('SELECT * FROM youtube_mappings ORDER BY gift_name')
    .all() as YouTubeMappingRow[]
}

export function upsertMapping(
  giftName: string,
  vconnectUid: string | null,
  titsUid: string | null
): YouTubeMappingRow[] {
  const name = giftName.trim()
  if (!name) return listMappings()
  const d = getDb()
  const existing = d.prepare('SELECT * FROM youtube_mappings WHERE gift_name = ?').get(name) as
    | YouTubeMappingRow
    | undefined

  if (existing) {
    d.prepare('UPDATE youtube_mappings SET vconnect_uid = ?, tits_uid = ? WHERE gift_name = ?').run(
      vconnectUid ?? null,
      titsUid ?? null,
      name
    )
  } else {
    d.prepare('INSERT INTO youtube_mappings (gift_name, vconnect_uid, tits_uid) VALUES (?, ?, ?)').run(
      name,
      vconnectUid ?? null,
      titsUid ?? null
    )
  }
  return listMappings()
}

export function deleteMapping(giftName: string): YouTubeMappingRow[] {
  getDb().prepare('DELETE FROM youtube_mappings WHERE gift_name = ?').run(giftName.trim())
  return listMappings()
}

export function findMapping(giftName: string): YouTubeMappingRow | undefined {
  if (!giftName) return undefined
  return getDb().prepare('SELECT * FROM youtube_mappings WHERE gift_name = ? COLLATE NOCASE').get(
    giftName
  ) as YouTubeMappingRow | undefined
}
