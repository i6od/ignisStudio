import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface SupporterRow {
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

export interface SupporterSummary {
  total: number
  topGifter: SupporterRow | null
  topLiker: SupporterRow | null
  topCommenter: SupporterRow | null
  topJeweler: SupporterRow | null
}

export type RecordEventInput = {
  type: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe'
  userId?: string
  uniqueId?: string
  nickname?: string
  profilePictureUrl?: string
  repeatCount?: number
  diamondCount?: number
  likeCount?: number
}

export type SupporterMetric = 'gifts' | 'likes' | 'comments' | 'jewels'

export type YouTubeTypeFilter = 'gifts' | 'money' | 'all'

export interface YouTubeConfig {
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

export interface YouTubeLiveTarget {
  liveChatId: string
  videoId: string
  title: string
  channelId: string
  channelTitle: string
}

export interface YouTubeStatus {
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

export interface YouTubeMessageRow {
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

export interface YouTubeEventPayload {
  kind: 'new' | 'combo'
  message: YouTubeMessageRow
  mapping: { vconnect_uid: string | null; tits_uid: string | null } | null
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

export interface YouTubeQuotaSnapshot {
  day: string
  cap: number
  resetAt: number
  used: Record<string, number>
  total: number
  cooling: { key: string; until: number; reason: string }[]
}

export interface YouTubeMappingRow {
  gift_name: string
  vconnect_uid: string | null
  tits_uid: string | null
}

export interface YouTubeSession {
  liveChatId: string | null
  streamTitle: string
  sessionStart: string | null
  offlineAt: string | null
  chatEnded: boolean
  fetched: number
  pollIntervalMs: number
}

export interface YouTubeExportResult {
  saved: boolean
  path?: string
  count: number
}

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

export type UpdateInfo = { version: string }
export type UpdateCheckResult = { success: boolean; error?: string }

export type TikTokLiveSourceStatus = {
  status: 'Disconnected' | 'Connecting...' | 'Connected' | 'Error'
  username?: string
  roomId?: string
  error?: string
}

export type TikTokLiveFrame = {
  event: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe'
  data: Record<string, unknown>
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload as T)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  supporters: {
    record: (input: RecordEventInput): Promise<SupporterSummary> =>
      ipcRenderer.invoke('supporters:record', input),
    top: (metric: SupporterMetric, limit = 10): Promise<SupporterRow[]> =>
      ipcRenderer.invoke('supporters:top', metric, limit),
    summary: (): Promise<SupporterSummary> => ipcRenderer.invoke('supporters:summary'),
    reset: (): Promise<SupporterSummary> => ipcRenderer.invoke('supporters:reset')
  },
  tiktokLive: {
    start: (username: string): Promise<TikTokLiveSourceStatus> =>
      ipcRenderer.invoke('tiktok:start', username),
    stop: (): Promise<TikTokLiveSourceStatus> => ipcRenderer.invoke('tiktok:stop'),
    getStatus: (): Promise<TikTokLiveSourceStatus> => ipcRenderer.invoke('tiktok:getStatus'),
    onEvent: (cb: (frame: TikTokLiveFrame) => void): (() => void) =>
      subscribe('tiktok:event', cb),
    onStatus: (cb: (status: TikTokLiveSourceStatus) => void): (() => void) =>
      subscribe('tiktok:status', cb)
  },
  youtube: {
    getConfig: (): Promise<YouTubeConfig> => ipcRenderer.invoke('youtube:getConfig'),
    setConfig: (partial: Partial<YouTubeConfig>): Promise<YouTubeConfig> =>
      ipcRenderer.invoke('youtube:setConfig', partial),
    start: (partial?: Partial<YouTubeConfig>): Promise<YouTubeStatus> =>
      ipcRenderer.invoke('youtube:start', partial),
    preview: (partial?: Partial<YouTubeConfig>): Promise<YouTubeLiveTarget> =>
      ipcRenderer.invoke('youtube:preview', partial),
    stop: (): Promise<YouTubeStatus> => ipcRenderer.invoke('youtube:stop'),
    reset: (): Promise<YouTubeStatus> => ipcRenderer.invoke('youtube:reset'),
    getStatus: (): Promise<YouTubeStatus> => ipcRenderer.invoke('youtube:getStatus'),
    listMessages: (limit?: number): Promise<YouTubeMessageRow[]> =>
      ipcRenderer.invoke('youtube:listMessages', limit),
    getStats: (): Promise<YouTubeStats> => ipcRenderer.invoke('youtube:getStats'),
    getGiftNames: (): Promise<string[]> => ipcRenderer.invoke('youtube:getGiftNames'),
    getSession: (): Promise<YouTubeSession> => ipcRenderer.invoke('youtube:getSession'),
    getRaw: (): Promise<unknown> => ipcRenderer.invoke('youtube:getRaw'),
    getQuota: (): Promise<YouTubeQuotaSnapshot> => ipcRenderer.invoke('youtube:getQuota'),
    resetQuota: (): Promise<YouTubeQuotaSnapshot> => ipcRenderer.invoke('youtube:resetQuota'),
    clearLog: (): Promise<YouTubeStats> => ipcRenderer.invoke('youtube:clearLog'),
    export: (format: 'csv' | 'json'): Promise<YouTubeExportResult> =>
      ipcRenderer.invoke('youtube:export', format),
    listMappings: (): Promise<YouTubeMappingRow[]> => ipcRenderer.invoke('youtube:listMappings'),
    setMapping: (
      giftName: string,
      vconnectUid: string | null,
      titsUid: string | null
    ): Promise<YouTubeMappingRow[]> =>
      ipcRenderer.invoke('youtube:setMapping', giftName, vconnectUid, titsUid),
    deleteMapping: (giftName: string): Promise<YouTubeMappingRow[]> =>
      ipcRenderer.invoke('youtube:deleteMapping', giftName),
    onEvent: (cb: (payload: YouTubeEventPayload) => void): (() => void) =>
      subscribe('youtube:event', cb),
    onStatus: (cb: (status: YouTubeStatus) => void): (() => void) =>
      subscribe('youtube:status', cb)
  },
  events: {
    append: (input: EventLogInput): Promise<EventLogRow | null> =>
      ipcRenderer.invoke('events:append', input),
    list: (limit?: number): Promise<EventLogRow[]> => ipcRenderer.invoke('events:list', limit),
    stats: (): Promise<EventLogStats> => ipcRenderer.invoke('events:stats'),
    clear: (): Promise<EventLogStats> => ipcRenderer.invoke('events:clear')
  },
  updates: {
    check: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('update:check'),
    getVersion: (): Promise<string> => ipcRenderer.invoke('update:getVersion'),
    onChecking: (cb: () => void): (() => void) => subscribe('update:checking', cb),
    onAvailable: (cb: (info: UpdateInfo) => void): (() => void) =>
      subscribe('update:available', cb),
    onNotAvailable: (cb: () => void): (() => void) => subscribe('update:not-available', cb),
    onProgress: (cb: (percent: number) => void): (() => void) =>
      subscribe('update:progress', cb),
    onDownloaded: (cb: (info: UpdateInfo) => void): (() => void) =>
      subscribe('update:downloaded', cb),
    onError: (cb: (message: string) => void): (() => void) => subscribe('update:error', cb)
  }
}

contextBridge.exposeInMainWorld('vconnect', api)

export type VConnectApi = typeof api