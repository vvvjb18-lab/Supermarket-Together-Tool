'use client'

// ============================================================
// Skill Lab — unified shell hosting the 4 main tabs:
//   1. 「策略工具」 — 7 sub-tools (Tool 1..7)
//   2. 「技能樹圖譜」 — SkillTreeView (from skill-tree.tsx, reused as-is)
//   3. 「44 技能總表」 — PerksTableView (reused as-is)
//   4. 「ROI 排序」 — ported from the previous skills.tsx (strategy +
//      Top-15 ROI chart + skill cards grid)
//
// All room/voting UI from the old skills.tsx is removed (those live in
// room.tsx now). Pure skill-strategy focus.
// ============================================================

import { useMemo, useState, useEffect } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  computeSkillRecommendations,
  type SkillROI,
  type SkillStrategy,
} from '@/lib/engine'
import { useSaveStore } from '@/lib/store'
import {
  useLang,
  useSkillToolLabel,
  skillNameFor,
  skillDescFor,
} from '@/lib/i18n'
import {
  ConfidenceBadge,
  SectionHeader,
  MiniBar,
  fmt,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Lightbulb,
  AlertTriangle,
  Coins,
  Network,
  Table as TableIcon,
  Wrench,
  Unlock,
  Upload,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkillTreeView } from './skill-tree'
import {
  getUnlockedSkillIndices,
  FP_COST_PER_SKILL,
  TOTAL_SKILLS,
} from '@/lib/skill-engine'
import { UnlockedOverview } from './skill-tools/UnlockedOverview'
import { BuildPlanner } from './skill-tools/BuildPlanner'
import { NextStepRecommender } from './skill-tools/NextStepRecommender'
import { BenefitComparator } from './skill-tools/BenefitComparator'
import { FpInvestmentSimulator } from './skill-tools/FpInvestmentSimulator'
import { SaveDiffAnalyzer } from './skill-tools/SaveDiffAnalyzer'
import { StrategyPanel } from './skill-tools/StrategyPanel'
import { SkillsDataTable } from './skill-tools/SkillsDataTable'

// ============================================================
// ROI tab (ported from old skills.tsx, room/voting UI removed)
// ============================================================

type Strategy = SkillStrategy

const STRATEGIES: { id: Strategy; label: string; hint: string }[] = [
  { id: 'employee-automation', label: '員工自動化', hint: '加速 + 擴編' },
  { id: 'checkout-speed', label: '結帳速度', hint: 'throughput' },
  { id: 'customer-volume', label: '客流提升', hint: 'extracustomers' },
  { id: 'manufacturing', label: '製造/訂貨', hint: 'reroll/ordering' },
  { id: 'anti-theft', label: '防盜監控', hint: 'surveillance' },
  { id: 'early-cash', label: '前期現金', hint: 'finance/sales' },
  { id: 'late-scale', label: '後期規模', hint: 'headcount/speed' },
]

const CATEGORY_COLORS: Record<string, string> = {
  'employee-speed': '#10b981',
  checkout: '#f59e0b',
  'customer-volume': '#8b5cf6',
  recycling: '#22c55e',
  'employee-count': '#06b6d4',
  ordering: '#ec4899',
  finance: '#eab308',
  other: '#71717a',
}

const TAG_COLORS: Record<string, string> = {
  speed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  automation: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  headcount: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  throughput: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'sales-cap': 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  recycling: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30',
  finance: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  ordering: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
}

// ============================================================
// Main shell
// ============================================================

export function Skills() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const unlockedCount = useMemo(
    () => getUnlockedSkillIndices(snapshot).length,
    [snapshot],
  )
  const earnedFp = snapshot?.franchiseExperience ?? 0
  const availableFp = snapshot?.franchisePoints ?? 0
  const hasSave = mounted && !!snapshot

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-[1600px] space-y-4 p-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('skilllab.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('skilllab.subtitle')}</p>
        </div>

        {/* FP status strip (always visible) */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">
                {t('skilllab.unlocked.count')}
              </span>
              <Badge variant="outline" className="font-mono text-xs">
                {unlockedCount} / {TOTAL_SKILLS}
              </Badge>
            </div>
            <div className="h-4 w-px bg-border" />
            <FpChip label={t('skilllab.fp.earned')} value={hasSave ? fmt(earnedFp, 0) : '—'} />
            <FpChip label={t('skilllab.fp.available')} value={hasSave ? fmt(availableFp, 0) : '—'} accent="emerald" />
            <FpChip label={t('skilllab.fp.cost.skill')} value={`${FP_COST_PER_SKILL}`} accent="primary" />
            {!hasSave && (
              <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => loadDemo()}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                {t('skilllab.load.demo')}
              </Button>
            )}
            {hasSave && (
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {lang === 'en' ? `Save: Day ${snapshot?.day}` : `存檔：Day ${snapshot?.day}`}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two-level tabs */}
        <Tabs defaultValue="tools" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="tools" className="text-xs gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('skilllab.tab.tools')}</span>
              <span className="sm:hidden">工具</span>
            </TabsTrigger>
            <TabsTrigger value="graph" className="text-xs gap-1.5">
              <Network className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('skilllab.tab.graph')}</span>
              <span className="sm:hidden">圖譜</span>
            </TabsTrigger>
            <TabsTrigger value="table" className="text-xs gap-1.5">
              <TableIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('skilllab.tab.table')}</span>
              <span className="sm:hidden">總表</span>
            </TabsTrigger>
            <TabsTrigger value="roi" className="text-xs gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('skilllab.tab.roi')}</span>
              <span className="sm:hidden">ROI</span>
            </TabsTrigger>
          </TabsList>

          {/* Tools tab — 7 sub-tabs */}
          <TabsContent value="tools" className="mt-0">
            <Tabs defaultValue="overview">
              <TabsList className="flex w-full flex-wrap gap-1 overflow-x-auto rounded-md">
                <TabsTrigger value="overview" className="text-xs gap-1.5">
                  <Unlock className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.overview')}</span>
                </TabsTrigger>
                <TabsTrigger value="build" className="text-xs gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.build')}</span>
                </TabsTrigger>
                <TabsTrigger value="next" className="text-xs gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.next')}</span>
                </TabsTrigger>
                <TabsTrigger value="compare" className="text-xs gap-1.5">
                  <TableIcon className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.compare')}</span>
                </TabsTrigger>
                <TabsTrigger value="fp" className="text-xs gap-1.5">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.fp')}</span>
                </TabsTrigger>
                <TabsTrigger value="diff" className="text-xs gap-1.5">
                  <Network className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.diff')}</span>
                </TabsTrigger>
                <TabsTrigger value="strategy" className="text-xs gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{t('skilllab.tool.strategy')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <UnlockedOverview />
              </TabsContent>
              <TabsContent value="build" className="mt-4">
                <BuildPlanner />
              </TabsContent>
              <TabsContent value="next" className="mt-4">
                <NextStepRecommender />
              </TabsContent>
              <TabsContent value="compare" className="mt-4">
                <BenefitComparator />
              </TabsContent>
              <TabsContent value="fp" className="mt-4">
                <FpInvestmentSimulator />
              </TabsContent>
              <TabsContent value="diff" className="mt-4">
                <SaveDiffAnalyzer />
              </TabsContent>
              <TabsContent value="strategy" className="mt-4">
                <StrategyPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Graph tab — reuse SkillTreeView */}
          <TabsContent value="graph" className="mt-0">
            <SkillTreeView />
          </TabsContent>

          {/* Table tab — enhanced SkillsDataTable */}
          <TabsContent value="table" className="mt-0">
            <SkillsDataTable />
          </TabsContent>

          {/* ROI tab — ported from old skills.tsx */}
          <TabsContent value="roi" className="mt-0">
            <RoiTab lang={lang} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

function FpChip({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'primary' | 'emerald'
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      : accent === 'primary'
        ? 'border-primary/30 bg-primary/5 text-primary'
        : ''
  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1', accentClass)}>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      <span className="font-mono text-xs font-bold tabular-nums">{value}</span>
    </div>
  )
}

// ============================================================
// ROI Tab — Top-15 chart + 44 skill cards
// ============================================================

function RoiTab({ lang }: { lang: ReturnType<typeof useLang> }) {
  const [strategy, setStrategy] = useState<Strategy>('employee-automation')
  const result = useMemo(() => computeSkillRecommendations(strategy), [strategy])
  const rois = result.value
  const maxRoi = rois.length > 0 ? rois[0].roiProxy : 1

  const top15 = useMemo(
    () => rois.slice(0, 15).map((r) => ({ ...r, label: skillNameFor(r.skill, lang) })),
    [rois, lang],
  )

  return (
    <div className="space-y-4">
      {/* Strategy selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              營運策略
            </span>
            <ConfidenceBadge
              confidence={result.confidence}
              formula={result.formula}
              note={result.note}
              sources={result.sources}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            value={strategy}
            onValueChange={(v) => v && setStrategy(v as Strategy)}
            variant="outline"
            className="flex w-full flex-wrap gap-1 rounded-md"
          >
            {STRATEGIES.map((s) => (
              <ToggleGroupItem
                key={s.id}
                value={s.id}
                variant="outline"
                className="flex-1 flex-col items-start gap-0 px-3 py-2 text-left first:rounded-l-md last:rounded-r-md"
                aria-label={s.label}
              >
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{s.hint}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            公式：<code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{result.formula}</code>
          </p>
        </CardContent>
      </Card>

      {/* Perk cost callout */}
      <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Coins className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              所有 44 個 Perk 統一 1000 FP（已確認）
            </div>
            <div className="text-xs text-muted-foreground">
              來源：<code className="font-mono text-[10px]">CmdAcquirePerk IL: i4:1000</code>
              · 無前置、無解鎖順序 · 玩家自選組合
            </div>
          </div>
        </div>
        <ConfidenceBadge
          confidence="confirmed"
          formula="perkSystem.cost = 1000 (FP)"
          sources={['encyclopedia.config.perkSystem.cost', 'CmdAcquirePerk IL']}
        />
      </div>

      {/* Caution box */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold">注意：</span>
          部分技能精確 % 數值未完全從 IL 提取；<code className="font-mono">effect</code> 欄位為主，ROI 為 proxy 推導。
          排序結果為決策參考，非絕對最佳解。
        </div>
      </div>

      {/* ROI Chart - Top 15 horizontal bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Top 15 ROI 條圖</span>
            <ConfidenceBadge confidence="proxy" formula="roiProxy × strategyWeight" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top15}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 10 }}
                />
                <RTooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const r = payload[0].payload as SkillROI & { label: string }
                    return (
                      <div className="rounded-md border bg-background p-2 text-xs shadow-md">
                        <div className="font-semibold">{skillNameFor(r.skill, lang)}</div>
                        <div className="text-muted-foreground">{r.skill.name.en}</div>
                        <div className="mt-1">
                          <span className="font-mono text-muted-foreground">roi:</span>{' '}
                          <span className="font-mono font-bold">{fmt(r.roiProxy, 2)}</span>
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          category: {r.category}
                        </div>
                        {r.synergyTags.length > 0 && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            tags: {r.synergyTags.join(', ')}
                          </div>
                        )}
                        <div className="mt-1 max-w-[220px] truncate font-mono text-[10px]">
                          {r.skill.effect || '(no effect)'}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="roiProxy" radius={[0, 4, 4, 0]}>
                  {top15.map((r, i) => (
                    <Cell
                      key={r.skill.id}
                      fill={CATEGORY_COLORS[r.category] ?? '#71717a'}
                      opacity={i < 5 ? 1 : 0.65}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1 text-[10px]">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{cat}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Skill cards grid */}
      <SectionHeader
        title="全部 44 個技能"
        description="按 ROI 降序排列。前 5 名 highlighted。每張卡顯示 id、名稱、effect、類別、synergy、ROI 進度條、信心等級。"
        confidence="proxy"
        formula="roiProxy = baseScore × strategyWeight"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rois.map((r, i) => (
          <SkillCard
            key={r.skill.id}
            roi={r}
            rank={i + 1}
            maxRoi={maxRoi}
            isTop5={i < 5}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

function SkillCard({
  roi,
  rank,
  maxRoi,
  isTop5,
  lang,
}: {
  roi: SkillROI
  rank: number
  maxRoi: number
  isTop5: boolean
  lang: ReturnType<typeof useLang>
}) {
  const s = roi.skill
  const eff = s.effect || '(無 effect 欄位 — 可能為保留槽)'
  const color = CATEGORY_COLORS[roi.category] ?? '#71717a'
  return (
    <Card
      className={cn(
        'relative flex flex-col gap-2 p-3 transition-colors',
        isTop5 && 'border-fuchsia-500/40 bg-fuchsia-500/5',
      )}
    >
      {/* rank badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              isTop5 ? 'bg-fuchsia-500 text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {skillNameFor(s, lang) || s.id}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {s.name.en || s.id} · <code className="font-mono">{s.id}</code>
            </div>
          </div>
        </div>
        <ConfidenceBadge
          confidence={roi.confidence}
          formula={roi.note}
          sources={[`il: ${s.il}`, `perk: ${s.perk ?? 'null'}`]}
        />
      </div>

      {/* description */}
      <div className="text-xs text-muted-foreground line-clamp-2">
        {skillDescFor(s, lang) || '(無描述)'}
      </div>

      {/* effect (monospace, truncated with tooltip) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="block w-full cursor-help truncate rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
            {eff}
          </code>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-1 text-xs">
            <div className="font-mono text-[10px] break-all">{eff}</div>
            <div className="text-muted-foreground">IL: {s.il} · Perk index: {s.perk ?? 'null'}</div>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* category + tags */}
      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant="outline"
          className="text-[10px] gap-1"
          style={{
            backgroundColor: `${color}20`,
            color,
            borderColor: `${color}50`,
          }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {roi.category}
        </Badge>
        {roi.synergyTags.map((tg) => (
          <Badge
            key={tg}
            variant="outline"
            className={cn('text-[10px]', TAG_COLORS[tg] ?? 'bg-muted text-muted-foreground')}
          >
            {tg}
          </Badge>
        ))}
      </div>

      {/* ROI bar */}
      <div className="mt-auto space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">ROI proxy</span>
          <span className="font-mono font-bold tabular-nums">{fmt(roi.roiProxy, 2)}</span>
        </div>
        <MiniBar
          value={roi.roiProxy}
          max={maxRoi}
          color={isTop5 ? 'bg-fuchsia-500' : 'bg-primary'}
        />
      </div>
    </Card>
  )
}
