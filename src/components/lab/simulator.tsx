'use client'

import { useMemo, useState } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { productById } from '@/lib/data-loader'
import { simulateCustomers, type SimulationConfig } from '@/lib/engine'
import { useSaveStore, useUIStore } from '@/lib/store'
import type { Product } from '@/lib/types'
import {
  useLang,
  customerTypeLabel,
  necessityIdNameFor,
  productNameFor,
  groupIdNameFor,
} from '@/lib/i18n'
import {
  ConfidenceBadge,
  StatCard,
  SectionHeader,
  DataRow,
  MiniBar,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  Users,
  Play,
  Sparkles,
  Flame,
  AlertCircle,
  Layers,
  Box,
  Trophy,
  Target,
} from 'lucide-react'
import type { SimulationResult } from '@/lib/engine'

// ============================================================
// Helpers
// ============================================================

function parseCustomWeights(text: string): number[] | null {
  const lines = text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length !== ENC.customerTypes.length) return null
  const nums = lines.map(Number)
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  if (nums.every((n) => n === 0)) return null
  return nums
}

// ============================================================
// Main component
// ============================================================

export function Simulator() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const setView = useUIStore((s) => s.setView)

  // Top-level tab: customer view / necessity view / simulator
  const [tab, setTab] = useState<'customer' | 'necessity' | 'sim'>('customer')

  // selections for the two explorer tabs
  const [selectedCust, setSelectedCust] = useState(0)
  const [selectedNec, setSelectedNec] = useState(0)
  const [demandSaveMode, setDemandSaveMode] = useState(false)

  // simulation controls
  const [n, setN] = useState(2000)
  const [mode, setMode] = useState<'raw' | 'unique'>('raw')
  const [spawnMode, setSpawnMode] = useState<'equal' | 'custom'>('equal')
  const [customText, setCustomText] = useState('')
  const [stockedMode, setStockedMode] = useState<'all' | 'from-save' | 'none'>('all')

  // simulation result
  const [result, setResult] = useState<ReturnType<typeof simulateCustomers> | null>(null)

  const customerTypes = ENC.customerTypes
  const necessities = ENC.necessities
  const selectedCustomer = customerTypes[selectedCust]

  // ---------- Panel A: customer → top necessities ----------
  const customerTopNec = useMemo(() => {
    return necessities
      .map((nec, idx) => ({
        nec,
        idx,
        weight: selectedCustomer.necessitiesChances[idx] ?? 0,
      }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
  }, [selectedCustomer, necessities])

  const maxCustNecWeight = Math.max(...customerTopNec.map((x) => x.weight), 0.0001)

  // Total weight per customer — for "需求佔比" label
  const totalWeightPerCustomer = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of customerTypes) {
      m.set(
        c.index,
        c.necessitiesChances.reduce((a, b) => a + Math.max(0, b), 0),
      )
    }
    return m
  }, [customerTypes])

  // ---------- Panel B: necessity → ranked customers ----------
  const necTopCustomers = useMemo(() => {
    return customerTypes
      .map((c) => ({
        c,
        idx: c.index,
        weight: c.necessitiesChances[selectedNec] ?? 0,
      }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
  }, [customerTypes, selectedNec])

  const maxNecCustWeight = Math.max(...necTopCustomers.map((x) => x.weight), 0.0001)

  // Per-necessity aggregate stats (for the necessity list sidebar)
  const necAggregates = useMemo(() => {
    return necessities.map((_, idx) => {
      let totalWeight = 0
      let custCount = 0
      for (const c of customerTypes) {
        const w = c.necessitiesChances[idx] ?? 0
        if (w > 0) {
          totalWeight += w
          custCount++
        }
      }
      return { idx, totalWeight, custCount }
    })
  }, [necessities, customerTypes])

  // Per-necessity save-aware stats: how many products are unlocked / in stock / missing
  const necSaveStats = useMemo(() => {
    const unlockedSet = new Set(snapshot?.unlockedProducts ?? [])
    const inv = snapshot?.inventoryByProduct ?? {}
    return necessities.map((nec) => {
      let unlocked = 0
      let stocked = 0
      for (const pid of nec.productIds) {
        if (!unlockedSet.has(pid)) continue
        unlocked++
        if ((inv[pid] ?? 0) > 0) stocked++
      }
      return { unlocked, stocked, missing: unlocked - stocked }
    })
  }, [necessities, snapshot])

  // Necessity list order: index order in theory mode, most-missing first in save mode
  const necessityList = useMemo(() => {
    const list = necessities.map((nec, idx) => ({
      nec,
      idx,
      agg: necAggregates[idx],
      save: necSaveStats[idx],
    }))
    if (demandSaveMode) {
      list.sort((a, b) => b.save.missing - a.save.missing)
    }
    return list
  }, [necessities, necAggregates, necSaveStats, demandSaveMode])

  // ---------- Simulation ----------
  const runSimulation = () => {
    let customerWeights: number[] | undefined
    if (spawnMode === 'custom') {
      const parsed = parseCustomWeights(customText)
      if (parsed) customerWeights = parsed
      // else fall back to equal (undefined)
    }
    let stockedProductIds: Set<number> | undefined
    let unlockedProductIds: Set<number> | undefined
    if (stockedMode === 'all') {
      stockedProductIds = new Set(ENC.products.map((p) => p.id))
    } else if (stockedMode === 'from-save') {
      const unlocked = snapshot?.unlockedProducts ?? []
      unlockedProductIds = new Set(unlocked.length > 0 ? unlocked : ENC.products.map((p) => p.id))
      const inv = snapshot?.inventoryByProduct ?? {}
      stockedProductIds = new Set(
        Object.entries(inv)
          .filter(([, c]) => (c as number) > 0)
          .map(([id]) => Number(id)),
      )
    } else {
      stockedProductIds = new Set<number>()
    }
    const cfg: SimulationConfig = {
      n,
      customerWeights,
      mode,
      stockedProductIds,
      unlockedProductIds,
    }
    setResult(simulateCustomers(cfg))
  }

  const productHitsRows = useMemo(() => {
    if (!result) return []
    return Array.from(result.value.productHits.entries())
      .map(([pid, hits]) => {
        const p = productById.get(pid) as Product | undefined
        return {
          pid,
          name: productNameFor(pid, lang),
          hits,
          hitPct: result.value.totalHits > 0 ? (hits / result.value.totalHits) * 100 : 0,
          basePrice: p?.basePricePerUnit ?? 0,
          group: p ? groupIdNameFor(p.group, lang) : '',
        }
      })
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 20)
  }, [result, lang])

  const missedRows = useMemo(() => {
    if (!result) return []
    return Array.from(result.value.missedSales.entries())
      .map(([pid, missed]) => {
        const p = productById.get(pid) as Product | undefined
        return {
          pid,
          name: productNameFor(pid, lang),
          missed,
          basePrice: p?.basePricePerUnit ?? 0,
          lostRevenue: missed * (p?.basePricePerUnit ?? 0),
          group: p ? groupIdNameFor(p.group, lang) : '',
        }
      })
      .sort((a, b) => b.lostRevenue - a.lostRevenue)
      .slice(0, 20)
  }, [result, lang])

  const missedByGroup = useMemo(() => {
    if (!result) return []
    const groups: Record<string, number> = {}
    for (const [pid, missed] of result.value.missedSales.entries()) {
      const p = productById.get(pid) as Product | undefined
      const g = p ? groupIdNameFor(p.group, lang) : lang === 'en' ? 'Other' : '其他'
      groups[g] = (groups[g] ?? 0) + missed
    }
    return Object.entries(groups)
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [result, lang])

  const maxMissedGroup = Math.max(...missedByGroup.map((g) => g.count), 1)
  const maxHitsRow = Math.max(...productHitsRows.map((r) => r.hits), 1)
  const maxMissedRow = Math.max(...missedRows.map((r) => r.missed), 1)

  const totalForSelCust = totalWeightPerCustomer.get(selectedCust) ?? 1

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">顧客模擬器</h1>
        <p className="text-sm text-muted-foreground">
          以 58 種顧客類型 × 11 個商品類別權重進行 Monte Carlo 模擬。所有輸出為 Proxy 等級，需實測驗證。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          選擇一位顧客類型查看他最需要的商品類別，或選擇一個商品類別查看哪些顧客需要它。
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="customer" className="text-xs sm:text-sm">
            <Users className="mr-1.5 h-3.5 w-3.5" />顧客最愛
          </TabsTrigger>
          <TabsTrigger value="necessity" className="text-xs sm:text-sm">
            <Layers className="mr-1.5 h-3.5 w-3.5" />需求熱門
          </TabsTrigger>
          <TabsTrigger value="sim" className="text-xs sm:text-sm">
            <Play className="mr-1.5 h-3.5 w-3.5" />模擬器
          </TabsTrigger>
        </TabsList>

        {/* ============== Tab A: 顧客最愛 ============== */}
        <TabsContent value="customer" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            {/* Customer list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    顧客類型
                  </span>
                  <Badge variant="outline" className="text-[10px]">{customerTypes.length} 種</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[640px] space-y-1 overflow-y-auto scrollbar-thin pr-1">
                  {customerTypes.map((c) => {
                    const isSelected = c.index === selectedCust
                    const hasPremium = c.premiumIndexes.length > 0
                    const label = customerTypeLabel(c, lang)
                    return (
                      <button
                        key={c.index}
                        onClick={() => setSelectedCust(c.index)}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                          isSelected && 'border-primary bg-primary/5',
                        )}
                      >
                        <span className="mt-0.5 w-7 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                          #{c.index}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium" title={label}>{label}</span>
                            {hasPremium && (
                              <Badge variant="outline" className="h-3.5 shrink-0 px-1 text-[9px] text-fuchsia-600">
                                premium
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            comp[{c.compensatedChances.join('/')}]
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Selected customer detail */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-emerald-500" />
                    顧客 #{selectedCust} 最需要的商品類別
                  </span>
                  <ConfidenceBadge
                    confidence="confirmed"
                    formula="weight = customerType.necessitiesChances[necIdx]"
                    note="原始資料來自百科 customers.tsv"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 p-2">
                    <span className="text-muted-foreground">顧客類型標籤：</span>
                    <div className="mt-0.5 font-mono text-[11px] break-words">
                      {customerTypeLabel(selectedCustomer, lang)}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <span className="text-muted-foreground">premiumIndexes：</span>
                    <span className="ml-1 font-mono">
                      {selectedCustomer.premiumIndexes.length > 0
                        ? selectedCustomer.premiumIndexes.join(', ')
                        : '(none)'}
                    </span>
                  </div>
                </div>

                {customerTopNec.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    此顧客類型沒有非零 necessity 權重
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerTopNec.map(({ nec, idx, weight }, i) => {
                      const pct = (weight / maxCustNecWeight) * 100
                      const sharePct = (weight / totalForSelCust) * 100
                      return (
                        <div key={idx} className="rounded-md border bg-card p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-6 shrink-0 text-right text-xs font-mono text-muted-foreground">
                                #{i + 1}
                              </span>
                              <span className="truncate text-sm font-medium">
                                {necessityIdNameFor(idx, lang)}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">[{idx}]</span>
                            </div>
                            <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                              {weight.toFixed(3)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                i === 0 ? 'bg-emerald-500' : 'bg-emerald-500/70',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {nec.productIds.length} 個商品 · {nec.rawTokens.length} tokens
                            </span>
                            <span>佔此顧客需求 {sharePct.toFixed(1)}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============== Tab B: 需求熱門 ============== */}
        <TabsContent value="necessity" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            {/* Necessity list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-500" />
                    商品類別
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[11px]', !demandSaveMode ? 'font-bold' : 'text-muted-foreground')}>理論</span>
                    <Switch checked={demandSaveMode} onCheckedChange={setDemandSaveMode} />
                    <span className={cn('text-[11px]', demandSaveMode ? 'font-bold' : 'text-muted-foreground')}>存檔</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {necessityList.map(({ idx, agg, save }) => {
                    const isSelected = idx === selectedNec
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedNec(idx)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                          isSelected && 'border-primary bg-primary/5',
                        )}
                      >
                        <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                          [{idx}]
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {necessityIdNameFor(idx, lang)}
                          </div>
                          {demandSaveMode ? (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              已解鎖 {save.unlocked} · 現貨 {save.stocked} ·{' '}
                              <span className={save.missing > 0 ? 'font-bold text-rose-600' : ''}>缺貨 {save.missing}</span>
                            </div>
                          ) : (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {agg.custCount} 顧客 · 總權重 {agg.totalWeight.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Ranked customers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-amber-500" />
                    需要「{necessityIdNameFor(selectedNec, lang)}」的顧客排行
                  </span>
                  <ConfidenceBadge
                    confidence="confirmed"
                    formula="weight = customerType.necessitiesChances[selectedNec]"
                    note="按權重由高到低排序"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">商品類別：</span>
                    <span className="font-mono">
                      [{selectedNec}] {necessityIdNameFor(selectedNec, lang)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">商品池大小：</span>
                    <span className="font-mono">
                      {necessities[selectedNec].productIds.length} unique ·{' '}
                      {necessities[selectedNec].rawTokens.length} tokens
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">存檔：</span>
                    <span className="font-mono">
                      已解鎖 {necSaveStats[selectedNec].unlocked} · 現貨 {necSaveStats[selectedNec].stocked} ·{' '}
                      <span className={necSaveStats[selectedNec].missing > 0 ? 'text-rose-600' : ''}>
                        缺貨 {necSaveStats[selectedNec].missing}
                      </span>
                    </span>
                  </div>
                </div>

                {necTopCustomers.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    沒有顧客需要這個類別
                  </div>
                ) : (
                  <div className="max-h-[640px] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                    {necTopCustomers.map(({ c, idx, weight }, i) => {
                      const pct = (weight / maxNecCustWeight) * 100
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedCust(idx)
                            setTab('customer')
                          }}
                          className="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                          title="點擊查看此顧客的全部需求"
                        >
                          <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                            #{i + 1}
                          </span>
                          <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">
                            cust {idx}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {customerTypeLabel(c, lang)}
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  i < 3 ? 'bg-amber-500' : 'bg-amber-500/70',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
                            {weight.toFixed(3)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============== Tab C: 模擬器 ============== */}
        <TabsContent value="sim" className="mt-4 space-y-4">
          {/* Simulation controls */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-4 w-4 text-primary" /> 模擬控制台
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Left column: N + mode */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs">
                      樣本數 N <span className="ml-1 font-mono text-muted-foreground">({n.toLocaleString()})</span>
                    </Label>
                    <div className="mt-2 px-1">
                      <Slider
                        value={[n]}
                        min={100}
                        max={10000}
                        step={100}
                        onValueChange={(v) => setN(v[0])}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>100</span><span>5,000</span><span>10,000</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <Label className="text-xs font-semibold">Token 模式</Label>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {mode === 'raw'
                          ? 'Raw: 保留重複 token（例如 Salt 在 nec[9] 算 5×）'
                          : 'Unique: 同一池內 product 去重，權重均分'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[11px]', mode === 'raw' ? 'font-bold' : 'text-muted-foreground')}>Raw</span>
                      <Switch checked={mode === 'unique'} onCheckedChange={(c) => setMode(c ? 'unique' : 'raw')} />
                      <span className={cn('text-[11px]', mode === 'unique' ? 'font-bold' : 'text-muted-foreground')}>Unique</span>
                    </div>
                  </div>
                </div>

                {/* Right column: spawn + stocked */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">顧客生成權重</Label>
                    <Tabs value={spawnMode} onValueChange={(v) => setSpawnMode(v as 'equal' | 'custom')}>
                      <TabsList className="mt-1 h-7">
                        <TabsTrigger value="equal" className="text-[11px]">Equal (1/58)</TabsTrigger>
                        <TabsTrigger value="custom" className="text-[11px]">Custom</TabsTrigger>
                      </TabsList>
                      <TabsContent value="custom" className="mt-2">
                        <Textarea
                          placeholder="每行一個權重，共 58 行（如 1, 0.5, 0.5, ...）。無效則退回 equal。"
                          className="h-20 text-xs scrollbar-thin"
                          value={customText}
                          onChange={(e) => setCustomText(e.target.value)}
                        />
                        {spawnMode === 'custom' && customText.length > 0 && !parseCustomWeights(customText) && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-600">
                            <AlertCircle className="h-3 w-3" /> 格式無效（需 58 個非負數）— 將退回 equal
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  <div>
                    <Label className="text-xs">商品範圍</Label>
                    <Tabs value={stockedMode} onValueChange={(v) => setStockedMode(v as 'all' | 'from-save' | 'none')}>
                      <TabsList className="mt-1 h-7">
                        <TabsTrigger value="all" className="text-[11px]">全部商品</TabsTrigger>
                        <TabsTrigger value="from-save" className="text-[11px]">依存檔（已解鎖）</TabsTrigger>
                        <TabsTrigger value="none" className="text-[11px]">無現貨（看漏單）</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {stockedMode === 'from-save' && !snapshot && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertCircle className="h-3 w-3" /> 尚未載入存檔，將以空集合計算
                      </div>
                    )}
                    {stockedMode === 'from-save' && snapshot && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        已解鎖 {snapshot.unlockedProducts?.length ?? 0} 項商品、有現貨{' '}
                        {Object.values(snapshot.inventoryByProduct).filter((c) => (c as number) > 0).length} 項
                        （缺貨＝已解鎖但無現貨）
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={runSimulation} size="sm">
                  <Play className="mr-1.5 h-3.5 w-3.5" /> 執行模擬
                </Button>
                {result && (
                  <Badge variant="outline" className="text-[10px]">
                    已執行 N={result.value.totalCustomers.toLocaleString()}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Output panel */}
          {result && (
            <OutputPanel
              result={result.value}
              formula={result.formula}
              note={result.note}
              productHitsRows={productHitsRows}
              missedRows={missedRows}
              missedByGroup={missedByGroup}
              maxHitsRow={maxHitsRow}
              maxMissedRow={maxMissedRow}
              maxMissedGroup={maxMissedGroup}
              onSelectProduct={(id) => {
                setSelectedProduct(id)
                setView('wiki')
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// Output panel
// ============================================================

function OutputPanel({
  result,
  formula,
  note,
  productHitsRows,
  missedRows,
  missedByGroup,
  maxHitsRow,
  maxMissedRow,
  maxMissedGroup,
  onSelectProduct,
}: {
  result: SimulationResult
  formula: string
  note?: string
  productHitsRows: Array<{ pid: number; name: string; hits: number; hitPct: number; basePrice: number; group: string }>
  missedRows: Array<{ pid: number; name: string; missed: number; basePrice: number; lostRevenue: number; group: string }>
  missedByGroup: Array<{ group: string; count: number }>
  maxHitsRow: number
  maxMissedRow: number
  maxMissedGroup: number
  onSelectProduct: (id: number) => void
}) {
  const lang = useLang()
  const coveragePct = result.demandCoverage * 100
  return (
    <div className="space-y-4">
      <SectionHeader
        title="模擬輸出"
        description="Monte Carlo 結果，基於均勻挑選假設。重跑可觀察變異。"
        confidence="proxy"
        formula={formula}
        note={note}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="總顧客數"
          value={result.totalCustomers.toLocaleString()}
          confidence="confirmed"
          formula="N (input)"
          accent="neutral"
        />
        <StatCard
          label="總命中"
          value={result.totalHits.toLocaleString()}
          hint="已選到店內現貨的次數"
          confidence="proxy"
          formula="Σ hits where stocked.has(productId)"
          accent="good"
        />
        <StatCard
          label="錯失命中"
          value={result.missedHits.toLocaleString()}
          hint="想買但沒進貨"
          confidence="proxy"
          formula="Σ hits where !stocked.has(productId)"
          accent="bad"
        />
        <StatCard
          label="需求覆蓋率"
          value={fmt(coveragePct, 1)}
          unit="%"
          hint={(result.totalHits + result.missedHits).toLocaleString() + ' 次總嘗試'}
          confidence="proxy"
          formula="demandCoverage = (totalHits - missedHits) / totalHits"
          accent={coveragePct > 70 ? 'good' : coveragePct > 40 ? 'warn' : 'bad'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 20 product hits */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-500" /> 預期命中 Top 20
              </span>
              <ConfidenceBadge confidence="proxy" formula="productHits / totalHits × 100" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin pr-1">
              {productHitsRows.map((r, i) => (
                <DataRow
                  key={r.pid}
                  index={i + 1}
                  title={<span className="font-medium">{r.name}</span>}
                  subtitle={`#${r.pid} · $${r.basePrice.toFixed(2)} · ${r.group}`}
                  right={
                    <div className="flex w-28 flex-col items-end gap-0.5">
                      <span className="font-mono text-xs tabular-nums">{r.hits} hits ({r.hitPct.toFixed(1)}%)</span>
                      <MiniBar value={r.hits} max={maxHitsRow} color="bg-emerald-500" />
                    </div>
                  }
                  onClick={() => onSelectProduct(r.pid)}
                />
              ))}
              {productHitsRows.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">無命中資料</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top 20 missed sales */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" /> 缺貨漏單 Top 20
              </span>
              <ConfidenceBadge confidence="proxy" formula="missed × basePrice (lost revenue proxy)" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin pr-1">
              {missedRows.map((r, i) => (
                <DataRow
                  key={r.pid}
                  index={i + 1}
                  title={<span className="font-medium">{r.name}</span>}
                  subtitle={`#${r.pid} · ${r.group} · ${r.missed} 次漏單`}
                  right={
                    <div className="flex w-32 flex-col items-end gap-0.5">
                      <span className="font-mono text-xs tabular-nums text-rose-600">-{fmtMoney(r.lostRevenue)}</span>
                      <MiniBar value={r.missed} max={maxMissedRow} color="bg-orange-500" />
                    </div>
                  }
                  onClick={() => onSelectProduct(r.pid)}
                />
              ))}
              {missedRows.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">無漏單（所有需求都有現貨）</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top missing categories */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-fuchsia-500" /> 漏單商品群組 Top 10
              </span>
              <ConfidenceBadge confidence="proxy" formula="groupBy(product.group).sum(missed)" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {missedByGroup.map((g, i) => (
                <DataRow
                  key={g.group}
                  index={i + 1}
                  title={g.group}
                  right={
                    <div className="flex w-32 flex-col items-end gap-0.5">
                      <span className="font-mono text-xs tabular-nums">{g.count} 漏單</span>
                      <MiniBar value={g.count} max={maxMissedGroup} color="bg-fuchsia-500" />
                    </div>
                  }
                />
              ))}
              {missedByGroup.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">無漏單資料</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Overstocked low-demand */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Box className="h-4 w-4 text-amber-500" /> 過度備貨 / 低需求 Top 10
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="filter products where demandProxy < 0.0005"
                note="高庫存但低 demand proxy 的矛盾品項"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {result.topOverstockedLowDemand.map((r, i) => (
                <DataRow
                  key={r.productId}
                  index={i + 1}
                  title={productNameFor(r.productId, lang)}
                  subtitle={`#${r.productId} · demand ${r.demand.toExponential(3)}`}
                  right={<Badge variant="outline" className="text-[10px] text-amber-600">low demand</Badge>}
                  onClick={() => onSelectProduct(r.productId)}
                />
              ))}
              {result.topOverstockedLowDemand.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">無過度備貨品項</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
