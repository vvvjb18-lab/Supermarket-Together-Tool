'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRoomStore, useSaveStore, useUIStore } from '@/lib/store'
import { useRoomSync } from '@/lib/room-sync'
import { setAutoSyncCreds } from '@/lib/auto-sync'
import { SectionHeader } from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Crown,
  Copy,
  Check,
  Users,
  LogOut,
  Wifi,
  WifiOff,
  Upload,
  Loader2,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  User,
  AlertCircle,
  CheckCircle2,
  History,
  Package,
  Clock,
  LayoutGrid,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Room, RoomMember } from '@/lib/types'

// ============================================================
// Top-level <Room /> component
// ============================================================
export function Room() {
  const sync = useRoomSync()
  const room = useRoomStore((s) => s.room)

  if (!room) {
    return <RoomLobby sync={sync} />
  }
  return <RoomWorkspace sync={sync} />
}

// ============================================================
// Mode banner
// ============================================================
function ModeBanner({ sync }: { sync: ReturnType<typeof useRoomSync> }) {
  if (sync.mode === 'backend') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-start gap-3 py-3">
          <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm">
            <div className="font-medium text-emerald-700 dark:text-emerald-300">
              Supabase 已連線 · 跨裝置同步啟用
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              建立或加入房間後，存檔、成員、活動紀錄將透過 Supabase 即時同步到所有裝置。僅 Host 可上傳存檔，成員可即時檢視。
            </div>
          </div>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            connected
          </span>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="flex items-start gap-3 py-3">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-sm">
          <div className="font-medium text-amber-700 dark:text-amber-300">
            本地模式 — 尚未設定 Supabase
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            跨裝置同步停用，僅同瀏覽器分頁同步。請在{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.env</code>{' '}
            加入{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{' '}
            與{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{' '}
            即可啟用跨裝置同步。
          </div>
        </div>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          local
        </span>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Password input with show/hide toggle
// ============================================================
function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = 'off',
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pl-8 pr-9"
      />
      <button
        type="button"
        aria-label={show ? '隱藏密碼' : '顯示密碼'}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ============================================================
// Room Lobby — Create / Join cards
// ============================================================
function RoomLobby({ sync }: { sync: ReturnType<typeof useRoomSync> }) {
  const selfName = useRoomStore((s) => s.selfName)
  const selfId = useRoomStore((s) => s.selfId)
  const setSelf = useRoomStore((s) => s.setSelf)

  // Create form state
  const [cName, setCName] = useState(selfName)
  const [cRoom, setCRoom] = useState('我們的超級市場')
  const [cPass, setCPass] = useState('')
  const [cCreating, setCCreating] = useState(false)
  const [cCreatedCode, setCCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Join form state
  const [jCode, setJCode] = useState('')
  const [jName, setJName] = useState(selfName)
  const [jPass, setJPass] = useState('')
  const [jJoining, setJJoining] = useState(false)

  // Auto-sync: remember this room so the dashboard auto-connects on next load.
  const [remember, setRemember] = useState(false)

  const persistName = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setSelf(selfId, v)
  }

  const handleCreate = async () => {
    if (cCreating) return
    setCCreating(true)
    sync.clearError()
    try {
      const code = await sync.createRoom(cRoom || '我們的超級市場', cName || 'Host', cPass)
      setCCreatedCode(code)
      if (remember) setAutoSyncCreds({ code, password: cPass, name: cName || 'Host' })
      toast.success(`房間已建立：${code}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '建立房間失敗')
    } finally {
      setCCreating(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    toast.success(`房間代碼 ${code} 已複製`)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleJoin = async () => {
    if (jJoining) return
    setJJoining(true)
    sync.clearError()
    try {
      await sync.joinRoom(jCode, jName || 'Player', jPass)
      if (remember) setAutoSyncCreds({ code: jCode.toUpperCase(), password: jPass, name: jName || 'Player' })
      toast.success(`已加入房間 ${jCode.toUpperCase()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加入房間失敗')
    } finally {
      setJJoining(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 p-4">
      <SectionHeader
        title="多人房間"
        description="房間密碼認證 · Host 上傳存檔 · 成員即時檢視。跨裝置同步透過 Supabase。"
      />

      <ModeBanner sync={sync} />

      {cCreatedCode ? (
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              房間已建立
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                房間代碼
              </div>
              <div className="mt-2 text-3xl font-mono font-bold tracking-[0.3em] text-foreground">
                {cCreatedCode}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {cRoom || '我們的超級市場'}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => handleCopyCode(cCreatedCode)}
              >
                {copied ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copied ? '已複製' : '複製代碼'}
              </Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              將房間代碼與密碼分享給朋友。他們在「加入房間」輸入代碼 + 密碼即可進入。
              {sync.mode === 'local' && ' （目前為本地模式，僅同瀏覽器分頁可同步。）'}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setCCreatedCode(null)}
            >
              建立另一個房間
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Create room card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Crown className="h-4 w-4 text-amber-500" />
                建立房間（Host）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cRoom" className="text-xs">
                  房間名稱
                </Label>
                <Input
                  id="cRoom"
                  value={cRoom}
                  onChange={(e) => setCRoom(e.target.value)}
                  placeholder="我們的超級市場"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cName" className="text-xs">
                  你的名字
                </Label>
                <Input
                  id="cName"
                  value={cName}
                  onChange={(e) => persistName(setCName)(e.target.value)}
                  placeholder="Host"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cPass" className="text-xs">
                  房間密碼
                </Label>
                <PasswordInput
                  id="cPass"
                  value={cPass}
                  onChange={setCPass}
                  placeholder="設定一組密碼"
                  autoComplete="new-password"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={cCreating || !cPass}
              >
                {cCreating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="mr-1.5 h-4 w-4" />
                )}
                {cCreating ? '建立中…' : '建立房間'}
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                身為 Host 你將可上傳存檔到房間，所有成員即時檢視。
              </p>
            </CardContent>
          </Card>

          {/* Join room card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                加入房間（Member）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="jCode" className="text-xs">
                  房間代碼
                </Label>
                <Input
                  id="jCode"
                  value={jCode}
                  onChange={(e) =>
                    setJCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                  }
                  placeholder="ABC123"
                  className="font-mono tracking-[0.2em]"
                  maxLength={6}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jName" className="text-xs">
                  你的名字
                </Label>
                <Input
                  id="jName"
                  value={jName}
                  onChange={(e) => persistName(setJName)(e.target.value)}
                  placeholder="Player"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jPass" className="text-xs">
                  房間密碼
                </Label>
                <PasswordInput
                  id="jPass"
                  value={jPass}
                  onChange={setJPass}
                  placeholder="向 Host 索取密碼"
                  autoComplete="current-password"
                />
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleJoin}
                disabled={jJoining || jCode.length < 4 || !jPass}
              >
                {jJoining ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 h-4 w-4" />
                )}
                {jJoining ? '加入中…' : '加入房間'}
              </Button>
              {sync.lastError && (
                <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="leading-relaxed">{sync.lastError}</span>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                成員僅能檢視 Host 上傳的存檔，無法自行上傳。
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          記住此房間密碼（僅存於此裝置），下次開啟網站自動連線並即時同步遊戲存檔。
        </span>
      </label>

      <Card className="bg-muted/30">
        <CardContent className="space-y-2 py-4 text-sm">
          <div className="font-medium">房間功能</div>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Host 上傳存檔一次，全員即時檢視 Day / Money / 偵測欄位</li>
            <li>成員名冊即時更新（加入 / 離開 / 上次活動時間）</li>
            <li>活動紀錄顯示加入、離開、存檔更新事件</li>
            <li>房間密碼以 bcrypt 雜湊儲存，加入時透過 RPC 驗證</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Room Workspace — in-room view
// ============================================================
function RoomWorkspace({ sync }: { sync: ReturnType<typeof useRoomSync> }) {
  const room = useRoomStore((s) => s.room) as Room
  const selfId = useRoomStore((s) => s.selfId)
  const saveSnapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)

  const isHost = useMemo(
    () => room.members.find((m) => m.id === selfId)?.role === 'host',
    [room.members, selfId],
  )

  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(null)

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(room.code)
    setCopied(true)
    toast.success(`房間代碼 ${room.code} 已複製`)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleUpload = async () => {
    if (uploading) return
    setUploading(true)
    sync.clearError()
    try {
      await sync.uploadSave()
      setLastUploadAt(Date.now())
      toast.success('存檔已上傳到房間')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上傳存檔失敗')
    } finally {
      setUploading(false)
    }
  }

  const handleLeave = async () => {
    await sync.leaveRoom()
    toast.info('已離開房間')
  }

  // Detect snapshot source: prefer room.snapshot (mirrors backend), fall
  // back to local saveSnapshot for the host's own loaded save.
  const displayedSnapshot = room.snapshot ?? (isHost ? saveSnapshot : null)
  const lastSeenUpload = lastUploadAt
    ? lastUploadAt
    : room.snapshot
      ? room.events.find((e) => e.type === 'save-updated')?.ts ?? null
      : null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-[1200px] space-y-4 p-4">
        {/* Header */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{room.name}</span>
                <Badge variant="outline" className="font-mono text-xs tracking-wider">
                  {room.code}
                </Badge>
                <RoleBadge isHost={isHost} />
                {sync.mode === 'backend' ? (
                  <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600">
                    <Wifi className="h-3 w-3" /> Supabase
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-[10px] text-amber-600">
                    <WifiOff className="h-3 w-3" /> 本地
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {room.members.length} 位玩家 · 建立於{' '}
                {new Date(room.createdAt).toLocaleString('zh-Hant')}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={handleCopyCode}>
                {copied ? (
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="mr-1 h-3.5 w-3.5" />
                )}
                {copied ? '已複製' : room.code}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleLeave}>
                <LogOut className="mr-1 h-3.5 w-3.5" /> 離開
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: host upload / member waiting + snapshot preview */}
          <div className="space-y-4 lg:col-span-2">
            {isHost ? (
              <HostUploadCard
                uploading={uploading}
                lastUploadAt={lastSeenUpload}
                hasSave={Boolean(saveSnapshot)}
                onUpload={handleUpload}
                onViewUpload={() => setView('upload')}
              />
            ) : (
              <MemberWaitCard hasSnapshot={Boolean(displayedSnapshot)} />
            )}

            {/* Snapshot preview */}
            <SnapshotPreviewCard
              snapshot={displayedSnapshot}
              onOpenDashboard={() => setView('dashboard')}
            />
          </div>

          {/* Right: members + activity */}
          <div className="space-y-4">
            <MembersCard members={room.members} selfId={selfId} />
            <ActivityCard events={room.events} members={room.members} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ============================================================
// Role badge
// ============================================================
function RoleBadge({ isHost }: { isHost: boolean }) {
  return isHost ? (
    <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">
      <Crown className="h-3 w-3" /> Host
    </Badge>
  ) : (
    <Badge className="gap-1 bg-muted text-muted-foreground" variant="outline">
      <User className="h-3 w-3" /> Member
    </Badge>
  )
}

// ============================================================
// Host upload card
// ============================================================
function HostUploadCard({
  uploading,
  lastUploadAt,
  hasSave,
  onUpload,
  onViewUpload,
}: {
  uploading: boolean
  lastUploadAt: number | null
  hasSave: boolean
  onUpload: () => void
  onViewUpload: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4 text-primary" />
          上傳存檔到房間
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          身為 Host，你可以將目前載入的存檔上傳到房間，所有成員將即時收到更新。
          成員無法上傳存檔。
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onUpload} disabled={uploading || !hasSave} className="min-w-[180px]">
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            {uploading ? '上傳中…' : '上傳目前存檔到房間'}
          </Button>
          {!hasSave && (
            <Button variant="outline" size="sm" onClick={onViewUpload}>
              前往載入存檔
            </Button>
          )}
          {lastUploadAt && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              上次上傳：{relativeTime(lastUploadAt)}
            </span>
          )}
        </div>
        {!hasSave && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>尚未載入存檔。請先到「存檔上傳」頁面上傳 .es3 檔或載入範本。</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Member waiting card
// ============================================================
function MemberWaitCard({ hasSnapshot }: { hasSnapshot: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" />
          等待 Host 上傳存檔
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSnapshot ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Host 已上傳存檔。下方顯示最新快照摘要。</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>正在等待 Host 上傳存檔… 一旦 Host 上傳，將即時顯示於此。</span>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          成員身分無法上傳存檔。如需上傳，請聯絡 Host 或自行建立新房間。
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Snapshot preview card
// ============================================================
function SnapshotPreviewCard({
  snapshot,
  onOpenDashboard,
}: {
  snapshot: ReturnType<typeof useSaveStore.getState>['snapshot']
  onOpenDashboard: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          存檔快照
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SnapshotTile label="Day" value={String(snapshot.day ?? '—')} />
              <SnapshotTile
                label="Money"
                value={`$${(snapshot.money ?? 0).toLocaleString()}`}
              />
              <SnapshotTile
                label="偵測欄位"
                value={String(snapshot.detectedFields?.length ?? 0)}
              />
              <SnapshotTile label="來源" value={snapshot.source ?? '—'} small />
            </div>
            <Button size="sm" variant="outline" onClick={onOpenDashboard}>
              查看 Dashboard
            </Button>
          </>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            尚無存檔快照
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SnapshotTile({
  label,
  value,
  small,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 font-semibold tabular-nums ${small ? 'text-xs' : 'text-sm'}`}>
        {value}
      </div>
    </div>
  )
}

// ============================================================
// Members roster card
// ============================================================
function MembersCard({
  members,
  selfId,
}: {
  members: RoomMember[]
  selfId: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            成員
          </span>
          <Badge variant="outline" className="text-xs">
            {members.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">尚無成員</div>
        ) : (
          <div className="grid gap-2">
            {members.map((m) => (
              <MemberRow key={m.id} m={m} isSelf={m.id === selfId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MemberRow({ m, isSelf }: { m: RoomMember; isSelf: boolean }) {
  const initials = m.name.slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: m.color }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{m.name}</span>
          {isSelf && <Badge variant="outline" className="text-[9px]">你</Badge>}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {relativeTime(m.lastSeen)}
        </div>
      </div>
      {m.role === 'host' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="outline">
              <Crown className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Host</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-muted text-muted-foreground" variant="outline">
              <User className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Member</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

// ============================================================
// Activity log card
// ============================================================
function ActivityCard({
  events,
  members,
}: {
  events: Room['events']
  members: RoomMember[]
}) {
  // events may be in any order — sort by ts desc for display.
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.ts - a.ts).slice(0, 50),
    [events],
  )
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          活動紀錄
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            尚無活動紀錄
          </div>
        ) : (
          <div
            className="max-h-64 space-y-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {sorted.map((e) => {
              const m = members.find((mm) => mm.id === e.playerId)
              const name = m?.name ?? e.payload?.['name'] ?? 'Unknown'
              return (
                <ActivityRow key={e.id} type={e.type} name={String(name)} ts={e.ts} />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRow({ type, name, ts }: { type: string; name: string; ts: number }) {
  let icon = <History className="h-3.5 w-3.5 text-muted-foreground" />
  let text = `${name} ${type}`
  let tone = 'text-muted-foreground'
  if (type === 'join') {
    icon = <User className="h-3.5 w-3.5 text-emerald-500" />
    text = `${name} 加入了房間`
    tone = 'text-foreground'
  } else if (type === 'leave') {
    icon = <LogOut className="h-3.5 w-3.5 text-rose-500" />
    text = `${name} 離開了房間`
    tone = 'text-muted-foreground'
  } else if (type === 'save-updated') {
    icon = <Upload className="h-3.5 w-3.5 text-primary" />
    text = `${name} 更新了存檔`
    tone = 'text-foreground'
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
      {icon}
      <span className={`flex-1 truncate ${tone}`}>{text}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {relativeTime(ts)}
      </span>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 0) return '剛剛'
  const s = Math.floor(diff / 1000)
  if (s < 5) return '剛剛'
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分鐘前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小時前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-Hant')
}
