'use client'

import { useState, useEffect, useRef } from 'react'
import { useRoomStore, useSaveStore, useUIStore } from '@/lib/store'
import { useRoomSync } from '@/lib/room-sync'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { ConfidenceBadge, StatCard, DataRow, SectionHeader, fmt, fmtMoney } from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UsersRound, Copy, LogOut, Send, Crown, Wifi, WifiOff, Share2, CheckSquare, ListTodo, Tag, PackageSearch, Map, GitBranch } from 'lucide-react'
import { toast } from 'sonner'

const TASK_CATEGORIES = [
  { id: 'buy', label: '採購', color: '#10b981' },
  { id: 'restock', label: '補貨', color: '#06b6d4' },
  { id: 'manufacturing', label: '製造', color: '#84cc16' },
  { id: 'checkout', label: '結帳/訂單', color: '#f59e0b' },
  { id: 'security', label: '防盜', color: '#f43f5e' },
  { id: 'other', label: '其他', color: '#8b5cf6' },
] as const

export function Room() {
  const sync = useRoomSync()
  const room = useRoomStore((s) => s.room)
  const selfName = useRoomStore((s) => s.selfName)
  const setSelf = useRoomStore((s) => s.setSelf)
  const selfId = useRoomStore((s) => s.selfId)
  const saveSnapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)

  const [name, setName] = useState(selfName)
  const [roomName, setRoomName] = useState('我們的超級市場')
  const [joinCode, setJoinCode] = useState('')
  const [chatText, setChatText] = useState('')
  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [newChecklist, setNewChecklist] = useState('')

  const persistName = (n: string) => {
    setName(n)
    setSelf(selfId, n)
  }

  const copyInvite = () => {
    if (!room) return
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/#room=${room.code}`
    navigator.clipboard?.writeText(url)
    toast.success(`邀請連結已複製：房間代碼 ${room.code}`)
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-[700px] space-y-4 p-4">
        <SectionHeader
          title="多人房間"
          description="與朋友共用網站，對應遊戲多人房間。支援共享存檔快照、清單、補貨/定價/貨架/技能計畫、任務分配、即時編輯與 cursor presence。"
          confidence={sync.transport === 'socket' ? 'confirmed' : 'unverified'}
          note={sync.transport === 'socket' ? 'Socket.IO 已連線 (port 3003)' : sync.transport === 'broadcast' ? 'BroadcastChannel 同瀏覽器分頁同步' : '離線模式'}
        />

        <Card className={sync.transport === 'socket' ? 'border-emerald-500/30' : 'border-amber-500/30'}>
          <CardContent className="flex items-center gap-3 py-3">
            {sync.transport === 'socket' ? <Wifi className="h-5 w-5 text-emerald-500" /> : <WifiOff className="h-5 w-5 text-amber-500" />}
            <div className="text-sm">
              <div className="font-medium">
                {sync.transport === 'socket' ? 'Socket 服務已連線' : sync.transport === 'broadcast' ? '使用 BroadcastChannel（同瀏覽器分頁）' : '離線'}
              </div>
              <div className="text-xs text-muted-foreground">
                {sync.transport === 'socket'
                  ? '跨裝置即時同步已就緒。建立房間後分享代碼給朋友。'
                  : 'room-service (port 3003) 未連線。可建立房間但僅限同瀏覽器分頁同步。'}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">建立房間</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">你的名稱</Label>
                <Input value={name} onChange={(e) => persistName(e.target.value)} placeholder="Player A" />
              </div>
              <div>
                <Label className="text-xs">房間名稱</Label>
                <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
              </div>
              <Button className="w-full" onClick={() => sync.createRoom(roomName, name || 'Host')}>
                <Crown className="mr-1.5 h-4 w-4" /> 建立房間（你當 Host）
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">加入房間</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">你的名稱</Label>
                <Input value={name} onChange={(e) => persistName(e.target.value)} placeholder="Player B" />
              </div>
              <div>
                <Label className="text-xs">房間代碼</Label>
                <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" className="font-mono" maxLength={6} />
              </div>
              <Button className="w-full" variant="outline" onClick={() => sync.joinByCode(joinCode, name || 'Player')} disabled={joinCode.length < 4}>
                <UsersRound className="mr-1.5 h-4 w-4" /> 加入房間
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="space-y-2 py-4 text-sm">
            <div className="font-medium">房間功能（對應遊戲多人玩法）</div>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>共享 save snapshot — 一人上傳，全員可見</li>
              <li>共享 Opening Prep 清單 — 開店前確認事項</li>
              <li>共享 restock plan / price plan / shelf plan / skill plan</li>
              <li>每位玩家可被分配任務（採購/補貨/製造/結帳/防盜）</li>
              <li>即時編輯、presence cursor、last-edited-by、衝突以樂觀更新處理</li>
              <li>匯出房間報告為 Markdown / JSON</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <RoomWorkspace sync={sync} />
}

function RoomWorkspace({ sync }: { sync: ReturnType<typeof useRoomSync> }) {
  const room = useRoomStore((s) => s.room)!
  const selfId = useRoomStore((s) => s.selfId)
  const toggleChecklist = useRoomStore((s) => s.toggleChecklist)
  const addChecklist = useRoomStore((s) => s.addChecklist)
  const removeChecklist = useRoomStore((s) => s.removeChecklist)
  const addTask = useRoomStore((s) => s.addTask)
  const toggleTask = useRoomStore((s) => s.toggleTask)
  const removeTask = useRoomStore((s) => s.removeTask)
  const assignTask = useRoomStore((s) => s.assignTask)
  const voteSkill = useRoomStore((s) => s.voteSkill)
  const unvoteSkill = useRoomStore((s) => s.unvoteSkill)
  const saveSnapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)

  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [newChecklist, setNewChecklist] = useState('')
  const [chatText, setChatText] = useState('')

  const isHost = room.members.find((m) => m.id === selfId)?.role === 'host'

  const handleAddTask = () => {
    if (!newTaskLabel.trim()) return
    addTask({ id: Math.random().toString(36).slice(2), playerId: '', category: 'other', label: newTaskLabel, done: false })
    sync.broadcastPatch({ tasks: [...room.tasks, { id: Math.random().toString(36).slice(2), playerId: '', category: 'other', label: newTaskLabel, done: false }] })
    setNewTaskLabel('')
  }
  const handleAddChecklist = () => {
    if (!newChecklist.trim()) return
    const item = { id: Math.random().toString(36).slice(2), label: newChecklist, done: false }
    addChecklist(newChecklist)
    sync.broadcastPatch({ checklist: [...room.checklist, item] })
    setNewChecklist('')
  }
  const handleToggleCheck = (id: string) => {
    toggleChecklist(id)
    sync.broadcastPatch({ checklist: room.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })
  }
  const handleToggleTask = (id: string) => {
    toggleTask(id)
    sync.broadcastPatch({ tasks: room.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
  }
  const handleAssign = (id: string, pid: string) => {
    assignTask(id, pid)
    sync.broadcastPatch({ tasks: room.tasks.map((t) => (t.id === id ? { ...t, assignedTo: pid } : t)) })
  }
  const handleSyncSnapshot = () => {
    if (!saveSnapshot) {
      toast.info('請先上傳或載入存檔')
      return
    }
    sync.syncSnapshot(saveSnapshot)
    toast.success('存檔快照已同步到房間')
  }
  const handleVote = (skillId: string) => {
    if ((room.skillVotes[skillId] ?? []).includes(selfId)) {
      unvoteSkill(skillId, selfId)
      sync.broadcastPatch({ skillVotes: { ...room.skillVotes, [skillId]: (room.skillVotes[skillId] ?? []).filter((p) => p !== selfId) } })
    } else {
      voteSkill(skillId, selfId)
      sync.broadcastPatch({ skillVotes: { ...room.skillVotes, [skillId]: [...(room.skillVotes[skillId] ?? []), selfId] } })
    }
  }
  const handleSendChat = () => {
    if (!chatText.trim()) return
    sync.sendChat(chatText)
    setChatText('')
  }
  const exportRoom = (format: 'md' | 'json') => {
    const data = format === 'json' ? JSON.stringify(room, null, 2) : roomToMarkdown(room)
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `room-${room.code}.${format === 'md' ? 'md' : 'json'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const chatEvents = room.events.filter((e) => e.type === 'chat').slice(-50)
  const checklistDone = room.checklist.filter((c) => c.done).length
  const tasksDone = room.tasks.filter((t) => t.done).length

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* Room header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UsersRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{room.name}</span>
              <Badge variant="outline" className="font-mono text-xs">{room.code}</Badge>
              {sync.transport === 'socket' ? (
                <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600"><Wifi className="h-3 w-3" /> 已連線</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px] text-amber-600"><WifiOff className="h-3 w-3" /> 同瀏覽器</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{room.members.length} 位玩家 · 建立於 {new Date(room.createdAt).toLocaleString('zh-HK')}</div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(room.code); toast.success('房間代碼已複製') }}>
              <Copy className="mr-1 h-3.5 w-3.5" /> {room.code}
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportRoom('md')}>匯出 MD</Button>
            <Button size="sm" variant="outline" onClick={() => exportRoom('json')}>匯出 JSON</Button>
            <Button size="sm" variant="ghost" onClick={sync.leaveRoom}><LogOut className="h-3.5 w-3.5" /> 離開</Button>
          </div>
        </CardContent>
      </Card>

      {/* Members + snapshot */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>玩家 ({room.members.length})</span>
              <ConfidenceBadge confidence={sync.transport === 'socket' ? 'confirmed' : 'unverified'} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {room.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-full border px-2 py-1" style={{ borderColor: m.color }}>
                  <Avatar className="h-6 w-6"><AvatarFallback style={{ backgroundColor: m.color, color: 'white' }} className="text-[10px]">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="text-xs font-medium">{m.name}</span>
                  {m.role === 'host' && <Crown className="h-3 w-3 text-amber-500" />}
                  {m.id === selfId && <Badge variant="outline" className="text-[9px]">你</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">共享存檔快照</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room.snapshot ? (
              <>
                <div className="text-xs text-muted-foreground">來源: {room.snapshot.source}</div>
                <div className="text-xs">Day {room.snapshot.day} · ${room.snapshot.money.toLocaleString()} · {room.snapshot.detectedFields.length} 欄位</div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setView('dashboard')}>查看 Dashboard</Button>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">尚未共享存檔</div>
                <Button size="sm" className="w-full" onClick={handleSyncSnapshot} disabled={!saveSnapshot}>
                  <Share2 className="mr-1 h-3.5 w-3.5" /> 同步我的存檔
                </Button>
                {!saveSnapshot && <div className="text-[10px] text-muted-foreground">先到「存檔上傳」載入</div>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList className="flex h-9 flex-wrap">
          <TabsTrigger value="checklist" className="text-xs"><CheckSquare className="mr-1 h-3.5 w-3.5" /> 開店清單 ({checklistDone}/{room.checklist.length})</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs"><ListTodo className="mr-1 h-3.5 w-3.5" /> 任務分配 ({tasksDone}/{room.tasks.length})</TabsTrigger>
          <TabsTrigger value="chat" className="text-xs"><Send className="mr-1 h-3.5 w-3.5" /> 聊天</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs"><PackageSearch className="mr-1 h-3.5 w-3.5" /> 計畫連結</TabsTrigger>
          <TabsTrigger value="skills" className="text-xs"><GitBranch className="mr-1 h-3.5 w-3.5" /> 技能投票</TabsTrigger>
        </TabsList>

        {/* Checklist */}
        <TabsContent value="checklist">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Opening Prep 開店前清單</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)} placeholder="新增清單項目…" onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist()} />
                <Button size="sm" onClick={handleAddChecklist}>新增</Button>
              </div>
              <div className="space-y-1">
                {room.checklist.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <input type="checkbox" checked={c.done} onChange={() => handleToggleCheck(c.id)} className="h-4 w-4 accent-primary" />
                    <span className={c.done ? 'text-muted-foreground line-through' : ''}>{c.label}</span>
                    <button className="ml-auto text-xs text-muted-foreground hover:text-destructive" onClick={() => { removeChecklist(c.id); sync.broadcastPatch({ checklist: room.checklist.filter((x) => x.id !== c.id) }) }}>✕</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">玩家任務分配</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {TASK_CATEGORIES.map((cat) => (
                  <Badge key={cat.id} variant="outline" style={{ borderColor: cat.color, color: cat.color }}>{cat.label}</Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newTaskLabel} onChange={(e) => setNewTaskLabel(e.target.value)} placeholder="新增任務…" onKeyDown={(e) => e.key === 'Enter' && handleAddTask()} />
                <Button size="sm" onClick={handleAddTask}>新增</Button>
              </div>
              <div className="space-y-1.5">
                {room.tasks.map((t) => {
                  const cat = TASK_CATEGORIES.find((c) => c.id === t.category) ?? TASK_CATEGORIES[5]
                  const assignee = room.members.find((m) => m.id === t.assignedTo)
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm" style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}>
                      <input type="checkbox" checked={t.done} onChange={() => handleToggleTask(t.id)} className="h-4 w-4 accent-primary" />
                      <span className="text-[10px] font-medium uppercase" style={{ color: cat.color }}>{cat.label}</span>
                      <span className={t.done ? 'text-muted-foreground line-through' : ''}>{t.label}</span>
                      <Select value={t.assignedTo ?? ''} onValueChange={(v) => handleAssign(t.id, v)}>
                        <SelectTrigger className="ml-auto h-7 w-32 text-xs"><SelectValue placeholder="指派…" /></SelectTrigger>
                        <SelectContent>
                          {room.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {assignee && <Avatar className="h-5 w-5"><AvatarFallback style={{ backgroundColor: assignee.color, color: 'white' }} className="text-[9px]">{assignee.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>}
                      <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { removeTask(t.id); sync.broadcastPatch({ tasks: room.tasks.filter((x) => x.id !== t.id) }) }}>✕</button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat */}
        <TabsContent value="chat">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">房間聊天</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ScrollArea className="h-64 rounded-md border p-2">
                {chatEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">尚無訊息。說聲嗨 👋</div>
                ) : (
                  <div className="space-y-1.5">
                    {chatEvents.map((e) => {
                      const m = room.members.find((mm) => mm.id === e.playerId)
                      return (
                        <div key={e.id} className="flex gap-2 text-sm">
                          <span className="font-medium" style={{ color: m?.color }}>{m?.name ?? 'Unknown'}:</span>
                          <span className="flex-1">{e.payload?.text ?? (e as any).text}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleTimeString('zh-HK')}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
              <div className="flex gap-2">
                <Input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="輸入訊息…" onKeyDown={(e) => e.key === 'Enter' && handleSendChat()} />
                <Button size="sm" onClick={handleSendChat}><Send className="h-3.5 w-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan links */}
        <TabsContent value="plans">
          <div className="grid gap-3 md:grid-cols-2">
            <PlanLinkCard icon={<PackageSearch className="h-5 w-5" />} title="補貨計畫" desc="共享 restock plan、依預算分配採購" count={room.restockPlan.length} onClick={() => setView('restock')} />
            <PlanLinkCard icon={<Tag className="h-5 w-5" />} title="定價計畫" desc="共享價格實驗、投票審核" count={room.pricePlan.length} onClick={() => setView('pricing')} />
            <PlanLinkCard icon={<Map className="h-5 w-5" />} title="貨架分配" desc="將貨架區域分配給玩家" count={Object.keys(room.shelfAssignments).length} onClick={() => setView('layout')} />
            <PlanLinkCard icon={<GitBranch className="h-5 w-5" />} title="技能計畫" desc="團隊投票下一個 perk" count={Object.keys(room.skillVotes).length} onClick={() => setView('skills')} />
          </div>
        </TabsContent>

        {/* Skill votes */}
        <TabsContent value="skills">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>技能投票</span>
                <ConfidenceBadge confidence="confirmed" note="所有 perk 統一 1000 FP，無前置。多數決即團隊共識。" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {ENC.skills.slice(0, 12).map((s) => {
                  const voters = room.skillVotes[s.id] ?? []
                  const voted = voters.includes(selfId)
                  return (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{s.name.zhHant || s.name.en || s.id}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{s.effect || '(no effect)'}</div>
                      </div>
                      <div className="flex -space-x-1">
                        {voters.slice(0, 4).map((vid) => {
                          const m = room.members.find((mm) => mm.id === vid)
                          return m ? <Avatar key={vid} className="h-5 w-5 border-2 border-background"><AvatarFallback style={{ backgroundColor: m.color, color: 'white' }} className="text-[8px]">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar> : null
                        })}
                      </div>
                      <Button size="sm" variant={voted ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => handleVote(s.id)}>
                        {voted ? '已投' : '投票'} {voters.length > 0 && `(${voters.length})`}
                      </Button>
                    </div>
                  )
                })}
              </div>
              <Button variant="link" size="sm" className="mt-2" onClick={() => setView('skills')}>查看完整技能 ROI →</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PlanLinkCard({ icon, title, desc, count, onClick }: { icon: React.ReactNode; title: string; desc: string; count: number; onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <Badge variant="outline" className="text-xs">{count}</Badge>
      </CardContent>
    </Card>
  )
}

function roomToMarkdown(room: any): string {
  let md = `# Room ${room.code} — ${room.name}\n\n`
  md += `Created: ${new Date(room.createdAt).toISOString()}\n`
  md += `Members: ${room.members.map((m: any) => `${m.name}(${m.role})`).join(', ')}\n\n`
  md += `## Checklist (${room.checklist.filter((c: any) => c.done).length}/${room.checklist.length})\n`
  for (const c of room.checklist) md += `- [${c.done ? 'x' : ' '}] ${c.label}\n`
  md += `\n## Tasks (${room.tasks.filter((t: any) => t.done).length}/${room.tasks.length})\n`
  for (const t of room.tasks) {
    const assignee = room.members.find((m: any) => m.id === t.assignedTo)?.name ?? '未指派'
    md += `- [${t.done ? 'x' : ' '}] [${t.category}] ${t.label} → ${assignee}\n`
  }
  if (room.snapshot) {
    md += `\n## Snapshot\n- source: ${room.snapshot.source}\n- day: ${room.snapshot.day}\n- money: ${room.snapshot.money}\n- fields: ${room.snapshot.detectedFields.join(', ')}\n`
  }
  return md
}
