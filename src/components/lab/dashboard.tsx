'use client'

import { useMemo } from 'react'
import { useSaveStore, useUIStore } from '@/lib/store'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useLang, productNameFor } from '@/lib/i18n'
import {
  computeDashboardScores,
  computeDemandProxy,
  computeDemandPerVisit,
  computeMarketPrice,
  computeBoxValue,
  computeColliderVolume,
  computeValueDensity,
  computeShelfEfficiency,
  computeNecessityCoverage,
} from '@/lib/engine'
import {
  ConfidenceBadge,
  StatCard,
  ScoreRing,
  SectionHeader,
  DataRow,
  MiniBar,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, AlertTriangle, TrendingUp, TrendingDown, PackageX, Lightbulb, ArrowRight, Store, Coins, Calendar, Heart, Banknote, Layers, Users, Boxes, Palette } from 'lucide-react'

export function Dashboard() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const demandOptions = useMemo(() => ({
    day: snapshot?.day ?? 1,
    difficulty: snapshot?.difficulty ?? 1,
    connections: Math.max(1, snapshot?.playerSlots || 1),
  }), [snapshot])

  const scores = useMemo(() => computeDashboardScores(snapshot), [snapshot])

  // top 10 urgent restocks
  const urgentRestocks = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    return ENC.products
      .filter((p) => (inv[p.id] as number) !== undefined || Object.keys(inv).length === 0)
      .map((p) => {
        // v2.0: use per-visit demand (multiplies by compensatedChances sum)
        const demand = computeDemandPerVisit(p.id, ENC.necessities, ENC.customerTypes, demandOptions).value
        const current = (inv[p.id] as number) ?? 0
        // urgency = demand * (current < 10 ? 5 : 1) + (current === 0 && demand > 0.001 ? 2 : 0)
        // 5 = "critically low" multiplier (<10 units, ~1 day of stock)
        // 2 = "out of stock" boost (lost sales until restock)
        const urgency =
          demand * (current < 10 ? 5 : 1) + (current === 0 && demand > 0.001 ? 2 : 0)
        return { p, demand, current, urgency, label: productNameFor(p.id, lang) }
      })
      .filter((x) => x.urgency > 0)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 10)
  }, [snapshot, lang, demandOptions])

  // top 10 wasted shelf slots (low demand, high inventory)
  const wastedSlots = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    if (Object.keys(inv).length === 0) {
      // demo: find low-demand products
      return ENC.products
        .map((p) => ({
          p,
          demand: computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value,
          units: 0,
          label: productNameFor(p.id, lang),
        }))
        .filter((x) => x.demand < 0.0002)
        .sort((a, b) => a.demand - b.demand)
        .slice(0, 10)
    }
    return ENC.products
      .map((p) => {
        const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
        const units = (inv[p.id] as number) ?? 0
        return { p, demand, units, label: productNameFor(p.id, lang) }
      })
      .filter((x) => x.units > 0 && x.demand < 0.001)
      .sort((a, b) => b.units - a.units)
      .slice(0, 10)
  }, [snapshot, lang, demandOptions])

  // top 10 high-value unlock opportunities (products you have NOT unlocked yet)
  const opportunities = useMemo(() => {
    const unlocked = new Set(snapshot?.unlockedProducts ?? ENC.products.map((p) => p.id))
    return ENC.products
      .filter((p) => !unlocked.has(p.id))
      .map((p) => {
        const box = computeBoxValue(p).value
        const vol = computeColliderVolume(p).value
        const density = computeValueDensity(p).value
        // v2.0: use per-visit demand so the score reflects "real sales potential"
        const demand = computeDemandPerVisit(p.id, ENC.necessities, ENC.customerTypes, demandOptions).value
        const market = computeMarketPrice(p).value
        // score weights: 0.4 (box value) + 0.0001 (density) + 0.6 (demand×box)
        // 0.0001 normalizes $/u³ values (typically 1e3-1e5) to similar scale
        const score = box * 0.4 + density * 0.0001 + demand * box * 0.6
        return { p, box, density, demand, market, score, label: productNameFor(p.id, lang) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [snapshot, lang, demandOptions])

  // top 10 likely missed sales (high demand, not stocked)
  const missedSales = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    const stocked = new Set(
      Object.entries(inv)
        .filter(([, c]) => (c as number) > 0)
        .map(([id]) => Number(id)),
    )
    // only count products the player can actually sell (unlocked). A locked
    // product is an unlock opportunity, not a missed sale.
    const unlocked = new Set(snapshot?.unlockedProducts ?? ENC.products.map((p) => p.id))
    return ENC.products
      .filter((p) => unlocked.has(p.id) && !stocked.has(p.id))
      .map((p) => ({
        p,
        demand: computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value,
        box: computeBoxValue(p).value,
        label: productNameFor(p.id, lang),
      }))
      .filter((x) => x.demand > 0.002)
      .sort((a, b) => b.demand * b.box - a.demand * a.box)
      .slice(0, 10)
  }, [snapshot, lang, demandOptions])

  // next best actions
  const nextActions = useMemo(() => {
    const actions: { id: string; label: string; reason: string; source: string; view: string }[] = []
    if (!snapshot) {
      actions.push({
        id: 'a1',
        label: '上傳存檔或載入 Demo',
        reason: 'Dashboard 需要存檔資料才能計算個人化建議',
        source: 'no save loaded',
        view: 'upload',
      })
    } else {
      if (scores.stockRisk.value != null && scores.stockRisk.value > 40) {
        actions.push({
          id: 'a2',
          label: `${Math.round(scores.stockRisk.value)}% 商品庫存過低，前往補貨規劃`,
          reason: `stock risk = ${scores.stockRisk.value.toFixed(1)}%`,
          source: 'computeDashboardScores',
          view: 'restock',
        })
      }
      if (scores.demandCoverage.value != null && scores.demandCoverage.value < 70) {
        actions.push({
          id: 'a3',
          label: `需求覆蓋僅 ${scores.demandCoverage.value.toFixed(0)}%，補齊缺失品類`,
          reason: '部分 necessity pool 未被庫存覆蓋',
          source: 'computeNecessityCoverage',
          view: 'restock',
        })
      }
      if (scores.shelfEfficiency.value != null && scores.shelfEfficiency.value < 60) {
        actions.push({
          id: 'a4',
          label: '店面有空貨架，前往平面圖檢視',
          reason: `shelf efficiency = ${scores.shelfEfficiency.value.toFixed(1)}`,
          source: 'computeShelfEfficiency',
          view: 'layout',
        })
      }
      actions.push({
        id: 'a5',
        label: '檢查 USB 1TB / Gaming Console 是否解鎖',
        reason: 'confirmed 高單箱價值數據怪',
        source: 'classifyExploitCandidates',
        view: 'exploits',
      })
      actions.push({
        id: 'a6',
        label: '查看鹽壟斷探測結果',
        reason: 'Salt = confirmed mechanic, unproven exploit',
        source: 'computeSaltProbe',
        view: 'salt',
      })
      if (snapshot.employees.length === 0) {
        actions.push({
          id: 'a7',
          label: '尚未偵測到員工資料（demo save 無員工）',
          reason: '真實存檔上傳後可計算員工效率',
          source: 'snapshot.employees',
          view: 'employees',
        })
      }
    }
    return actions
  }, [snapshot, scores])

  const hasData = snapshot != null
  // Helper: render null scores as "—" (honest, not faked to 30/60/50/100).
  const scoreOrDash = (v: number | null, digits = 0): string =>
    v == null ? '—' : fmt(v, digits)
  const scoreConfidence = (v: number | null): 'proxy' | 'needs-save' =>
    v == null ? 'needs-save' : 'proxy'

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <SectionHeader
        level={1}
        title="營運總覽"
        description={hasData
          ? `Day ${snapshot!.day} · 已讀取 ${snapshot!.detectedFields.length} 個存檔欄位，先處理下方第一個建議。`
          : '載入存檔後，系統會直接告訴你先補貨、調價，還是整理店面。'}
        right={
          !hasData ? (
            <Button size="sm" onClick={() => setView('upload')}>
              <Upload className="mr-1.5 h-4 w-4" /> 載入存檔
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setView('room')}>
              <ArrowRight className="mr-1.5 h-4 w-4" /> 多人協作
            </Button>
          )
        }
      />

      {/* Score row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="flex items-center justify-center p-3">
          <ScoreRing
            value={scores.storeHealth.value}
            label="Store Health"
            sublabel={scores.storeHealth.value == null ? '需存檔' : '綜合'}
          />
        </Card>
        <StatCard
          label="Demand Coverage"
          value={scoreOrDash(scores.demandCoverage.value, 0)}
          unit="%"
          confidence={scoreConfidence(scores.demandCoverage.value)}
          formula={scores.demandCoverage.formula}
          hint={scores.demandCoverage.value == null ? '需存檔內 inventoryByProduct' : undefined}
          accent={scores.demandCoverage.value == null ? 'neutral' : scores.demandCoverage.value > 70 ? 'good' : 'warn'}
        />
        <StatCard
          label="Stock Risk"
          value={scoreOrDash(scores.stockRisk.value, 0)}
          unit="%"
          confidence={scoreConfidence(scores.stockRisk.value)}
          formula={scores.stockRisk.formula}
          hint={scores.stockRisk.value == null ? '需存檔內 inventoryByProduct' : undefined}
          accent={scores.stockRisk.value == null ? 'neutral' : scores.stockRisk.value < 30 ? 'good' : 'bad'}
        />
        <StatCard
          label="Shelf Efficiency"
          value={scoreOrDash(scores.shelfEfficiency.value, 0)}
          confidence={scoreConfidence(scores.shelfEfficiency.value)}
          formula={scores.shelfEfficiency.formula}
          hint={scores.shelfEfficiency.value == null ? '需存檔內 storeLayout' : undefined}
          accent={scores.shelfEfficiency.value == null ? 'neutral' : scores.shelfEfficiency.value > 60 ? 'good' : 'warn'}
        />
        <StatCard
          label="Employee Eff."
          value={scoreOrDash(scores.employeeEfficiency.value, 0)}
          confidence={scoreConfidence(scores.employeeEfficiency.value)}
          formula={scores.employeeEfficiency.formula}
          hint={scores.employeeEfficiency.value == null ? '需存檔內 employees' : undefined}
          accent="neutral"
        />
        <StatCard
          label="Money / FP"
          value={hasData && snapshot!.money > 0 ? fmtMoney(snapshot!.money) : '—'}
          hint={hasData ? `Day ${snapshot!.day} · ${snapshot!.franchisePoints} FP` : '需上傳存檔'}
          confidence={hasData ? 'confirmed' : 'needs-save'}
          accent="neutral"
        />
      </div>

      {/* Save Overview (real save data) */}
      {hasData && <SaveOverviewCard snapshot={snapshot!} />}

      {/* Next best actions */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-amber-500" /> 現在先做這件事
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {nextActions[0] && (
            <button
              onClick={() => setView(nextActions[0].view as any)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{nextActions[0].label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{nextActions[0].reason}</span>
              </span>
              <span className="hidden text-xs font-medium text-primary sm:block">前往處理</span>
            </button>
          )}
          {nextActions.length > 1 && (
            <div className="grid border-t sm:grid-cols-2">
              {nextActions.slice(1, 3).map((action) => (
                <button
                  key={action.id}
                  onClick={() => setView(action.view as any)}
                  className="flex items-center gap-2 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-accent sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Four lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Top 10 緊急補貨"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          confidence="proxy"
          empty={urgentRestocks.length === 0}
        >
          {urgentRestocks.map((r, i) => (
            <DataRow
              key={r.p.id}
              index={i + 1}
              title={r.label}
              subtitle={`#${r.p.id} · ${r.p.brand} · demand ${fmt(r.demand, 5)}`}
              right={
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono text-xs">stock {r.current}</span>
                  <MiniBar value={r.demand} max={urgentRestocks[0]?.demand || 1} color="bg-amber-500" />
                </div>
              }
              onClick={() => {
                setSelectedProduct(r.p.id)
                setView('wiki')
              }}
            />
          ))}
        </ListCard>

        <ListCard
          title="Top 10 浪費貨架格"
          icon={<PackageX className="h-4 w-4 text-rose-500" />}
          confidence="proxy"
          empty={wastedSlots.length === 0}
        >
          {wastedSlots.map((r, i) => (
            <DataRow
              key={r.p.id}
              index={i + 1}
              title={r.label}
              subtitle={`#${r.p.id} · demand ${fmt(r.demand, 5)} · units ${r.units}`}
              right={<Badge variant="outline" className="text-[10px] text-rose-600">low demand</Badge>}
              onClick={() => {
                setSelectedProduct(r.p.id)
                setView('wiki')
              }}
            />
          ))}
        </ListCard>

        <ListCard
          title="Top 10 值得解鎖商品"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          confidence="proxy"
          empty={opportunities.length === 0}
        >
          {opportunities.map((r, i) => (
            <DataRow
              key={r.p.id}
              index={i + 1}
              title={r.label}
              subtitle={`未解鎖 · #${r.p.id} · box ${fmtMoney(r.box)} · market ${fmtMoney(r.market)} · density ${fmt(r.density, 1)} $/u³`}
              right={
                <div className="flex flex-col items-end">
                  <span className="font-mono text-xs">score {fmt(r.score, 1)}</span>
                  {ENC.premiumProducts.includes(r.p.id) && <Badge variant="outline" className="text-[10px] text-fuchsia-600">premium</Badge>}
                </div>
              }
              onClick={() => {
                setSelectedProduct(r.p.id)
                setView('wiki')
              }}
            />
          ))}
        </ListCard>

        <ListCard
          title="Top 10 疑似錯失銷售"
          icon={<TrendingDown className="h-4 w-4 text-orange-500" />}
          confidence="proxy"
          empty={missedSales.length === 0}
        >
          {missedSales.map((r, i) => (
            <DataRow
              key={r.p.id}
              index={i + 1}
              title={r.label}
              subtitle={`#${r.p.id} · demand ${fmt(r.demand, 5)} · box ${fmtMoney(r.box)}`}
              right={<span className="font-mono text-xs">loss/visit {fmtMoney(r.demand * r.box)}</span>}
              onClick={() => {
                setSelectedProduct(r.p.id)
                setView('wiki')
              }}
            />
          ))}
        </ListCard>
      </div>

      {/* necessity coverage mini */}
      <NecessityCoverageMini snapshot={snapshot} />
    </div>
  )
}

function ListCard({
  title,
  icon,
  confidence,
  empty,
  children,
}: {
  title: string
  icon: React.ReactNode
  confidence: any
  empty?: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          <ConfidenceBadge confidence={confidence} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="py-6 text-center text-sm text-muted-foreground">無資料（需上傳存檔）</div>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin pr-1">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

function NecessityCoverageMini({ snapshot }: { snapshot: any }) {
  const cov = useMemo(() => {
    const stocked = new Set<number>()
    if (snapshot && Object.keys(snapshot.inventoryByProduct).length > 0) {
      for (const [id, c] of Object.entries(snapshot.inventoryByProduct)) {
        if ((c as number) > 0) stocked.add(Number(id))
      }
    } else {
      ENC.products.forEach((p) => stocked.add(p.id))
    }
    return computeNecessityCoverage(stocked).value
  }, [snapshot])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Necessity 覆蓋概覽</span>
          <ConfidenceBadge confidence="proxy" formula="coverage = stockedRawTokens / totalRawTokens per necessity" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {cov.map((c) => (
            <div key={c.necessityIndex} className="rounded-md border bg-card p-2">
              <div className="truncate text-[11px] font-medium" title={c.necessityName}>{c.necessityName}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{fmt(c.coverage * 100, 0)}%</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{c.stockedTokens}/{c.totalTokens} tokens</div>
              <div className="mt-1">
                <MiniBar value={c.coverage * 100} max={100} color={c.coverage > 0.7 ? 'bg-emerald-500' : c.coverage > 0.3 ? 'bg-amber-500' : 'bg-rose-500'} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SaveOverviewCard({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useSaveStore.getState>['snapshot']> }) {
  const s = snapshot
  const brandColor = s.supermarketColor
    ? `rgb(${Math.round(s.supermarketColor.r * 255)},${Math.round(s.supermarketColor.g * 255)},${Math.round(s.supermarketColor.b * 255)})`
    : undefined

  const tiles: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: string }[] = []

  // Identity
  if (s.storeName) {
    tiles.push({
      icon: <Store className="h-3.5 w-3.5" />,
      label: '店面名稱',
      value: s.storeName,
      hint: s.supermarketName ? `品牌: ${s.supermarketName}` : undefined,
    })
  }
  if (s.supermarketName && brandColor) {
    tiles.push({
      icon: <Palette className="h-3.5 w-3.5" />,
      label: '品牌',
      value: s.supermarketName,
      hint: `RGB(${s.supermarketColor!.r.toFixed(0)},${s.supermarketColor!.g.toFixed(0)},${s.supermarketColor!.b.toFixed(0)})`,
    })
  }

  // Progression
  if (s.difficulty != null) {
    tiles.push({
      icon: <Heart className="h-3.5 w-3.5" />,
      label: '難度',
      value: `${s.difficulty} / 5`,
    })
  }
  if (s.franchiseExperience != null) {
    tiles.push({
      icon: <Coins className="h-3.5 w-3.5" />,
      label: 'Franchise XP',
      value: s.franchiseExperience.toLocaleString(),
      hint: s.lastAwardedLevel != null ? `Last Level: ${s.lastAwardedLevel}` : undefined,
    })
  }
  if (s.lastAwardedLevel != null) {
    tiles.push({
      icon: <Layers className="h-3.5 w-3.5" />,
      label: '已達等級',
      value: `${s.lastAwardedLevel}`,
      hint: `Day ${s.day}`,
    })
  }

  // Finance
  if (s.loanAmount != null && s.loanAmount > 0) {
    tiles.push({
      icon: <Banknote className="h-3.5 w-3.5" />,
      label: '貸款',
      value: fmtMoney(s.loanAmount),
      hint: s.loanPaymentPerDay ? `每日還款 ${fmtMoney(s.loanPaymentPerDay)}` : undefined,
      accent: 'amber',
    })
  }

  // Expansion
  if (s.spaceBought != null) {
    tiles.push({
      icon: <Boxes className="h-3.5 w-3.5" />,
      label: '店面擴建',
      value: `${s.spaceBought}`,
    })
  }
  if (s.storageBought != null) {
    tiles.push({
      icon: <Boxes className="h-3.5 w-3.5" />,
      label: '倉庫擴建',
      value: `${s.storageBought}`,
    })
  }

  // Employees
  if (s.employees.length > 0) {
    const totalSalary = s.employees.reduce((a, b) => a + b.salary, 0)
    tiles.push({
      icon: <Users className="h-3.5 w-3.5" />,
      label: '雇用員工',
      value: `${s.employees.length}`,
      hint: `日薪合計 ${fmtMoney(totalSalary)}`,
    })
  }

  // Invoices
  if (s.invoices && s.invoices.length > 0) {
    tiles.push({
      icon: <Calendar className="h-3.5 w-3.5" />,
      label: '待處理發票',
      value: `${s.invoices.length}`,
      accent: 'amber',
    })
  }

  // Store layout
  if (s.storeLayout.length > 0) {
    const totalUnits = s.storeLayout.reduce(
      (a, p) => a + p.inventory.reduce((b, i) => b + i.count, 0),
      0,
    )
    tiles.push({
      icon: <Boxes className="h-3.5 w-3.5" />,
      label: '店面道具',
      value: `${s.storeLayout.length}`,
      hint: `${totalUnits.toLocaleString()} 件庫存`,
    })
  }

  // Deco props
  if (s.decoPropsCount != null && s.decoPropsCount > 0) {
    tiles.push({
      icon: <Palette className="h-3.5 w-3.5" />,
      label: '裝飾道具',
      value: `${s.decoPropsCount}`,
    })
  }

  // Unlocks
  tiles.push({
    icon: <Layers className="h-3.5 w-3.5" />,
    label: '已解鎖 Tier',
    value: `${s.unlockedProductTiers.length} / 55`,
    hint: `${s.unlockedProducts.length} / 339 商品`,
  })

  // Recipes
  if (s.manufacUnlockedRecipes) {
    const unlocked = s.manufacUnlockedRecipes.filter(Boolean).length
    tiles.push({
      icon: <Boxes className="h-3.5 w-3.5" />,
      label: '製造配方',
      value: `${unlocked} / ${s.manufacUnlockedRecipes.length}`,
      accent: unlocked === 0 ? 'amber' : undefined,
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Store className="h-4 w-4 text-emerald-500" />
            存檔概覽
          </span>
          <div className="flex items-center gap-2">
            {brandColor && (
              <span
                className="inline-block h-4 w-4 rounded border"
                style={{ backgroundColor: brandColor }}
                title={`Brand color: ${brandColor}`}
              />
            )}
            <ConfidenceBadge
              confidence="confirmed"
              formula="ES3 fields → SaveSnapshot"
              sources={['es3-parser.ts', 'Funds/Day/FP/FX/Loan/StoreName/etc.']}
              note={`來源: ${s.source}`}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {tiles.map((t, i) => (
            <div
              key={i}
              className="rounded-md border bg-card p-2"
              style={
                t.accent === 'amber'
                  ? { borderColor: 'rgb(245 158 11 / 0.4)', backgroundColor: 'rgb(245 158 11 / 0.03)' }
                  : undefined
              }
            >
              <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                {t.icon}
                {t.label}
              </div>
              <div className="mt-0.5 truncate font-mono text-sm font-bold" title={t.value}>
                {t.value}
              </div>
              {t.hint && (
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={t.hint}>
                  {t.hint}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
