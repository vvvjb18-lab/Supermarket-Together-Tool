'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { productById } from '@/lib/data-loader'
import {
  computeRestockPlan,
  computeDemandPerVisit,
  estimateDailyCustomers,
  computeSmartInventory,
  type RestockStrategy,
  type RestockRecommendation,
  type StockStatus,
} from '@/lib/engine'
import { useSaveStore, useRoomStore } from '@/lib/store'
import type { RestockItem, Product } from '@/lib/types'
import {
  useLang,
  productNameFor,
  groupIdNameFor,
  seasonIdNameFor,
} from '@/lib/i18n'
import type { Lang } from '@/lib/store'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  Calculator,
  Upload,
  AlertTriangle,
  Eye,
  FileJson,
  FileText,
  Share2,
  ChevronDown,
  ShoppingCart,
  Users,
  Receipt,
  Boxes,
} from 'lucide-react'

/**
 * Per-visit demand threshold for "high demand" in the detection panel.
 * demandPerVisit ≈ expected units sold per customer visit. The distribution
 * tops out around 0.044 and ~128/339 products exceed 0.01; 0.02 selects the
 * genuinely top tier (≈ "sells in ≥1 of every 50 customer visits").
 */
const HIGH_DEMAND_THRESHOLD = 0.02

const STOCK_STATUS_META: Record<StockStatus, { label: string; color: string; bar: string }> = {
  critical: { label: '急缺', color: 'text-rose-600', bar: 'bg-rose-500' },
  low: { label: '偏低', color: 'text-amber-600', bar: 'bg-amber-500' },
  healthy: { label: '健康', color: 'text-emerald-600', bar: 'bg-emerald-500' },
  overstocked: { label: '過量', color: 'text-sky-600', bar: 'bg-sky-500' },
  dead: { label: '滯銷', color: 'text-zinc-500', bar: 'bg-zinc-400' },
}

const STRATEGIES: { id: RestockStrategy; label: string; desc: string }[] = [
  { id: 'balanced', label: '均衡', desc: '綜合考量，最全面的選擇' },
  { id: 'demand-coverage', label: '補需求', desc: '需求越高的商品越先買' },
  { id: 'high-profit', label: '高利潤', desc: '挑最賺錢的商品買' },
  { id: 'high-density', label: '高密度', desc: '佔空間小、價值高的先買' },
  { id: 'premium-push', label: '衝高價', desc: '優先買高價 3C 商品' },
  { id: 'seasonal-prep', label: '當季備貨', desc: '只買當季商品' },
  { id: 'early-game-cheap-fill', label: '平價填充', desc: '買便宜貨補滿貨架' },
]

// ============================================================
// Helpers
// ============================================================

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildMarkdown(
  strategy: RestockStrategy,
  budget: number,
  recs: RestockRecommendation[],
  formula: string,
  snapshotLabel: string,
  lang: Lang,
  note?: string,
): string {
  const totalCost = recs.reduce((s, r) => s + r.costEstimate, 0)
  const totalUnits = recs.reduce((s, r) => s + r.units, 0)
  const totalRev = recs.reduce((s, r) => s + r.revenueProxy, 0)
  const roi = totalCost > 0 ? (totalRev / totalCost).toFixed(2) : '—'
  let md = '# Supermarket Together — 補貨計畫\n\n'
  md += `生成時間: ${new Date().toISOString()}\n`
  md += `存檔來源: ${snapshotLabel}\n`
  md += `策略: ${strategy}\n`
  md += `預算: $${budget}\n\n`
  md += `## 統計\n\n- 總成本: $${totalCost.toFixed(2)}\n- 總單位: ${totalUnits}\n- 營收 Proxy: $${totalRev.toFixed(2)}\n- ROI Proxy: ${roi}×\n\n`
  md += `## 公式與信心\n\n\`${formula}\`\n\n`
  if (note) md += `> ${note}\n\n`
  md += `## 採購清單 (${recs.length} 項)\n\n`
  md += `| # | Product | ID | Boxes | Units | Cost | Revenue Proxy | Reason |\n|---|---|---|---|---|---|---|---|\n`
  recs.forEach((r, i) => {
    md += `| ${i + 1} | ${productNameFor(r.productId, lang)} | ${r.productId} | ${r.buyBoxes} | ${r.units} | $${r.costEstimate.toFixed(2)} | $${r.revenueProxy.toFixed(2)} | ${r.reason} |\n`
  })
  return md
}

function buildJson(recs: RestockRecommendation[], strategy: RestockStrategy, budget: number) {
  return JSON.stringify({ strategy, budget, generatedAt: new Date().toISOString(), recommendations: recs }, null, 2)
}

// ============================================================
// Main component
// ============================================================

export function Restock() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const room = useRoomStore((s) => s.room)
  const setRestockPlan = useRoomStore((s) => s.setRestockPlan)
  const lang = useLang()

  const [strategy, setStrategy] = useState<RestockStrategy>('balanced')
  const [budget, setBudget] = useState(5000)
  const [season, setSeason] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof computeRestockPlan> | null>(null)
  const [expandedDetection, setExpandedDetection] = useState<string | null>(null)

  // Detection: compute candidates
  const detection = useMemo(() => {
    if (!snapshot) return null
    const inv = snapshot.inventoryByProduct ?? {}
    const unlockedSet = new Set(snapshot.unlockedProducts ?? [])
    const demandOptions = {
      day: snapshot.day ?? 1,
      difficulty: snapshot.difficulty ?? 1,
      connections: Math.max(1, snapshot.playerSlots || 1),
    }
    const demandOf = (id: number) => computeDemandPerVisit(id, ENC.necessities, ENC.customerTypes, demandOptions).value

    const dailyCustomers = Math.max(1, estimateDailyCustomers(
      snapshot.day ?? 1,
      Math.max(1, snapshot.playerSlots || 1),
      snapshot.difficulty ?? 1,
    ).value)
    // low stock: positive inventory with less than one estimated day remaining.
    const lowStock = ENC.products
      .map((p) => {
        const count = (inv[p.id] as number) ?? 0
        const demand = demandOf(p.id)
        return { p, count, stockDays: demand > 1e-9 ? count / demand / dailyCustomers : Infinity }
      })
      .filter((x) => x.count > 0 && x.stockDays < 1)
      .sort((a, b) => a.count - b.count)
      .slice(0, 10)

    // negative / invalid inventory entries from storeLayout
    const negativeEntries: { propIndex: number; product: number; count: number }[] = []
    for (const prop of snapshot.storeLayout ?? []) {
      for (const e of prop.inventory) {
        if (e.count < 0) {
          negativeEntries.push({
            propIndex: prop.index,
            product: e.product,
            count: e.count,
          })
        }
      }
    }

    // unlocked but never stocked (count 0 or absent), ranked by demand
    const neverStocked = ENC.products
      .filter((p) => unlockedSet.has(p.id) && ((inv[p.id] as number) ?? 0) === 0)
      .map((p: Product) => ({ p, demand: demandOf(p.id) }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 10)

    // high demand absent = unlocked + count 0 + per-visit demand above a real
    // top-tier threshold. Computed over the FULL catalog (NOT derived from the
    // sliced `neverStocked` list) so the count matches the list.
    const highDemandAbsent = ENC.products
      .filter((p) => unlockedSet.has(p.id) && ((inv[p.id] as number) ?? 0) === 0)
      .map((p: Product) => ({ p, demand: demandOf(p.id) }))
      .filter((x) => x.demand > HIGH_DEMAND_THRESHOLD)
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 10)

    return {
      lowStockCount: ENC.products.filter((p) => {
        const c = (inv[p.id] as number) ?? 0
        const demand = demandOf(p.id)
        return c > 0 && demand > 1e-9 && c / demand / dailyCustomers < 1
      }).length,
      negativeCount: negativeEntries.length,
      neverStockedCount: ENC.products.filter(
        (p) => unlockedSet.has(p.id) && ((inv[p.id] as number) ?? 0) === 0,
      ).length,
      highDemandAbsentCount: ENC.products.filter((p) => {
        const c = (inv[p.id] as number) ?? 0
        return unlockedSet.has(p.id) && c === 0 && demandOf(p.id) > HIGH_DEMAND_THRESHOLD
      }).length,
      lowStock,
      negativeEntries,
      neverStocked,
      highDemandAbsent,
    }
  }, [snapshot])

  // Smart inventory: stock × per-visit demand → run-out horizon + dead stock.
  const smartInventory = useMemo(() => computeSmartInventory(snapshot), [snapshot])

  const compute = () => {
    const opts = strategy === 'seasonal-prep' ? { season } : {}
    const r = computeRestockPlan(snapshot, strategy, budget, opts)
    setResult(r)
    toast.success(`已計算 ${r.value.length} 項採購建議（${strategy}）`)
  }

  // Parse outstanding invoices from ES3 CurrentInvoicesArray
  const invoices = useMemo(() => {
    if (!snapshot?.invoices?.length) return []
    return snapshot.invoices.map((raw, i) => {
      const parts = raw.split('|')
      const toNum = (s: string | undefined) => Number((s ?? '0').replace(',', '.'))
      return {
        idx: i,
        invoiceId: parts[0] ?? String(i),
        amount: toNum(parts[1]),
        day: toNum(parts[2]),
        dueDay: toNum(parts[3]),
        flags: parts[4] ?? '',
        raw,
      }
    }).filter((inv) => inv.amount > 0)
  }, [snapshot])

  const totalInvoiceAmount = invoices.reduce((a, b) => a + b.amount, 0)

  const recs = result?.value ?? []
  const totalCost = recs.reduce((s, r) => s + r.costEstimate, 0)
  const totalUnits = recs.reduce((s, r) => s + r.units, 0)
  const totalRev = recs.reduce((s, r) => s + r.revenueProxy, 0)
  const roi = totalCost > 0 ? totalRev / totalCost : 0
  const snapshotLabel = snapshot
    ? `${snapshot.source} · Day ${snapshot.day}`
    : 'demo（無存檔）'

  const handleExportMd = () => {
    if (!result) return toast.warning('請先執行計算')
    const md = buildMarkdown(strategy, budget, recs, result.formula, snapshotLabel, lang, result.note)
    downloadBlob(`restock-plan-${strategy}-${Date.now()}.md`, md, 'text/markdown')
    toast.success('已下載 Markdown 報告')
  }
  const handleExportJson = () => {
    if (!result) return toast.warning('請先執行計算')
    downloadBlob(`restock-plan-${strategy}-${Date.now()}.json`, buildJson(recs, strategy, budget), 'application/json')
    toast.success('已下載 JSON')
  }

  const handleSyncRoom = () => {
    if (!room) return toast.warning('未加入任何房間')
    if (!result) return toast.warning('請先執行計算')
    const items: RestockItem[] = recs.map((r, i) => ({
      id: `r-${i}-${r.productId}`,
      productId: r.productId,
      boxes: r.buyBoxes,
      units: r.units,
      costEstimate: r.costEstimate,
      revenueProxy: r.revenueProxy,
      reason: r.reason,
      assignedTo: undefined,
    }))
    setRestockPlan(items)
    toast.success(`已同步 ${items.length} 項採購計畫到房間「${room.name}」`)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <SectionHeader
        level={1}
        title="補貨規劃"
        description="選策略、輸入預算，直接產生可買的採購清單。"
        right={!snapshot ? (
          <Button size="sm" onClick={() => { loadDemo(); toast.success('已載入 Demo 存檔') }}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> 試用 Demo
          </Button>
        ) : room ? (
          <Button variant="outline" size="sm" onClick={handleSyncRoom}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" /> 同步到房間
          </Button>
        ) : undefined}
      />

      {/* Snapshot status */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{snapshot ? snapshot.source : '未載入'}</Badge>
            <span className="text-muted-foreground">
              {snapshot
                ? `Day ${snapshot.day} · ${snapshot.unlockedProducts.length} 已解鎖 · ${Object.values(snapshot.inventoryByProduct).filter((c) => (c as number) > 0).length} 庫存品項`
                : '使用 demoSave 作為預設來源'}
            </span>
          </div>
          <ConfidenceBadge
            confidence={snapshot ? snapshot.confidence : 'demo'}
            formula="snapshot.inventoryByProduct + unlockedProducts"
            note={snapshot ? undefined : '未上傳存檔，將使用 demoSave'}
          />
        </CardContent>
      </Card>

      {/* Strategy + Budget + Compute */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" /> 產生採購清單
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
            <div>
              <Label className="text-xs">補貨策略</Label>
              <Select value={strategy} onValueChange={(value) => setStrategy(value as RestockStrategy)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label} · {item.desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="budget" className="text-xs">可用預算 ($)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                value={budget}
                onChange={(event) => setBudget(Math.max(0, Number(event.target.value) || 0))}
                className="mt-1"
              />
            </div>
            <Button onClick={compute} className="w-full sm:w-auto">
              <Calculator className="mr-1.5 h-4 w-4" /> 計算清單
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{STRATEGIES.find((item) => item.id === strategy)?.desc}</span>
            {strategy === 'seasonal-prep' && (
              <Select value={String(season)} onValueChange={(value) => setSeason(Number(value))}>
                <SelectTrigger className="h-8 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENC.seasons.map((item) => (
                    <SelectItem key={item.index} value={String(item.index)}>
                      {seasonIdNameFor(item.index, lang)} · {item.productIds.length} 件商品
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {result && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={handleExportMd}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> 匯出 Markdown
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson}>
                <FileJson className="mr-1.5 h-3.5 w-3.5" /> 匯出 JSON
              </Button>
              {room && (
                <Button variant="outline" size="sm" onClick={handleSyncRoom}>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> 同步到房間
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detection panel */}
      {detection && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-500" /> 偵測面板
              </span>
              <ConfidenceBadge confidence="proxy" formula="snapshot.inventoryByProduct + demandProxy thresholds" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetectionStat
                id="low"
                label="低庫存"
                sub="預估不足 1 天且 > 0"
                count={detection.lowStockCount}
                accent="warn"
                expanded={expandedDetection}
                setExpanded={setExpandedDetection}
              />
              <DetectionStat
                id="neg"
                label="負數/異常"
                sub="storeLayout 中 count<0"
                count={detection.negativeCount}
                accent="bad"
                expanded={expandedDetection}
                setExpanded={setExpandedDetection}
              />
              <DetectionStat
                id="never"
                label="解鎖未進貨"
                sub="已解鎖但無庫存"
                count={detection.neverStockedCount}
                accent="neutral"
                expanded={expandedDetection}
                setExpanded={setExpandedDetection}
              />
              <DetectionStat
                id="high"
                label="高需求缺貨"
                sub="per-visit demand>0.02 且 count=0"
                count={detection.highDemandAbsentCount}
                accent="bad"
                expanded={expandedDetection}
                setExpanded={setExpandedDetection}
              />
            </div>

            {/* Expandable lists */}
            {expandedDetection === 'low' && (
              <DetectionList title="低庫存（Top 10）">
                {detection.lowStock.map((x) => (
                  <DataRow
                    key={x.p.id}
                    title={productNameFor(x.p.id, lang)}
                    subtitle={`#${x.p.id} · ${groupIdNameFor(x.p.group ?? 0, lang)}`}
                    right={<Badge variant="outline" className="text-[10px] text-amber-600">stock {x.count}</Badge>}
                  />
                ))}
                {detection.lowStock.length === 0 && <EmptyList />}
              </DetectionList>
            )}
            {expandedDetection === 'neg' && (
              <DetectionList title="負數/異常庫存條目">
                {detection.negativeEntries.map((x, i) => (
                  <DataRow
                    key={i}
                    index={i + 1}
                    title={productNameFor(x.product, lang)}
                    subtitle={`prop#${x.propIndex} · product #${x.product}`}
                    right={<Badge variant="outline" className="text-[10px] text-rose-600">count {x.count}</Badge>}
                  />
                ))}
                {detection.negativeEntries.length === 0 && <EmptyList />}
              </DetectionList>
            )}
            {expandedDetection === 'never' && (
              <DetectionList title="解鎖未進貨（依 demand 排序 Top 10）">
                {detection.neverStocked.map((x) => (
                  <DataRow
                    key={x.p.id}
                    title={productNameFor(x.p.id, lang)}
                    subtitle={`#${x.p.id} · tier ${x.p.tier} · per-visit ${x.demand.toFixed(5)}`}
                    right={
                      <div className="flex w-24 flex-col items-end gap-0.5">
                        <span className="font-mono text-[10px]">{x.demand.toFixed(5)}</span>
                        <MiniBar value={x.demand} max={detection.neverStocked[0]?.demand ?? 1} color="bg-zinc-400" />
                      </div>
                    }
                  />
                ))}
                {detection.neverStocked.length === 0 && <EmptyList />}
              </DetectionList>
            )}
            {expandedDetection === 'high' && (
              <DetectionList title="高需求缺貨（Top 10）">
                {detection.highDemandAbsent.map((x) => (
                  <DataRow
                    key={x.p.id}
                    title={productNameFor(x.p.id, lang)}
                    subtitle={`#${x.p.id} · tier ${x.p.tier} · per-visit ${x.demand.toFixed(5)}`}
                    right={
                      <div className="flex w-24 flex-col items-end gap-0.5">
                        <span className="font-mono text-[10px] text-rose-600">{x.demand.toFixed(5)}</span>
                        <MiniBar value={x.demand} max={detection.highDemandAbsent[0]?.demand ?? 1} color="bg-rose-500" />
                      </div>
                    }
                  />
                ))}
                {detection.highDemandAbsent.length === 0 && <EmptyList />}
              </DetectionList>
            )}
          </CardContent>
        </Card>
      )}

      {/* Smart inventory panel */}
      {smartInventory && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" /> 智能庫存面板
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="daysRemaining = current / demandPerVisit / estimatedDailyCustomers（Day/難度/連線動態）"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* summary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label="總件數"
                value={smartInventory.totalUnits.toLocaleString()}
                confidence="confirmed"
                formula="Σ count"
                accent="neutral"
              />
              <StatCard
                label="庫存品項"
                value={smartInventory.distinctProducts.toLocaleString()}
                confidence="confirmed"
                formula="count>0 的商品數"
                accent="neutral"
              />
              <StatCard
                label="庫存市值"
                value={fmtMoney(smartInventory.totalMarketValue)}
                confidence="confirmed"
                formula="Σ count × marketPrice（count 準確、marketPrice=base×tierInflation 已確認）"
                accent="good"
              />
              <StatCard
                label="滯銷品項"
                value={smartInventory.counts.dead.toLocaleString()}
                confidence="proxy"
                formula="demandPerVisit≈0 且有庫存"
                accent={smartInventory.counts.dead > 0 ? 'warn' : 'neutral'}
              />
            </div>

            {/* status buckets */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STOCK_STATUS_META) as StockStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px]">
                  <span className={`h-2 w-2 rounded-full ${STOCK_STATUS_META[s].bar}`} />
                  <span className="text-muted-foreground">{STOCK_STATUS_META[s].label}</span>
                  <span className={`font-bold tabular-nums ${STOCK_STATUS_META[s].color}`}>
                    {smartInventory.counts[s]}
                  </span>
                </div>
              ))}
            </div>

            {/* two lists */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold">最急補貨（預估剩餘天數最少）</div>
                <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                  {smartInventory.topUrgent.map((it) => (
                    <DataRow
                      key={it.productId}
                      title={productNameFor(it.productId, lang)}
                      subtitle={`stock ${it.current} · 每客需求 ${it.demandPerVisit.toFixed(5)}`}
                      right={
                        <Badge variant="outline" className="text-[10px] text-rose-600">
                          ≈{Number.isFinite(it.daysRemaining) ? it.daysRemaining.toFixed(2) : '∞'} 天
                        </Badge>
                      }
                    />
                  ))}
                  {smartInventory.topUrgent.length === 0 && <EmptyList />}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold">滯銷庫存（無需求仍佔倉）</div>
                <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                  {smartInventory.deadStock.map((it) => (
                    <DataRow
                      key={it.productId}
                      title={productNameFor(it.productId, lang)}
                      subtitle={`stock ${it.current} · 市值 ${fmtMoney(it.marketValue)}`}
                      right={<Badge variant="outline" className="text-[10px] text-zinc-500">dead</Badge>}
                    />
                  ))}
                  {smartInventory.deadStock.length === 0 && <EmptyList />}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <>
          <SectionHeader
            title="採購清單"
            description={result.note}
            confidence={result.confidence}
            formula={result.formula}
          />

          {/* Totals row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="總成本"
              value={fmtMoney(totalCost)}
              hint={`預算 ${fmtMoney(budget)}`}
              confidence="proxy"
              formula="Σ costEstimate"
              accent={totalCost > budget ? 'bad' : 'neutral'}
            />
            <StatCard
              label="總單位"
              value={totalUnits.toLocaleString()}
              confidence="proxy"
              formula="Σ units = Σ boxes × maxItemsPerBox"
              accent="neutral"
            />
            <StatCard
              label="營收 Proxy"
              value={fmtMoney(totalRev)}
              confidence="proxy"
              formula="Σ demandProxy × units × basePrice"
              accent="good"
            />
            <StatCard
              label="ROI Proxy"
              value={fmt(roi, 2)}
              unit="×"
              hint={roi > 1 ? '正報酬' : '負報酬'}
              confidence="proxy"
              formula="revenueProxy / totalCost"
              accent={roi > 1 ? 'good' : 'bad'}
            />
          </div>

          {/* Shopping list table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" /> 採購清單 ({recs.length} 項)
                </span>
                {room && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Users className="h-3 w-3" /> 房間模式可指派
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[60vh] overflow-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b text-left">
                      <th className="p-2">#</th>
                      <th className="p-2">商品</th>
                      <th className="p-2 text-right">Boxes</th>
                      <th className="p-2 text-right">Units</th>
                      <th className="p-2 text-right">成本</th>
                      <th className="p-2 text-right">營收 Proxy</th>
                      <th className="p-2">原因</th>
                      {room && <th className="p-2">指派</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {recs.map((r, i) => {
                      const p = productById.get(r.productId) as Product | undefined
                      return (
                        <tr key={r.productId} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <div className="font-medium">{productNameFor(r.productId, lang)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              #{r.productId} · tier {p?.tier ?? '-'}
                            </div>
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums">{r.buyBoxes}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{r.units}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmtMoney(r.costEstimate)}</td>
                          <td className="p-2 text-right font-mono tabular-nums text-emerald-600">{fmtMoney(r.revenueProxy)}</td>
                          <td className="p-2 text-[10px] text-muted-foreground">{r.reason}</td>
                          {room && (
                            <td className="p-2">
                              <Select>
                                <SelectTrigger className="h-7 w-24 text-[10px]">
                                  <SelectValue placeholder="指派" />
                                </SelectTrigger>
                                <SelectContent>
                                  {room.members.filter((m) => m.id).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-muted/80 font-medium">
                    <tr>
                      <td colSpan={2} className="p-2">合計</td>
                      <td className="p-2 text-right font-mono tabular-nums">{recs.reduce((s, r) => s + r.buyBoxes, 0)}</td>
                      <td className="p-2 text-right font-mono tabular-nums">{totalUnits.toLocaleString()}</td>
                      <td className="p-2 text-right font-mono tabular-nums">{fmtMoney(totalCost)}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-emerald-600">{fmtMoney(totalRev)}</td>
                      <td className="p-2 text-[10px] text-muted-foreground">ROI {fmt(roi, 2)}×</td>
                      {room && <td className="p-2" />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function DetectionStat({
  id,
  label,
  sub,
  count,
  accent,
  expanded,
  setExpanded,
}: {
  id: string
  label: string
  sub: string
  count: number
  accent: 'warn' | 'bad' | 'neutral'
  expanded: string | null
  setExpanded: (s: string | null) => void
}) {
  const accentClass =
    accent === 'bad' ? 'border-rose-500/40 text-rose-600'
    : accent === 'warn' ? 'border-amber-500/40 text-amber-600'
    : 'border-zinc-400/40 text-zinc-600'
  const isExpanded = expanded === id
  return (
    <button
      onClick={() => setExpanded(isExpanded ? null : id)}
      className={cn(
        'rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent',
        accentClass,
        isExpanded && 'ring-1 ring-primary',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        {count > 0 && <AlertTriangle className="h-3 w-3" />}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{count}</div>
      <div className="mt-0.5 text-[10px] opacity-80">{sub}</div>
    </button>
  )
}

function DetectionList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible open className="mt-3">
      <CollapsibleTrigger className="mb-1 flex items-center gap-1 text-xs font-semibold">
        <ChevronDown className="h-3 w-3" /> {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin pr-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function EmptyList() {
  return <div className="py-4 text-center text-xs text-muted-foreground">無符合條件項目</div>
}
