import type {
  RecordEventInput,
  SupporterMetric,
  SupporterRow,
  SupporterSummary,
  UpdateCheckResult,
  UpdateInfo
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