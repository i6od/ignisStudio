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
}

interface SupporterSummary {
  total: number
  topGifter: SupporterRow | null
  topLiker: SupporterRow | null
  topCommenter: SupporterRow | null
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

interface VConnectApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  supporters: {
    record: (input: RecordEventInput) => Promise<SupporterSummary>
    top: (metric: 'gifts' | 'likes' | 'comments', limit?: number) => Promise<SupporterRow[]>
    summary: () => Promise<SupporterSummary>
    reset: () => Promise<SupporterSummary>
  }
  updates: UpdateApi
}

interface Window {
  vconnect?: VConnectApi
}