'use client'

// Online Orders x Bad Weather x Skill 43 strategy tool (D2)
//
// Reads: snapshot (day, inventory, perks/skillUnlocks, difficulty)
// Outputs: today's expected revenue, what-if slider (day 1-200), top
// 10 products to pack, skill 43 ROI estimate, tier inflation table.

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CloudRain,
  Cloud,
  Sparkles,
  Lightbulb,
  TrendingUp,
  Package,
  Calendar,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { useSaveStore } from '@/lib/store'
import { encyclopedia as ENC, productById } from '@/lib/data-loader'
import {
  computeOrderDayEconomy,
  findSkill43ROI,
  getTierInflationTable,
  getWeather,
  hasSkill43,
  SKILL_43_PERK_INDEX,
  type OnlineOrderEconomy,
} from '@/lib/online-order-engine'
import {
  ConfidenceBadge,
  SectionHeader,
  StatCard,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { cn } from '@/lib/utils'

type SortKey = 'expected' | 'name' | 'tier' | 'stock'

export function OnlineOrders() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const day = snapshot?.day ?? 1

  // Sim slider: which day are we forecasting for?
  const [simDay, setSimDay] = useState<number>(day)
  // Force-bad-weather toggle (for what-if)
  const [forceBadWeather, setForceBadWeather] = useState<boolean>(false)
  // Sort key for the top products table
  const [sortKey, setSortKey] = useState<SortKey>('expected')

  // Today's actual economy (no overrides)
  const today = useMemo<OnlineOrderEconomy>(
    () => computeOrderDayEconomy(snapshot, ENC.products, day),
    [snapshot, day],
  )

  // What-if: slider day + optional forced weather
  const sim = useMemo<OnlineOrderEconomy>(
    () =>
      computeOrderDayEconomy(snapshot, ENC.products, simDay, {
        weatherOverride: { isBad: forceBadWeather },
      }),
    [snapshot, simDay, forceBadWeather],
  )

  // Skill 43 ROI
  const skill43 = hasSkill43(snapshot)
  const roi = useMemo(
    () => findSkill43ROI(snapshot, ENC.products, day),
    [snapshot, day],
  )

  // Sort top products table
  const sortedTop = useMemo(() => {
    const arr = [...today.top10ByRevenue]
    if (sortKey === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortKey === 'tier') arr.sort((a, b) => a.tier - b.tier)
    else if (sortKey === 'stock') arr.sort((a, b) => b.inStock - a.inStock)
    return arr
  }, [today, sortKey])

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      <SectionHeader
        level={1}
        title="線上訂單 × 壞天氣 × 技能 43 策略工具"
        description="把遊戲 IL 真實公式（每件 = basePrice × tierInflation × Random(3.25, 3.5) × 壞天氣加成）套到你的庫存，看今天線上訂單能賺多少。技能 43 = orderingExtraCrashOnBadWeather。"
        confidence="proxy"
        formula="perItem = basePrice × tierInflation × Random(3.25, 3.5) × (badWeather && skill43 ? 3 : 1)"
        note="V9=0..5 (≥4 為壞天氣)；季節 = clamp(floor((day%111)/28), 0, 3)"
      />

      {/* Hero card */}
      <HeroCard today={today} skill43={skill43} />

      {/* Today's picture */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-sky-500" /> 今日總覽
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <StatCard label="Day" value={fmt(today.day, 0)} confidence="confirmed" />
            <StatCard label="季節" value={today.season.zh} hint={today.season.en} confidence="confirmed" formula="floor((day%111)/28)" />
            <StatCard
              label="天氣"
              value={today.weather.label}
              accent={today.weather.isBad ? 'bad' : 'good'}
              confidence="proxy"
              hint={`V9=${today.weather.v9}`}
            />
            <StatCard label="今日訂單數" value={fmt(today.ordersToday, 0)} confidence="proxy" formula={`baseOrders=${today.baseOrders} + badWeather×skill43 bonus`} />
            <StatCard label="每單件數" value={fmt(today.itemsPerOrder, 0)} confidence="confirmed" hint="difficulty 5 預設" />
            <StatCard
              label="技能 43"
              value={skill43 ? '已解鎖' : '未解鎖'}
              accent={skill43 ? 'good' : 'warn'}
              confidence="confirmed"
              hint={skill43 ? '壞天氣 ×3 加成啟動' : 'perk 43 未解鎖'}
            />
          </div>
        </CardContent>
      </Card>

      {/* What-if simulator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-500" /> 模擬器：換天氣、換日子看收入
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="computeOrderDayEconomy(snapshot, products, simDay, {weatherOverride})"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Label className="text-xs text-muted-foreground">模擬 Day {simDay}</Label>
            <Slider
              value={[simDay]}
              min={1}
              max={200}
              step={1}
              onValueChange={(v) => setSimDay(v[0])}
              className="max-w-md flex-1"
            />
            <div className="flex items-center gap-2">
              <Switch id="force-bad" checked={forceBadWeather} onCheckedChange={setForceBadWeather} />
              <Label htmlFor="force-bad" className="text-xs">強制壞天氣</Label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="模擬 Day" value={fmt(simDay, 0)} confidence="confirmed" />
            <StatCard label="模擬季節" value={sim.season.zh} hint={sim.season.en} confidence="confirmed" />
            <StatCard
              label="模擬天氣"
              value={sim.weather.label}
              accent={sim.weather.isBad ? 'bad' : 'good'}
              confidence="proxy"
            />
            <StatCard
              label="預估收入"
              value={fmtMoney(sim.totalExpectedRevenue)}
              accent="good"
              confidence="proxy"
              hint={`區間 $${sim.totalMinRevenue.toFixed(0)} – $${sim.totalMaxRevenue.toFixed(0)}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Top 10 to pack */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> 今日 Top 10 線上訂單商品
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(['expected', 'name', 'tier', 'stock'] as SortKey[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={sortKey === k ? 'default' : 'outline'}
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setSortKey(k)}
                >
                  {k === 'expected' ? '預期收入' : k === 'name' ? '名稱' : k === 'tier' ? 'Tier' : '庫存'}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedTop.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 py-6 text-center text-sm text-muted-foreground">
              庫存為 0 — 上傳存檔或先補貨再開線上訂單。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">商品</TableHead>
                    <TableHead className="text-right text-xs">基價</TableHead>
                    <TableHead className="text-right text-xs">Tier</TableHead>
                    <TableHead className="text-right text-xs">通脹 ×</TableHead>
                    <TableHead className="text-right text-xs">單件區間</TableHead>
                    <TableHead className="text-right text-xs">庫存</TableHead>
                    <TableHead className="text-right text-xs">預期收入</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTop.map((l) => (
                    <TableRow key={l.productId}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-[10px] text-muted-foreground">#{l.productId}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">${l.basePrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{l.tier}</TableCell>
                      <TableCell className={cn('text-right font-mono text-xs tabular-nums', l.tierInflation > 1.2 ? 'text-emerald-600' : l.tierInflation > 1.0 ? 'text-amber-600' : 'text-muted-foreground')}>
                        {l.tierInflation.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] tabular-nums">
                        ${l.minItemPrice.toFixed(2)} – ${l.maxItemPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{l.inStock}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">${l.expectedRevenue.toFixed(0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skill 43 ROI */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-amber-500" /> 技能 43 ROI 計算器
            <Badge variant={skill43 ? 'default' : 'outline'} className="text-[10px]">
              perk #{SKILL_43_PERK_INDEX}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {skill43 ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> 你已解鎖技能 43
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                壞天氣日自動 ×3 加成 +3~5 訂單。當前 111 天週期內預估 <span className="font-mono font-semibold">${roi.expectedRevenueWithSkill43.toFixed(0)}</span>。
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> 技能 43 未解鎖
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{roi.verdict}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="壞天氣天數" value={fmt(roi.badWeatherDays, 0)} confidence="proxy" formula="~day%7==6 over 111-day cycle" />
            <StatCard label="無技能 43 (111d)" value={fmtMoney(roi.expectedRevenueNoSkill43)} confidence="proxy" />
            <StatCard
              label="有技能 43 (111d)"
              value={fmtMoney(roi.expectedRevenueWithSkill43)}
              accent="good"
              confidence="proxy"
            />
            <StatCard
              label="Uplift (111d)"
              value={fmtMoney(roi.uplift)}
              accent={roi.uplift > 0 ? 'good' : 'neutral'}
              confidence="proxy"
              hint={`≈ ${fmt(roi.uplift / 111, 0)}/天`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tier inflation table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Tier 通脹係數（55 階完整版）
            <ConfidenceBadge confidence="confirmed" formula="encyclopedia.tiers[].inflation (= tier-inflation.json)" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {getTierInflationTable().map((t) => (
              <div
                key={t.id}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-[11px]',
                  t.inflation > 1.4
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : t.inflation > 1.1
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-muted bg-muted/20',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-muted-foreground">#{t.id}</span>
                  <span className={cn('font-mono font-semibold', t.inflation > 1.4 ? 'text-emerald-600' : t.inflation > 1.1 ? 'text-amber-600' : '')}>
                    ×{t.inflation.toFixed(2)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-muted-foreground">{t.category}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Tier 0–9 為通脹高峰（最高 ×1.59，套利空間最大）；Tier 10–16 中度通脹（×1.13–×1.34）；Tier 17+ 為 1.0。
              玩家售價上限 = 2.01 × 市價 = 2.01 × basePrice × 通脹。
            </span>
          </div>
        </CardContent>
      </Card>

      {/* How this works (formula reference) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-sky-500" /> 計算公式（IL 真實）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
{`# 季節
season = clamp(floor((day % 111) / 28), 0, 3)   # 0=春 1=夏 2=秋 3=冬

# 天氣（從存檔 snapshot.weather 取得；無存檔時用 day%7==6 proxy）
isBadWeather = V9 >= 4

# 訂單數
baseOrders = max(1, round(difficulty * 0.8))
ordersToday = baseOrders + (isBadWeather && skill43 ? 3..5 : 0)

# 單件收入
itemPrice = basePrice × tierInflation × Random(3.25, 3.5)
          × (isBadWeather && skill43 ? 3 : 1)

# 線上訂單 = 無投訴、自動付（Pickup Point）
# Skill 43 = perk #43 = orderingExtraCrashOnBadWeather
# Cost: 1000 FP, no prereq`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Hero card
// ============================================================

function HeroCard({ today, skill43 }: { today: OnlineOrderEconomy; skill43: boolean }) {
  const isBad = today.weather.isBad
  return (
    <Card
      className={cn(
        'overflow-hidden border-2',
        isBad && skill43
          ? 'border-fuchsia-500/50 bg-gradient-to-br from-fuchsia-500/10 via-amber-500/5 to-emerald-500/5'
          : isBad
            ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-muted/30'
            : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-muted/30',
      )}
    >
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {isBad ? (
              <CloudRain className={cn('h-9 w-9 shrink-0', skill43 ? 'text-fuchsia-500' : 'text-amber-500')} />
            ) : (
              <Cloud className="h-9 w-9 shrink-0 text-emerald-500" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span>Day {today.day}</span>
                <Badge variant="outline" className="text-[10px]">
                  {today.season.zh}季
                </Badge>
                <Badge
                  variant={isBad ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {today.weather.label}
                </Badge>
                {skill43 && (
                  <Badge variant="default" className="bg-fuchsia-500 text-[10px]">
                    技能 43 ✓
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {today.ordersToday} 單 × {today.itemsPerOrder} 件 ·{' '}
                {today.lines.length} 個有庫存商品
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">預估今日線上訂單收入</div>
            <div
              className={cn(
                'mt-0.5 font-mono text-3xl font-bold tabular-nums',
                isBad && skill43 ? 'text-fuchsia-600' : isBad ? 'text-amber-600' : 'text-emerald-600',
              )}
            >
              {fmtMoney(today.totalExpectedRevenue)}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              區間 ${today.totalMinRevenue.toFixed(0)} – ${today.totalMaxRevenue.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-md border bg-background/60 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <Lightbulb className="h-3 w-3" /> 建議
          </div>
          <div className="text-foreground/90">{today.recommendation}</div>
        </div>
      </CardContent>
    </Card>
  )
}
