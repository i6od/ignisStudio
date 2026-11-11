/// <reference types="vite/client" />

interface SupporterRow {
  user_key: string
  unique_id: string | null
  nickname: string | null
  avatar: string | null
  gifts_count: number
  diamonds: number
  likes_count: number
  comments_count: number
  follows_count: number
  subs_count: number
  first_seen: number
  last_seen: number
  source: 'tiktok' | 'youtube'
  jewels: number
}

interface SupporterSummary {
  total: number
  topGifter: SupporterRow | null
  topLiker: SupporterRow | null
  topCommenter: SupporterRow | null
  topJeweler: SupporterRow | null
}

interface RecordEventInput {
  type: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe'
  userId?: string
  uniqueId?: string
  nickname?: string
  profilePictureUrl?: string
  repeatCount?: number
  diamondCount?: number
  likeCount?: number
}

interface UpdateInfo {
  version: string
}

interface UpdateCheckResult {
  success: boolean
  error?: string
}

interface UpdateApi {
  check: () => Promise<UpdateCheckResult>
  getVersion: () => Promise<string>
  onChecking: (cb: () => void) => () => void
  onAvailable: (cb: (info: UpdateInfo) => void) => () => void
  onNotAvailable: (cb: () => void) => () => void
  onProgress: (cb: (percent: number) => void) => () => void
  onDownloaded: (cb: (info: UpdateInfo) => void) => () => void
  onError: (cb: (message: string) => void) => () => void
}

interface TikTokLiveSourceStatus {
  status: 'Disconnected' | 'Connecting...' | 'Connected' | 'Error'
  username?: string
  roomId?: string
  error?: string
}

interface TikTokLiveFrame {
  event: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe'
  data: Record<string, unknown>
}

interface TikTokLiveApi {
  start: (username: string) => Promise<TikTokLiveSourceStatus>
  stop: () => Promise<TikTokLiveSourceStatus>
  getStatus: () => Promise<TikTokLiveSourceStatus>
  onEvent: (cb: (frame: TikTokLiveFrame) => void) => () => void
  onStatus: (cb: (status: TikTokLiveSourceStatus) => void) => () => void
}

type YouTubeTypeFilter = 'gifts' | 'money' | 'all'

interface YouTubeConfig {
  keys: string[]
  quotaCap: number
  hl: string
  maxResults: number
  pollSec: number
  typeFilter: YouTubeTypeFilter
  jewelValue: number
  videoInput: string
  liveChatId: string
  handle: string
}

interface YouTubeLiveTarget {
  liveChatId: string
  videoId: string
  title: string
  channelId: string
  channelTitle: string
}

interface YouTubeStatus {
  state: 'Idle' | 'Resolving...' | 'Reading...' | 'Polling' | 'Waiting' | 'Stopped' | 'Error'
  polling: boolean
  liveChatId: string | null
  streamTitle: string
  error: string | null
  nextPollAt: number | null
  gapMs: number
  keysReady: number
  keysTotal: number
  coolingUntil: number | null
  fetched: number
  captured: number
  chatEnded: boolean
  offlineAt: string | null
  backoffMs: number
  watchMode: boolean
  handle: string
  channelTitle: string
  videoId: string
  nextLiveCheckAt: number | null
}

interface YouTubeMessageRow {
  id: string
  live_chat_id: string | null
  type: string
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

interface YouTubeEventPayload {
  kind: 'new' | 'combo'
  message: YouTubeMessageRow
  mapping: { vconnect_uid: string | null; tits_uid: string | null } | null
}

interface YouTubeStats {
  giftCount: number
  totalJewels: number
  uniqueSenders: number
  maxCombo: number
  messageCount: number
  byGift: { label: string; count: number; jewels: number; comboSeen: number }[]
  bySender: { label: string; count: number; jewels: number }[]
}

interface YouTubeQuotaSnapshot {
  day: string
  cap: number
  resetAt: number
  used: Record<string, number>
  total: number
  cooling: { key: string; until: number; reason: string }[]
}

interface YouTubeMappingRow {
  gift_name: string
  vconnect_uid: string | null
  tits_uid: string | null
}

interface YouTubeSession {
  liveChatId: string | null
  streamTitle: string
  sessionStart: string | null
  offlineAt: string | null
  chatEnded: boolean
  fetched: number
  pollIntervalMs: number
}

interface YouTubeExportResult {
  saved: boolean
  path?: string
  count: number
}

type EventLogSource = 'tiktok' | 'youtube'

type EventLogKind =
  | 'gift'
  | 'comment'
  | 'like'
  | 'follow'
  | 'subscribe'
  | 'superchat'
  | 'membership'
  | 'other'

interface EventLogRow {
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

interface EventLogInput {
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

interface EventLogStats {
  total: number
  tiktok: number
  youtube: number
  gifts: number
  comments: number
}

interface EventLogApi {
  append: (input: EventLogInput) => Promise<EventLogRow | null>
  list: (limit?: number) => Promise<EventLogRow[]>
  stats: () => Promise<EventLogStats>
  clear: () => Promise<EventLogStats>
}

interface YouTubeApi {
  getConfig: () => Promise<YouTubeConfig>
  setConfig: (partial: Partial<YouTubeConfig>) => Promise<YouTubeConfig>
  start: (partial?: Partial<YouTubeConfig>) => Promise<YouTubeStatus>
  preview: (partial?: Partial<YouTubeConfig>) => Promise<YouTubeLiveTarget>
  stop: () => Promise<YouTubeStatus>
  reset: () => Promise<YouTubeStatus>
  getStatus: () => Promise<YouTubeStatus>
  listMessages: (limit?: number) => Promise<YouTubeMessageRow[]>
  getStats: () => Promise<YouTubeStats>
  getGiftNames: () => Promise<string[]>
  getSession: () => Promise<YouTubeSession>
  getRaw: () => Promise<unknown>
  getQuota: () => Promise<YouTubeQuotaSnapshot>
  resetQuota: () => Promise<YouTubeQuotaSnapshot>
  clearLog: () => Promise<YouTubeStats>
  export: (format: 'csv' | 'json') => Promise<YouTubeExportResult>
  listMappings: () => Promise<YouTubeMappingRow[]>
  setMapping: (
    giftName: string,
    vconnectUid: string | null,
    titsUid: string | null
  ) => Promise<YouTubeMappingRow[]>
  deleteMapping: (giftName: string) => Promise<YouTubeMappingRow[]>
  onEvent: (cb: (payload: YouTubeEventPayload) => void) => () => void
  onStatus: (cb: (status: YouTubeStatus) => void) => () => void
}

interface VConnectApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  supporters: {
    record: (input: RecordEventInput) => Promise<SupporterSummary>
    top: (
      metric: 'gifts' | 'likes' | 'comments' | 'jewels',
      limit?: number
    ) => Promise<SupporterRow[]>
    summary: () => Promise<SupporterSummary>
    reset: () => Promise<SupporterSummary>
  }
  tiktokLive: TikTokLiveApi
  youtube: YouTubeApi
  events: EventLogApi
  updates: UpdateApi
}

interface Window {
  vconnect?: VConnectApi
}