'use client'

import { useMemo } from 'react'
import { useUIStore } from '@/lib/store'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  computeBoxValue,
  computeColliderVolume,
  computeValueDensity,
  computeBoxValueDensity,
  computeDemandProxy,
  computeWeightedRevenueProxy,
  computeWeightedBoxProxy,
} from '@/lib/engine'
import {
  ConfidenceBadge,
  StatCard,
  SectionHeader,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts'
import {
  Boxes,
  TrendingUp,
  Layers,
  Activity,
  Crown,
  Sparkles,
  AlertTriangle,
  Rocket,
  Hourglass,
} from 'lucide-react'
import type { Product } from '@/lib/types'

// ---------- Per-product precompute ----------
interface Row {
  p: Product
  boxValue: number
  colliderVolume: number
  valueDensity: number
  boxValueDensity: number
  demandProxy: number
  weightedRevenue: number
  weightedBox: number
  isPremium: boolean
  isSeasonal: boolean
  groupColor: string
  groupName: string
}

const NOTABLE_IDS = [296, 299, 287, 4]

function groupColorHex(g: number | null): string {
  if (g == null) return '#888888'
  const grp = ENC.productGroups[g]
  if (!grp) return '#888888'
  const r = Math.round(grp.color.r * 255)
  const gr = Math.round(grp.color.g * 255)
  const b = Math.round(grp.color.b * 255)
  return `rgb(${r},${gr},${b})`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function Profit() {
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const setView = useUIStore((s) => s.setView)

  // Precompute all rows
  const rows: Row[] = useMemo(() => {
    return ENC.products.map((p) => {
      const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
      return {
        p,
        boxValue: computeBoxValue(p).value,
        colliderVolume: computeColliderVolume(p).value,
        valueDensity: computeValueDensity(p).value,
        boxValueDensity: computeBoxValueDensity(p).value,
        demandProxy: demand,
        weightedRevenue: computeWeightedRevenueProxy(p, demand).value,
        weightedBox: computeWeightedBoxProxy(p, demand).value,
        isPremium: ENC.premiumProducts.includes(p.id),
        isSeasonal: ENC.seasons.some((s) => s.productIds.includes(p.id)),
        groupColor: groupColorHex(p.group),
        groupName: p.groupName.zhHant,
      }
    })
  }, [])

  // Bottom-10% thresholds for trap detection
  const thresholds = useMemo(() => {
    const densities = rows.map((r) => r.valueDensity).sort((a, b) => a - b)
    const demands = rows.map((r) => r.demandProxy).sort((a, b) => a - b)
    return {
      densP10: percentile(densities, 0.1),
      demP10: percentile(demands, 0.1),
    }
  }, [rows])

  // Leaderboards
  const leaderboards = useMemo(() => {
    const lb1 = [...rows].sort((a, b) => b.boxValue - a.boxValue).slice(0, 15)
    const lb2 = [...rows].sort((a, b) => b.valueDensity - a.valueDensity).slice(0, 15)
    const lb3 = [...rows].sort((a, b) => b.demandProxy - a.demandProxy).slice(0, 15)
    const lb4 = [...rows].sort((a, b) => b.weightedBox - a.weightedBox).slice(0, 15)
    const lb5 = rows.filter((r) => r.p.tier <= 8).sort((a, b) => b.weightedBox - a.weightedBox).slice(0, 15)
    const lb6 = rows.filter((r) => r.p.tier >= 40).sort((a, b) => b.weightedBox - a.weightedBox).slice(0, 15)
    const lb7 = rows.filter((r) => r.isPremium).sort((a, b) => b.boxValue - a.boxValue).slice(0, 15)
    const lb8 = rows.filter((r) => r.isSeasonal).sort((a, b) => b.weightedBox - a.weightedBox).slice(0, 15)
    const lb9 = rows
      .filter((r) => r.valueDensity < thresholds.densP10 && r.demandProxy < thresholds.demP10)
      .sort((a, b) => a.valueDensity - b.valueDensity)
      .slice(0, 15)
    return { lb1, lb2, lb3, lb4, lb5, lb6, lb7, lb8, lb9 }
  }, [rows, thresholds])

  // Scatter data — split by top groups (top 6 by population)
  const scatterData = useMemo(() => {
    // Compute aggregate bounds
    const notableSet = new Set(NOTABLE_IDS)

    // build per-group series (limit to top 8 groups to keep legend manageable)
    const counts = new Map<number, number>()
    for (const r of rows) {
      if (r.p.group == null) continue
      counts.set(r.p.group, (counts.get(r.p.group) ?? 0) + 1)
    }
    const topGroups = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0])

    const series = topGroups.map((gid) => {
      const g = ENC.productGroups[gid]
      return {
        gid,
        name: g?.name.zhHant ?? `#${gid}`,
        color: groupColorHex(gid),
        data: rows
          .filter((r) => r.p.group === gid)
          .map((r) => ({
            id: r.p.id,
            name: r.p.name.en,
            zhName: r.p.name.zhHant,
            demandProxy: r.demandProxy,
            valueDensity: r.valueDensity === 0 ? 0.0001 : r.valueDensity,
            boxValue: r.boxValue,
            notable: notableSet.has(r.p.id),
          })),
      }
    })
    // Also include "other" group as small grey series
    const otherGids = new Set([...counts.keys()].filter((g) => !topGroups.includes(g)))
    if (otherGids.size > 0) {
      series.push({
        gid: -1,
        name: '其他',
        color: '#9ca3af',
        data: rows
          .filter((r) => r.p.group != null && otherGids.has(r.p.group))
          .map((r) => ({
            id: r.p.id,
            name: r.p.name.en,
            zhName: r.p.name.zhHant,
            demandProxy: r.demandProxy,
            valueDensity: r.valueDensity === 0 ? 0.0001 : r.valueDensity,
            boxValue: r.boxValue,
            notable: notableSet.has(r.p.id),
          })),
      })
    }
    return series
  }, [rows])

  const notableLabels = useMemo(
    () =>
      rows
        .filter((r) => NOTABLE_IDS.includes(r.p.id))
        .map((r) => ({
          id: r.p.id,
          name: r.p.name.en,
          demandProxy: r.demandProxy,
          valueDensity: r.valueDensity,
          boxValue: r.boxValue,
          isPremium: r.isPremium,
        })),
    [rows],
  )

  // Summary stat row
  const summary = useMemo(
    () => ({
      total: rows.length,
      premium: rows.filter((r) => r.isPremium).length,
      seasonal: rows.filter((r) => r.isSeasonal).length,
      traps: leaderboards.lb9.length,
      avgBox: rows.reduce((s, r) => s + r.boxValue, 0) / rows.length,
    }),
    [rows, leaderboards],
  )

  const goToProduct = (id: number) => {
    setSelectedProduct(id)
    setView('wiki')
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profit Lab</h1>
        <p className="text-sm text-muted-foreground">
          所有指標均為 Proxy — true customer spawn distribution 與 runtime product-selection 未完全提取。Salt 機制見專屬探測頁。
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">所有指標均為 Proxy</span>
              <ConfidenceBadge
                confidence="proxy"
                formula="demandProxy = Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight"
                note="Assumes equal customer spawn + uniform pick within necessity pool. True runtime selection unverified."
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              下圖與排行榜的 demand、weighted value、box value 皆由 encyclopedia 靜態資料計算，未涵蓋實際顧客生成機制與產品選擇演算法。
              Salt 路徑請見 <span className="font-semibold">Salt 探測頁</span>。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="總商品數" value={summary.total} confidence="confirmed" formula="encyclopedia.products.length" />
        <StatCard label="Premium 候選" value={summary.premium} confidence="confirmed" formula="premiumProducts.length" accent="good" />
        <StatCard label="季節性候選" value={summary.seasonal} confidence="confirmed" formula="Σ seasons[i].productIds ∩ products" />
        <StatCard label="陷阱商品 (P10)" value={summary.traps} confidence="proxy" formula="valueDensity < P10 ∧ demandProxy < P10" accent="bad" />
        <StatCard label="平均 boxValue" value={fmtMoney(summary.avgBox)} confidence="confirmed" formula="avg(boxValue)" accent="good" />
      </div>

      {/* Scatter plot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Demand × Density 散佈圖
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="X=demandProxy, Y=valueDensity (log scale), 氣泡大小=boxValue, 顏色=group"
              note="log scale 因 USB 1TB valueDensity (~$74,737) 遠高於其他品項"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[460px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  type="number"
                  dataKey="demandProxy"
                  name="demandProxy"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => fmt(v, 4)}
                  label={{ value: 'demandProxy (proxy)', position: 'insideBottom', offset: -10, style: { fontSize: 11 } }}
                />
                <YAxis
                  type="number"
                  dataKey="valueDensity"
                  name="valueDensity"
                  scale="log"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => (v >= 1000 ? fmt(v, 0) : fmt(v, 1))}
                  label={{ value: 'valueDensity ($/u³, log)', angle: -90, position: 'insideLeft', offset: 20, style: { fontSize: 11 } }}
                />
                <ZAxis type="number" dataKey="boxValue" range={[20, 360]} name="boxValue" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const d = payload[0].payload as { id: number; name: string; zhName: string; demandProxy: number; valueDensity: number; boxValue: number }
                    return (
                      <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                        <div className="font-medium">#{d.id} {d.name} <span className="text-muted-foreground">({d.zhName})</span></div>
                        <div className="mt-1 font-mono text-[10px]">demandProxy: {fmt(d.demandProxy, 5)}</div>
                        <div className="font-mono text-[10px]">valueDensity: {fmt(d.valueDensity, 2)} $/u³</div>
                        <div className="font-mono text-[10px]">boxValue: {fmtMoney(d.boxValue)}</div>
                      </div>
                    )
                  }}
                />
                {scatterData.map((s) => (
                  <Scatter key={s.gid} name={s.name} data={s.data} fill={s.color} fillOpacity={0.7}>
                    {s.data.map((d) => (
                      <Cell
                        key={d.id}
                        fill={d.notable ? '#dc2626' : s.color}
                        stroke={d.notable ? '#000' : 'none'}
                        strokeWidth={d.notable ? 1 : 0}
                      />
                    ))}
                    <LabelList
                      dataKey="name"
                      position="top"
                      formatter={(v: string) => {
                        // Only show labels for notable products
                        const match = scatterData.flatMap((ss) => ss.data).find((d) => d.name === v && d.notable)
                        return match ? v : ''
                      }}
                      style={{ fontSize: 9, fill: '#dc2626', fontWeight: 600 }}
                    />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {/* Notable products list */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {notableLabels.map((n) => (
              <button
                key={n.id}
                onClick={() => goToProduct(n.id)}
                className="rounded-md border bg-card p-2 text-left text-xs transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-1">
                  <span className="font-semibold">#{n.id} {n.name}</span>
                  {n.isPremium && <Crown className="h-3 w-3 text-fuchsia-500" />}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  dem {fmt(n.demandProxy, 5)} · dens {fmt(n.valueDensity, 1)} · box {fmtMoney(n.boxValue)}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboards */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> 排行榜 (Top 15)
            <ConfidenceBadge confidence="proxy" formula="all metrics derived from engine; demand=true spawn proxy" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="lb1" className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap gap-1">
              <TabsTrigger value="lb1" className="text-xs">單箱價值</TabsTrigger>
              <TabsTrigger value="lb2" className="text-xs">價值密度</TabsTrigger>
              <TabsTrigger value="lb3" className="text-xs">需求</TabsTrigger>
              <TabsTrigger value="lb4" className="text-xs">加權</TabsTrigger>
              <TabsTrigger value="lb5" className="text-xs">早期</TabsTrigger>
              <TabsTrigger value="lb6" className="text-xs">後期</TabsTrigger>
              <TabsTrigger value="lb7" className="text-xs">Premium</TabsTrigger>
              <TabsTrigger value="lb8" className="text-xs">季節</TabsTrigger>
              <TabsTrigger value="lb9" className="text-xs">陷阱</TabsTrigger>
            </TabsList>

            <TabsContent value="lb1">
              <LeaderboardTable
                title="最高單箱價值"
                icon={<Boxes className="h-3.5 w-3.5 text-emerald-500" />}
                formula="boxValue = basePricePerUnit × maxItemsPerBox"
                confidence="confirmed"
                rows={leaderboards.lb1}
                metricLabel="boxValue"
                metricFmt={(r) => fmtMoney(r.boxValue)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb2">
              <LeaderboardTable
                title="最高價值密度"
                icon={<Layers className="h-3.5 w-3.5 text-teal-500" />}
                formula="valueDensity = basePricePerUnit / colliderVolume"
                confidence="confirmed"
                rows={leaderboards.lb2}
                metricLabel="valueDensity ($/u³)"
                metricFmt={(r) => fmt(r.valueDensity, 2)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb3">
              <LeaderboardTable
                title="最高 demand proxy"
                icon={<Activity className="h-3.5 w-3.5 text-amber-500" />}
                formula="Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight"
                confidence="proxy"
                rows={leaderboards.lb3}
                metricLabel="demandProxy"
                metricFmt={(r) => fmt(r.demandProxy, 5)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb4">
              <LeaderboardTable
                title="最高加權價值 (demand × box)"
                icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                formula="weightedBoxProxy = demandProxy × boxValue"
                confidence="proxy"
                rows={leaderboards.lb4}
                metricLabel="weightedBox"
                metricFmt={(r) => fmt(r.weightedBox, 3)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb5">
              <LeaderboardTable
                title="最佳早期 (Tier ≤ 8)"
                icon={<Rocket className="h-3.5 w-3.5 text-sky-500" />}
                formula="filter tier ≤ 8; sort by demandProxy × boxValue desc"
                confidence="proxy"
                rows={leaderboards.lb5}
                metricLabel="weightedBox"
                metricFmt={(r) => fmt(r.weightedBox, 3)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb6">
              <LeaderboardTable
                title="最佳後期 (Tier ≥ 40)"
                icon={<Hourglass className="h-3.5 w-3.5 text-fuchsia-500" />}
                formula="filter tier ≥ 40; sort by demandProxy × boxValue desc"
                confidence="proxy"
                rows={leaderboards.lb6}
                metricLabel="weightedBox"
                metricFmt={(r) => fmt(r.weightedBox, 3)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb7">
              <LeaderboardTable
                title="Premium 候選"
                icon={<Crown className="h-3.5 w-3.5 text-fuchsia-500" />}
                formula="filter premiumProducts; sort by boxValue desc"
                confidence="confirmed"
                rows={leaderboards.lb7}
                metricLabel="boxValue"
                metricFmt={(r) => fmtMoney(r.boxValue)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb8">
              <LeaderboardTable
                title="季節性候選"
                icon={<Sparkles className="h-3.5 w-3.5 text-sky-500" />}
                formula="filter season pool members; sort by demandProxy × boxValue desc"
                confidence="proxy"
                rows={leaderboards.lb8}
                metricLabel="weightedBox"
                metricFmt={(r) => fmt(r.weightedBox, 3)}
                onClick={goToProduct}
              />
            </TabsContent>
            <TabsContent value="lb9">
              <LeaderboardTable
                title="陷阱商品 (valueDensity P10 ∧ demandProxy P10)"
                icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                formula={`valueDensity < P10 (${fmt(thresholds.densP10, 3)}) ∧ demandProxy < P10 (${fmt(thresholds.demP10, 5)})`}
                confidence="proxy"
                rows={leaderboards.lb9}
                metricLabel="dens / dem"
                metricFmt={(r) => `${fmt(r.valueDensity, 2)} / ${fmt(r.demandProxy, 5)}`}
                onClick={goToProduct}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function LeaderboardTable({
  title,
  icon,
  formula,
  confidence,
  rows,
  metricLabel,
  metricFmt,
  onClick,
}: {
  title: string
  icon: React.ReactNode
  formula: string
  confidence: 'confirmed' | 'proxy'
  rows: Row[]
  metricLabel: string
  metricFmt: (r: Row) => string
  onClick: (id: number) => void
}) {
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {title}</span>
        <ConfidenceBadge confidence={confidence} formula={formula} />
        <Badge variant="outline" className="text-[10px]">{rows.length} items</Badge>
      </div>
      <div className="max-h-[60vh] overflow-auto scrollbar-thin rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>商品</TableHead>
              <TableHead>群組</TableHead>
              <TableHead className="text-right">{metricLabel}</TableHead>
              <TableHead className="text-right">boxValue</TableHead>
              <TableHead className="text-right"> Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow
                key={r.p.id}
                onClick={() => onClick(r.p.id)}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium leading-tight">
                      #{r.p.id} {r.p.name.en}
                      {r.isPremium && <Crown className="ml-1 inline h-3 w-3 text-fuchsia-500" />}
                      {r.isSeasonal && <Sparkles className="ml-0.5 inline h-3 w-3 text-sky-500" />}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{r.p.name.zhHant} · Tier {r.p.tier}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.groupColor }} />
                    {r.groupName}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{metricFmt(r)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtMoney(r.boxValue)}</TableCell>
                <TableCell className="text-right">
                  <ConfidenceBadge confidence={confidence} formula={formula} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  無符合條件商品
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
