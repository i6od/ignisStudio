/**
 * Connect / Disconnect is meant to be one switch for the whole app: the TikTok
 * feed and the VConnect / TITS sockets live in the bridge hook, the YouTube live
 * poller lives in the main process. Both pages that expose the switch go through
 * here so they cannot drift apart.
 */

export function isYouTubeSourceConfigured(config: YouTubeConfig): boolean {
  return (
    config.keys.length > 0 &&
    !!(config.liveChatId.trim() || config.videoInput.trim() || config.handle.trim())
  )
}

export function isYouTubePolling(status: YouTubeStatus | null): boolean {
  return !!status?.polling
}

export function toggleBridgeAndYouTube({
  bridge,
  youtube,
  connected
}: {
  bridge: { connect: () => void; disconnect: () => void }
  youtube: {
    start: (partial?: Partial<YouTubeConfig>) => Promise<void>
    stop: () => Promise<void>
    status: YouTubeStatus | null
    config: YouTubeConfig
  }
  connected: boolean
}): void {
  if (connected) {
    bridge.disconnect()
    if (isYouTubePolling(youtube.status)) void youtube.stop()
    return
  }

  bridge.connect()
  // Only start the poller when it has a key and something to read, otherwise
  // Connect would surface a "add a key / enter a target" error for a source the
  // user never set up.
  if (!isYouTubePolling(youtube.status) && isYouTubeSourceConfigured(youtube.config)) {
    void youtube.start()
  }
}
