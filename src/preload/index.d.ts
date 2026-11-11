import type {
  EventLogInput,
  EventLogRow,
  EventLogStats,
  RecordEventInput,
  SupporterMetric,
  SupporterRow,
  SupporterSummary,
  TikTokLiveFrame,
  TikTokLiveSourceStatus,
  UpdateCheckResult,
  UpdateInfo,
  YouTubeConfig,
  YouTubeEventPayload,
  YouTubeExportResult,
  YouTubeLiveTarget,
  YouTubeMappingRow,
  YouTubeMessageRow,
  YouTubeQuotaSnapshot,
  YouTubeSession,
  YouTubeStats,
  YouTubeStatus
} from './index'

export interface VConnectApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  supporters: {
    record: (input: RecordEventInput) => Promise<SupporterSummary>
    top: (metric: SupporterMetric, limit?: number) => Promise<SupporterRow[]>
    summary: () => Promise<SupporterSummary>
    reset: () => Promise<SupporterSummary>
  }
  tiktokLive: {
    start: (username: string) => Promise<TikTokLiveSourceStatus>
    stop: () => Promise<TikTokLiveSourceStatus>
    getStatus: () => Promise<TikTokLiveSourceStatus>
    onEvent: (cb: (frame: TikTokLiveFrame) => void) => () => void
    onStatus: (cb: (status: TikTokLiveSourceStatus) => void) => () => void
  }
  youtube: {
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
  events: {
    append: (input: EventLogInput) => Promise<EventLogRow | null>
    list: (limit?: number) => Promise<EventLogRow[]>
    stats: () => Promise<EventLogStats>
    clear: () => Promise<EventLogStats>
  }
  updates: {
    check: () => Promise<UpdateCheckResult>
    getVersion: () => Promise<string>
    onChecking: (cb: () => void) => () => void
    onAvailable: (cb: (info: UpdateInfo) => void) => () => void
    onNotAvailable: (cb: () => void) => () => void
    onProgress: (cb: (percent: number) => void) => () => void
    onDownloaded: (cb: (info: UpdateInfo) => void) => () => void
    onError: (cb: (message: string) => void) => () => void
  }
}

declare global {
  interface Window {
    vconnect: VConnectApi
  }
}

export {}