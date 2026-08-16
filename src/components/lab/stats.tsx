'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSaveStore } from '@/lib/store'
import { parseStatsFile } from '@/lib/stats-parser'
import {
  computeStatsSummary,
  computeProfitBreakdown,
  computeProductPerformance,
  computeDiagnostics,
  computeNextDayActions,
  computeDayExtremes,
  buildDailySeries,
  type ProductPerformance,
} from '@/lib/stats-engine'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { StatsHistory } from '@/lib/types'
import {
  FileUp,
  FileJson,
  Loader2,
  Sparkles,
  XCircle,
  TrendingUp,
  TrendingDown,
  PackageX,
  Tag,
  Lightbulb,
  AlertTriangle,
  BarChart3,
  Receipt,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
} from 'recharts'

type SortKey = 'sold' | 'profit' | 'margin'

export function Stats() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const [history, setHistory] = useState<StatsHistory | null>(null)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('profit')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runParse = useCallback((text: string, fileName: string) => {
    try {
      const h = parseStatsFile(text, fileName)
      setHistory(h)
      const days = h.days.length
      toast.success(`已解析 ${days} 天營運統計（${fileName}）`)
    } catch (e: any) {
      toast.error(e?.message ?? '解析失敗')
      setHistory(null)
    }
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      try {
        const text = await file.text()
        runParse(text, file.name)
      } catch (e: any) {
        toast.error('讀檔失敗: ' + (e?.message ?? 'unknown'))
      } finally {
        setParsing(false)
      }
    },
    [runParse],
  )

  const loadSample = useCallback(async () => {
    setParsing(true)
    try {
      const res = await fetch('/demo-stats.json')
      if (!res.ok) {
        toast.error(`取樣本失敗 (${res.status})`)
        return
      }
      const text = await res.text()
      runParse(text, 'demo-stats.json')
    } catch (e: any) {
      toast.error('取樣本失敗: ' + (e?.message ?? 'unknown'))
    } finally {
      setParsing(false)
    }
  }, [runParse])

  const summary = useMemo(() => (history ? computeStatsSummary(history) : null), [history])
  const breakdown = useMemo(() => (history ? computeProfitBreakdown(history, snapshot) : null), [history, snapshot])
  const performance = useMemo(() => (history ? computeProductPerformance(history) : null), [history])
  const diagnostics = useMemo(() => (history ? computeDiagnostics(history) : null), [history])
  const actions = useMemo(() => (history ? computeNextDayActions(history, snapshot) : null), [history, snapshot])
  const series = useMemo(() => (history ? buildDailySeries(history, snapshot) : null), [history, snapshot])
  const extremes = useMemo(() => (history ? computeDayExtremes(history) : null), [history])

  const sortedPerf = useMemo(() => {
    if (!performance) return []
    const arr = [...performance]
    if (sortKey === 'sold') arr.sort((a, b) => b.totalSold - a.totalSold)
    else if (sortKey === 'margin') arr.sort((a, b) => b.grossMargin - a.grossMargin)
    else arr.sort((a, b) => b.grossProfit - a.grossProfit)
    return arr.slice(0, 20)
  }, [performance, sortKey])

  const maxProfit = useMemo(() => {
    if (!sortedPerf.length) return 0
    return Math.max(...sortedPerf.map((p) => Math.max(0, p.grossProfit)))
  }, [sortedPerf])

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4">
      <SectionHeader
        level={1}
        title="營運分析"
        description="載入 StoreFile0stats.es3（每日統計檔），把真實銷量、收入、成本變成決策。與主存檔串聯：貸款、庫存、定價一起看。"
        confidence="confirmed"
        note="數據源為遊戲每日寫入的明文統計檔；已知兩個 key 拼字 bug 已自動修正，acquired 欄位標記為不可靠。"
      />

      {/* upload zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted'}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="text-base font-semibold">把 StoreFile0stats.es3 拖到這裡</div>
            <div className="mt-1 text-xs text-muted-foreground">
              或按下方按鈕選擇 stats.es3 / stats_history.json（明文 JSON）
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".es3,.json,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
            <Button disabled={parsing} onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
              {parsing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 解析中…</> : <><FileJson className="mr-1.5 h-4 w-4" /> 選擇統計檔</>}
            </Button>
            <Button variant="outline" onClick={loadSample} disabled={parsing}>
              <Sparkles className="mr-1.5 h-4 w-4" /> 載入內建樣本
            </Button>
            {history && (
              <Button variant="ghost" onClick={() => setHistory(null)}>
                <XCircle className="mr-1.5 h-4 w-4" /> 清除
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            檔案路徑：{`%USERPROFILE%\\AppData\\LocalLow\\DDTNL\\Supermarket Together\\StoreFile0stats.es3`}
          </div>
        </CardContent>
      </Card>

      {history && history.parseWarnings.length > 0 && (
        <Card>
          <CardContent className="space-y-1 py-3">
            {history.parseWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {history && summary && (
        <>
          {/* latest-day KPI */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="累計天數" value={summary.totalDays} confidence="confirmed" />
            <StatCard label="最新淨利" value={fmtMoney(summary.latest?.benefits ?? 0)} accent={(summary.latest?.benefits ?? 0) >= 0 ? 'good' : 'bad'} confidence="confirmed" />
            <StatCard label="日均營收（估）" value={fmtMoney(summary.averages.revenueEstimate)} confidence="proxy" hint="淨利＋可見開支反推" />
            <StatCard label="日均顧客" value={fmt(summary.averages.customers, 0)} confidence="confirmed" />
            <StatCard label="平均客單" value={fmtMoney(summary.averages.basketSize)} confidence="proxy" />
            <StatCard label="線上訂單收入" value={fmtMoney(summary.totals.onlineRevenue)} confidence="confirmed" hint={summary.totals.onlineRevenue > 0 ? '線上訂單是強力盈利來源' : '尚未啟用線上訂單'} />
          </div>

          {/* best / worst day hero KPIs (D4) */}
          {extremes && (extremes.best || extremes.worst) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {extremes.best && (
                <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-muted/30">
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        <TrendingUp className="h-3.5 w-3.5" /> 史上最佳日
                      </div>
                      <Badge variant="outline" className="text-[10px]">Day {extremes.best.day}</Badge>
                    </div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(extremes.best.benefits)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{extremes.best.summary}</div>
                  </CardContent>
                </Card>
              )}
              {extremes.worst && extremes.worst.day !== extremes.best?.day && (
                <Card className="border-rose-500/30 bg-gradient-to-br from-rose-500/5 to-muted/30">
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                        <TrendingDown className="h-3.5 w-3.5" /> 史上最差日
                      </div>
                      <Badge variant="outline" className="text-[10px]">Day {extremes.worst.day}</Badge>
                    </div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {fmtMoney(extremes.worst.benefits)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{extremes.worst.summary}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* profit breakdown */}
          {breakdown && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" /> 最新一日盈利拆解（Day {breakdown.day}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard label="當日淨利" value={fmtMoney(breakdown.benefits)} accent={breakdown.benefits >= 0 ? 'good' : 'bad'} confidence="confirmed" />
                  <StatCard label="店內營收（估）" value={fmtMoney(breakdown.storeRevenueEstimate)} confidence="proxy" />
                  <StatCard label="採購支出" value={fmtMoney(breakdown.moneySpent)} confidence="confirmed" />
                  <StatCard label="員工＋電＋租" value={fmtMoney(breakdown.employeesCost + breakdown.lightCost + breakdown.rentCost)} confidence="confirmed" hint={`薪 ${fmtMoney(breakdown.employeesCost)} · 電 ${fmtMoney(breakdown.lightCost)} · 租 ${fmtMoney(breakdown.rentCost)}`} />
                  <StatCard label="貸款還款" value={breakdown.loanPayment != null ? fmtMoney(breakdown.loanPayment) : '—'} confidence={breakdown.loanPayment != null ? 'confirmed' : 'needs-save'} hint={breakdown.loanPayment == null ? '載入主存檔以取得每日還款額' : undefined} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  營收為「淨利＋可見開支」反推，未含發票付款等未記錄金額；與主存檔串聯後才會把貸款還款納入。
                </div>
              </CardContent>
            </Card>
          )}

          {/* growth curve */}
          {series && series.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" /> 每日淨利與客流
                  <ConfidenceBadge confidence="confirmed" />
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => '$' + fmt(v, 0)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, name: any) => (name === 'customers' ? [fmt(v, 0) + ' 人', '顧客'] : ['$' + fmt(Number(v), 0), '淨利'])} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="benefits" fill="var(--chart-1)" name="淨利" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="customers" stroke="var(--chart-2)" name="顧客" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* expense stack */}
          {series && series.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" /> 每日營收 vs 主要開支
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => '$' + fmt(v, 0)} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, name: any) => ['$' + fmt(Number(v), 0), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" stackId="a" fill="var(--chart-1)" name="營收（估）" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="moneySpent" stackId="b" fill="var(--chart-3)" name="採購" />
                    <Bar dataKey="employeesCost" stackId="b" fill="var(--chart-4)" name="薪資" />
                    <Bar dataKey="rentCost" stackId="b" fill="var(--chart-5)" name="租金" />
                    <Bar dataKey="lightCost" stackId="b" fill="#f59e0b" name="電費" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* diagnostics */}
          {diagnostics && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageX className="h-4 w-4" /> 缺貨／定價診斷
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="總缺貨次數" value={fmt(diagnostics.totalNotFound, 0)} accent={diagnostics.avgNotFoundPerDay > 3 ? 'warn' : undefined} confidence="confirmed" />
                  <StatCard label="日均缺貨" value={fmt(diagnostics.avgNotFoundPerDay, 1)} confidence="confirmed" />
                  <StatCard label="總太貴投訴" value={fmt(diagnostics.totalTooExpensive, 0)} accent={diagnostics.avgTooExpensivePerDay > 3 ? 'warn' : undefined} confidence="confirmed" />
                  <StatCard label="日均太貴" value={fmt(diagnostics.avgTooExpensivePerDay, 1)} confidence="confirmed" />
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <Badge variant="outline" className="mb-1 mr-2">{diagnostics.mode}</Badge>
                  {diagnostics.verdict}
                </div>
              </CardContent>
            </Card>
          )}

          {/* product performance */}
          {performance && performance.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="h-4 w-4" /> 商品真實盈利排行
                    <ConfidenceBadge confidence="proxy" note="收入與成本非同會計期間（購入≠同期售出），毛利為近似。fair× 用 tierInflation 校正市價基準。" />
                  </CardTitle>
                  <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <TabsList>
                      <TabsTrigger value="profit">毛利</TabsTrigger>
                      <TabsTrigger value="sold">銷量</TabsTrigger>
                      <TabsTrigger value="margin">毛利率</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {sortedPerf.map((p: ProductPerformance) => (
                  <DataRow
                    key={p.productId}
                    index={`#${p.productId}`}
                    title={p.name}
                    subtitle={
                      <span>
                        售 {p.totalSold} 件 · 均價 ${p.avgPrice.toFixed(2)} · 成本 ${p.totalCost.toFixed(0)} · 近7日日均 {p.recentDailySold.toFixed(1)} ·{' '}
                        <span className={p.fairMultiplier > 1.5 ? 'text-amber-600' : p.fairMultiplier > 1.0 ? 'text-emerald-600' : 'text-muted-foreground'}>
                          fair×{p.fairMultiplier.toFixed(2)}
                        </span>
                        {' '}(tier {p.tier} ×{p.tierInflation.toFixed(2)})
                      </span>
                    }
                    right={
                      <div className="flex min-w-[120px] flex-col items-end gap-1">
                        <span className={`font-mono text-xs font-semibold ${p.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ${p.grossProfit.toFixed(0)} <span className="text-[10px] text-muted-foreground">({(p.grossMargin * 100).toFixed(0)}%)</span>
                        </span>
                        <MiniBar value={Math.max(0, p.grossProfit)} max={maxProfit} color={p.grossProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} />
                      </div>
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* next-day actions */}
          {actions && actions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4" /> 下一日建議（真實銷量 × 目前存檔）
                  <ConfidenceBadge confidence="proxy" note="以近 7 日真實銷量估算庫存可撐天數，再疊加主存檔庫存／貸款。" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {actions.map((a, i) => (
                  <DataRow
                    key={i}
                    index={a.priority}
                    title={a.title}
                    subtitle={a.detail}
                    right={
                      <Badge variant="outline" className="text-[10px]">
                        {a.kind === 'restock' ? '補貨' : a.kind === 'dead-stock' ? '清貨' : a.kind === 'pricing' ? '定價' : a.kind === 'watch' ? '觀察' : '提示'}
                      </Badge>
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* data footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {summary.totalDays} 天 · Day {summary.firstDay}–{summary.lastDay} · {history.productCount} 商品
            </span>
            {summary.totals.timesRobbed > 0 && (
              <span className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" /> 累計被偷 {summary.totals.timesRobbed} 次
              </span>
            )}
          </div>
        </>
      )}

      {!history && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          尚未載入統計檔。上傳 <span className="font-mono">StoreFile0stats.es3</span> 或按「載入內建樣本」查看效果。
        </div>
      )}
    </div>
  )
}
