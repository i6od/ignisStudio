/**
 * YouTube Live Chat gift tracker, owned by the main process.
 *
 * The renderer never talks to googleapis.com: it would need a CSP change and
 * polling would die whenever the tab unmounts. Instead the main process owns
 * the key pool, the quota meter and the poll loop, stores every captured
 * message in SQLite, and pushes new events to the renderer over IPC - the same
 * shape the built-in TikTok feed already uses.
 *
 * Quota model (documented behaviour): liveChatMessages.list costs 5 units,
 * videos/liveStreams lookups 1 each, and even a failed request burns at least 1.
 * Daily quota resets at midnight Pacific Time, so the meter rolls over on a
 * PT calendar day, not a UTC one.
 */

import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'

import {
  addQuotaUnits,
  clearMessages,
  findMapping,
  getGiftNames,
  getMessage,
  getQuotaUsed,
  getSettings,
  getStats,
  listMessages,
  markTriggerFired,
  resetQuota,
  setSetting,
  upsertMessage,
  type YouTubeMessageInput,
  type YouTubeMessageRow,
  type YouTubeStats
} from './youtube-db'
import { recordYouTubeGift } from './db'
import { mirrorYouTubeMessage } from './event-log'

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
  /** Channel handle (@name) - when set alone, the tracker follows whoever is live. */
  handle: string
}

export type YouTubeStatus = {
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

export type YouTubeEventPayload = {
  kind: 'new' | 'combo'
  message: YouTubeMessageRow
  mapping: { vconnect_uid: string | null; tits_uid: string | null } | null
}

export type YouTubeQuotaSnapshot = {
  day: string
  cap: number
  resetAt: number
  used: Record<string, number>
  total: number
  cooling: { key: string; until: number; reason: string }[]
}

const API_BASE = 'https://www.googleapis.com/youtube/v3/'
/**
 * Only endpoints that accept a plain API key. liveBroadcasts.list and
 * liveStreams.list answer "API keys are not supported by this API. Expected
 * OAuth2 access token" for a key-authenticated caller, so the tracker never
 * calls them: a channel's current live is found through its live-uploads
 * playlist (1 unit) and, as a last resort, search.list (100 units).
 */
const COSTS: Record<string, number> = {
  'liveChat/messages': 5,
  videos: 1,
  channels: 1,
  playlistItems: 1,
  search: 100
}
const PAID_TYPES = [
  'giftEvent',
  'superChatEvent',
  'superStickerEvent',
  'membershipGiftingEvent',
  'giftMembershipReceivedEvent'
]
const MAX_HISTORY_PAGES = 2
const MAX_BACKOFF_MS = 300_000
const KEY_COOLDOWN_MS = 20_000
const QUOTA_EXHAUSTED_COOLDOWN_MS = 3_600_000
/** Handle mode: how long to wait before asking "are they live again?". */
const LIVE_RECHECK_MS = Math.max(1000, Number(process.env.VCONNECT_YT_RECHECK_MS ?? 60_000))
/** An offline channel is asked less and less often, down to every 15 minutes. */
const LIVE_RECHECK_MAX_MS = Math.max(LIVE_RECHECK_MS, Number(process.env.VCONNECT_YT_RECHECK_MAX_MS ?? 900_000))

/**
 * Feed behaviour is fixed on purpose: a 30s live-chat poll is what one quota
 * unit buys on a normal stream, 100 messages per page keeps a page well inside
 * what 30s of chat can produce, and the log keeps every event type so Super
 * Chats, memberships and chat text are all searchable later. Only the keys and
 * which stream to watch are left to the user.
 */
const DEFAULT_CONFIG: YouTubeConfig = {
  keys: [],
  quotaCap: 10_000,
  hl: 'en',
  maxResults: 100,
  pollSec: 30,
  typeFilter: 'all',
  jewelValue: 0.01,
  videoInput: '',
  liveChatId: '',
  handle: ''
}

let config: YouTubeConfig = { ...DEFAULT_CONFIG }
let quotaUsed: Record<string, number> = {}
let quotaDay = ''
let quotaResetAt = 0
let keyCooldown: Record<string, { until: number; reason: string }> = {}

let liveChatId: string | null = null
let streamTitle = ''
let streamOfflineAt: string | null = null
let chatEnded = false
// Handle mode: the tracker owns the resolution, so it can hop to the next live.
let watchMode = false
let resolvedChannelId = ''
let resolvedChannelTitle = ''
let resolvedVideoId = ''
let recheckTimer: NodeJS.Timeout | null = null
let recheckAt = 0
let rearmAttempts = 0
let nextPageToken: string | null = null
let polling = false
let pollTimer: NodeJS.Timeout | null = null
let inFlight = false
let fetchedRaw = 0
let consecutiveErrors = 0
let backoffMs = 0
let pollIntervalMs = 10_000
let lastRequestAt = 0
let nextAllowedAt = 0
let lastRaw: unknown = null
let sessionStart: string | null = null
let lastError: string | null = null

let onEvent: (payload: YouTubeEventPayload) => void = () => {}
let onStatus: (status: YouTubeStatus) => void = () => {}

/* ---------------- Pacific-day quota clock ---------------- */

function ptParts(instantMs: number): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(new Date(instantMs))) out[p.type] = p.value
  return out
}

function ptOffsetMs(instantMs: number): number {
  const m = ptParts(instantMs)
  const asUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour),
    Number(m.minute),
    Number(m.second)
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * UTC instant of 00:00 Pacific for a calendar date. Fixed-point iteration so a
 * 23h or 25h DST day resolves exactly instead of drifting an hour.
 */
function ptMidnightUtc(year: string, month: string, day: string): number {
  const base = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)
  let guess = base
  for (let i = 0; i < 4; i++) {
    const next = base - ptOffsetMs(guess)
    if (next === guess) break
    guess = next
  }
  return guess
}

function currentQuotaDay(): string {
  const nowMs = Date.now()
  const m = ptParts(nowMs)
  const day = `${m.year}-${m.month}-${m.day}`
  if (quotaDay !== day || !quotaResetAt || nowMs >= quotaResetAt) {
    quotaDay = day
    const dayStart = ptMidnightUtc(m.year, m.month, m.day)
    const next = new Date(dayStart + 86_400_000)
    quotaResetAt = ptMidnightUtc(
      String(next.getUTCFullYear()),
      String(next.getUTCMonth() + 1),
      String(next.getUTCDate())
    )
    quotaUsed = getQuotaUsed(day)
  }
  return quotaDay
}

function keyUnits(key: string): number {
  return quotaUsed[key] ?? 0
}

function keyRemaining(key: string): number {
  return quotaCap() - keyUnits(key)
}

function quotaCap(): number {
  return Math.max(1, Math.trunc(config.quotaCap) || DEFAULT_CONFIG.quotaCap)
}

/* ---------------- config ---------------- */

export function getYouTubeConfig(): YouTubeConfig {
  return { ...config, keys: [...config.keys] }
}

export function setYouTubeConfig(partial: Partial<YouTubeConfig>): YouTubeConfig {
  // Clamp only the fields the caller actually sent: clamping an omitted value
  // would drag a fixed default (maxResults 100) up to the allowed minimum.
  const num = (value: number | undefined, min: number, max: number, fallback: number): number => {
    if (value === undefined || value === null) return fallback
    const clamped = clamp(Number(value), min, max)
    return clamped ?? fallback
  }

  config = {
    ...config,
    ...partial,
    keys: Array.isArray(partial.keys)
      ? normalizeKeys(partial.keys.join('\n'))
      : config.keys,
    quotaCap: num(partial.quotaCap, 1, 1_000_000, config.quotaCap),
    maxResults: num(partial.maxResults, 1, 2000, config.maxResults),
    pollSec: num(partial.pollSec, 5, 600, config.pollSec),
    jewelValue: num(partial.jewelValue, 0, 1000, config.jewelValue),
    hl: String(partial.hl ?? config.hl).trim() || 'en',
    typeFilter: isTypeFilter(partial.typeFilter) ? partial.typeFilter : config.typeFilter,
    videoInput: String(partial.videoInput ?? config.videoInput).trim(),
    liveChatId: String(partial.liveChatId ?? config.liveChatId).trim(),
    handle: normalizeHandle(partial.handle ?? config.handle) ?? ''
  }
  setSetting('config', JSON.stringify(config))
  currentQuotaDay()
  return getYouTubeConfig()
}

export function loadYouTubeSettings(): void {
  const stored = getSettings()
  if (stored['config']) {
    try {
      const parsed = JSON.parse(stored['config']) as Partial<YouTubeConfig>
      config = { ...DEFAULT_CONFIG, ...parsed, keys: normalizeKeys(parsed.keys ?? []) }
    } catch {
      config = { ...DEFAULT_CONFIG }
    }
  }
  sessionStart = stored['sessionStart'] ?? null
  liveChatId = stored['liveChatId'] ?? null
  streamTitle = stored['streamTitle'] ?? ''
  resolvedChannelTitle = stored['channelTitle'] ?? ''
  currentQuotaDay()
}

function normalizeKeys(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input.join('\n') : String(input ?? '')
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const key = part.trim()
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

function clamp(value: number, min: number, max: number): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

function isTypeFilter(value: unknown): value is YouTubeTypeFilter {
  return value === 'gifts' || value === 'money' || value === 'all'
}

export function extractVideoId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{6,})/)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null
}

/**
 * Accepts "@name", "name", "youtube.com/@name" or a raw UC… channel id and
 * returns what channels.list wants. Returns null for anything that is not a
 * handle so a video URL pasted in this box fails loudly instead of silently.
 */
export function normalizeHandle(input: string): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  const fromUrl = raw.match(/youtube\.com\/(@[A-Za-z0-9_.-]{2,64})/)
  if (fromUrl) return fromUrl[1]

  if (/^UC[A-Za-z0-9_-]{22}$/.test(raw)) return raw

  const handle = raw.startsWith('@') ? raw : `@${raw}`
  if (/^@[A-Za-z0-9_.-]{2,64}$/.test(handle) && !/^\@[0-9]/.test(handle)) return handle

  return null
}

/* ---------------- key pool ---------------- */

type KeyPool = { ready: string[]; earliest: number; total: number }

function usableKeys(path: string): KeyPool {
  const cost = COSTS[path] ?? 1
  const now = Date.now()
  const ready: string[] = []
  const cooling: string[] = []
  for (const key of config.keys) {
    const state = keyCooldown[key]
    if (state && state.until > now) {
      cooling.push(key)
      continue
    }
    // A key that cannot afford the call would only fail and burn an attempt.
    if (keyRemaining(key) < cost) {
      cooling.push(key)
      continue
    }
    ready.push(key)
  }
  if (!ready.length && cooling.length) {
    cooling.sort((a, b) => (keyCooldown[a]?.until ?? 0) - (keyCooldown[b]?.until ?? 0))
    return { ready: [cooling[0]], earliest: keyCooldown[cooling[0]]?.until ?? 0, total: config.keys.length }
  }
  return { ready, earliest: 0, total: config.keys.length }
}

export function keyLabel(key: string): string {
  if (!key) return 'none'
  if (key.length <= 8) return key
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

/* ---------------- API layer ---------------- */

class YouTubeApiError extends Error {
  status: number
  reason: string
  key?: string

  constructor(message: string, status: number, reason: string, key?: string) {
    super(message)
    this.name = 'YouTubeApiError'
    this.status = status
    this.reason = reason
    this.key = key
  }
}

async function apiGet(
  path: string,
  query: Record<string, string | number | undefined | null>
): Promise<Record<string, unknown>> {
  const pool = usableKeys(path)
  if (!pool.ready.length) {
    throw new YouTubeApiError(
      config.keys.length ? 'Every API key is cooling down or out of quota.' : 'No API keys configured.',
      0,
      config.keys.length ? 'noUsableKey' : 'noKeys'
    )
  }

  let attempt = 0
  for (;;) {
    const key = pool.ready[attempt % pool.ready.length]
    const params = new URLSearchParams()
    for (const [name, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params.set(name, String(value))
    }
    params.set('key', key)

    lastRequestAt = Date.now()
    const response = await fetch(`${API_BASE}${path}?${params.toString()}`, { method: 'GET' })
    const text = await response.text()
    let data: Record<string, unknown> | null = null
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = null
    }

    if (!response.ok) {
      const err = (data?.['error'] ?? null) as
        | { message?: string; errors?: { reason?: string }[] }
        | null
      const reason = err?.errors?.[0]?.reason ?? ''
      const message = err?.message ?? reason ?? text.slice(0, 300)
      const keyProblem =
        reason === 'rateLimitExceeded' ||
        reason === 'quotaExceeded' ||
        reason === 'dailyLimitExceeded' ||
        reason === 'userRateLimitExceeded' ||
        response.status === 429 ||
        (response.status === 403 && /quota|rate limit|limit/i.test(String(message)))

      chargeQuota(key, path, true)
      if (keyProblem) {
        const exhausted = reason === 'quotaExceeded' || reason === 'dailyLimitExceeded'
        keyCooldown[key] = {
          until: Date.now() + (exhausted ? QUOTA_EXHAUSTED_COOLDOWN_MS : KEY_COOLDOWN_MS),
          reason: reason || 'rate limited'
        }
        if (attempt + 1 < pool.ready.length) {
          attempt++
          continue
        }
      }
      emitStatus()
      throw new YouTubeApiError(message, response.status, reason, key)
    }

    chargeQuota(key, path, false)
    consecutiveErrors = 0
    emitStatus()
    return data ?? {}
  }
}

function chargeQuota(key: string, path: string, failed: boolean): void {
  if (!key) return
  currentQuotaDay()
  const base = COSTS[path] ?? 1
  const cost = failed ? Math.max(1, base) : base
  quotaUsed[key] = keyUnits(key) + cost
  addQuotaUnits(quotaDay, key, cost)
}

export function describeApiError(error: unknown): string {
  const e = error as YouTubeApiError
  const base = e?.message ?? 'request failed'
  const reason = e?.reason ?? ''
  const hints: Record<string, string> = {
    liveChatNotFound: ' Check the liveChatId, or make sure the stream is currently live.',
    liveChatDisabled: ' Live chat is turned off for this broadcast.',
    liveChatEnded: ' This chat is closed; gift events only exist while the stream is live.',
    rateLimitExceeded: ' Polling faster than this chat refreshes - backing off and rotating keys.',
    userRateLimitExceeded: ' Polling faster than this chat refreshes - backing off and rotating keys.',
    quotaExceeded: ' That key used its daily quota - cooled down for an hour, next key takes over.',
    dailyLimitExceeded: ' That key used its daily quota - cooled down for an hour, next key takes over.',
    noUsableKey: ' Every key is cooling down or cannot afford the next call.',
    noKeys: ' Add at least one YouTube Data API v3 key in the Setup card.',
    forbidden: ' The key may lack YouTube Data API v3 access or permission for this chat.',
    authorizationError: ' This app talks to YouTube with API keys only.'
  }
  const hint =
    hints[reason] ??
    (/api keys are not supported/i.test(base)
      ? ' This app only uses key-authenticated endpoints - the lookup that complained has been removed.'
      : e?.status === 400
        ? ' Bad parameters (maxResults must be 200-2000).'
        : '')
  return `${base}${hint}`
}

/* ---------------- liveChatId resolution ---------------- */

function resolveLiveChatId(videoId: string): Promise<string> {
  return apiGet('videos', { id: videoId, part: 'snippet,liveStreamingDetails' })
    .then((videoData) => {
      const items = (videoData['items'] ?? []) as Record<string, unknown>[]
      const item = items[0]
      if (!item) throw new YouTubeApiError(`Video not found for id ${videoId}.`, 404, 'videoNotFound')

      const snippet = (item['snippet'] ?? {}) as Record<string, unknown>
      const streaming = (item['liveStreamingDetails'] ?? {}) as Record<string, unknown>
      streamTitle = String(snippet['title'] ?? videoId)
      const active = streaming['activeLiveChatId'] ? String(streaming['activeLiveChatId']) : ''

      if (active) return active

      throw new YouTubeApiError(
        `That video has no active live chat (liveBroadcastContent=${String(snippet['liveBroadcastContent'] ?? 'none')}). ` +
          'Put the channel handle (@name) in the Channel handle box to follow whoever is live, or paste the live URL while it is streaming.',
        404,
        'noLiveStream'
      )
    })
}

/* ---------------- handle mode ---------------- */

export type YouTubeLiveTarget = {
  liveChatId: string
  videoId: string
  title: string
  channelId: string
  channelTitle: string
}

async function resolveChannel(input: string): Promise<{ channelId: string; title: string }> {
  const data = await apiGet(
    'channels',
    input.startsWith('UC') ? { part: 'id,snippet', id: input } : { part: 'id,snippet', forHandle: input }
  )
  const item = ((data['items'] ?? []) as Record<string, unknown>[])[0]
  if (!item) throw new YouTubeApiError(`No YouTube channel found for ${input}.`, 404, 'channelNotFound')
  const snippet = (item['snippet'] ?? {}) as Record<string, unknown>
  return { channelId: String(item['id'] ?? ''), title: String(snippet['title'] ?? input) }
}

function chatFromVideoIds(ids: string[]): Promise<{ liveChatId: string; videoId: string; title: string } | null> {
  if (!ids.length) return Promise.resolve(null)
  return apiGet('videos', { part: 'snippet,liveStreamingDetails', id: ids.join(',') }).then((data) => {
    for (const item of (data['items'] ?? []) as Record<string, unknown>[]) {
      const streaming = (item['liveStreamingDetails'] ?? {}) as Record<string, unknown>
      const chat = streaming['activeLiveChatId']
      if (!chat) continue
      const snippet = (item['snippet'] ?? {}) as Record<string, unknown>
      return { liveChatId: String(chat), videoId: String(item['id'] ?? ''), title: String(snippet['title'] ?? '') }
    }
    return null
  })
}

/** Every channel has a hidden "live uploads" playlist: UC… becomes UU…. */
function liveUploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`
}

/**
 * Turn a channel handle into the live chat of whatever that channel is
 * streaming right now, using only endpoints that accept a plain API key:
 * channels.list (1 unit) -> playlistItems.list on the channel's live-uploads
 * playlist (1 unit) -> videos.list (1 unit). search.list (100 units) is the
 * last resort for channels whose live-uploads playlist does not show the
 * broadcast, and the auto-follow loop only pays for it occasionally.
 */
export async function resolveLiveFromHandle(
  input: string,
  opts: { allowSearch?: boolean } = {}
): Promise<YouTubeLiveTarget> {
  const allowSearch = opts.allowSearch !== false
  const handle = normalizeHandle(input)
  if (!handle) throw new YouTubeApiError(`"${input}" is not a channel handle (@name).`, 400, 'badHandle')

  const channel = await resolveChannel(handle)
  if (!channel.channelId) {
    throw new YouTubeApiError(`No channel id returned for ${handle}.`, 404, 'channelNotFound')
  }

  const ids: string[] = []
  try {
    const playlist = await apiGet('playlistItems', {
      part: 'contentDetails',
      playlistId: liveUploadsPlaylistId(channel.channelId),
      maxResults: 5
    })
    for (const item of (playlist['items'] ?? []) as Record<string, unknown>[]) {
      const details = (item['contentDetails'] ?? {}) as Record<string, unknown>
      if (details['videoId']) ids.push(String(details['videoId']))
    }
  } catch (error) {
    // A channel that has never gone live has no live-uploads playlist yet; the
    // search lookup below still covers it.
    const e = error as YouTubeApiError
    if (e?.status !== 404 && e?.status !== 403) throw error
  }

  const fromPlaylist = await chatFromVideoIds(Array.from(new Set(ids)))
  if (fromPlaylist) return { ...fromPlaylist, channelId: channel.channelId, channelTitle: channel.title }

  const searchIds: string[] = []
  if (allowSearch) {
    try {
      const found = await apiGet('search', {
        part: 'snippet',
        type: 'video',
        eventType: 'live',
        channelId: channel.channelId,
        maxResults: 5
      })
      for (const item of (found['items'] ?? []) as Record<string, unknown>[]) {
        const id = item['id'] as Record<string, unknown> | undefined
        const videoId = typeof id === 'string' ? id : String(id?.['videoId'] ?? '')
        if (videoId) searchIds.push(videoId)
      }
    } catch (error) {
      // No key can afford 100 units, or the key may not have Search enabled.
      const e = error as YouTubeApiError
      if (e?.reason !== 'noUsableKey' && e?.status !== 403) throw error
    }

    const fromSearch = await chatFromVideoIds(Array.from(new Set(searchIds)))
    if (fromSearch) return { ...fromSearch, channelId: channel.channelId, channelTitle: channel.title }
  }

  throw new YouTubeApiError(`${handle} is not live right now.`, 404, 'notLive')
}

/* ---------------- ingestion ---------------- */

function keepType(type: string, filter: YouTubeTypeFilter): boolean {
  if (filter === 'gifts') return type === 'giftEvent'
  if (filter === 'money') return PAID_TYPES.includes(type)
  return true
}

function toMessageInput(item: Record<string, unknown>): YouTubeMessageInput | null {
  const snippet = (item['snippet'] ?? {}) as Record<string, unknown>
  const author = (item['authorDetails'] ?? {}) as Record<string, unknown>
  const type = String(snippet['type'] ?? '')
  if (!type) return null

  const publishedAt = Date.parse(String(snippet['publishedAt'] ?? ''))
  const gift = (snippet['giftDetails'] ?? null) as Record<string, unknown> | null
  const superChat = (snippet['superChatDetails'] ?? null) as Record<string, unknown> | null
  const superSticker = (snippet['superStickerDetails'] ?? null) as Record<string, unknown> | null
  const milestone = (snippet['memberMilestoneChatDetails'] ?? null) as Record<string, unknown> | null
  const gifting = (snippet['membershipGiftingDetails'] ?? null) as Record<string, unknown> | null
  const received = (snippet['giftMembershipReceivedDetails'] ?? null) as Record<string, unknown> | null
  const newSponsor = (snippet['newSponsorDetails'] ?? null) as Record<string, unknown> | null
  const textDetails = (snippet['textMessageDetails'] ?? null) as Record<string, unknown> | null

  const duration = (gift?.['giftDuration'] ?? null) as Record<string, unknown> | null
  const id = String(
    item['id'] ??
      `${snippet['liveChatId'] ?? ''}|${snippet['publishedAt'] ?? ''}|${author['channelId'] ?? ''}`
  )

  return {
    id,
    liveChatId: String(snippet['liveChatId'] ?? liveChatId ?? ''),
    type,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
    jewels: gift ? Math.trunc(Number(gift['jewelsAmount']) || 0) : 0,
    giftName: gift?.['giftName'] ? String(gift['giftName']) : undefined,
    giftUrl: gift?.['giftUrl'] ? String(gift['giftUrl']) : undefined,
    giftSeconds: duration ? Math.trunc(Number(duration['seconds']) || 0) : 0,
    hasVisualEffect: Boolean(gift?.['hasVisualEffect']),
    comboCount: gift ? Math.trunc(Number(gift['comboCount']) || 0) : 0,
    altText: gift?.['altText'] ? String(gift['altText']) : undefined,
    language: gift?.['language'] ? String(gift['language']) : undefined,
    amountDisplayString: String(
      superChat?.['amountDisplayString'] ?? superSticker?.['amountDisplayString'] ?? ''
    ),
    amountMicros: Math.trunc(
      Number(superChat?.['amountMicros'] ?? superSticker?.['amountMicros'] ?? 0) || 0
    ),
    currency: String(superChat?.['currency'] ?? superSticker?.['currency'] ?? ''),
    userComment: String(milestone?.['userComment'] ?? superChat?.['userComment'] ?? ''),
    giftMembershipsCount: Math.trunc(Number(gifting?.['giftMembershipsCount'] ?? 0) || 0),
    memberLevelName: String(
      gifting?.['giftMembershipsLevelName'] ??
        newSponsor?.['memberLevelName'] ??
        received?.['memberLevelName'] ??
        milestone?.['memberLevelName'] ??
        ''
    ),
    displayMessage: String(snippet['displayMessage'] ?? ''),
    text: textDetails?.['messageText'] ? String(textDetails['messageText']) : undefined,
    author: author['displayName'] ? String(author['displayName']) : undefined,
    authorChannelId: String(author['channelId'] ?? snippet['authorChannelId'] ?? ''),
    authorUrl: author['channelUrl'] ? String(author['channelUrl']) : undefined,
    avatar: author['profileImageUrl'] ? String(author['profileImageUrl']) : undefined,
    isChatOwner: Boolean(author['isChatOwner']),
    isChatModerator: Boolean(author['isChatModerator'])
  }
}

function ingest(items: Record<string, unknown>[]): { added: number; merged: number } {
  let added = 0
  let merged = 0

  for (const item of items) {
    const snippet = (item['snippet'] ?? {}) as Record<string, unknown>
    const type = String(snippet['type'] ?? '')
    if (type === 'chatEndedEvent') chatEnded = true
    if (!keepType(type, config.typeFilter)) continue

    const input = toMessageInput(item)
    if (!input) continue

    const result = upsertMessage(input)
    if (result === 'unchanged') continue

    const row = getMessage(input.id)
    if (!row) continue

    // Shared TikTok + YouTube timeline (Live activity tab). Combo updates reuse
    // the same ref_id, so the row is raised in place instead of duplicated.
    mirrorYouTubeMessage(row)

    if (result === 'added') {
      added++
      if (type === 'giftEvent') {
        // Supporters are credited once per message id: a combo update on the
        // same id must not count the same jewels twice.
        recordYouTubeGift({
          channelId: input.authorChannelId,
          displayName: input.author,
          avatar: input.avatar,
          jewels: input.jewels,
          at: input.publishedAt
        })
      }
    } else {
      merged++
    }

    const mapping = type === 'giftEvent' ? findMapping(input.giftName ?? '') : undefined
    if (mapping && result === 'added') {
      // Records that the bridge already saw this message once. YouTube gives no
      // "combo ended" signal, so a gift maps on first sight - not per combo tick.
      markTriggerFired(input.id)
    }

    onEvent({
      kind: result === 'added' ? 'new' : 'combo',
      message: row,
      mapping: mapping ? { vconnect_uid: mapping.vconnect_uid, tits_uid: mapping.tits_uid } : null
    })
  }

  return { added, merged }
}

/* ---------------- polling ---------------- */

function minGapMs(): number {
  // pollingIntervalMillis is measured from the previous request, not from the
  // reply, so the gap gets a 2s safety margin on top.
  return Math.max(config.pollSec * 1000, pollIntervalMs + 2000, backoffMs, 3000)
}

function fetchPage(pageToken?: string | null): Promise<Record<string, unknown>> {
  return apiGet('liveChat/messages', {
    part: 'snippet,authorDetails',
    liveChatId,
    maxResults: config.maxResults,
    hl: config.hl,
    profileImageSize: 88,
    pageToken: pageToken ?? undefined
  })
}

function applyPage(data: Record<string, unknown>): void {
  const items = (data['items'] ?? []) as Record<string, unknown>[]
  fetchedRaw += items.length
  lastRaw = data
  const interval = Number(data['pollingIntervalMillis'])
  if (Number.isFinite(interval) && interval > 0) pollIntervalMs = Math.max(interval, 1000)
  if (data['offlineAt']) streamOfflineAt = String(data['offlineAt'])
  ingest(items)
}

async function pullHistory(pageToken: string | null, depth: number): Promise<void> {
  const data = await fetchPage(pageToken)
  applyPage(data)
  const next = data['nextPageToken'] ? String(data['nextPageToken']) : null
  // Always assign: a page without a token ends the history walk and puts the
  // live poll back on "newest messages", which is what an empty pageToken means.
  nextPageToken = next
  if (next && depth < MAX_HISTORY_PAGES) {
    await sleep(minGapMs())
    await pullHistory(next, depth + 1)
  }
}

function scheduleNext(delayMs: number): void {
  if (!polling) return
  const wait = Math.max(1000, delayMs)
  nextAllowedAt = Date.now() + wait
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollOnce()
  }, wait)
  emitStatus()
}

async function pollOnce(): Promise<void> {
  if (!liveChatId || inFlight) return
  inFlight = true
  try {
    const data = await fetchPage(nextPageToken)
    applyPage(data)
    if (data['nextPageToken']) nextPageToken = String(data['nextPageToken'])
    backoffMs = 0
    emitStatus()
    if (chatEnded) {
      handleStreamEnd()
      return
    }
    if (polling) scheduleNext(minGapMs())
  } catch (error) {
    const e = error as YouTubeApiError
    const throttled =
      e?.reason === 'rateLimitExceeded' ||
      e?.reason === 'userRateLimitExceeded' ||
      e?.reason === 'quotaExceeded' ||
      e?.reason === 'dailyLimitExceeded' ||
      e?.status === 429

    if (throttled) {
      consecutiveErrors += 1
      backoffMs = Math.min((pollIntervalMs + 2000) * 2 ** consecutiveErrors, MAX_BACKOFF_MS)
      failStatus(describeApiError(error))
      if (polling) scheduleNext(backoffMs)
      return
    }

    failStatus(describeApiError(error))
    if (e?.reason === 'liveChatEnded' || e?.reason === 'liveChatNotFound') {
      handleStreamEnd()
    } else if (polling) {
      scheduleNext(minGapMs())
    }
  } finally {
    inFlight = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ---------------- public API ---------------- */

export function setYouTubeHandlers(handlers: {
  onEvent: (payload: YouTubeEventPayload) => void
  onStatus: (status: YouTubeStatus) => void
}): void {
  onEvent = handlers.onEvent
  onStatus = handlers.onStatus
}

/**
 * Ask "who is live right now?" without starting the poll loop. Costs the same
 * 1-3 quota units as a handle start, and is what the Setup card's Find live
 * button uses so the user can confirm the channel before committing to polling.
 */
export async function previewYouTubeLive(input?: Partial<YouTubeConfig>): Promise<YouTubeLiveTarget> {
  if (input) setYouTubeConfig(input)
  if (!config.keys.length) {
    throw new YouTubeApiError('Add at least one YouTube Data API v3 key first.', 0, 'noKeys')
  }
  const handle = normalizeHandle(config.handle)
  if (!handle) {
    throw new YouTubeApiError(`"${config.handle}" is not a channel handle (@name).`, 400, 'badHandle')
  }
  const resolved = await resolveLiveFromHandle(handle)
  resolvedChannelId = resolved.channelId
  resolvedChannelTitle = resolved.channelTitle
  resolvedVideoId = resolved.videoId
  streamTitle = resolved.title
  setSetting('streamTitle', streamTitle)
  setSetting('channelTitle', resolved.channelTitle)
  emitStatus()
  return resolved
}

export function startYouTube(input?: Partial<YouTubeConfig>): YouTubeStatus {
  if (input) setYouTubeConfig(input)
  lastError = null
  if (!config.keys.length) return failStatus('Add at least one YouTube Data API v3 key first.')
  if (liveChatId && config.liveChatId && config.liveChatId !== liveChatId) {
    resetSession()
  }

  const target = config.liveChatId
  const videoId = extractVideoId(config.videoInput)
  const handle = normalizeHandle(config.handle)
  if (!target && !videoId && !handle) {
    return failStatus('Enter a live video URL/ID, a channel handle (@name), or a liveChatId.')
  }

  // Handle mode owns the resolution so the tracker can follow the next live.
  watchMode = !target && !videoId && !!handle
  polling = true
  consecutiveErrors = 0
  backoffMs = 0
  chatEnded = false
  streamOfflineAt = null
  sessionStart = sessionStart ?? new Date().toISOString()
  setSetting('sessionStart', sessionStart)

  const chain: Promise<YouTubeLiveTarget> = target
    ? Promise.resolve({
        liveChatId: target,
        videoId: videoId ?? '',
        title: streamTitle,
        channelId: resolvedChannelId,
        channelTitle: resolvedChannelTitle
      })
    : videoId
      ? resolveLiveChatId(videoId).then((chatId) => ({
          liveChatId: chatId,
          videoId,
          title: streamTitle,
          channelId: resolvedChannelId,
          channelTitle: resolvedChannelTitle
        }))
      : resolveLiveFromHandle(handle!)

  void chain
    .then(async (resolved) => {
      applyResolvedTarget(resolved)
      nextPageToken = null
      emitStatus('Resolving...')
      await pullHistory(null, 0)
      if (!polling) return
      const sinceLast = Date.now() - lastRequestAt
      scheduleNext(Math.max(minGapMs() - sinceLast, 1000))
      emitStatus()
    })
    .catch((error) => {
      stopYouTubePolling()
      failStatus(describeApiError(error))
    })

  return getStatus()
}

function applyResolvedTarget(resolved: YouTubeLiveTarget): void {
  rearmAttempts = 0
  liveChatId = resolved.liveChatId
  if (resolved.videoId) resolvedVideoId = resolved.videoId
  if (resolved.channelId) resolvedChannelId = resolved.channelId
  if (resolved.channelTitle) resolvedChannelTitle = resolved.channelTitle
  if (resolved.title) streamTitle = resolved.title
  setSetting('liveChatId', resolved.liveChatId)
  setSetting('streamTitle', streamTitle)
  if (resolvedChannelTitle) setSetting('channelTitle', resolvedChannelTitle)
}

/** Stream finished: in handle mode, look for the next one instead of stopping. */
function handleStreamEnd(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  if (!watchMode) {
    stopYouTubePolling()
    return
  }
  liveChatId = null
  nextPageToken = null
  chatEnded = false
  scheduleLiveRecheck()
}

function scheduleLiveRecheck(): void {
  if (!watchMode || recheckTimer) return
  // A channel that has been offline for a while is asked less and less often,
  // so an idle follow costs 2-3 quota units every few minutes instead of every
  // minute. Finding a live resets the ladder.
  const delay = Math.min(LIVE_RECHECK_MAX_MS, LIVE_RECHECK_MS * 2 ** Math.min(5, rearmAttempts))
  recheckAt = Date.now() + delay
  recheckTimer = setTimeout(() => {
    recheckTimer = null
    void rearmFromHandle()
  }, delay)
  emitStatus('Waiting')
}

function clearLiveRecheck(): void {
  if (recheckTimer) {
    clearTimeout(recheckTimer)
    recheckTimer = null
  }
  recheckAt = 0
  rearmAttempts = 0
}

async function rearmFromHandle(): Promise<void> {
  if (!polling || !watchMode) return
  const handle = normalizeHandle(config.handle)
  if (!handle) return
  const attempt = ++rearmAttempts
  try {
    // search.list costs 100 units, so the cheap playlist lookup carries the
    // wait and search is paid for on the first recheck and every sixth after.
    const resolved = await resolveLiveFromHandle(handle, { allowSearch: attempt === 1 || attempt % 6 === 1 })
    applyResolvedTarget(resolved)
    nextPageToken = null
    chatEnded = false
    backoffMs = 0
    consecutiveErrors = 0
    lastError = null
    emitStatus('Resolving...')
    await pullHistory(null, 0)
    if (!polling) return
    scheduleNext(minGapMs())
    emitStatus()
  } catch (error) {
    const e = error as YouTubeApiError
    // A channel that is simply offline is the normal case here, not an error
    // worth shouting about; key/quota problems are worth one line.
    if (e?.reason !== 'notLive') failStatus(describeApiError(error))
    if (polling) scheduleLiveRecheck()
  }
}

export function stopYouTubePolling(): YouTubeStatus {
  polling = false
  backoffMs = 0
  watchMode = false
  clearLiveRecheck()
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  nextAllowedAt = 0
  emitStatus('Stopped')
  return getStatus()
}

export function resetSession(): void {
  stopYouTubePolling()
  liveChatId = null
  streamTitle = ''
  streamOfflineAt = null
  chatEnded = false
  watchMode = false
  resolvedVideoId = ''
  resolvedChannelId = ''
  resolvedChannelTitle = ''
  clearLiveRecheck()
  nextPageToken = null
  fetchedRaw = 0
  lastRaw = null
  sessionStart = null
  consecutiveErrors = 0
  backoffMs = 0
  setSetting('liveChatId', '')
  setSetting('sessionStart', '')
}

export function clearYouTubeLog(): YouTubeStats {
  resetSession()
  clearMessages()
  emitStatus()
  return getStats()
}

export function resetYouTubeQuota(): YouTubeQuotaSnapshot {
  currentQuotaDay()
  resetQuota(quotaDay)
  quotaUsed = {}
  keyCooldown = {}
  emitStatus()
  return getQuotaSnapshot()
}

export function getQuotaSnapshot(): YouTubeQuotaSnapshot {
  const day = currentQuotaDay()
  const now = Date.now()
  const cooling = Object.entries(keyCooldown)
    .filter(([, state]) => state.until > now)
    .map(([key, state]) => ({ key, until: state.until, reason: state.reason }))
  return {
    day,
    cap: quotaCap(),
    resetAt: quotaResetAt,
    used: { ...quotaUsed },
    total: Object.values(quotaUsed).reduce((a, b) => a + b, 0),
    cooling
  }
}

export function listYouTubeMessages(limit = 1000): YouTubeMessageRow[] {
  return listMessages(limit)
}

export function getYouTubeStats(): YouTubeStats {
  return getStats()
}

export function listYouTubeGiftNames(): string[] {
  return getGiftNames()
}

export function getYouTubeRawPage(): unknown {
  return lastRaw
}

export function getYouTubeSession(): {
  liveChatId: string | null
  streamTitle: string
  sessionStart: string | null
  offlineAt: string | null
  chatEnded: boolean
  fetched: number
  pollIntervalMs: number
} {
  return {
    liveChatId,
    streamTitle,
    sessionStart,
    offlineAt: streamOfflineAt,
    chatEnded,
    fetched: fetchedRaw,
    pollIntervalMs
  }
}

export async function exportYouTubeLog(
  format: 'csv' | 'json'
): Promise<{ saved: boolean; path?: string; count: number }> {
  const rows = listMessages(5000)
  const parent = BrowserWindow.getAllWindows()[0]
  const defaultName = format === 'csv' ? 'gifts.csv' : 'gifts.json'
  const { canceled, filePath } = await dialog.showSaveDialog(parent ?? undefined, {
    title: `Export ${rows.length} message(s)`,
    defaultPath: defaultName,
    filters:
      format === 'csv'
        ? [{ name: 'CSV', extensions: ['csv'] }]
        : [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { saved: false, count: rows.length }

  const content = format === 'csv' ? buildCsv(rows) : buildJson(rows)
  writeFileSync(filePath, content, 'utf8')
  return { saved: true, path: filePath, count: rows.length }
}

const CSV_COLUMNS: (keyof YouTubeMessageRow)[] = [
  'published_at',
  'id',
  'type',
  'gift_name',
  'jewels',
  'combo_count',
  'has_visual_effect',
  'gift_seconds',
  'alt_text',
  'language',
  'amount_display_string',
  'currency',
  'author',
  'author_channel_id',
  'member_level_name',
  'display_message'
]

function buildCsv(rows: YouTubeMessageRow[]): string {
  const escape = (value: unknown): string => {
    const raw = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
  }
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(
      CSV_COLUMNS.map((column) => {
        const value = row[column]
        return escape(column === 'published_at' && typeof value === 'number' ? new Date(value).toISOString() : value)
      }).join(',')
    )
  }
  return lines.join('\n')
}

function buildJson(rows: YouTubeMessageRow[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      liveChatId,
      streamTitle,
      sessionStart,
      count: rows.length,
      items: rows
    },
    null,
    2
  )
}

/* ---------------- status ---------------- */

export function getStatus(): YouTubeStatus {
  const pool = usableKeys('liveChat/messages')
  const cooling = Object.values(keyCooldown).filter((state) => state.until > Date.now())
  const waiting = polling && !liveChatId && !!recheckTimer
  return {
    state: waiting
      ? 'Waiting'
      : polling
        ? inFlight
          ? 'Reading...'
          : 'Polling'
        : liveChatId
          ? 'Stopped'
          : 'Idle',
    polling,
    liveChatId,
    streamTitle,
    error: null,
    nextPollAt: nextAllowedAt || null,
    gapMs: minGapMs(),
    keysReady: pool.ready.length,
    keysTotal: pool.total,
    coolingUntil: pool.earliest || cooling[0]?.until || null,
    fetched: fetchedRaw,
    captured: (getStats()).messageCount,
    chatEnded,
    offlineAt: streamOfflineAt,
    backoffMs,
    watchMode,
    handle: config.handle,
    channelTitle: resolvedChannelTitle,
    videoId: resolvedVideoId,
    nextLiveCheckAt: recheckAt || null
  }
}

function failStatus(message: string): YouTubeStatus {
  lastError = message
  const status = { ...getStatus(), state: 'Error' as const, error: message }
  onStatus(status)
  return status
}

function emitStatus(state?: YouTubeStatus['state']): void {
  const status = getStatus()
  onStatus(lastError && !polling ? { ...status, state: 'Error', error: lastError } : state ? { ...status, state } : status)
}

export function clearYouTubeError(): void {
  lastError = null
}

/** Called on app quit: a live poll timer would otherwise keep the process alive. */
export function shutdownYouTube(): void {
  stopYouTubePolling()
}
