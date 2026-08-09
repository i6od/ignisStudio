export interface TikfinityOptions {
  vconnectUrl?: string
  tiktokUrl?: string
  storageKey?: string
}

export interface Trigger {
  uid: string
  name: string
  enabled?: boolean
  nodeCount?: number
}

export interface LikeMapping {
  likeCount: number
  triggerId: string
}

export interface LogEntry {
  message: string
  isError: boolean
}

export interface StatusEvent {
  status: string
  className: string
}

export interface GiftData {
  nickname?: string
  uniqueId?: string
  giftName?: string
  repeatCount?: number
  diamondCount?: number
  giftPictureUrl?: string
  [key: string]: unknown
}

export interface UserData {
  nickname?: string
  uniqueId?: string
  userId?: string
  profilePictureUrl?: string
  subMonth?: number
  likeCount?: number
  totalLikeCount?: number
  comment?: string
  message?: string
  [key: string]: unknown
}

export interface LikeStats {
  usersTracked: number
  topLikerName: string
  topLikerCount: number
}

export declare class TikfinitySystem {
  constructor(options?: TikfinityOptions)

  vconnectUrl: string
  tiktokUrl: string
  storageKey: string
  triggers: Trigger[]
  giftMappings: Map<string, string>
  followUid: string | null
  subscribeUid: string | null
  likeMappings: LikeMapping[]
  userLikeTotals: Map<string, number>
  userNicknames: Map<string, string>
  triggeredLikeGoals: Map<string, Set<number>>

  on(event: string, handler: (data: unknown) => void): this
  off(event: string, handler: (data: unknown) => void): this
  emit(event: string, data: unknown): void
  log(message: string, isError?: boolean): void

  connectVConnect(): void
  connectTikfinity(): void
  disconnectVConnect(): void
  disconnectTikfinity(): void
  requestTriggerList(): boolean
  sendTrigger(triggerId: string): boolean

  getTriggers(): Trigger[]
  getGiftMappings(): Map<string, string>
  getLikeMappings(): LikeMapping[]
  getTriggerName(uid: string): string

  setFollowUid(uid: string | null): void
  setSubscribeUid(uid: string | null): void
  addGiftMapping(giftName: string, triggerId: string): boolean
  removeGiftMapping(giftName: string): void
  addLikeMapping(likeCount: number | string, uid: string): boolean
  removeLikeMapping(index: number): void
  clearLikeTracking(): void
  updateLikeTrackingStats(): void

  loadConfig(): void
  saveConfig(): void
}

export default TikfinitySystem