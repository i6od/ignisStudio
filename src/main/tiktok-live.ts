/**
 * Built-in TikTok LIVE feed (the "r.js API", running in-process).
 *
 * This is the in-app alternative to the external Tikfinity relay: instead of
 * connecting to a WebSocket server on ws://localhost:21213, Brij Studio opens
 * the TikTok LIVE stream itself through tiktok-live-connector and feeds the
 * events straight into the renderer.
 *
 * It MUST live in the main process: tiktok-live-connector needs Node (raw
 * sockets, protobuf decoding) and is not packable into the renderer sandbox.
 *
 * Output contract — this is the important part. Every event is normalized into
 * the EXACT shape the Tikfinity relay already sends, so TikfinitySystem's
 * streak/combo/replay-dedup logic runs unchanged no matter which source is on:
 *
 *   { event: 'gift' | 'like' | 'comment' | 'follow' | 'subscribe', data: {...} }
 *
 * The raw protobuf field names differ from Tikfinity's, so each handler maps
 * them explicitly (see the notes in each normalizer). Getting these wrong is
 * silent, not loud: a missing `userId` collapses every viewer into one like
 * bucket, and a `diamondCount` that is already multiplied double-counts gifts.
 */

import {
  ControlEvent,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent
} from 'tiktok-live-connector'

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

/** Same growth curve the Tikfinity socket path uses (5s -> 30s cap). */
const RETRY_BASE_MS = 5000
const RETRY_MAX_MS = 30000
const RETRY_FACTOR = 1.5

let connection: TikTokLiveConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let desiredUsername: string | null = null
let intentionallyStopped = true
let currentStatus: TikTokLiveSourceStatus = { status: 'Disconnected' }

let emitFrame: ((frame: TikTokLiveFrame) => void) = () => {}
let emitStatus: ((status: TikTokLiveSourceStatus) => void) = () => {}

/* -------------------------------------------------------------------------- */
/* value helpers                                                              */
/* -------------------------------------------------------------------------- */

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s === '' ? undefined : s
}

/**
 * Protobuf "Long" fields arrive as objects/strings, and some senders omit them
 * entirely. Never let NaN reach the bridge: a NaN like total permanently kills
 * that user's like-goal checks (every later comparison is false).
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(n) ? n : fallback
}

function firstUrl(image: unknown): string | undefined {
  if (!image || typeof image !== 'object') return undefined
  const img = image as { urlList?: unknown[]; url?: unknown[]; uri?: unknown }
  const candidate = img.urlList?.[0] ?? img.url?.[0] ?? img.uri
  return str(candidate)
}

/**
 * The identity fields the bridge uses for replay dedup. `eventId` is preferred
 * by isReplayedTikfinityEvent(), and the server's message id is a far stronger
 * key than a locally-generated timestamp (which would make every replay look
 * like a brand-new event after a reconnect).
 */
function identity(data: any): Record<string, unknown> {
  const msgId = str(data?.common?.msgId ?? data?.msgId)
  const createTime = num(data?.common?.createTime ?? data?.createTime, 0)
  return {
    ...(msgId ? { eventId: msgId } : {}),
    timestamp: createTime > 0 ? createTime : Date.now()
  }
}

/**
 * User fields flattened the way the bridge expects them. `userId` is load
 * bearing: it keys the like-goal tracker and the supporters PRIMARY KEY, so it
 * falls back to the handle rather than being left undefined.
 */
function userFields(user: any): Record<string, unknown> {
  const uniqueId = str(user?.displayId ?? user?.uniqueId)
  const userId = str(user?.idStr ?? user?.id) ?? uniqueId
  return {
    userId,
    uniqueId,
    nickname: str(user?.nickname),
    profilePictureUrl: firstUrl(user?.avatarLarge) ?? firstUrl(user?.avatarMedium) ?? firstUrl(user?.avatarThumb)
  }
}

/* -------------------------------------------------------------------------- */
/* normalizers: raw protobuf  ->  Tikfinity-shaped payload                    */
/* -------------------------------------------------------------------------- */

function normalizeGift(data: any): TikTokLiveFrame {
  const gift = data?.gift ?? data?.giftDetails ?? {}

  const giftName = str(gift?.name ?? gift?.giftName ?? data?.giftName)
  const repeatCount = num(data?.repeatCount ?? gift?.repeatCount, 1)
  // Per-unit, always. db.ts multiplies diamondCount * repeatCount itself, and
  // the relay contract is per-unit too — so never read a pre-multiplied total.
  const diamondCount = num(gift?.diamondCount ?? data?.diamondCount, 0)
  const giftTypeRaw = gift?.type ?? gift?.giftType ?? data?.giftType
  const giftType = giftTypeRaw === undefined || giftTypeRaw === null ? undefined : num(giftTypeRaw, 0)

  // raw proto carries repeatEnd as 0/1; the bridge compares `repeatEnd === false`
  // strictly, so it has to become a real boolean.
  const rawEnd = data?.repeatEnd ?? gift?.repeatEnd
  const streakEnd = rawEnd === undefined || rawEnd === null ? undefined : rawEnd !== 0 && rawEnd !== false

  // Streaks only exist for giftType 1 (upstream contract). For anything else,
  // treat the event as final — otherwise a single non-streak gift would sit in
  // the combo buffer until the 10s orphan flush and fire 10 seconds late.
  const isStreakable = giftType === 1
  const repeatEnd = isStreakable ? streakEnd : true

  return {
    event: 'gift',
    data: {
      ...userFields(data?.user),
      giftName,
      giftId: str(data?.giftId ?? gift?.id),
      repeatCount,
      diamondCount,
      giftPictureUrl: firstUrl(gift?.image) ?? firstUrl(gift?.icon) ?? firstUrl(gift?.giftImage),
      ...(giftType !== undefined ? { giftType } : {}),
      repeatEnd,
      ...identity(data)
    }
  }
}

function normalizeLike(data: any): TikTokLiveFrame {
  return {
    event: 'like',
    data: {
      ...userFields(data?.user),
      // raw proto is `count`/`total`; the bridge reads `likeCount`/`totalLikeCount`
      likeCount: num(data?.likeCount ?? data?.count, 0),
      totalLikeCount: num(data?.totalLikeCount ?? data?.total, 0),
      ...identity(data)
    }
  }
}

function normalizeComment(data: any): TikTokLiveFrame {
  return {
    event: 'comment',
    data: {
      ...userFields(data?.user),
      // raw proto is `content`; the bridge reads `comment` (or `message`)
      comment: str(data?.content ?? data?.comment) ?? '',
      ...identity(data)
    }
  }
}

function normalizeFollow(data: any): TikTokLiveFrame {
  return {
    event: 'follow',
    data: {
      ...userFields(data?.user),
      followCount: num(data?.followCount, 0),
      ...identity(data)
    }
  }
}

function normalizeSubscribe(data: any): TikTokLiveFrame {
  return {
    event: 'subscribe',
    data: {
      ...userFields(data?.user),
      subMonth: num(data?.subMonth, 0),
      subscribeType: num(data?.subscribeType, 0),
      ...identity(data)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The connector reports failures in two shapes: connect() rejects with the
 * Error itself, while the 'error' control event hands over
 * { info: 'Error while connecting', exception: Error }. Flatten both into one
 * readable line — String(err) alone renders "[object Object]" in the UI.
 */
function describeError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as { message?: unknown; info?: unknown; exception?: { message?: unknown } }
  const message = typeof e.message === 'string' && e.message ? e.message : ''
  const nested = typeof e.exception?.message === 'string' ? e.exception.message : ''
  const info = typeof e.info === 'string' && e.info ? e.info : ''
  const detail = message || nested || info
  if (!detail) return String(err)
  if (info && detail !== info) return `${info}: ${detail}`
  return detail
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof UserOfflineError) return true
  const e = err as { exception?: unknown }
  return e?.exception instanceof UserOfflineError
}

function setStatus(next: Partial<TikTokLiveSourceStatus>): void {
  currentStatus = { ...currentStatus, ...next }
  emitStatus(currentStatus)
}

/**
 * Both failure paths describe the same problem, and the connector can emit the
 * error event several times per attempt — only surface a message once so the
 * Overview does not flicker through duplicates.
 */
function reportFailure(err: unknown): void {
  const offline = isOfflineError(err)
  const message = offline ? `${desiredUsername ?? 'That account'} is not live right now` : describeError(err)
  if (currentStatus.error !== message) {
    setStatus({ status: 'Error', username: desiredUsername ?? undefined, error: message })
  }
  scheduleReconnect()
}

function scheduleReconnect(): void {
  if (intentionallyStopped || retryTimer) return
  reconnectAttempts += 1
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(RETRY_FACTOR, reconnectAttempts - 1))
  setStatus({ status: 'Connecting...', error: undefined })
  retryTimer = setTimeout(() => {
    retryTimer = null
    void openConnection()
  }, delay)
}

async function openConnection(): Promise<void> {
  if (!desiredUsername) return

  try {
    connection = new TikTokLiveConnection(desiredUsername, {
      // Offline streamers are normal for this app (the stream may not have
      // started yet); a rejected fetch must not take the feed down permanently.
      fetchRoomInfoOnConnect: true,
      processInitialData: true
    })

    connection.on(ControlEvent.CONNECTED, (state: any) => {
      reconnectAttempts = 0
      setStatus({
        status: 'Connected',
        username: desiredUsername ?? undefined,
        roomId: str(state?.roomId),
        error: undefined
      })
    })

    connection.on(ControlEvent.DISCONNECTED, () => {
      setStatus({ status: 'Disconnected' })
      scheduleReconnect()
    })

    connection.on(ControlEvent.ERROR, (err: unknown) => {
      reportFailure(err)
    })

    connection.on(WebcastEvent.GIFT, (data: any) => emitFrame(normalizeGift(data)))
    connection.on(WebcastEvent.LIKE, (data: any) => emitFrame(normalizeLike(data)))
    connection.on(WebcastEvent.CHAT, (data: any) => emitFrame(normalizeComment(data)))
    // FOLLOW and SHARE both carry WebcastSocialMessage; only FOLLOW is bridged.
    connection.on(WebcastEvent.FOLLOW, (data: any) => emitFrame(normalizeFollow(data)))
    // tiktok-live-connector has no dedicated "subscribe" event the way the
    // Tikfinity relay does — subNotify is the closest equivalent.
    connection.on(WebcastEvent.SUB_NOTIFY, (data: any) => emitFrame(normalizeSubscribe(data)))

    await connection.connect()
  } catch (err) {
    reportFailure(err)
  }
}

export function setTikTokLiveHandlers(handlers: {
  onFrame: (frame: TikTokLiveFrame) => void
  onStatus: (status: TikTokLiveSourceStatus) => void
}): void {
  emitFrame = handlers.onFrame
  emitStatus = handlers.onStatus
}

export function startTikTokLive(rawUsername: string): TikTokLiveSourceStatus {
  const username = String(rawUsername ?? '').trim().replace(/^@+/, '')
  if (!username) {
    setStatus({ status: 'Error', error: 'TikTok username is required' })
    return currentStatus
  }

  stopTikTokLive()
  desiredUsername = username
  intentionallyStopped = false
  reconnectAttempts = 0
  setStatus({ status: 'Connecting...', username, roomId: undefined, error: undefined })
  void openConnection()
  return currentStatus
}

export function stopTikTokLive(): void {
  intentionallyStopped = true
  desiredUsername = null
  reconnectAttempts = 0

  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  const current = connection
  connection = null

  if (current) {
    // removeAllListeners first: a disconnect event must not look like a drop
    // and kick off the reconnect loop for a feed the user just turned off.
    try {
      current.removeAllListeners()
    } catch {
      /* emitter already torn down */
    }
    void Promise.resolve(current.disconnect()).catch(() => {})
  }

  setStatus({ status: 'Disconnected', roomId: undefined, error: undefined })
}

export function getTikTokLiveStatus(): TikTokLiveSourceStatus {
  return currentStatus
}

/**
 * Test seam (scripts/adapter-test.mjs). The raw-protobuf -> bridge-frame mapping
 * is the part of this module that fails silently — a wrong field name does not
 * throw, it just records a bad supporter row or a wrong diamond total — so it is
 * worth exercising directly instead of only through a live stream.
 */
export const normalizers = {
  gift: normalizeGift,
  like: normalizeLike,
  comment: normalizeComment,
  follow: normalizeFollow,
  subscribe: normalizeSubscribe
}
