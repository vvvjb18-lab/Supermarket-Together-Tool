'use client'

import { useMemo, useState } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { productById } from '@/lib/data-loader'
import { simulateCustomers, type SimulationConfig } from '@/lib/engine'
import { useSaveStore, useUIStore } from '@/lib/store'
import type { Product } from '@/lib/types'
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
import { Users, Play, Sparkles, Flame, AlertCircle, Layers, Box } from 'lucide-react'
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

function heatColor(weight: number): string {
  if (weight <= 0) return 'transparent'
  // 0..1 → emerald with alpha
  const alpha = Math.min(1, Math.max(0.08, weight))
  return `rgba(16, 185, 129, ${alpha.toFixed(3)})`
}

// ============================================================
// Main component
// ============================================================

export function Simulator() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const setView = useUIStore((s) => s.setView)

  // selected customer for the explorer
  const [selectedCust, setSelectedCust] = useState(0)

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

  // sorted nonzero necessities for selected customer
  const topNecessities = useMemo(() => {
    return necessities
      .map((nec, idx) => ({
        nec,
        idx,
        weight: selectedCustomer.necessitiesChances[idx] ?? 0,
      }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
  }, [selectedCustomer, necessities])

  const maxNecWeight = Math.max(...topNecessities.map((x) => x.weight), 0.0001)

  // max chance across all customers/necessities (for heatmap normalization)
  const maxCellWeight = useMemo(() => {
    let max = 0
    for (const c of customerTypes) for (const w of c.necessitiesChances) if (w > max) max = w
    return max || 1
  }, [customerTypes])

  // run simulation
  const runSimulation = () => {
    let customerWeights: number[] | undefined
    if (spawnMode === 'custom') {
      const parsed = parseCustomWeights(customText)
      if (parsed) customerWeights = parsed
      // else fall back to equal (undefined)
    }
    let stockedProductIds: Set<number> | undefined
    if (stockedMode === 'all') {
      stockedProductIds = new Set(ENC.products.map((p) => p.id))
    } else if (stockedMode === 'from-save') {
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
    }
    setResult(simulateCustomers(cfg))
  }

  // derived tables for output
  const productHitsRows = useMemo(() => {
    if (!result) return []
    return Array.from(result.value.productHits.entries())
      .map(([pid, hits]) => {
        const p = productById.get(pid) as Product | undefined
        return {
          pid,
          name: p?.name.en ?? `#${pid}`,
          zhName: p?.name.zhHant ?? '',
          hits,
          hitPct: result.value.totalHits > 0 ? (hits / result.value.totalHits) * 100 : 0,
          basePrice: p?.basePricePerUnit ?? 0,
          group: p?.groupName?.zhHant ?? p?.groupName?.en ?? '',
        }
      })
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 20)
  }, [result])

  const missedRows = useMemo(() => {
    if (!result) return []
    return Array.from(result.value.missedSales.entries())
      .map(([pid, missed]) => {
        const p = productById.get(pid) as Product | undefined
        return {
          pid,
          name: p?.name.en ?? `#${pid}`,
          zhName: p?.name.zhHant ?? '',
          missed,
          basePrice: p?.basePricePerUnit ?? 0,
          lostRevenue: missed * (p?.basePricePerUnit ?? 0),
          group: p?.groupName?.zhHant ?? p?.groupName?.en ?? '',
        }
      })
      .sort((a, b) => b.lostRevenue - a.lostRevenue)
      .slice(0, 20)
  }, [result])

  const missedByGroup = useMemo(() => {
    if (!result) return []
    const groups: Record<string, number> = {}
    for (const [pid, missed] of result.value.missedSales.entries()) {
      const p = productById.get(pid) as Product | undefined
      const g = p?.groupName?.zhHant ?? p?.groupName?.en ?? '其他'
      groups[g] = (groups[g] ?? 0) + missed
    }
    return Object.entries(groups)
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [result])

  const maxMissedGroup = Math.max(...missedByGroup.map((g) => g.count), 1)
  const maxHitsRow = Math.max(...productHitsRows.map((r) => r.hits), 1)
  const maxMissedRow = Math.max(...missedRows.map((r) => r.missed), 1)

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">顧客模擬器</h1>
        <p className="text-sm text-muted-foreground">
          以 58 種顧客類型 × 11 個 necessity 權重進行 Monte Carlo 模擬。所有輸出為 Proxy 等級，需實測驗證。
        </p>
      </div>

      {/* Top split: customer explorer + heatmap */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                顧客類型探索器
              </span>
              <Badge variant="outline" className="text-[10px]">{customerTypes.length} types</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin pr-1">
              {customerTypes.map((c) => {
                const isSelected = c.index === selectedCust
                const hasPremium = c.premiumIndexes.length > 0
                return (
                  <button
                    key={c.index}
                    onClick={() => setSelectedCust(c.index)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                      isSelected && 'border-primary bg-primary/5',
                    )}
                  >
                    <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      #{c.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          comp[{c.compensatedChances.join('/')}]
                        </span>
                        {hasPremium && (
                          <Badge variant="outline" className="h-3.5 px-1 text-[9px] text-fuchsia-600">
                            premium
                          </Badge>
                        )}
                      </div>
                      {/* 11-cell mini grid */}
                      <div className="mt-1 flex items-center gap-0.5">
                        {necessities.map((_, ni) => {
                          const w = c.necessitiesChances[ni] ?? 0
                          return (
                            <div
                              key={ni}
                              className="h-2 flex-1 rounded-sm"
                              style={{ backgroundColor: heatColor(w / maxCellWeight) }}
                              title={`nec[${ni}] = ${w}`}
                            />
                          )
                        })}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted-foreground" title={c.topSummary}>
                        {c.topSummary}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                Necessity × Customer 熱圖
              </span>
              <ConfidenceBadge
                confidence="confirmed"
                formula="weight = customerType.necessitiesChances[necIdx]"
                note="原始資料來自百科 customers.tsv"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scrollbar-thin">
              <div className="min-w-[680px]">
                {/* column headers: customer indexes */}
                <div
                  className="grid items-end gap-0.5 pl-[140px]"
                  style={{ gridTemplateColumns: `repeat(${customerTypes.length}, minmax(0, 1fr))` }}
                >
                  {customerTypes.map((c) => (
                    <div
                      key={c.index}
                      className={cn(
                        'truncate text-center font-mono text-[9px] text-muted-foreground',
                        c.index === selectedCust && 'font-bold text-primary',
                      )}
                      title={`Customer #${c.index} — ${c.topSummary}`}
                    >
                      {c.index}
                    </div>
                  ))}
                </div>
                {/* rows: 11 necessities */}
                {necessities.map((nec, ni) => (
                  <div key={nec.index} className="grid items-center gap-0.5" style={{ gridTemplateColumns: `140px repeat(${customerTypes.length}, minmax(0, 1fr))` }}>
                    <div className="truncate pr-2 text-right text-[10px] text-muted-foreground" title={nec.name.zhHant}>
                      {nec.name.zhHant}
                    </div>
                    {customerTypes.map((c) => {
                      const w = c.necessitiesChances[ni] ?? 0
                      const isSel = c.index === selectedCust
                      return (
                        <div
                          key={c.index}
                          onClick={() => setSelectedCust(c.index)}
                          className={cn(
                            'm-0.5 h-4 cursor-pointer rounded-sm border border-transparent transition-all hover:border-primary',
                            isSel && 'ring-1 ring-primary',
                          )}
                          style={{ backgroundColor: heatColor(w / maxCellWeight) }}
                          title={`cust#${c.index} × nec[${ni}] ${nec.name.en} = ${w}`}
                        />
                      )
                    })}
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>低</span>
                  <div className="h-2 flex-1 rounded-sm" style={{ background: 'linear-gradient(to right, transparent, rgba(16,185,129,1))' }} />
                  <span>高 (weight=1.0)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected customer detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            顧客 #{selectedCust} 詳情 · Top Necessities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-2">
              <span className="text-muted-foreground">compensatedChances:</span>{' '}
              <span className="font-mono">{selectedCustomer.compensatedChances.join(', ')}</span>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
              <span className="text-muted-foreground">premiumIndexes:</span>{' '}
              <span className="font-mono">
                {selectedCustomer.premiumIndexes.length > 0
                  ? selectedCustomer.premiumIndexes.join(', ')
                  : '(none)'}
              </span>
            </div>
            <div className="rounded-md border bg-muted/30 p-2 sm:col-span-2">
              <span className="text-muted-foreground">topSummary:</span>{' '}
              <span className="font-mono">{selectedCustomer.topSummary}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topNecessities.map(({ nec, idx, weight }) => (
              <div key={idx} className="rounded-md border bg-card p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium" title={nec.name.en}>
                    [{idx}] {nec.name.zhHant}
                  </span>
                  <span className="font-mono text-xs tabular-nums">{weight.toFixed(3)}</span>
                </div>
                <div className="mt-1">
                  <MiniBar value={weight} max={maxNecWeight} color="bg-emerald-500" />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {nec.productIds.length} unique products · {nec.rawTokens.length} raw tokens
                </div>
              </div>
            ))}
            {topNecessities.length === 0 && (
              <div className="col-span-full py-4 text-center text-sm text-muted-foreground">
                此顧客類型沒有非零 necessity 權重
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                <Label className="text-xs">店內現貨集合</Label>
                <Tabs value={stockedMode} onValueChange={(v) => setStockedMode(v as 'all' | 'from-save' | 'none')}>
                  <TabsList className="mt-1 h-7">
                    <TabsTrigger value="all" className="text-[11px]">全部商品</TabsTrigger>
                    <TabsTrigger value="from-save" className="text-[11px]">來自存檔</TabsTrigger>
                    <TabsTrigger value="none" className="text-[11px]">無（看漏單）</TabsTrigger>
                  </TabsList>
                </Tabs>
                {stockedMode === 'from-save' && !snapshot && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertCircle className="h-3 w-3" /> 尚未載入存檔，將以空集合計算
                  </div>
                )}
                {stockedMode === 'from-save' && snapshot && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    偵測到 {Object.values(snapshot.inventoryByProduct).filter((c) => (c as number) > 0).length} 項有庫存商品
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
      {result && <OutputPanel result={result.value} formula={result.formula} note={result.note} productHitsRows={productHitsRows} missedRows={missedRows} missedByGroup={missedByGroup} maxHitsRow={maxHitsRow} maxMissedRow={maxMissedRow} maxMissedGroup={maxMissedGroup} onSelectProduct={(id) => { setSelectedProduct(id); setView('wiki') }} />}
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
  productHitsRows: Array<{ pid: number; name: string; zhName: string; hits: number; hitPct: number; basePrice: number; group: string }>
  missedRows: Array<{ pid: number; name: string; zhName: string; missed: number; basePrice: number; lostRevenue: number; group: string }>
  missedByGroup: Array<{ group: string; count: number }>
  maxHitsRow: number
  maxMissedRow: number
  maxMissedGroup: number
  onSelectProduct: (id: number) => void
}) {
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
                  subtitle={`#${r.pid} · ${r.zhName} · $${r.basePrice.toFixed(2)} · ${r.group}`}
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
                  subtitle={`#${r.pid} · ${r.zhName} · ${r.group} · ${r.missed} 次漏單`}
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
                  title={r.name}
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
