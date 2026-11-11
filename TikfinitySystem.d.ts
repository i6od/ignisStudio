export type TikTokFeedSource = 'relay' | 'embedded'

export interface TikfinityOptions {
  vconnectUrl?: string
  titsUrl?: string
  tiktokUrl?: string
  storageKey?: string
  /** 'relay' = Tikfinity WebSocket at tiktokUrl (default), 'embedded' = in-app connector */
  feedSource?: TikTokFeedSource
}

export interface TikTokFeedFrame {
  event: string
  data: Record<string, unknown>
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

/** 'above' = more than min, 'below' = less than min, 'range' = between min and max (both ends included). */
export type DiamondRuleOp = 'above' | 'below' | 'range'

export interface DiamondRule {
  op: DiamondRuleOp
  min: number
  max: number | null
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
  titsUrl: string
  tiktokUrl: string
  storageKey: string
  feedSource: TikTokFeedSource
  vconnectEnabled: boolean
  titsEnabled: boolean
  triggers: Trigger[]
  giftMappings: Map<string, string>
  followUid: string | null
  subscribeUid: string | null
  likeMappings: LikeMapping[]
  diamondRules: DiamondRule[]
  userLikeTotals: Map<string, number>
  userNicknames: Map<string, string>
  triggeredLikeGoals: Map<string, Set<number>>
  titsTriggers: Trigger[]
  titsGiftMappings: Map<string, string>
  titsFollowId: string | null
  titsSubscribeId: string | null
  titsLikeMappings: LikeMapping[]
  titsDiamondRules: DiamondRule[]
  titsUserLikeTotals: Map<string, number>
  titsUserNicknames: Map<string, string>
  titsTriggeredLikeGoals: Map<string, Set<number>>

  on(event: string, handler: (data: unknown) => void): this
  off(event: string, handler: (data: unknown) => void): this
  emit(event: string, data: unknown): void
  log(message: string, isError?: boolean): void

  connectVConnect(): void
  connectTits(): void
  connectTikfinity(): void
  disconnectVConnect(): void
  disconnectTits(): void
  disconnectTikfinity(): void
  setFeedSource(source: TikTokFeedSource): TikTokFeedSource
  ingestTikfinityFrame(payload: TikTokFeedFrame | string): boolean
  requestTriggerList(): boolean
  requestTitsTriggerList(): boolean
  sendTrigger(triggerId: string): boolean
  sendTitsTrigger(triggerId: string): boolean

  getTriggers(): Trigger[]
  getGiftMappings(): Map<string, string>
  getLikeMappings(): LikeMapping[]
  getDiamondRules(): DiamondRule[]
  getTitsDiamondRules(): DiamondRule[]
  diamondRuleMatches(rule: DiamondRule, diamonds: number): boolean
  describeDiamondRule(rule: DiamondRule): string
  getTriggerName(uid: string): string
  getTitsTriggers(): Trigger[]
  getTitsGiftMappings(): Map<string, string>
  getTitsLikeMappings(): LikeMapping[]
  getTitsTriggerName(uid: string): string

  setVconnectEnabled(enabled: boolean): void
  setTitsEnabled(enabled: boolean): void
  setTitsFollowId(uid: string | null): void
  setTitsSubscribeId(uid: string | null): void
  addTitsGiftMapping(giftName: string, triggerId: string): boolean
  removeTitsGiftMapping(giftName: string): void
  addTitsLikeMapping(likeCount: number | string, uid: string): boolean
  removeTitsLikeMapping(index: number): void
  addTitsDiamondRule(op: DiamondRuleOp, min: number | string, max: number | string | null, uid: string): boolean
  removeTitsDiamondRule(index: number): void
  clearTitsLikeTracking(): void
  updateTitsLikeTrackingStats(): void

  setFollowUid(uid: string | null): void
  setSubscribeUid(uid: string | null): void
  addGiftMapping(giftName: string, triggerId: string): boolean
  removeGiftMapping(giftName: string): void
  addLikeMapping(likeCount: number | string, uid: string): boolean
  removeLikeMapping(index: number): void
  addDiamondRule(op: DiamondRuleOp, min: number | string, max: number | string | null, uid: string): boolean
  removeDiamondRule(index: number): void
  clearLikeTracking(): void
  updateLikeTrackingStats(): void

  loadConfig(): void
  saveConfig(): void
}

export default TikfinitySystem