'use client'

import { useMemo } from 'react'
import { useSaveStore, useUIStore } from '@/lib/store'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  computeDashboardScores,
  computeDemandProxy,
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
import { Upload, AlertTriangle, TrendingUp, TrendingDown, PackageX, Lightbulb, ArrowRight } from 'lucide-react'
import type { Product } from '@/lib/types'

export function Dashboard() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)

  const scores = useMemo(() => computeDashboardScores(snapshot), [snapshot])

  // top 10 urgent restocks
  const urgentRestocks = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    return ENC.products
      .filter((p) => (inv[p.id] as number) !== undefined || Object.keys(inv).length === 0)
      .map((p) => {
        const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
        const current = (inv[p.id] as number) ?? 0
        const urgency = demand * (current < 10 ? 5 : 1) + (current === 0 && demand > 0.001 ? 2 : 0)
        return { p, demand, current, urgency }
      })
      .filter((x) => x.urgency > 0)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 10)
  }, [snapshot])

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
        }))
        .filter((x) => x.demand < 0.0002)
        .sort((a, b) => a.demand - b.demand)
        .slice(0, 10)
    }
    return ENC.products
      .map((p) => {
        const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
        const units = (inv[p.id] as number) ?? 0
        return { p, demand, units }
      })
      .filter((x) => x.units > 0 && x.demand < 0.001)
      .sort((a, b) => b.units - a.units)
      .slice(0, 10)
  }, [snapshot])

  // top 10 high-value unlocked opportunities
  const opportunities = useMemo(() => {
    const unlocked = new Set(snapshot?.unlockedProducts ?? ENC.products.map((p) => p.id))
    return ENC.products
      .filter((p) => unlocked.has(p.id))
      .map((p) => {
        const box = computeBoxValue(p).value
        const vol = computeColliderVolume(p).value
        const density = computeValueDensity(p).value
        const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
        const score = box * 0.4 + density * 0.0001 + demand * box * 0.6
        return { p, box, density, demand, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [snapshot])

  // top 10 likely missed sales (high demand, not stocked)
  const missedSales = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    const stocked = new Set(
      Object.entries(inv)
        .filter(([, c]) => (c as number) > 0)
        .map(([id]) => Number(id)),
    )
    return ENC.products
      .filter((p) => !stocked.has(p.id) || ((inv[p.id] as number) ?? 0) === 0)
      .map((p) => ({
        p,
        demand: computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value,
        box: computeBoxValue(p).value,
      }))
      .filter((x) => x.demand > 0.002)
      .sort((a, b) => b.demand * b.box - a.demand * a.box)
      .slice(0, 10)
  }, [snapshot])

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
      if (scores.stockRisk.value > 40) {
        actions.push({
          id: 'a2',
          label: `${Math.round(scores.stockRisk.value)}% 商品庫存過低，前往補貨規劃`,
          reason: `stock risk = ${scores.stockRisk.value.toFixed(1)}%`,
          source: 'computeDashboardScores',
          view: 'restock',
        })
      }
      if (scores.demandCoverage.value < 70) {
        actions.push({
          id: 'a3',
          label: `需求覆蓋僅 ${scores.demandCoverage.value.toFixed(0)}%，補齊缺失品類`,
          reason: '部分 necessity pool 未被庫存覆蓋',
          source: 'computeNecessityCoverage',
          view: 'restock',
        })
      }
      if (scores.shelfEfficiency.value < 60) {
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">營運儀表板</h1>
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `來源: ${snapshot!.source} · Day ${snapshot!.day} · 偵測欄位 ${snapshot!.detectedFields.length} 個`
              : '尚未載入存檔。顯示百科靜態資料 + Demo 模式。'}
          </p>
        </div>
        <div className="flex gap-2">
          {!hasData && (
            <>
              <Button variant="default" size="sm" onClick={() => setView('upload')}>
                <Upload className="mr-1.5 h-4 w-4" /> 上傳存檔
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setView('room')}>
            <ArrowRight className="mr-1.5 h-4 w-4" /> 多人房間
          </Button>
        </div>
      </div>

      {/* Score row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="flex items-center justify-center p-3">
          <ScoreRing value={scores.storeHealth.value} label="Store Health" sublabel="綜合" />
        </Card>
        <StatCard label="Demand Coverage" value={fmt(scores.demandCoverage.value, 0)} unit="%" confidence="proxy" formula={scores.demandCoverage.formula} accent={scores.demandCoverage.value > 70 ? 'good' : 'warn'} />
        <StatCard label="Stock Risk" value={fmt(scores.stockRisk.value, 0)} unit="%" confidence="proxy" formula={scores.stockRisk.formula} accent={scores.stockRisk.value < 30 ? 'good' : 'bad'} />
        <StatCard label="Shelf Efficiency" value={fmt(scores.shelfEfficiency.value, 0)} confidence="proxy" formula={scores.shelfEfficiency.formula} accent={scores.shelfEfficiency.value > 60 ? 'good' : 'warn'} />
        <StatCard label="Employee Eff." value={fmt(scores.employeeEfficiency.value, 0)} confidence="proxy" formula={scores.employeeEfficiency.formula} accent="neutral" />
        <StatCard
          label="Money / FP"
          value={hasData && snapshot!.money > 0 ? fmtMoney(snapshot!.money) : '—'}
          hint={hasData ? `Day ${snapshot!.day} · ${snapshot!.franchisePoints} FP` : '需上傳存檔'}
          confidence={hasData ? 'confirmed' : 'needs-save'}
          accent="neutral"
        />
      </div>

      {/* Next best actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-amber-500" /> 下一個最佳動作
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {nextActions.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setView(a.view as any)}
              className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.label}</div>
                <div className="truncate text-xs text-muted-foreground">reason: {a.reason}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{a.source}</code>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </button>
          ))}
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
              title={r.p.name.en}
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
              title={r.p.name.en}
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
          title="Top 10 高價值解鎖機會"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          confidence="proxy"
          empty={opportunities.length === 0}
        >
          {opportunities.map((r, i) => (
            <DataRow
              key={r.p.id}
              index={i + 1}
              title={r.p.name.en}
              subtitle={`#${r.p.id} · box ${fmtMoney(r.box)} · density ${fmt(r.density, 1)} $/u³`}
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
              title={r.p.name.en}
              subtitle={`#${r.p.id} · demand ${fmt(r.demand, 5)} · box ${fmtMoney(r.box)}`}
              right={<span className="font-mono text-xs">loss proxy {fmtMoney(r.demand * r.box * 10)}</span>}
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
