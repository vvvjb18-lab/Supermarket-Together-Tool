'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { encyclopedia as ENC, productById } from '@/lib/data-loader'
import {
  computeBoxValue,
  computeDemandProxy,
} from '@/lib/engine'
import { useRoomStore } from '@/lib/store'
import {
  ConfidenceBadge,
  SectionHeader,
  StatCard,
  MiniBar,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sparkles,
  AlertTriangle,
  Trophy,
  Calendar,
  ListChecks,
  Star,
  TrendingUp,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Product } from '@/lib/types'

const SEASON_COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#06b6d4']
const STATIC_CHECKLIST_BY_SEASON: Record<number, string[]> = {
  0: [
    '春季：檢查花園/季節性裝飾商品',
    '春季：補齊 23 個季節商品庫存',
    '春季：季節限定商品（無重複）優先陳列',
    '春季：預估 demand proxy × boxValue 前 10 名',
  ],
  1: [
    '夏季：37 個季節商品（最大池）',
    '夏季：飲料/冰品類優先',
    '夏季：與其他季節重複商品（多個）',
    '夏季：demand proxy 高者大量備貨',
  ],
  2: [
    '秋季/萬聖節：20 個季節商品',
    '秋季：南瓜/萬聖節主題優先',
    '秋季：季節限定商品（多個 exclusive）',
    '秋季：高 boxValue 商品陳列顯眼處',
  ],
  3: [
    '冬季：15 個季節商品（最小池）',
    '冬季：節日/熱食類優先',
    '冬季：與秋季重疊商品檢查庫存',
    '冬季：補齊冬季限定商品',
  ],
}

export function Seasons() {
  const [seasonIdx, setSeasonIdx] = useState(0)
  const [sortKey, setSortKey] = useState<'demand' | 'boxValue' | 'name' | 'group'>('demand')

  const season = ENC.seasons[seasonIdx]
  const otherSeasonIds = useMemo(() => {
    const ids = new Set<number>()
    ENC.seasons.forEach((s, i) => {
      if (i !== seasonIdx) s.productIds.forEach((id) => ids.add(id))
    })
    return ids
  }, [seasonIdx])

  // Build enriched pool rows
  const pool = useMemo(() => {
    const rows = season.productIds.map((pid) => {
      const p = productById.get(pid) as Product | undefined
      if (!p) return null
      const box = computeBoxValue(p).value
      const demand = computeDemandProxy(pid, ENC.necessities, ENC.customerTypes).value
      const isPremium = ENC.premiumProducts.includes(pid)
      const isExclusive = !otherSeasonIds.has(pid)
      const otherSeasons = ENC.seasons
        .filter((s, i) => i !== seasonIdx && s.productIds.includes(pid))
        .map((s) => s.name.zhHant || s.name.en)
      return { p, box, demand, isPremium, isExclusive, otherSeasons, score: demand * box }
    }).filter(Boolean) as {
      p: Product
      box: number
      demand: number
      isPremium: boolean
      isExclusive: boolean
      otherSeasons: string[]
      score: number
    }[]
    return rows
  }, [season, otherSeasonIds, seasonIdx])

  const sortedPool = useMemo(() => {
    const arr = [...pool]
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'demand': return b.demand - a.demand
        case 'boxValue': return b.box - a.box
        case 'name':
          return (a.p.name.zhHant || a.p.name.en).localeCompare(b.p.name.zhHant || b.p.name.en)
        case 'group': return (a.p.group ?? -1) - (b.p.group ?? -1)
        default: return 0
      }
    })
    return arr
  }, [pool, sortKey])

  // Top 10 pre-season recommendations
  const top10 = useMemo(
    () => [...pool].sort((a, b) => b.score - a.score).slice(0, 10),
    [pool],
  )

  // Exclusive seasonal-only products
  const exclusive = useMemo(
    () => pool.filter((r) => r.isExclusive),
    [pool],
  )

  // Overlap analysis: median of demand + boxValue, flag above-median
  const overlap = useMemo(() => {
    if (pool.length === 0) return { above: [] as typeof pool, medianDemand: 0, medianBox: 0, scatterData: [] as any[] }
    const demands = pool.map((r) => r.demand).sort((a, b) => a - b)
    const boxes = pool.map((r) => r.box).sort((a, b) => a - b)
    const medianDemand = demands[Math.floor(demands.length / 2)] ?? 0
    const medianBox = boxes[Math.floor(boxes.length / 2)] ?? 0
    const above = pool.filter((r) => (r.demand >= medianDemand && r.box >= medianBox))
    const scatterData = pool.map((r) => ({
      x: r.demand,
      y: r.box,
      name: r.p.name.zhHant || r.p.name.en,
      id: r.p.id,
      isPremium: r.isPremium,
      isExclusive: r.isExclusive,
      isAbove: r.demand >= medianDemand && r.box >= medianBox,
    }))
    return { above, medianDemand, medianBox, scatterData }
  }, [pool])

  // All-seasons overview stats
  const overview = useMemo(() => {
    return ENC.seasons.map((s, i) => {
      const boxes = s.productIds
        .map((pid) => productById.get(pid))
        .filter(Boolean)
        .map((p) => computeBoxValue(p as Product).value)
      const premiumCount = s.productIds.filter((pid) => ENC.premiumProducts.includes(pid)).length
      const avgBox = boxes.length > 0 ? boxes.reduce((a, b) => a + b, 0) / boxes.length : 0
      return {
        idx: i,
        name: s.name.zhHant || s.name.en,
        nameEn: s.name.en,
        size: s.productIds.length,
        avgBox,
        premiumCount,
        color: SEASON_COLORS[i],
      }
    })
  }, [])

  // Room checklist
  const room = useRoomStore((s) => s.room)
  const toggleChecklist = useRoomStore((s) => s.toggleChecklist)
  const addChecklist = useRoomStore((s) => s.addChecklist)

  // Filter room.checklist for season items (or show all if none)
  const seasonChecklist = useMemo(() => {
    if (!room) return null
    const kw = [season.name.zhHant, season.name.en, '季節', 'season', '春季', '夏季', '秋季', '冬季', '萬聖']
    const filtered = room.checklist.filter((c) =>
      kw.some((k) => k && c.label.toLowerCase().includes(k.toLowerCase())),
    )
    return filtered.length > 0 ? filtered : room.checklist.slice(0, 5)
  }, [room, season])

  const staticChecklist = STATIC_CHECKLIST_BY_SEASON[seasonIdx] ?? []

  function addSeasonItemsToRoom() {
    if (!room) return
    staticChecklist.forEach((label) => addChecklist(`[${season.name.zhHant}] ${label}`))
  }

  const scatterColors = (d: any) => {
    if (d.isAbove) return '#f43f5e' // above median - rose
    if (d.isExclusive) return '#8b5cf6' // exclusive - violet
    if (d.isPremium) return '#f59e0b' // premium - amber
    return '#71717a'
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">季節規劃</h1>
        <p className="text-sm text-muted-foreground">
          4 個季節池 · NPC_Manager.productsPerSeason · 需求 proxy × boxValue 推導
        </p>
      </div>

      {/* All-seasons overview cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overview.map((o) => (
          <button
            key={o.idx}
            onClick={() => setSeasonIdx(o.idx)}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-all hover:shadow-md',
              seasonIdx === o.idx ? 'border-primary ring-2 ring-primary/30' : 'border-border',
            )}
            style={{ borderLeftColor: o.color, borderLeftWidth: 3 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: o.color }}>
                {o.name}
              </span>
              {seasonIdx === o.idx && (
                <Badge variant="outline" className="text-[9px]">current</Badge>
              )}
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-base font-bold tabular-nums">{o.size}</div>
                <div className="text-[9px] uppercase text-muted-foreground">pool</div>
              </div>
              <div>
                <div className="text-base font-bold tabular-nums">{fmt(o.avgBox, 0)}</div>
                <div className="text-[9px] uppercase text-muted-foreground">avg $</div>
              </div>
              <div>
                <div className="text-base font-bold tabular-nums">{o.premiumCount}</div>
                <div className="text-[9px] uppercase text-muted-foreground">premium</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Season selector tabs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              選擇季節
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="NPC_Manager.productsPerSeason"
              sources={['encyclopedia.seasons[]', 'IL: NPC_Manager.productsPerSeason']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={String(seasonIdx)} onValueChange={(v) => setSeasonIdx(Number(v))}>
            <TabsList className="w-full justify-start">
              {ENC.seasons.map((s, i) => (
                <TabsTrigger key={s.index} value={String(i)} className="flex-1">
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: SEASON_COLORS[i] }}
                  />
                  {s.name.zhHant || s.name.en}
                  <span className="ml-1 text-[10px] text-muted-foreground">({s.productIds.length})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mt-2 text-xs text-muted-foreground">
            當前選擇：<span className="font-semibold" style={{ color: SEASON_COLORS[seasonIdx] }}>
              {season.name.zhHant || season.name.en}
            </span>{' '}
            · {season.name.en} · {season.productIds.length} 個商品
          </div>
        </CardContent>
      </Card>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="池大小"
          value={pool.length}
          unit="items"
          confidence="confirmed"
          formula="season.productIds.length"
          accent="neutral"
        />
        <StatCard
          label="季節限定"
          value={exclusive.length}
          unit="exclusive"
          confidence="confirmed"
          formula="productId 不在其他季節池"
          hint="不與其他季節重疊"
          accent="good"
        />
        <StatCard
          label="平均 boxValue"
          value={fmtMoney(pool.reduce((a, r) => a + r.box, 0) / Math.max(1, pool.length))}
          confidence="confirmed"
          formula="avg(basePricePerUnit × maxItemsPerBox)"
          accent="neutral"
        />
        <StatCard
          label="高 demand × value"
          value={overlap.above.length}
          unit="above median"
          confidence="proxy"
          formula="demand≥med AND box≥med"
          hint="overlap 分析"
          accent="warn"
        />
      </div>

      {/* Pre-season recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              季前備貨建議（Top 10）
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="rank = demandProxy × boxValue"
              note="假設等機率顧客 + 均勻 necessity 選擇"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {top10.map((r, i) => (
              <div
                key={r.p.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border bg-card px-3 py-2',
                  i < 3 && 'border-amber-500/40 bg-amber-500/5',
                )}
              >
                <span className="w-7 text-center font-bold text-amber-600 dark:text-amber-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.p.name.zhHant || r.p.name.en}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    #{r.p.id} · {r.p.name.en}
                  </div>
                  <div className="mt-1">
                    <MiniBar value={r.score} max={top10[0]?.score ?? 1} color="bg-amber-500" />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-xs font-bold">{fmtMoney(r.box)}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    d={fmt(r.demand, 5)}
                  </div>
                  <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    score={fmt(r.score, 2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Seasonal-only opportunity list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-500" />
              季節限定機會（exclusive）
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="productId ∈ this season ∧ ∉ other seasons"
              note="這些商品只在當前季節出現"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exclusive.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 py-4 text-center text-sm text-muted-foreground">
              本季無限定商品 — 所有商品都與其他季節重疊
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {exclusive.map((r) => (
                <div
                  key={r.p.id}
                  className="flex items-center gap-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2"
                >
                  <Star className="h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.p.name.zhHant || r.p.name.en}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      #{r.p.id} · box {fmtMoney(r.box)}
                      {r.isPremium && <span className="ml-1 text-fuchsia-600">· premium</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overlap scatter plot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-rose-500" />
              Overlap 散佈圖：demandProxy vs boxValue
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="x=demandProxy, y=boxValue"
              note="紅點=高於中位數（重點備貨），紫=限定，琥珀=premium"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> above median (重點)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> 季節限定
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> premium
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" /> 一般
            </span>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="demandProxy"
                  tick={{ fontSize: 10 }}
                  label={{ value: 'demandProxy', position: 'insideBottom', offset: -8, fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="boxValue"
                  tick={{ fontSize: 10 }}
                  label={{ value: 'boxValue ($)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <ZAxis range={[40, 40]} />
                <RTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const d = payload[0].payload as any
                    return (
                      <div className="rounded-md border bg-background p-2 text-xs shadow-md">
                        <div className="font-semibold">{d.name}</div>
                        <div className="text-muted-foreground">#{d.id}</div>
                        <div className="mt-1 font-mono">
                          demand: <span className="font-bold">{fmt(d.x, 5)}</span>
                        </div>
                        <div className="font-mono">
                          box: <span className="font-bold">{fmtMoney(d.y)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.isAbove && <Badge variant="outline" className="text-[9px] text-rose-600">above median</Badge>}
                          {d.isExclusive && <Badge variant="outline" className="text-[9px] text-violet-600">exclusive</Badge>}
                          {d.isPremium && <Badge variant="outline" className="text-[9px] text-amber-600">premium</Badge>}
                        </div>
                      </div>
                    )
                  }}
                />
                <Scatter data={overlap.scatterData} fill="#8884d8">
                  {overlap.scatterData.map((d: any, i: number) => (
                    <Cell key={i} fill={scatterColors(d)} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
            <span className="font-mono text-muted-foreground">中位數：</span>
            demandProxy = <span className="font-mono font-bold">{fmt(overlap.medianDemand, 5)}</span>
            ， boxValue = <span className="font-mono font-bold">{fmtMoney(overlap.medianBox)}</span>
            <span className="ml-2 text-muted-foreground">
              （{overlap.above.length} 個商品同時高於兩個中位數 — 重點備貨清單）
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Room shared preparation checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-emerald-500" />
              房間共享備貨清單
            </span>
            <ConfidenceBadge
              confidence={room ? 'confirmed' : 'unverified'}
              formula={room ? 'room.checklist (synced)' : 'static season checklist'}
              note={room ? '與房間成員即時同步' : '建立房間以共享'}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {room ? (
            <div className="space-y-2">
              {seasonChecklist && seasonChecklist.length > 0 ? (
                <div className="space-y-1.5">
                  {seasonChecklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <Checkbox
                        checked={item.done}
                        onCheckedChange={() => toggleChecklist(item.id)}
                      />
                      <span className={cn('flex-1', item.done && 'text-muted-foreground line-through')}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/30 py-3 text-center text-xs text-muted-foreground">
                  房間清單為空
                </div>
              )}
              <Button size="sm" variant="outline" onClick={addSeasonItemsToRoom}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                加入「{season.name.zhHant || season.name.en}」季節項目（{staticChecklist.length}）
              </Button>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  未連接房間 — 顯示建議靜態清單。
                  <span className="ml-1 font-semibold">建立房間以共享</span>
                  給隊員並即時同步狀態。
                </div>
              </div>
              <div className="space-y-1.5">
                {staticChecklist.map((label, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground"
                  >
                    <Checkbox disabled />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full season product pool table */}
      <SectionHeader
        title={`完整季節商品池 — ${season.name.zhHant || season.name.en}`}
        description={`所有 ${pool.length} 個商品，可排序。欄位：name, group, basePrice, boxValue, demandProxy, isPremium, isAlsoInOtherSeasons`}
        confidence="confirmed"
        formula="NPC_Manager.productsPerSeason[]"
        right={
          <div className="flex gap-1">
            {(['demand', 'boxValue', 'name', 'group'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={sortKey === k ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                onClick={() => setSortKey(k)}
              >
                {k === 'demand' ? 'demand↓' : k === 'boxValue' ? 'boxValue↓' : k}
              </Button>
            ))}
          </div>
        }
      />
      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">id</th>
                  <th className="py-2 pr-3 font-medium">name</th>
                  <th className="py-2 pr-3 font-medium">group</th>
                  <th className="py-2 pr-3 font-medium">basePrice</th>
                  <th className="py-2 pr-3 font-medium">boxValue</th>
                  <th className="py-2 pr-3 font-medium">demandProxy</th>
                  <th className="py-2 pr-3 font-medium">score</th>
                  <th className="py-2 pr-3 font-medium">flags</th>
                  <th className="py-2 font-medium">other seasons</th>
                </tr>
              </thead>
              <tbody>
                {sortedPool.map((r) => (
                  <tr
                    key={r.p.id}
                    className={cn(
                      'border-b last:border-0 hover:bg-accent/40',
                      r.isExclusive && 'bg-fuchsia-500/5',
                    )}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{r.p.id}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.p.name.zhHant || r.p.name.en}</div>
                      <div className="text-[10px] text-muted-foreground">{r.p.name.en}</div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.p.group ?? '—'}
                      {r.p.groupName && (
                        <div className="text-[10px] text-muted-foreground">{r.p.groupName.zhHant}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs tabular-nums">{fmtMoney(r.p.basePricePerUnit)}</td>
                    <td className="py-2 pr-3 font-mono text-xs tabular-nums">{fmtMoney(r.box)}</td>
                    <td className="py-2 pr-3 font-mono text-xs tabular-nums">
                      {fmt(r.demand, 5)}
                      <div className="mt-0.5 w-16">
                        <MiniBar value={r.demand} max={sortedPool[0]?.demand ?? 1} color="bg-emerald-500" />
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmt(r.score, 2)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-0.5">
                        {r.isPremium && (
                          <Badge variant="outline" className="text-[9px] text-amber-600">premium</Badge>
                        )}
                        {r.isExclusive && (
                          <Badge variant="outline" className="text-[9px] text-fuchsia-600">exclusive</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-[10px] text-muted-foreground">
                      {r.otherSeasons.length > 0 ? r.otherSeasons.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Caution */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold">信心等級：</span>
          季節池資料（productsPerSeason）為 <span className="font-semibold">confirmed</span>；
          demand proxy 與備貨建議為 <span className="font-semibold">proxy</span>（假設等機率顧客 + 均勻 necessity 選擇）。
          真實遊戲中季節切換時機、顧客偏好可能影響實際需求。
        </div>
      </div>

    </div>
  )
}
