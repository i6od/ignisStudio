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
}

export interface SupporterSummary {
  total: number
  topGifter: SupporterRow | null
  topLiker: SupporterRow | null
  topCommenter: SupporterRow | null
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

export type SupporterMetric = 'gifts' | 'likes' | 'comments'

export type UpdateInfo = { version: string }
export type UpdateCheckResult = { success: boolean; error?: string }

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