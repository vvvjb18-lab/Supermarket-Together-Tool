'use client'

import { useMemo, useState, useCallback } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  computeSaltProbe,
  simulateCustomers,
} from '@/lib/engine'
import {
  useLang,
  productNameFor,
} from '@/lib/i18n'
import {
  ConfidenceBadge,
  StatCard,
  SectionHeader,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  AlertTriangle,
  Beaker,
  FlaskConical,
  Play,
  RefreshCw,
  Crown,
  Atom,
} from 'lucide-react'
import type { SimulationResult } from '@/lib/engine'
import type { Confidence } from '@/lib/types'

type Mode = 'normal' | 'salt-heavy' | 'salt-only'

const MODE_LABEL: Record<Mode, string> = {
  normal: '正常混合貨架',
  'salt-heavy': '鹽重型貨架',
  'salt-only': '純鹽迷因測試',
}

const MODE_DESC: Record<Mode, string> = {
  normal: '所有 339 項商品皆有鋪貨 — 對照組',
  'salt-heavy': '只鋪鹽 + Staple Groceries 池 (necessity[10] 的 62 項) — 模擬偏鹽策略',
  'salt-only': '只鋪鹽 (id 4) — 迷因測試，看 route 9 單獨能跑多少',
}

interface SimRun {
  mode: Mode
  result: SimulationResult
  saltHits: number
  totalProducts: number
  top5: { productId: number; hits: number }[]
  topMissing: { productId: number; missed: number }[]
}

export function Salt() {
  const lang = useLang()
  const probe = useMemo(() => computeSaltProbe(), [])
  const [activeMode, setActiveMode] = useState<Mode>('normal')
  const [runs, setRuns] = useState<Record<Mode, SimRun | null>>({
    normal: null,
    'salt-heavy': null,
    'salt-only': null,
  })
  const [running, setRunning] = useState(false)

  const buildStocked = useCallback((mode: Mode): Set<number> => {
    if (mode === 'normal') return new Set(ENC.products.map((p) => p.id))
    if (mode === 'salt-heavy') {
      const ids = new Set<number>([4])
      for (const nec of ENC.necessities) {
        if (nec.index === 10) {
          for (const t of nec.rawTokens) if (t >= 0) ids.add(t)
        }
      }
      return ids
    }
    // salt-only
    return new Set<number>([4])
  }, [])

  const runSim = useCallback(
    async (mode: Mode) => {
      setRunning(true)
      // Yield to UI thread so the spin state can render
      await new Promise((r) => setTimeout(r, 50))
      const stocked = buildStocked(mode)
      const res = simulateCustomers({
        n: 2000,
        mode: 'raw',
        stockedProductIds: stocked,
      }).value

      const top5 = Array.from(res.productHits.entries())
        .map(([productId, hits]) => ({
          productId,
          hits,
        }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 5)

      const topMissing = res.topMissing.slice(0, 5).map((m) => ({
        productId: m.productId,
        missed: m.missed,
      }))

      const saltHits = res.productHits.get(4) ?? 0
      const run: SimRun = {
        mode,
        result: res,
        saltHits,
        totalProducts: stocked.size,
        top5,
        topMissing,
      }
      setRuns((cur) => ({ ...cur, [mode]: run }))
      setActiveMode(mode)
      setRunning(false)
    },
    [buildStocked],
  )

  const runAll = useCallback(async () => {
    setRunning(true)
    await new Promise((r) => setTimeout(r, 50))
    const newRuns: Record<Mode, SimRun | null> = { ...runs }
    for (const m of ['normal', 'salt-heavy', 'salt-only'] as Mode[]) {
      const stocked = buildStocked(m)
      const res = simulateCustomers({
        n: 2000,
        mode: 'raw',
        stockedProductIds: stocked,
      }).value
      const top5 = Array.from(res.productHits.entries())
        .map(([productId, hits]) => ({
          productId,
          hits,
        }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 5)
      const topMissing = res.topMissing.slice(0, 5).map((m2) => ({
        productId: m2.productId,
        missed: m2.missed,
      }))
      const saltHits = res.productHits.get(4) ?? 0
      newRuns[m] = {
        mode: m,
        result: res,
        saltHits,
        totalProducts: stocked.size,
        top5,
        topMissing,
      }
    }
    setRuns(newRuns)
    setRunning(false)
  }, [buildStocked, runs])

  const activeRun = runs[activeMode]

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salt Monopoly Probe</h1>
        <p className="text-sm text-muted-foreground">
          鹽 (id 4) 是已確認的特殊機制 — necessity[9] 單一商品池。本頁探測其壟斷路徑與實測可行性。
        </p>
      </div>

      {/* Mechanic explanation */}
      <Card className="border-fuchsia-500/30 bg-fuchsia-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Atom className="h-4 w-4 text-fuchsia-500" /> 機制說明
            <ConfidenceBadge
              confidence="confirmed"
              formula="necessity[9].rawIds === '4-4-4-4-4'"
              sources={['encyclopedia.necessities[9]', 'encyclopedia.customerTypes[47].necessitiesChances[9] = 0.5']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">necessity[9]</code>{' '}
            的 <code className="text-xs">rawIds</code> ={' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">"4-4-4-4-4"</code>，
            代表此需求池只有 Salt (id 4) 一個商品，且重複 5 次 (rawTokens 長度 5)。
            當顧客選到此 necessity 時，5/5 機率命中 Salt — Salt 完全壟斷此路徑。
          </p>
          <p>
            但只有 <code className="rounded bg-muted px-1.5 py-0.5 text-xs">customer #47</code>{' '}
            對 necessity[9] 有權重 0.5。其餘 57 種顧客權重為 0。
            Salt 同時出現在 <code className="text-xs">necessity[10]</code> Staple Groceries (62 個 rawTokens，Salt 出現 1 次)，
            走這條路徑時 Salt 命中機率為 1/62 ≈ 1.61%。
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <RawCard label="necessity[9] rawIds" value='"4-4-4-4-4"' hint="5 tokens, 全為 product id 4" />
            <RawCard label="necessity[9] unique productIds" value="[4]" hint="Salt 完全壟斷此池" />
            <RawCard label="necessity[10] Staple Groceries pool" value="62 rawTokens" hint="Salt 出現 1 次 (1/62 ≈ 1.61%)" />
            <RawCard label="necessity[9] 權重來源" value="customer #47 = 0.5" hint="其餘 57 種顧客為 0" />
            <RawCard label="Salt basePrice" value={fmtMoney(probe.saltProduct.basePricePerUnit)} hint={`maxItemsPerBox = ${probe.saltProduct.maxItemsPerBox}`} />
            <RawCard label="Salt 商品名稱 / tier / brand" value={productNameFor(probe.saltProduct.id, lang)} hint={`Tier ${probe.saltProduct.tier} / ${probe.saltProduct.brand} · 基本商品、可立即進貨`} />
          </div>
        </CardContent>
      </Card>

      {/* Demand routes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Route 9 (Salt necessity)"
          value={fmt(probe.saltRoute9.value, 6)}
          confidence="confirmed"
          formula={probe.saltRoute9.formula}
          hint={probe.saltRoute9.note}
          accent="good"
        />
        <StatCard
          label="Route 10 (Staple)"
          value={fmt(probe.saltRoute10.value, 6)}
          confidence="confirmed"
          formula={probe.saltRoute10.formula}
          hint={probe.saltRoute10.note}
          accent="good"
        />
        <StatCard
          label="Salt 總 demand proxy"
          value={fmt(probe.saltTotalDemand.value, 6)}
          confidence="proxy"
          formula={probe.saltTotalDemand.formula}
          hint="route9 + route10，spawn 分布未驗證"
          accent="warn"
        />
      </div>

      {/* Salt product stats */}
      <SectionHeader
        title="Salt 商品數據"
        description="直接取自 encyclopedia.products[4]"
        confidence="confirmed"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="basePrice"
          value={fmtMoney(probe.saltProduct.basePricePerUnit)}
          confidence="confirmed"
          formula="products[4].basePricePerUnit"
        />
        <StatCard
          label="boxValue"
          value={fmtMoney(probe.saltBoxValue.value)}
          confidence="confirmed"
          formula="boxValue = 0.45 × 50 = $22.50"
          accent="good"
        />
        <StatCard
          label="colliderVolume"
          value={fmt(probe.saltVolume.value, 6)}
          unit="u³"
          confidence="confirmed"
          formula={probe.saltVolume.formula}
        />
        <StatCard
          label="valueDensity"
          value={fmt(probe.saltValueDensity.value, 3)}
          unit="$/u³"
          confidence="confirmed"
          formula={probe.saltValueDensity.formula}
          accent="good"
        />
        <StatCard
          label="maxItemsPerBox"
          value={probe.saltProduct.maxItemsPerBox}
          confidence="confirmed"
          formula="products[4].maxItemsPerBox"
        />
      </div>

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Beaker className="h-4 w-4" /> Salt vs 早期 / Premium 商品比較
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="basePrice / boxValue / volume 為 confirmed; demandProxy / shelfEfficiency 為 proxy"
              note="shelfEfficiency = demandProxy × boxValue / colliderVolume"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-12">ID</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead className="text-right">basePrice</TableHead>
                  <TableHead className="text-right">boxValue</TableHead>
                  <TableHead className="text-right">volume</TableHead>
                  <TableHead className="text-right">demandProxy</TableHead>
                  <TableHead className="text-right">shelfEfficiency</TableHead>
                  <TableHead>類型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {probe.comparison.map((c) => {
                  const isSalt = c.product.id === 4
                  const isPremium = ENC.premiumProducts.includes(c.product.id)
                  return (
                    <TableRow
                      key={c.product.id}
                      className={isSalt ? 'bg-fuchsia-500/10' : ''}
                    >
                      <TableCell className="font-mono text-xs">{c.product.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{productNameFor(c.product.id, lang)}</span>
                          {isSalt && <Badge variant="outline" className="text-[10px] border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">SALT</Badge>}
                          {isPremium && <Crown className="h-3 w-3 text-fuchsia-500" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Tier {c.product.tier}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtMoney(c.basePrice)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtMoney(c.boxValue)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(c.volume, 5)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmt(c.demandProxy, 5)}
                        {isSalt && <ConfidenceBadge confidence="proxy" className="ml-1" formula="demandProxy via route9 + route10" />}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmt(c.shelfEfficiency, 3)}</TableCell>
                      <TableCell>
                        {isSalt ? (
                          <Badge variant="outline" className="text-[10px] border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">壟斷</Badge>
                        ) : isPremium ? (
                          <Badge variant="outline" className="text-[10px] border-fuchsia-500/30 text-fuchsia-700 dark:text-fuchsia-300">premium</Badge>
                        ) : c.product.tier <= 5 ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-300">早期</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">其他</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Conclusion callout */}
      <Card className="border-fuchsia-500/40 bg-fuchsia-500/10">
        <CardContent className="flex items-start gap-3 p-4">
          <FlaskConical className="mt-0.5 h-6 w-6 shrink-0 text-fuchsia-500" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">結論</span>
              <ConfidenceBadge confidence="exploit" formula="confirmed mechanic, unproven exploit" note="壟斷路徑確認但客群極窄，單位利潤極低" />
            </div>
            <p className="mt-2 text-sm leading-relaxed">{probe.conclusion}</p>
          </div>
        </CardContent>
      </Card>

      {/* Simulation modes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> 模擬模式 (Monte Carlo, n=2000)
            </span>
            <div className="flex items-center gap-2">
              <ConfidenceBadge confidence="proxy" formula="simulateCustomers: pick cust by weight, pick nec by chance, pick product uniform from raw pool" note="Random uniform assumptions; re-run for variance" />
              <Button size="sm" variant="default" onClick={runAll} disabled={running}>
                {running ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                {running ? '執行中…' : '全部執行'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as Mode)}>
            <TabsList className="flex h-auto w-full flex-wrap gap-1">
              {(['normal', 'salt-heavy', 'salt-only'] as Mode[]).map((m) => (
                <TabsTrigger key={m} value={m} className="text-xs">
                  {MODE_LABEL[m]}
                </TabsTrigger>
              ))}
            </TabsList>
            {(['normal', 'salt-heavy', 'salt-only'] as Mode[]).map((m) => (
              <TabsContent key={m} value={m}>
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{MODE_LABEL[m]}</div>
                      <div className="text-xs text-muted-foreground">{MODE_DESC[m]}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => runSim(m)} disabled={running}>
                      <Play className="mr-1 h-3.5 w-3.5" /> 執行模擬
                    </Button>
                  </div>
                  {runs[m] ? (
                    <RunResultView run={runs[m]!} />
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                      尚未執行。點擊「執行模擬」開始 (n=2000 customers)。
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Cross-mode comparison */}
          {runs.normal && runs['salt-heavy'] && runs['salt-only'] && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>三模式比較表</span>
                  <ConfidenceBadge confidence="proxy" formula="n=2000, mode=raw, equal customer spawn" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模式</TableHead>
                      <TableHead className="text-right">鋪貨數</TableHead>
                      <TableHead className="text-right">總命中</TableHead>
                      <TableHead className="text-right">錯失</TableHead>
                      <TableHead className="text-right">Demand Coverage</TableHead>
                      <TableHead className="text-right">Salt 命中</TableHead>
                      <TableHead className="text-right">Salt 佔比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(['normal', 'salt-heavy', 'salt-only'] as Mode[]).map((m) => {
                      const r = runs[m]!
                      const saltPct = r.result.totalHits > 0 ? (r.saltHits / r.result.totalHits) * 100 : 0
                      return (
                        <TableRow key={m} className={m === 'salt-only' ? 'bg-fuchsia-500/10' : ''}>
                          <TableCell>
                            <span className="font-medium">{MODE_LABEL[m]}</span>
                            <div className="text-[10px] text-muted-foreground">{MODE_DESC[m]}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.totalProducts}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.result.totalHits}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.result.missedHits}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmt(r.result.demandCoverage * 100, 1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-300">{r.saltHits}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmt(saltPct, 1)}%
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RunResultView({ run }: { run: SimRun }) {
  const lang = useLang()
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="鋪貨商品數" value={run.totalProducts} confidence="proxy" formula="stockedProductIds.size" />
        <StatCard label="總命中" value={run.result.totalHits} confidence="proxy" formula="productHits.size + missedHits" />
        <StatCard label="錯失銷售" value={run.result.missedHits} confidence="proxy" formula="Σ missedSales" accent="warn" />
        <StatCard
          label="Demand Coverage"
          value={fmt(run.result.demandCoverage * 100, 1)}
          unit="%"
          confidence="proxy"
          formula="(totalHits - missedHits) / totalHits"
          accent={run.result.demandCoverage > 0.7 ? 'good' : 'bad'}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Top 5 命中商品</span>
              <ConfidenceBadge confidence="proxy" formula="productHits sorted desc" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead className="text-right">hits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.top5.map((h, i) => (
                  <TableRow key={h.productId} className={h.productId === 4 ? 'bg-fuchsia-500/10' : ''}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs">
                      #{h.productId} {productNameFor(h.productId, lang)}
                      {h.productId === 4 && <Badge variant="outline" className="ml-1 text-[10px]">SALT</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{h.hits}</TableCell>
                  </TableRow>
                ))}
                {run.top5.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-4 text-center text-xs text-muted-foreground">無命中</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Top 5 缺貨商品</span>
              <ConfidenceBadge confidence="proxy" formula="missedSales sorted desc" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead className="text-right">missed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.topMissing.map((h, i) => (
                  <TableRow key={h.productId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs">#{h.productId} {productNameFor(h.productId, lang)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-rose-600">{h.missed}</TableCell>
                  </TableRow>
                ))}
                {run.topMissing.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-4 text-center text-xs text-muted-foreground">無缺貨（貨架全鋪）</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RawCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const conf: Confidence = 'confirmed'
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title={label}>{label}</span>
        <ConfidenceBadge confidence={conf} formula={label} />
      </div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
