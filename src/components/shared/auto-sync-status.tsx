'use client'

import { useAutoSync } from '@/lib/auto-sync'
import { Button } from '@/components/ui/button'
import {
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

// Slim global status bar that appears under the TopBar whenever personal
// auto-sync is active (connected / connecting / error / disabled). In 'idle'
// (no remembered room) it renders nothing.
export function AutoSyncStatus() {
  const { status, code, lastSyncedAt, error, disconnect } = useAutoSync()

  if (status === 'idle') return null

  const time = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-Hant', { hour12: false }) : null

  return (
    <div className="border-b bg-muted/40 px-4 py-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {status === 'connected' && (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-700 dark:text-emerald-400">自動同步已連線</span>
            <span className="font-mono tracking-wider">{code}</span>
            {time && <span>最後同步 {time}</span>}
          </>
        )}
        {status === 'connecting' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>連接自動同步中…</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
            <span className="text-rose-600 dark:text-rose-400">自動同步失敗：{error}</span>
          </>
        )}
        {status === 'disabled' && (
          <>
            <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-amber-600 dark:text-amber-400">自動同步已暫停（你正手動加入房間）</span>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-2 text-[11px]"
          onClick={disconnect}
        >
          {status === 'error' ? <RefreshCw className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
          停用自動同步
        </Button>
      </div>
    </div>
  )
}
