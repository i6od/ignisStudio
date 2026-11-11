import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

export type SupporterMetric = 'gifts' | 'likes' | 'comments' | 'jewels'

export type SupporterSource = 'tiktok' | 'youtube'

export interface SupporterRow {
  user_key: string
  unique_id: string | null
  nickname: string
  avatar: string | null
  gifts_count: number
  diamonds: number
  likes_count: number
  comments_count: number
  follows_count: number
  subs_count: number
  first_seen: number
  last_seen: number
  source: SupporterSource
  jewels: number
}

export interface RecordEventInput {
  type: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe'
  userId?: string
  uniqueId?: string
  nickname?: string
  profilePictureUrl?: string
  repeatCount?: number
  diamondCount?: number
  likeCount?: number
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const file =
      process.env.VCONNECT_DB_PATH ?? join(app.getPath('userData'), 'supporters.db')
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS supporters (
        user_key      TEXT PRIMARY KEY,
        unique_id     TEXT,
        nickname      TEXT,
        avatar        TEXT,
        gifts_count   INTEGER NOT NULL DEFAULT 0,
        diamonds      INTEGER NOT NULL DEFAULT 0,
        likes_count   INTEGER NOT NULL DEFAULT 0,
        comments_count INTEGER NOT NULL DEFAULT 0,
        follows_count INTEGER NOT NULL DEFAULT 0,
        subs_count    INTEGER NOT NULL DEFAULT 0,
        first_seen    INTEGER,
        last_seen     INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_supporters_diamonds ON supporters(diamonds DESC);
      CREATE INDEX IF NOT EXISTS idx_supporters_likes ON supporters(likes_count DESC);
      CREATE INDEX IF NOT EXISTS idx_supporters_comments ON supporters(comments_count DESC);
    `)

    // Added when YouTube gifts joined the leaderboard. Jewels are YouTube's
    // currency and diamonds are TikTok's, so they stay in separate columns
    // rather than being merged into one meaningless total.
    const columns = new Set(
      (db.prepare('PRAGMA table_info(supporters)').all() as { name: string }[]).map((c) => c.name)
    )
    if (!columns.has('source')) {
      db.prepare(`ALTER TABLE supporters ADD COLUMN source TEXT NOT NULL DEFAULT 'tiktok'`).run()
    }
    if (!columns.has('jewels')) {
      db.prepare(`ALTER TABLE supporters ADD COLUMN jewels INTEGER NOT NULL DEFAULT 0`).run()
    }
    db.prepare('CREATE INDEX IF NOT EXISTS idx_supporters_jewels ON supporters(jewels DESC)').run()
  }
  return db
}

function keyFor(input: RecordEventInput): string {
  return input.userId ?? input.uniqueId ?? 'anon'
}

export function recordEvent(input: RecordEventInput): void {
  const d = getDb()
  const key = keyFor(input)
  const now = Date.now()

  d.prepare(`
    INSERT INTO supporters (user_key, unique_id, nickname, avatar, first_seen, last_seen)
    VALUES (@key, @uniqueId, @nickname, @avatar, @now, @now)
    ON CONFLICT(user_key) DO UPDATE SET
      unique_id = COALESCE(NULLIF(@uniqueId, ''), unique_id),
      nickname   = COALESCE(NULLIF(@nickname, ''), nickname),
      avatar     = COALESCE(NULLIF(@avatar, ''), avatar),
      last_seen  = @now
  `).run({
    key,
    uniqueId: input.uniqueId ?? null,
    nickname: input.nickname ?? null,
    avatar: input.profilePictureUrl ?? null,
    now
  })

  switch (input.type) {
    case 'gift': {
      const repeat = input.repeatCount ?? 1
      const diamonds = (input.diamondCount ?? 0) * repeat
      d.prepare('UPDATE supporters SET gifts_count = gifts_count + ?, diamonds = diamonds + ? WHERE user_key = ?')
        .run(repeat, diamonds, key)
      break
    }
    case 'like': {
      const likes = input.likeCount ?? 1
      d.prepare('UPDATE supporters SET likes_count = likes_count + ? WHERE user_key = ?').run(likes, key)
      break
    }
    case 'comment': {
      d.prepare('UPDATE supporters SET comments_count = comments_count + 1 WHERE user_key = ?').run(key)
      break
    }
    case 'follow': {
      d.prepare('UPDATE supporters SET follows_count = follows_count + 1 WHERE user_key = ?').run(key)
      break
    }
    case 'subscribe': {
      d.prepare('UPDATE supporters SET subs_count = subs_count + 1 WHERE user_key = ?').run(key)
      break
    }
  }
}

export interface YouTubeGiftInput {
  channelId?: string
  displayName?: string
  avatar?: string
  jewels?: number
  at?: number
}

/**
 * YouTube gifters share the leaderboard with TikTok gifters but never the
 * currency column: jewels land in `jewels`, diamonds in `diamonds`. The key is
 * namespaced with `yt:` so a channel id can never collide with a TikTok user id.
 */
export function recordYouTubeGift(input: YouTubeGiftInput): void {
  const d = getDb()
  const key = input.channelId
    ? `yt:${input.channelId}`
    : input.displayName
      ? `yt:${input.displayName}`
      : 'anon'
  const now = input.at ?? Date.now()

  d.prepare(`
    INSERT INTO supporters (user_key, unique_id, nickname, avatar, first_seen, last_seen, source)
    VALUES (@key, @uniqueId, @nickname, @avatar, @now, @now, 'youtube')
    ON CONFLICT(user_key) DO UPDATE SET
      unique_id = COALESCE(NULLIF(@uniqueId, ''), unique_id),
      nickname  = COALESCE(NULLIF(@nickname, ''), nickname),
      avatar    = COALESCE(NULLIF(@avatar, ''), avatar),
      last_seen = @now
  `).run({
    key,
    uniqueId: input.displayName ?? null,
    nickname: input.displayName ?? null,
    avatar: input.avatar ?? null,
    now
  })

  const jewels = input.jewels ?? 0
  if (jewels > 0) {
    d.prepare('UPDATE supporters SET gifts_count = gifts_count + 1, jewels = jewels + ? WHERE user_key = ?').run(
      jewels,
      key
    )
  }
}

export function getTopSupporters(metric: SupporterMetric, limit = 10): SupporterRow[] {
  const d = getDb()
  const column =
    metric === 'gifts'
      ? 'diamonds'
      : metric === 'likes'
        ? 'likes_count'
        : metric === 'comments'
          ? 'comments_count'
          : 'jewels'
  return d
    .prepare(`SELECT * FROM supporters WHERE ${column} > 0 ORDER BY ${column} DESC LIMIT ?`)
    .all(limit) as SupporterRow[]
}

export function getSummary(): {
  total: number
  topGifter: SupporterRow | null
  topLiker: SupporterRow | null
  topCommenter: SupporterRow | null
  topJeweler: SupporterRow | null
} {
  const d = getDb()
  // Only report a leader that actually has a count: without the "> 0" filter a
  // supporter with zero likes showed up as the "top liker" of an empty board.
  return {
    total: (d.prepare('SELECT COUNT(*) AS c FROM supporters').get() as { c: number }).c,
    topGifter: (d.prepare('SELECT * FROM supporters WHERE diamonds > 0 ORDER BY diamonds DESC LIMIT 1').get() as SupporterRow) ?? null,
    topLiker: (d.prepare('SELECT * FROM supporters WHERE likes_count > 0 ORDER BY likes_count DESC LIMIT 1').get() as SupporterRow) ?? null,
    topCommenter: (d.prepare('SELECT * FROM supporters WHERE comments_count > 0 ORDER BY comments_count DESC LIMIT 1').get() as SupporterRow) ?? null,
    topJeweler: (d.prepare('SELECT * FROM supporters WHERE jewels > 0 ORDER BY jewels DESC LIMIT 1').get() as SupporterRow) ?? null
  }
}

export function resetSupporters(): void {
  const d = getDb()
  d.prepare('DELETE FROM supporters').run()
}