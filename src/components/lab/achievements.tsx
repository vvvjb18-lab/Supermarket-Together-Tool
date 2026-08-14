'use client'

import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useRoomStore } from '@/lib/store'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useLang, achievementNameFor, achievementDescFor } from '@/lib/i18n'
import {
  ConfidenceBadge,
  SectionHeader,
  fmt,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Trophy,
  Search,
  ArrowUpDown,
  BookOpen,
  Cat,
  Award,
  Sparkles,
  RotateCcw,
  Download,
} from 'lucide-react'
import type { Achievement } from '@/lib/types'
import { downloadTsv } from '@/lib/export-utils'

// ============================================================
// Achievements
// ------------------------------------------------------------
// 51 achievements from Steam IL. Manual progress tracker
// persists to localStorage (local mode) or syncs to
// room.checklist using steamIds as ids (room mode).
// Every analytical surface carries a ConfidenceBadge.
// ============================================================

// Local progress store (used when no room).
const useProgress = create<{
  done: Record<string, boolean>
  toggle: (id: string) => void
  reset: () => void
}>()(
  persist(
    (set) => ({
      done: {},
      toggle: (id) => set((s) => ({ done: { ...s.done, [id]: !s.done[id] } })),
      reset: () => set({ done: {} }),
    }),
    { name: 'stl-ach-progress', storage: createJSONStorage(() => localStorage) },
  ),
)

// Rarity tiers.
function rarity(p: number): { label: string; cls: string } {
  if (p < 1) return { label: '極稀有', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' }
  if (p < 5) return { label: '稀有', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' }
  if (p < 15) return { label: '普通', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' }
  return { label: '常見', cls: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30' }
}

// Notable achievement guides (player-community knowledge).
// steamIds now match the real Steam achievement slugs in encyclopedia.json.
const GUIDES: { steamId: string; zhName: string; tips: string[] }[] = [
  {
    steamId: 'ach_millionaire_s_holiday',
    zhName: "百萬富翁的假期",
    tips: [
      '資金達到 $1,000,000。長期目標。',
      '主力：高單價電子產品（USB 1TB、Gaming Console）+ 酒類。',
      '搭配製造業鏈（Manufacturing）提升邊際利潤。',
      '每日 Gaining Traction!（單日 $25k）也會推進累計收入。',
    ],
  },
  {
    steamId: 'ach_what_is_this',
    zhName: '這是什麼？',
    tips: [
      '隱藏成就 — 全球完成率 0.1%。在廣場佈局中建造謎樣方塊（enigma cube）。',
      '沒有公開解鎖條件，需在廣場佈局（Layout=1）下觸發。',
      '非純農刷可解，需社群合作挖掘建造位置與材料。',
    ],
  },
  {
    steamId: 'ach_might_need_two_ladders_or_more',
    zhName: '可能需要兩把梯子…或更多',
    tips: [
      '隱藏成就 — 全球完成率 0.1%。在廣場佈局中找到失蹤的貓。',
      '需切換到廣場佈局（Layout=1）才能觸發。',
      '建議查閱最新社群攻略與地圖標記。',
    ],
  },
  {
    steamId: 'ach_might_need_two_ladders',
    zhName: '可能需要兩把梯子',
    tips: [
      '隱藏成就 — 全球完成率 1.2%。在經典佈局中找到失蹤的貓。',
      '需在經典佈局（Layout=0）下尋找貓咪位置。',
      '建議查閱最新社群攻略與地圖標記。',
    ],
  },
  {
    steamId: 'ach_how_is_this_still_standing_a',
    zhName: '這怎麼還站著？（A）',
    tips: [
      '隱藏成就 — 全球完成率 0.4%。在經典佈局中拆除所有可拆的柱子與橫樑。',
      '需在經典佈局（Layout=0）下完成。',
    ],
  },
  {
    steamId: 'ach_superfood',
    zhName: '超級食物',
    tips: [
      '隱藏成就 — 全球完成率 0.3%。製造一個含至少 7 種額外配料的配方。',
      '需先解鎖製造部門並收集多種配料。',
    ],
  },
]

export function Achievements() {
  const lang = useLang()
  const room = useRoomStore((s) => s.room)
  const updateRoom = useRoomStore((s) => s.updateRoom)
  const toggleChecklist = useRoomStore((s) => s.toggleChecklist)
  const localDone = useProgress((s) => s.done)
  const localToggle = useProgress((s) => s.toggle)
  const localReset = useProgress((s) => s.reset)

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'globalPercent'>('globalPercent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const achievements = ENC.achievements
  const stats = ENC.achievementStats

  // Done state per achievement (room or local).
  const isDone = (a: Achievement): boolean => {
    if (room) {
      return room.checklist.find((c) => c.id === a.steamId)?.done ?? false
    }
    return !!localDone[a.steamId]
  }

  const toggleDone = (a: Achievement) => {
    if (room) {
      const exists = room.checklist.find((c) => c.id === a.steamId)
      if (exists) {
        toggleChecklist(a.steamId)
      } else {
        updateRoom({
          checklist: [
            ...room.checklist,
            { id: a.steamId, label: achievementNameFor(a, lang), done: true },
          ],
        })
      }
    } else {
      localToggle(a.steamId)
    }
  }

  const completedCount = achievements.filter(isDone).length

  // Filtered + sorted list.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q
      ? achievements.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            achievementNameFor(a, 'zhHant').toLowerCase().includes(q) ||
            a.steamId.toLowerCase().includes(q),
        )
      : [...achievements]
    list.sort((a, b) => {
      if (sortKey === 'name') {
        const av = achievementNameFor(a, lang).toLowerCase()
        const bv = achievementNameFor(b, lang).toLowerCase()
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc'
        ? a.globalPercent - b.globalPercent
        : b.globalPercent - a.globalPercent
    })
    return list
  }, [achievements, query, sortKey, sortDir, lang])

  const rarest = useMemo(
    () => [...achievements].sort((a, b) => a.globalPercent - b.globalPercent).slice(0, 10),
    [achievements],
  )
  const easiest = useMemo(
    () => [...achievements].sort((a, b) => b.globalPercent - a.globalPercent).slice(0, 10),
    [achievements],
  )

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <SectionHeader
        title="成就"
        description={`共 ${achievements.length} 個成就 · 已完成 ${completedCount}/${achievements.length}`}
        confidence="confirmed"
        formula="encyclopedia.achievements (51 entries from Steam IL)"
        right={
          <Badge variant="outline" className="text-xs">
            <Trophy className="mr-1 h-3 w-3" /> {fmt((completedCount / achievements.length) * 100, 0)}%
          </Badge>
        }
      />

      {/* Mode banner */}
      <Card className={room ? 'border-fuchsia-500/30 bg-fuchsia-500/5' : 'border-sky-500/30 bg-sky-500/5'}>
        <CardContent className="flex items-center gap-3 p-3 text-sm">
          {room ? (
            <>
              <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-500" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">房間模式</span> — 成就完成狀態同步至{' '}
                <code className="font-mono text-xs">room.checklist</code>（使用 steamId 作為 id），所有房間成員可見。
              </div>
            </>
          ) : (
            <>
              <BookOpen className="h-5 w-5 shrink-0 text-sky-500" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">本地模式</span> — 成就進度儲存於瀏覽器 localStorage。建立/加入房間後可同步至團隊。
              </div>
            </>
          )}
          {!room && completedCount > 0 && (
            <Button size="sm" variant="ghost" className="shrink-0" onClick={localReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> 重設
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Progress bar */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">完成進度</span>
            <span className="font-mono text-muted-foreground">
              {completedCount} / {achievements.length}
            </span>
          </div>
          <Progress value={(completedCount / achievements.length) * 100} className="h-3" />
        </CardContent>
      </Card>

      {/* Top cards: rarest + easiest */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopCard
          title="最稀有成就 Top 10"
          icon={<Award className="h-4 w-4 text-rose-500" />}
          subtitle="全球完成率最低 — 解鎖即標誌"
          items={rarest}
          isDone={isDone}
          onToggle={toggleDone}
          accent="rose"
          lang={lang}
        />
        <TopCard
          title="最易取得成就 Top 10"
          icon={<Sparkles className="h-4 w-4 text-emerald-500" />}
          subtitle="全球完成率最高 — 大部分玩家已解鎖"
          items={easiest}
          isDone={isDone}
          onToggle={toggleDone}
          accent="emerald"
          lang={lang}
        />
      </div>

      {/* Search + sort */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span>搜尋成就</span>
            </div>
            <Input
              value={query}
              placeholder="依名稱或 Steam ID 搜尋…"
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 flex-1"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">排序:</span>
              <ToggleGroup
                type="single"
                value={sortKey}
                onValueChange={(v) => v && setSortKey(v as 'name' | 'globalPercent')}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="globalPercent" className="text-xs">完成率</ToggleGroupItem>
                <ToggleGroupItem value="name" className="text-xs">名稱</ToggleGroupItem>
              </ToggleGroup>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                <ArrowUpDown className="mr-1 h-3 w-3" />
                {sortDir === 'asc' ? '升序' : '降序'}
              </Button>
              {sortKey === 'globalPercent' && (
                <span className="hidden text-[10px] text-muted-foreground sm:inline">
                  {sortDir === 'asc' ? '(最稀有先)' : '(最常見先)'}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full achievement table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>所有成就（{filtered.length}）</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  const tsvRows = filtered.map((a, i) => ({
                    index: i + 1,
                    steamId: a.steamId,
                    name_en: a.name,
                    name_zhHant: a.zhHant || a.name,
                    description_en: a.description || '',
                    description_zhHant: a.zhHantDesc || a.description || '',
                    globalPercent: a.globalPercent,
                    collective: a.collective ? 'true' : 'false',
                    layout: a.layout || '',
                  }))
                  downloadTsv(tsvRows, `achievements-${new Date().toISOString().slice(0, 10)}.tsv`)
                }}
              >
                <Download className="h-3 w-3" />
                下載 TSV
              </Button>
              <ConfidenceBadge
                confidence="confirmed"
                formula="encyclopedia.achievements"
                note="Steam 面向玩家的成就名稱 + 描述 + 全球解鎖百分比（51 項）"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-10">✓</TableHead>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead className="min-w-[200px]">名稱</TableHead>
                  <TableHead className="min-w-[260px]">解鎖條件</TableHead>
                  <TableHead className="text-right">全球 %</TableHead>
                  <TableHead>稀有度</TableHead>
                  <TableHead className="text-center">標記</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a, i) => {
                  const done = isDone(a)
                  const r = rarity(a.globalPercent)
                  return (
                    <TableRow key={a.steamId} data-state={done ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox checked={done} onCheckedChange={() => toggleDone(a)} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className={done ? 'line-through text-muted-foreground' : 'font-medium'}>
                          {achievementNameFor(a, lang)}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">{a.steamId}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs leading-relaxed text-muted-foreground whitespace-normal">
                          {achievementDescFor(a, lang)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmt(a.globalPercent, 1)}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${r.cls}`}>{r.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-center gap-1">
                          {a.collective && (
                            <Badge variant="outline" className="text-[9px] bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30">
                              集體
                            </Badge>
                          )}
                          {a.layout && (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                              {a.layout === 'classic' ? '經典' : '廣場'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Guide notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Cat className="h-4 w-4 text-amber-500" />
              重點成就攻略
            </span>
            <ConfidenceBadge confidence="unverified" note="玩家社群整理之攻略建議，非遊戲內 IL 提取" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {GUIDES.map((g) => {
            const a = achievements.find((x) => x.steamId === g.steamId)
            const r = a ? rarity(a.globalPercent) : null
            return (
              <div key={g.steamId} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{g.zhName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a ? achievementNameFor(a, lang) : g.zhName} · {a?.steamId}
                    </div>
                  </div>
                  {a && r && (
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${r.cls}`}>
                      {r.label}
                    </Badge>
                  )}
                </div>
                {a && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    全球完成率:{' '}
                    <span className="font-mono font-semibold">{fmt(a.globalPercent, 1)}%</span>
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-xs">
                  {g.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Stats reference (collapsible) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>成就統計參考</span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="encyclopedia.achievementStats"
              note={`從 IL 擷取的 ${stats.length} 個統計指標定義`}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="stats">
              <AccordionTrigger className="text-sm">
                展開 {stats.length} 個統計定義
              </AccordionTrigger>
              <AccordionContent>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead className="w-16 text-right">Index</TableHead>
                        <TableHead>描述</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.map((s) => (
                        <TableRow key={s.index}>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {s.index}
                          </TableCell>
                          <TableCell className="text-sm">{s.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Top-N card (rarest or easiest)
// ============================================================
function TopCard({
  title,
  icon,
  subtitle,
  items,
  isDone,
  onToggle,
  accent,
  lang,
}: {
  title: string
  icon: React.ReactNode
  subtitle: string
  items: Achievement[]
  isDone: (a: Achievement) => boolean
  onToggle: (a: Achievement) => void
  accent: 'rose' | 'emerald'
  lang: ReturnType<typeof useLang>
}) {
  const accentClass = accent === 'rose' ? 'border-rose-500/30' : 'border-emerald-500/30'
  return (
    <Card className={accentClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((a, i) => {
          const done = isDone(a)
          const r = rarity(a.globalPercent)
          return (
            <div
              key={a.steamId}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs transition-colors hover:bg-accent/50"
            >
              <span className="w-5 shrink-0 text-right font-mono text-muted-foreground">{i + 1}</span>
              <Checkbox
                checked={done}
                onCheckedChange={() => onToggle(a)}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className={`truncate font-medium ${done ? 'line-through text-muted-foreground' : ''}`}>
                  {achievementNameFor(a, lang)}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">{a.steamId}</div>
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${r.cls}`}>
                {r.label}
              </Badge>
              <span className="w-12 shrink-0 text-right font-mono">{fmt(a.globalPercent, 1)}%</span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
