'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { encyclopedia as ENC, productById } from '@/lib/data-loader'
import { useRoomStore, type Lang } from '@/lib/store'
import { useLang, manufacturingIdNameFor, productNameFor } from '@/lib/i18n'
import {
  ConfidenceBadge,
  SectionHeader,
  StatCard,
  MiniBar,
  fmt,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Plus,
  Trash2,
  Layers,
  AlertTriangle,
  Factory,
  Boxes,
  TrendingUp,
  Lightbulb,
  Coins,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ManufacturingProduct } from '@/lib/types'

const PRODUCTION_BASE_TIME = 30 // seconds, from config.manufacturing.productionBaseTimeSeconds

interface QueueItem {
  productId: number
  quantity: number
}

export function Manufacturing() {
  const lang = useLang()
  const [queue, setQueue] = useState<QueueItem[]>([
    { productId: 10, quantity: 5 }, // Muffin
    { productId: 29, quantity: 3 }, // Smoothies
  ])
  const [addPick, setAddPick] = useState<string | undefined>(undefined)

  const products = ENC.manufacturingProducts

  // Compute volume + density for each manufacturing product
  const enriched = useMemo(() => {
    return products.map((m) => {
      const vol = m.size.x * m.size.y * m.size.z
      const density = vol > 0 ? m.itemsPerBox / vol : 0
      const linkedProduct = productById.get(m.linkedProductID)
      const label = manufacturingIdNameFor(m.id, lang)
      const linkedLabel = productNameFor(m.linkedProductID, lang)
      return { m, vol, density, linkedProduct, label, linkedLabel }
    })
  }, [products, lang])

  const densityRanking = useMemo(
    () => [...enriched].sort((a, b) => b.density - a.density),
    [enriched],
  )

  // D5: per-recipe ROI proxy.
  // Model (clearly labelled as a proxy):
  //   inputCost per box    = marketPrice(linkedProduct)  [≈ 1 unit of "category base" worth]
  //   outputValue per box  = itemsPerBox × marketPrice(linkedProduct) × 2.01  [sold at 2.01× market cap]
  //   time per box         = 30s (PRODUCTION_BASE_TIME)
  //   profitPerBox         = outputValue − inputCost
  //   profitPerMinute      = profitPerBox / 0.5  (= 30s)
  // The IL real recipes (baseRecipes + combinableVariations) live in
  // save-analyzer/manufacturing_arbitrage.py and are NOT yet in the web
  // codebase; until they are, this proxy is the best we can do.
  const roiRanking = useMemo(() => {
    return enriched
      .map(({ m, linkedProduct }) => {
        // Use linkedProduct's marketPrice; fall back to the first product in
        // the matching category if linkedProductID doesn't resolve.
        const refProduct =
          linkedProduct ??
          (m.linkedProductID >= 0 && m.linkedProductID < ENC.products.length
            ? productById.get(m.linkedProductID)
            : undefined) ??
          ENC.products[0]
        const refMarket = refProduct ? refProduct.basePricePerUnit * (ENC.tiers[refProduct.tier]?.inflation ?? 1) : 0
        const inputCost = refMarket
        const outputValue = m.itemsPerBox * refMarket * 2.01
        const profit = outputValue - inputCost
        const profitPerMinute = profit / 0.5 // 30s = 0.5 min
        return {
          m,
          linkedProduct: refProduct,
          refMarket,
          inputCost,
          outputValue,
          profit,
          profitPerMinute,
        }
      })
      .sort((a, b) => b.profitPerMinute - a.profitPerMinute)
  }, [enriched])

  // Queue calcs
  const queueEnriched = useMemo(
    () =>
      queue.map((q) => {
        const m = products.find((p) => p.id === q.productId)!
        const timeSeconds = q.quantity * PRODUCTION_BASE_TIME
        const totalUnits = q.quantity * m.itemsPerBox
        return { ...q, m, timeSeconds, totalUnits }
      }),
    [queue, products],
  )

  const totalSeconds = queueEnriched.reduce((a, q) => a + q.timeSeconds, 0)
  const totalUnits = queueEnriched.reduce((a, q) => a + q.totalUnits, 0)
  const totalBoxes = queueEnriched.reduce((a, q) => a + q.quantity, 0)

  // Throughput: units per hour. assume one machine running 30s/product → 2 products/min → 120 products/hr
  // then × itemsPerBox = units/hr. If parallel machines N, scale by N.
  const [machines, setMachines] = useState(1)
  const throughputPerHour = useMemo(() => {
    if (totalSeconds <= 0) return 0
    // units produced per hour at N machines:
    // (3600 / 30) * itemsPerBox summed weighted = totalUnits * (3600 / totalSeconds) per machine
    // with N machines, throughput scales linearly (proxy)
    const perMachine = totalSeconds > 0 ? totalUnits * (3600 / totalSeconds) : 0
    return perMachine * machines
  }, [totalSeconds, totalUnits, machines])

  // Room
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const assignTask = useRoomStore((s) => s.assignTask)
  const manufacturingTask = room?.tasks.find((t) => t.category === 'manufacturing')
  const members = room?.members ?? []
  const assignedMember = manufacturingTask
    ? room?.members.find((m) => m.id === manufacturingTask.playerId)
    : undefined

  function addToQueue() {
    if (!addPick) return
    const pid = Number(addPick)
    setQueue((q) => {
      const ex = q.find((x) => x.productId === pid)
      if (ex) return q.map((x) => (x.productId === pid ? { ...x, quantity: x.quantity + 1 } : x))
      return [...q, { productId: pid, quantity: 1 }]
    })
    setAddPick('')
  }

  function updateQty(pid: number, qty: number) {
    setQueue((q) => q.map((x) => (x.productId === pid ? { ...x, quantity: Math.max(0, qty) } : x)))
  }

  function removeItem(pid: number) {
    setQueue((q) => q.filter((x) => x.productId !== pid))
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-[1600px] space-y-4 p-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">製造實驗室</h1>
          <p className="text-sm text-muted-foreground">
            30 個製造產品 · 基底時間 30s/件 · 自由配方組合制 · 產能、密度、ROI 推導
          </p>
        </div>

        {/* Honesty callout */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold">誠實聲明：</span>
            固定配方盈利未完全提取；食譜為<span className="font-semibold">基底商品 + 任意可組合一般商品</span>，無固定配方表。
            本頁只做<span className="font-semibold">產能與密度推導</span>，不預測成品售價或利潤。
          </div>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="製造品總數"
            value={products.length}
            unit="items"
            confidence="confirmed"
            formula="encyclopedia.manufacturingProducts.length"
            accent="neutral"
          />
          <StatCard
            label="基底生產時間"
            value={`${PRODUCTION_BASE_TIME}s`}
            unit="/件"
            confidence="confirmed"
            formula="config.manufacturing.productionBaseTimeSeconds = 30"
            accent="good"
          />
          <StatCard
            label="佇列總時間"
            value={fmtTime(totalSeconds)}
            confidence="confirmed"
            formula={`Σ(quantity × ${PRODUCTION_BASE_TIME}s) = ${totalSeconds}s`}
            hint={`${totalBoxes} 箱 · ${totalUnits} 單位`}
            accent="neutral"
          />
          <StatCard
            label="預估吞吐量"
            value={fmt(throughputPerHour, 0)}
            unit="u/hr"
            confidence="proxy"
            formula={`throughput = totalUnits × (3600/totalSec) × ${machines} 機台`}
            hint="假設並行線性擴展"
            accent="warn"
          />
        </div>

        {/* Production queue planner */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-emerald-500" />
                生產佇列規劃
              </span>
              <div className="flex items-center gap-2">
                <ConfidenceBadge confidence="confirmed" formula={`每件 ${PRODUCTION_BASE_TIME}s`} />
                <ConfidenceBadge confidence="proxy" formula="throughput × machines" />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add row */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={addPick} onValueChange={setAddPick}>
                <SelectTrigger className="h-8 w-[240px] text-xs">
                  <SelectValue placeholder="選擇製造品加入佇列…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)} className="text-xs">
                      #{m.id} {manufacturingIdNameFor(m.id, lang)} · {m.itemsPerBox}/box
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={addToQueue} disabled={!addPick}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 加入
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">並行機台</span>
                <Select value={String(machines)} onValueChange={(v) => setMachines(Number(v))}>
                  <SelectTrigger className="h-8 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Queue table */}
            {queueEnriched.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/30 py-6 text-center text-sm text-muted-foreground">
                佇列為空 — 從上方選擇製造品加入
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">產品</th>
                      <th className="py-2 pr-3 font-medium">數量（箱）</th>
                      <th className="py-2 pr-3 font-medium">items/box</th>
                      <th className="py-2 pr-3 font-medium">單位</th>
                      <th className="py-2 pr-3 font-medium">耗時</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueEnriched.map((q) => (
                      <tr key={q.productId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium">
                            {manufacturingIdNameFor(q.m.id, lang)}
                          </div>
                          <code className="text-[10px] text-muted-foreground">#{q.m.id} · {q.m.name.en}</code>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0"
                              onClick={() => updateQty(q.productId, q.quantity - 1)}
                            >
                              −
                            </Button>
                            <span className="w-8 text-center font-mono tabular-nums">{q.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0"
                              onClick={() => updateQty(q.productId, q.quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono tabular-nums">{q.m.itemsPerBox}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums">{q.totalUnits}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums">{fmtTime(q.timeSeconds)}</td>
                        <td className="py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-500/10"
                            onClick={() => removeItem(q.productId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-semibold">
                      <td className="py-2 pr-3">合計</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{totalBoxes}</td>
                      <td className="py-2 pr-3"></td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{totalUnits}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{fmtTime(totalSeconds)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Throughput callout */}
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="font-mono">
                throughput = {totalUnits} units × (3600 / {totalSeconds}s) × {machines} machines
                {' → '}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {fmt(throughputPerHour, 0)} units/hour
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">
                proxy：假設機台並行線性擴展、無 setup/中斷。真實遊戲中可能受 factory slot 限制。
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room task assignment: 製造佇列管理 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-sky-500" />
                製造佇列管理（房間任務）
              </span>
              <ConfidenceBadge
                confidence={room ? 'confirmed' : 'unverified'}
                formula={room ? 'room.tasks[manufacturing].assignedTo' : 'no room'}
                note={room ? '同步給房間' : '需建立房間'}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {room && manufacturingTask ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{manufacturingTask.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    task id: <code className="font-mono">{manufacturingTask.id}</code>
                    {assignedMember && (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                        · 已指派給 {assignedMember.name}
                      </span>
                    )}
                  </div>
                </div>
                <Select
                  value={manufacturingTask.playerId ?? '__none__'}
                  onValueChange={(v) => assignTask(manufacturingTask.id, v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="指派房間成員…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">— 未指派 —</SelectItem>
                    {members.filter((m) => m.id).map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                          {m.name} {m.id === selfId && '(我)'}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                未連接房間 — 此功能需先建立/加入房間後啟用。
                <br />
                <span className="text-[10px]">房間建立後，可將「製造佇列管理」任務指派給任一房間成員。</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Density ranking leaderboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-fuchsia-500" />
                貨架密度排行（itemsPerBox / volume）
              </span>
              <ConfidenceBadge
                confidence="confirmed"
                formula="density = itemsPerBox / (size.x × y × z)"
                sources={['manufacturing.size (IL)', 'manufacturing.itemsPerBox']}
                note="密度高者優先上架"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {densityRanking.slice(0, 12).map((row, i) => (
                <DensityRow key={row.m.id} rank={i + 1} row={row} max={densityRanking[0]?.density ?? 1} lang={lang} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              顯示前 12 名。完整 30 名見下方產品表。
            </p>
          </CardContent>
        </Card>

        {/* D5: per-recipe ROI ranking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-500" /> 配方 ROI 排行（D5：每分鐘利潤）
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="outputValue = itemsPerBox × marketPrice(linkedProduct) × 2.01; inputCost = marketPrice(linkedProduct) × 1; profit/min = (output − input) / 0.5"
                note="inputCost 假設 = 1 單位基底商品的市價（IL 真實 30 條 baseRecipes 仍在 save-analyzer，未回流）。"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {roiRanking.slice(0, 6).map((row, i) => (
                <RoiRow
                  key={row.m.id}
                  rank={i + 1}
                  row={row}
                  max={roiRanking[0]?.profitPerMinute ?? 1}
                  lang={lang}
                />
              ))}
            </div>
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <Lightbulb className="h-3 w-3" /> 今日推薦
              </div>
              <div className="mt-1 text-xs text-foreground/90">
                今天優先做 <span className="font-semibold">{manufacturingIdNameFor(roiRanking[0].m.id, lang)}</span>：
                每箱預估 <span className="font-mono font-semibold text-emerald-600">${roiRanking[0].profit.toFixed(0)}</span> 利潤
                （每分鐘 ${roiRanking[0].profitPerMinute.toFixed(0)}）。第二選擇 {manufacturingIdNameFor(roiRanking[1].m.id, lang)}（${roiRanking[1].profitPerMinute.toFixed(0)}/min）。
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Density chart top 15 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                密度條圖（Top 15）
              </span>
              <ConfidenceBadge confidence="confirmed" formula="itemsPerBox / volume" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={densityRanking.slice(0, 15)}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 10 }}
                  />
                  <RTooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const r = payload[0].payload as (typeof densityRanking)[number]
                      return (
                        <div className="rounded-md border bg-background p-2 text-xs shadow-md">
                          <div className="font-semibold">{manufacturingIdNameFor(r.m.id, lang)}</div>
                          <div className="text-muted-foreground">#{r.m.id} · {r.m.name.en}</div>
                          <div className="mt-1 font-mono">
                            density: <span className="font-bold">{fmt(r.density, 2)}</span> items/u³
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            itemsPerBox={r.m.itemsPerBox} · vol={fmt(r.vol, 4)} u³
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="density" radius={[0, 4, 4, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Required input products / recipe note */}
        <SectionHeader
          title="配方分類（linkedProductID）"
          description="manufacturingProducts.linkedProductID 是製造配方的 category index（0=麵包/烘焙類、1=蛋糕類）。遊戲內配方是「基底商品 + 任意可組合一般商品」自由組合，無固定配方表。"
          confidence="unverified"
          formula="linkedProductID = 製造 category index (0/1)"
          note="食譜 = 基底 + 任意 combinable 一般商品（未提取固定表）。linkedProductID 不直接是商品 id。"
        />
        <Card>
          <CardContent className="pt-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {enriched.map(({ m, linkedProduct, linkedLabel }) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {manufacturingIdNameFor(m.id, lang)}
                    </div>
                    <code className="text-[10px] text-muted-foreground">#{m.id}</code>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-muted-foreground">基底</div>
                    {linkedProduct ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="cursor-help font-mono text-xs underline decoration-dotted">
                            cat={m.linkedProductID}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="text-xs">
                            <div className="font-semibold">category id = {m.linkedProductID}</div>
                            <div className="text-muted-foreground">first product in this category: {linkedLabel} (#{m.linkedProductID})</div>
                            <div className="mt-1 font-mono text-[10px] text-amber-600">
                              注意：linkedProductID 是 category index，不是「基底商品」id。遊戲允許任意可組合 ingredient 自由配方。
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <code className="font-mono text-xs text-rose-500">cat={m.linkedProductID} (no product)</code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Full product table */}
        <SectionHeader
          title="完整 30 個製造產品表"
          description="所有欄位：id、名稱、基底商品、itemsPerBox、isStackable、size(x,y,z)、volume"
          confidence="confirmed"
          formula="encyclopedia.manufacturingProducts[]"
        />
        <Card>
          <CardContent className="pt-2">
            <div className="max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">id</th>
                    <th className="py-2 pr-3 font-medium">名稱</th>
                    <th className="py-2 pr-3 font-medium">基底商品</th>
                    <th className="py-2 pr-3 font-medium">items/box</th>
                    <th className="py-2 pr-3 font-medium">stackable</th>
                    <th className="py-2 pr-3 font-medium">size (x,y,z)</th>
                    <th className="py-2 pr-3 font-medium">volume (u³)</th>
                    <th className="py-2 font-medium">density</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map(({ m, vol, density, linkedProduct, linkedLabel }) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="py-2 pr-3 font-mono text-xs">{m.id}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{manufacturingIdNameFor(m.id, lang)}</div>
                        <div className="text-[10px] text-muted-foreground">{m.name.en}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs">cat={m.linkedProductID}</span>
                        {linkedProduct && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({linkedLabel})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{m.itemsPerBox}</td>
                      <td className="py-2 pr-3">
                        {m.isStackable ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600">yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">no</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[10px] tabular-nums">
                        {m.size.x},{m.size.y},{m.size.z}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs tabular-nums">{fmt(vol, 4)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums">{fmt(density, 1)}</span>
                          <MiniBar
                            value={density}
                            max={densityRanking[0]?.density ?? 1}
                            color="bg-fuchsia-500"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

function DensityRow({
  rank,
  row,
  max,
  lang,
}: {
  rank: number
  row: { m: ManufacturingProduct; vol: number; density: number; linkedProduct: ReturnType<typeof productById.get>; label: string; linkedLabel: string }
  max: number
  lang: Lang
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card px-3 py-2',
        rank <= 3 && 'border-fuchsia-500/40 bg-fuchsia-500/5',
      )}
    >
      <span className="w-8 text-center text-sm font-bold">{medal ?? rank}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {manufacturingIdNameFor(row.m.id, lang)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          #{row.m.id} · {row.m.itemsPerBox}/box · {fmt(row.vol, 3)}u³
        </div>
        <div className="mt-1">
          <MiniBar value={row.density} max={max} color="bg-fuchsia-500" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-bold tabular-nums">{fmt(row.density, 1)}</div>
        <div className="text-[9px] text-muted-foreground">items/u³</div>
      </div>
    </div>
  )
}

// D5: ROI row
function RoiRow({
  rank,
  row,
  max,
  lang,
}: {
  rank: number
  row: {
    m: ManufacturingProduct
    linkedProduct: ReturnType<typeof productById.get>
    refMarket: number
    inputCost: number
    outputValue: number
    profit: number
    profitPerMinute: number
  }
  max: number
  lang: Lang
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card px-3 py-2',
        rank <= 3 && 'border-emerald-500/40 bg-emerald-500/5',
      )}
    >
      <span className="w-8 text-center text-sm font-bold">{medal ?? rank}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {manufacturingIdNameFor(row.m.id, lang)}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {row.m.itemsPerBox}/box · 入 ${row.inputCost.toFixed(1)} → 出 ${row.outputValue.toFixed(0)}
        </div>
        <div className="mt-1">
          <MiniBar value={Math.max(0, row.profitPerMinute)} max={max} color="bg-emerald-500" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-bold tabular-nums text-emerald-600">
          ${row.profitPerMinute.toFixed(0)}
        </div>
        <div className="text-[9px] text-muted-foreground">利潤/分鐘</div>
      </div>
    </div>
  )
}

function fmtTime(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}
