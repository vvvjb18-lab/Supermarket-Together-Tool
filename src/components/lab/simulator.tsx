'use client'

import { useMemo, useState } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { productById } from '@/lib/data-loader'
import { simulateCustomers, maxProductsCustomersToBuy, type SimulationConfig } from '@/lib/engine'
import { useSaveStore, useUIStore } from '@/lib/store'
import type { Product, Confidence } from '@/lib/types'
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
  Workflow,
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
// 顧客行為流程圖資料 (5 步驟, 對應真實 IL 演算法)
// ============================================================

interface FlowStep {
  title: string
  confidence: Confidence
  formula: string
  details: string[]
  source: string
  sim: '已實現' | '部分實現' | '未實現'
  simNote: string
  accent: string
}

const FLOW_STEPS: FlowStep[] = [
  {
    title: '① 生成顧客 (Spawn)',
    confidence: 'confirmed',
    formula: 'maxCustomersNPCs = 5（店內同時最多 5 位 NPC 顧客）',
    details: [
      'bystanderToCustomerChance = 0.66：每位路人 66% 機率轉成顧客進店',
      'maxDummyNPCs = 10：店外最多同時有 10 位路人（可轉顧客的候選池）',
      'maxCustomersNPCs = 5：店內同時最多 5 位顧客，滿了才輪下一批',
      '營業時間 openHour 8.05 → closeHour 22；timeFactor = 50（遊戲內時間流速）',
      'skill42「說服技巧」：用滅火器把路人推進店內，33% 機率轉成顧客',
      'skill5「空調」/ skill6「Wifi」：各 +1 extraCustomersPerk（每日額外客流）',
      'skill38「托盤展示」：解鎖 convertBystandersTriggerOBJ（路人轉顧客 perk）',
      '佈局加成 extraLayoutCustomersFactor = 5；天氣 extraWeatherCustomers 額外加客',
      '58 種顧客類型，每種各有 necessitiesChances[11] + compensatedChances[3] + premiumIndexes',
    ],
    source: 'Game Tuning 常數 + 百科 customers.tsv',
    sim: '部分實現',
    simNote: '模擬器假設 58 種等機率生成；真實進店頻率 / 路人轉換率未在模擬器內模擬',
    accent: 'bg-sky-500',
  },
  {
    title: '② 生成購物清單 (GenerateCompensatedList)',
    confidence: 'confirmed',
    formula: '件數 k = Random.Range(2 + difficulty, maxProductsCustomersToBuy) ｜ maxProductsCustomersToBuy = clamp(5 + day/2 + conn + difficulty, 5, 25 + conn + difficulty)',
    details: [
      'Unity int Random.Range 上界 exclusive：difficulty=1 且 day=1 → maxProducts=7 → k ∈ {3,4,5,6}；開門時會重算上限（不是 .ctor 固定 5），難度與天數越高買越多（Day35 難度5 → 每客 7~27 件）',
      '每「件」獨立按 compensatedChances = [random, necessity, premium] 加權抽來源模式（不是每顧客固定一個模式）',
      'compensatedChances 結構：random 權重幾乎恆為 1；necessity 0.1~1；premium 0~0.25（只有部分顧客會抽 premium）',
      'mode 0 = random：從「全部已解鎖商品」均勻抽一件',
      'mode 1 = necessity：先按 necessitiesChances[11] 加權抽一個品類，再從該品類 rawTokens 均勻抽一件',
      'necessity 特例：necessity[9] = "4-4-4-4-4"（鹽重複 5 次）→ 抽到品類 9 只會買鹽',
      'mode 2 = premium：從該顧客 premiumIndexes（7 個 premium 商品 ID 的子集）均勻抽一件',
    ],
    source: 'IL 提取（GenerateCompensatedList）+ necessityMapping',
    sim: '已實現',
    simNote: '件數 + 三種來源模式皆已實作；necessity 池可切換 raw / unique',
    accent: 'bg-indigo-500',
  },
  {
    title: '③ 拿貨 (Pick from shelves)',
    confidence: 'proxy',
    formula: '只拿「已解鎖 + 有現貨(count>0)」的商品',
    details: [
      '解鎖由 unlockedProducts / unlockedProductTiers 決定',
      '缺貨（已解鎖但 count=0）→ 漏單，該件不買（計入 nFoundProducts 未命中）',
      '貨架容量 maxProductsPerShelfRow = 100；shelfOffsetFactor = 1.1（貨架擺放偏移）',
      '真實拿貨路徑（是否轉向替代商品 / 貨架走位 / 找不到就放棄的距離邏輯）尚未從 IL 驗證',
    ],
    source: 'proxy — 真實拿貨/轉向行為未提取',
    sim: '已實現',
    simNote: '用 unlockedProductIds + stockedProductIds 雙重過濾；「依存檔」模式可直接看漏單',
    accent: 'bg-emerald-500',
  },
  {
    title: '④ 結帳定價 / 投訴 (CustomerNPCControl)',
    confidence: 'confirmed',
    formula: '投訴門檻 = market × Random.Range(2.01, 2.5)',
    details: [
      'market = basePricePerUnit × tierInflation[tier]（17 個 tier 1.13~1.59，其餘 1.0）',
      '玩家定價 productPlayerPricing[pid] > 門檻 → 加入 AddExpensiveList（投訴）＋不買；否則結帳購買',
      '0 投訴保證價 = 2.01 × market（設 201%）；2.25× ≈ 50% 接受、2.5× ≈ 100% 投訴',
      '容忍度是「每位顧客每次結帳」重新 roll 的隨機區間 [2.01, 2.5]，非固定',
      '特價折扣在投訴判斷「之後」才套用 → 特價無法壓低投訴',
      '定價百分比 clamp [10, 500]；AcceptPercentage 價 = market × (pct/100)，依 roundPricesDown 向下取整',
      '結帳流程受 counterLimit=150 與收銀員 productCheckoutWait=0.75 / 自助結帳 wait 1.1~2.25 影響速度',
    ],
    source: 'IL 提取（CustomerNPCControl / PricingMachine.ShowPriceInfo）',
    sim: '未實現',
    simNote: '模擬器不看 productPlayerPricing；要納入需讀存檔定價 + tierInflation 算市價',
    accent: 'bg-rose-500',
  },
  {
    title: '⑤ 特價衝動購買 (ExtraProductsOnSaleToAdd)',
    confidence: 'confirmed',
    formula: '成交機率 = saleCurve(clamp(basePricePerUnit,0,199))/100 + 0.01×(discount/5)',
    details: [
      'discount clamp [5,45]；discount/5 是整數除法 → 5%→+1%、…、45%→+9%（每 5% 一階）',
      'Random.value < 機率 → 才把該特價品加進購物清單（衝動購買）',
      '折扣只 +1%~9% 機率，卻吃掉 5~45% 毛利 → 最小折扣 5% 最賺',
      '低價品（saleCurve 接近 1）在 5% 特價時幾乎必觸發衝動購買',
      'skill21「更多咖啡」：selfcheckoutExtraProductsFromPerk += 4（自助結帳額外推銷）',
      'saleCurve 是場景 AnimationCurve 資產（非 DLL），關鍵 frame 尚待 UnityPy 提取',
    ],
    source: 'IL 提取（ExtraProductsOnSaleToAdd）',
    sim: '未實現',
    simNote: '衝動購買未納入；公式已提取，但 curve 數值待補齊',
    accent: 'bg-amber-500',
  },
]

const FLOW_CONSTANTS: { k: string; v: string; note: string }[] = [
  { k: 'maxCustomersNPCs', v: 'clamp(3+day+…)', note: '開門重算：店內同時 NPC 上限（Day35 單人=48）' },
  { k: 'maxDummyNPCs', v: '10', note: '店外路人候選池' },
  { k: 'maxProductsCustomersToBuy', v: 'clamp(5+day/2+conn+難度, 5, 25+conn+難度)', note: '開門重算：每顧客件數上界（Day35=28）' },
  { k: 'bystanderToCustomerChance', v: '0.66', note: '路人轉顧客機率' },
  { k: '投訴門檻', v: 'Random(2.01, 2.5)', note: '市價 × 此值' },
  { k: '特價折扣 clamp', v: '[5, 45]%', note: '衝動購買折扣範圍' },
  { k: '衝動加成', v: '+0.01×(discount/5)', note: '整數除法' },
  { k: 'tierInflation', v: '1.13~1.59', note: '17 tier 有加價，其餘 1.0' },
  { k: 'premium 商品', v: '173/175/186/287/296/297/299', note: '7 個 premium ID' },
  { k: '營業時間', v: '8.05 ~ 22.50', note: 'openHour / closeHour' },
  { k: 'counterLimit', v: '150', note: '結帳計數上限' },
  { k: 'timeFactor', v: '開門 1 / 關門 50', note: '1 遊戲小時 = 60 真實秒（開門時）' },
]

// ============================================================
// Main component
// ============================================================

export function Simulator() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const setView = useUIStore((s) => s.setView)

  // Top-level tab: customer view / necessity view / simulator
  const [tab, setTab] = useState<'customer' | 'necessity' | 'sim' | 'flow'>('customer')

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
      difficulty: snapshot?.difficulty ?? 1,
      day: snapshot?.day ?? 1,
      connections: 1,
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
          <TabsTrigger value="flow" className="text-xs sm:text-sm">
            <Workflow className="mr-1.5 h-3.5 w-3.5" />行為流程
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={runSimulation} size="sm">
                  <Play className="mr-1.5 h-3.5 w-3.5" /> 執行模擬
                </Button>
                {result && (
                  <Badge variant="outline" className="text-[10px]">
                    已執行 N={result.value.totalCustomers.toLocaleString()}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  難度 {snapshot?.difficulty ?? 1} · Day {snapshot?.day ?? 1} → 每顧客{' '}
                  {Math.min(2 + (snapshot?.difficulty ?? 1), maxProductsCustomersToBuy(snapshot?.day ?? 1, 1, snapshot?.difficulty ?? 1))}~
                  {maxProductsCustomersToBuy(snapshot?.day ?? 1, 1, snapshot?.difficulty ?? 1) - 1} 件
                </span>
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

        {/* ============== Tab D: 行為流程 ============== */}
        <TabsContent value="flow" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="h-4 w-4 text-primary" /> 顧客/NPC 行為完整算法流程
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                從生成到結帳的 5 個階段，每步標註真實公式（IL / Game Tuning 提取）與模擬器實作程度。
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {FLOW_STEPS.map((step, i) => {
                  const simColor =
                    step.sim === '已實現'
                      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                      : step.sim === '部分實現'
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-700 border-rose-500/30'
                  return (
                    <div key={step.title} className="relative flex gap-3 pb-5">
                      {/* vertical connector */}
                      {i < FLOW_STEPS.length - 1 && (
                        <div className="absolute left-4 top-9 h-[calc(100%-2.25rem)] w-px bg-border" />
                      )}
                      {/* number circle */}
                      <div
                        className={cn(
                          'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm',
                          step.accent,
                        )}
                      >
                        {i + 1}
                      </div>
                      {/* step card */}
                      <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{step.title}</span>
                          <ConfidenceBadge confidence={step.confidence} formula={step.formula} />
                          <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium', simColor)}>
                            {step.sim}
                          </span>
                        </div>
                        <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
                          {step.formula}
                        </div>
                        <ul className="mt-2 space-y-1">
                          {step.details.map((d) => (
                            <li key={d} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 text-[11px] text-muted-foreground">{step.source}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">模擬器：</span>
                          {step.simNote}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-indigo-500" /> 關鍵常數（Game Tuning / IL 提取）
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                驅動以上 5 步的真實數值，全部來自反組譯常數或 Game Tuning 表。
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {FLOW_CONSTANTS.map((c) => (
                  <div key={c.k} className="rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">{c.k}</div>
                    <div className="mt-0.5 font-mono text-[12px] font-semibold text-foreground">{c.v}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{c.note}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-emerald-500" /> 一句話總結
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              每位顧客先由 <span className="font-mono text-foreground">66% 路人轉換</span> 進店，進店後先抽
              <span className="font-mono text-foreground">「要買幾件」= Random.Range(2+difficulty, maxProductsCustomersToBuy)</span>（開門時重算上限
              <span className="font-mono text-foreground">clamp(5+day/2+conn+difficulty, 5, 25+conn+difficulty)</span>，不是固定 5），然後「每一件」獨立 roll 一次
              <span className="font-mono text-foreground">compensatedChances[3]</span> 決定來源：隨機（全解鎖商品均勻抽）／按 11 品類需求加權／指定 premium 高價品。
              接著去貨架拿貨，<span className="text-foreground">缺貨就漏單</span>；結帳時若玩家定價超過
              <span className="font-mono text-foreground">市價 × Random(2.01, 2.5)</span> 就投訴不買；最後有
              <span className="font-mono text-foreground">特價</span> 時再額外 roll 一次衝動購買
              <span className="font-mono text-foreground">（saleCurve/100 + 0.01×(discount/5)，機率只 +1%~9% 卻吃掉 5~45% 毛利）</span>。
              模擬器已實作前 3 步（生成→清單→拿貨），定價投訴與特價衝動尚未納入。
            </CardContent>
          </Card>
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

        {/* Lowest-demand products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Box className="h-4 w-4 text-amber-500" /> 最低需求商品 Top 10
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="demandPerVisit 升冪排序，取最低 10"
                note="幾乎沒有顧客會買的商品，適合別囤貨"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {result.topLowDemand.map((r, i) => (
                <DataRow
                  key={r.productId}
                  index={i + 1}
                  title={productNameFor(r.productId, lang)}
                  subtitle={`#${r.productId} · demand ${r.demand.toExponential(3)}/visit`}
                  right={<Badge variant="outline" className="text-[10px] text-amber-600">low demand</Badge>}
                  onClick={() => onSelectProduct(r.productId)}
                />
              ))}
              {result.topLowDemand.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">無低需求品項</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
