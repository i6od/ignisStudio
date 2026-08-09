import { CheckCircle2, RefreshCcw, Settings2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PageSection } from '@/components/page-section'
import { Button } from '@/components/ui/button'

type UpdateState = {
  step: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
}

export function SettingsPage() {
  const [version, setVersion] = useState('')
  const [state, setState] = useState<UpdateState>({ step: 'idle' })

  useEffect(() => {
    let disposed = false
    window.vconnect?.updates.getVersion().then(v => {
      if (!disposed) setVersion(v)
    })

    const offChecking = window.vconnect?.updates.onChecking(() => {
      setState({ step: 'checking' })
    })
    const offAvailable = window.vconnect?.updates.onAvailable(info => {
      setState({ step: 'available', version: info.version })
    })
    const offNotAvailable = window.vconnect?.updates.onNotAvailable(() => {
      setState({ step: 'not-available' })
    })
    const offProgress = window.vconnect?.updates.onProgress(p => {
      setState(prev => ({ ...prev, step: 'downloading', progress: p }))
    })
    const offDownloaded = window.vconnect?.updates.onDownloaded(info => {
      setState({ step: 'downloaded', version: info.version })
    })
    const offError = window.vconnect?.updates.onError(msg => {
      setState({ step: 'error', error: msg })
    })

    return () => {
      disposed = true
      offChecking?.()
      offAvailable?.()
      offNotAvailable?.()
      offProgress?.()
      offDownloaded?.()
      offError?.()
    }
  }, [])

  const checkNow = useCallback(() => {
    setState({ step: 'checking' })
    window.vconnect?.updates.check()
  }, [])

  const isBusy = state.step === 'checking' || state.step === 'downloading'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageSection
        icon={<Settings2 className="h-4 w-4" />}
        title="App Settings"
        description="About and automatic updates"
      >
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">VConnect Bridge</p>
              <p className="text-xs text-zinc-500">
                Version{' '}
                <span className="font-mono text-zinc-300">{version || '—'}</span>
                <span className="mx-2 text-zinc-700">·</span>
                Electron {window.vconnect?.versions.electron ?? '—'}
              </p>
            </div>
            <Button size="sm" onClick={checkNow} disabled={isBusy}>
              {isBusy ? (
                <RefreshCcw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              {state.step === 'downloading' ? `Downloading ${state.progress ?? 0}%` : 'Check for Updates'}
            </Button>
          </div>

          <UpdateStatus state={state} />
        </div>

        <p className="mt-3 text-xs text-zinc-600">
          Updates are published to GitHub Releases. The app checks automatically 5 seconds after
          launch and hourly; a downloaded update installs automatically after 3 seconds.
        </p>
      </PageSection>
    </div>
  )
}

function UpdateStatus({ state }: { state: UpdateState }) {
  if (state.step === 'idle') {
    return null
  }
  if (state.step === 'checking') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
        <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
        Checking for updates…
      </div>
    )
  }
  if (state.step === 'error') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        <span className="line-clamp-2">{state.error ?? 'Update check failed'}</span>
      </div>
    )
  }
  if (state.step === 'available' || state.step === 'downloading') {
    return (
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${state.progress ?? 0}%` }}
          />
        </div>
        <span className="text-xs text-zinc-400">
          {state.step === 'downloading' ? `${state.progress ?? 0}%` : 'Update available'}
        </span>
      </div>
    )
  }
  if (state.step === 'downloaded') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Update v{state.version} downloaded — restarting…
      </div>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      You're on the latest version
    </div>
  )
}