'use client'

import { useMemo, useState, useCallback } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  ConfidenceBadge,
  StatCard,
  SectionHeader,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Zap,
  Crown,
  TrendingDown,
  Layers,
  DollarSign,
} from 'lucide-react'
import type { Container, Confidence } from '@/lib/types'

interface Row extends Container {
  shelfVolume: number
  costPerVolume: number
}

type SortKey =
  | 'containerClass'
  | 'containerID'
  | 'buildableName'
  | 'cost'
  | 'shelfVolume'
  | 'costPerVolume'
  | 'energyCost'
  | 'productVolumeLimit'

type SortDir = 'asc' | 'desc'

export function Containers() {
  const [sortKey, setSortKey] = useState<SortKey>('costPerVolume')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows: Row[] = useMemo(() => {
    return ENC.containers
      .map((c) => {
        const shelfVolume = c.shelfLength * c.shelfWidth * c.shelfHeight
        return {
          ...c,
          shelfVolume,
          costPerVolume: shelfVolume > 0 ? c.cost / shelfVolume : 0,
        }
      })
      .sort((a, b) => a.containerID - b.containerID)
  }, [])

  const stats = useMemo(() => {
    const total = rows.length
    const cheapest = rows.reduce((m, r) => (r.cost < m.cost ? r : m), rows[0])
    const highestCap = rows.reduce((m, r) => (r.shelfVolume > m.shelfVolume ? r : m), rows[0])
    const bestCostPerVol = rows
      .filter((r) => r.shelfVolume > 0)
      .reduce((m, r) => (r.costPerVolume < m.costPerVolume ? r : m), rows[0])
    const energyFree = rows.filter((r) => r.energyCost === 0).length
    return { total, cheapest, highestCap, bestCostPerVol, energyFree }
  }, [rows])

  const bestOf = useMemo(() => {
    const energyFreeRows = rows.filter((r) => r.energyCost === 0)
    const cheapEnergyFree = energyFreeRows.reduce((m, r) => (r.cost < m.cost ? r : m), energyFreeRows[0])
    const highCap = rows.reduce((m, r) => (r.shelfVolume > m.shelfVolume ? r : m), rows[0])
    const bestEnergyFree = energyFreeRows.reduce((m, r) => (r.shelfVolume > m.shelfVolume ? r : m), energyFreeRows[0])
    // Best for high-density goods: energyCost=0, sort by volume desc (small productVolumeLimit is fine)
    const highDensityBest = energyFreeRows.reduce((m, r) => (r.shelfVolume > m.shelfVolume ? r : m), energyFreeRows[0])
    // Trap containers: top 3 costPerVolume (highest cost / lowest volume)
    const trap = [...rows]
      .filter((r) => r.shelfVolume > 0)
      .sort((a, b) => b.costPerVolume - a.costPerVolume)
      .slice(0, 3)
    return { cheapEnergyFree, highCap, bestEnergyFree, highDensityBest, trap }
  }, [rows])

  const sortedRows = useMemo(() => {
    const out = [...rows]
    const sortVal = (r: Row): number | string => {
      switch (sortKey) {
        case 'containerClass': return r.containerClass
        case 'containerID': return r.containerID
        case 'buildableName': return r.buildableName
        case 'cost': return r.cost
        case 'shelfVolume': return r.shelfVolume
        case 'costPerVolume': return r.costPerVolume
        case 'energyCost': return r.energyCost
        case 'productVolumeLimit': return r.productVolumeLimit
      }
    }
    out.sort((a, b) => {
      const av = sortVal(a)
      const bv = sortVal(b)
      if (typeof av === 'string' || typeof bv === 'string') {
        const as = String(av), bs = String(bv)
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return out
  }, [rows, sortKey, sortDir])

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((cur) => {
      if (cur === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return cur
      }
      setSortDir('asc')
      return key
    })
  }, [])

  // Chart data: each container with costPerVolume + bar color
  const chartData = useMemo(() => {
    return [...rows]
      .filter((r) => r.shelfVolume > 0)
      .sort((a, b) => a.costPerVolume - b.costPerVolume)
      .map((r) => ({
        name: r.buildableName,
        costPerVolume: r.costPerVolume,
        energyFree: r.energyCost === 0,
        containerID: r.containerID,
        cost: r.cost,
        shelfVolume: r.shelfVolume,
      }))
  }, [rows])

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">貨架與容器實驗室</h1>
        <p className="text-sm text-muted-foreground">
          全 {stats.total} 個容器 · shelfVolume = shelfLength × shelfWidth × shelfHeight · costPerVolume = cost / shelfVolume
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="容器總數" value={stats.total} confidence="confirmed" formula="encyclopedia.containers.length" />
        <StatCard
          label="最便宜"
          value={fmtMoney(stats.cheapest.cost)}
          hint={stats.cheapest.buildableName}
          confidence="confirmed"
          formula="min(cost)"
          accent="good"
        />
        <StatCard
          label="最高容量"
          value={fmt(stats.highestCap.shelfVolume, 3)}
          unit="u³"
          hint={stats.highestCap.buildableName}
          confidence="confirmed"
          formula="max(shelfVolume)"
          accent="good"
        />
        <StatCard
          label="最佳成本/容量比"
          value={fmtMoney(stats.bestCostPerVol.costPerVolume)}
          unit="/u³"
          hint={stats.bestCostPerVol.buildableName}
          confidence="proxy"
          formula="min(costPerVolume) where costPerVolume=cost/shelfVolume"
          accent="good"
        />
        <StatCard
          label="無能耗容器數"
          value={stats.energyFree}
          confidence="confirmed"
          formula="count(energyCost=0)"
          accent="good"
        />
      </div>

      {/* Best of */}
      <SectionHeader
        title="Best of — 各情境最佳容器"
        description="所有數據來自 encyclopedia.containers，衍生指標為 proxy"
        confidence="confirmed"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BestOfCard
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          title="最便宜免能耗貨架"
          row={bestOf.cheapEnergyFree}
          metricLabel="cost"
          metricValue={fmtMoney(bestOf.cheapEnergyFree.cost)}
          confidence="confirmed"
          formula="filter energyCost=0; min(cost)"
          note="早期資金緊張時首選"
        />
        <BestOfCard
          icon={<Layers className="h-4 w-4 text-teal-500" />}
          title="最高容量"
          row={bestOf.highCap}
          metricLabel="shelfVolume"
          metricValue={`${fmt(bestOf.highCap.shelfVolume, 3)} u³`}
          confidence="confirmed"
          formula="max(shelfVolume) = max(L×W×H)"
          note="大件低密度品項主货架"
        />
        <BestOfCard
          icon={<Zap className="h-4 w-4 text-amber-500" />}
          title="最佳免能耗容器"
          row={bestOf.bestEnergyFree}
          metricLabel="shelfVolume (energyCost=0)"
          metricValue={`${fmt(bestOf.bestEnergyFree.shelfVolume, 3)} u³`}
          confidence="proxy"
          formula="filter energyCost=0; max(shelfVolume)"
          note="長期持有成本最低"
        />
        <BestOfCard
          icon={<Crown className="h-4 w-4 text-fuchsia-500" />}
          title="高密度品最佳容器"
          row={bestOf.highDensityBest}
          metricLabel="shelfVolume (energyCost=0)"
          metricValue={`${fmt(bestOf.highDensityBest.shelfVolume, 3)} u³`}
          confidence="proxy"
          formula="filter energyCost=0; sort by shelfVolume desc (small productVolumeLimit is fine)"
          note="USB 1TB / 電子類等高密度品項適用"
        />
        {bestOf.trap.map((t, i) => (
          <BestOfCard
            key={t.containerID}
            icon={<TrendingDown className="h-4 w-4 text-rose-500" />}
            title={`陷阱容器 #${i + 1}`}
            row={t}
            metricLabel="costPerVolume"
            metricValue={`${fmtMoney(t.costPerVolume)} /u³`}
            confidence="proxy"
            formula="costPerVolume = cost / shelfVolume; top 3 highest"
            note="高成本、低容量的反面教材"
            accent="bad"
          />
        ))}
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Boxes className="h-4 w-4" /> 成本/容量比 — 全容器
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="costPerVolume = cost / (shelfLength × shelfWidth × shelfHeight)"
              note="emerald = 免能耗 (energyCost=0); amber = 有能耗"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 30, bottom: 80, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  tick={{ fontSize: 9 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => fmt(v, 0)}
                  label={{ value: '$ / unit³', angle: -90, position: 'insideLeft', offset: 20, style: { fontSize: 11 } }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const d = payload[0].payload as { name: string; costPerVolume: number; energyFree: boolean; containerID: number; cost: number; shelfVolume: number }
                    return (
                      <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                        <div className="font-medium">{d.name} <span className="text-muted-foreground">(ID {d.containerID})</span></div>
                        <div className="mt-1 font-mono text-[10px]">costPerVolume: {fmtMoney(d.costPerVolume)} /u³</div>
                        <div className="font-mono text-[10px]">cost: {fmtMoney(d.cost)}</div>
                        <div className="font-mono text-[10px]">shelfVolume: {fmt(d.shelfVolume, 3)} u³</div>
                        <div className="font-mono text-[10px]">energy: {d.energyFree ? 'free' : 'has cost'}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="costPerVolume" radius={[3, 3, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.containerID} fill={d.energyFree ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> 免能耗 (energyCost=0)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /> 有能耗
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>容器比較表 (全部 {rows.length})</span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="raw fields from encyclopedia.containers; derived shelfVolume & costPerVolume are confirmed (deterministic from raw)"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHead label="class" k="containerClass" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHead label="ID" k="containerID" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHead label="buildableName" k="buildableName" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHead label="cost" k="cost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">L × W × H</TableHead>
                  <SortHead label="shelfVol" k="shelfVolume" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="$/u³" k="costPerVolume" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="energyCost" k="energyCost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">energyHours</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">happiness</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">volRestrict</TableHead>
                  <SortHead label="prodVolLim" k="productVolumeLimit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((r) => {
                  const isEnergyFree = r.energyCost === 0
                  return (
                    <TableRow key={r.containerID}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.containerClass}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.containerID}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{r.buildableName}</span>
                          {isEnergyFree && <Zap className="h-3 w-3 text-emerald-500" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtMoney(r.cost)}</TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                        {fmt(r.shelfLength, 2)} × {fmt(r.shelfWidth, 2)} × {fmt(r.shelfHeight, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(r.shelfVolume, 4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtMoney(r.costPerVolume)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEnergyFree ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">free</Badge>
                        ) : (
                          <span className="font-mono text-xs text-amber-600">{fmtMoney(r.energyCost)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.energyWorkingHours}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.employeeHappiness}</TableCell>
                      <TableCell className="text-right">
                        {r.isVolumeRestricted ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-300">restricted</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.productVolumeLimit}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SortHead({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  numeric,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
  numeric?: boolean
}) {
  const active = sortKey === k
  return (
    <TableHead className={numeric ? 'text-right' : ''}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

function BestOfCard({
  icon,
  title,
  row,
  metricLabel,
  metricValue,
  confidence,
  formula,
  note,
  accent,
}: {
  icon: React.ReactNode
  title: string
  row: Row
  metricLabel: string
  metricValue: string
  confidence: Confidence
  formula: string
  note?: string
  accent?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const accentClass =
    accent === 'good'
      ? 'border-emerald-500/30'
      : accent === 'warn'
        ? 'border-amber-500/30'
        : accent === 'bad'
          ? 'border-rose-500/30'
          : ''
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm ${accentClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </span>
        <ConfidenceBadge confidence={confidence} formula={formula} />
      </div>
      <div className="mt-2">
        <div className="text-lg font-bold leading-tight">{row.buildableName}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          containerID {row.containerID} · class {row.containerClass}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{metricLabel}</div>
          <div className="font-mono text-xl font-bold">{metricValue}</div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          <div>cost: {fmtMoney(row.cost)}</div>
          <div>vol: {fmt(row.shelfVolume, 3)} u³</div>
          <div>
            energy: {row.energyCost === 0 ? (
              <span className="text-emerald-600">free</span>
            ) : (
              <span className="text-amber-600">{fmtMoney(row.energyCost)}</span>
            )}
          </div>
        </div>
      </div>
      {note && <div className="mt-2 text-[10px] italic text-muted-foreground">{note}</div>}
      <div className="mt-2 rounded bg-muted/50 p-1.5">
        <code className="text-[10px] text-muted-foreground">{formula}</code>
      </div>
    </div>
  )
}
