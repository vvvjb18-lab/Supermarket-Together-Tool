'use client'

// Tool 3: NextStepRecommender — 下一步推薦
//
// Four mode tabs (員工效率 / 客流 / 收銀收益 / 回收收益). Each mode shows
// TOP 3 recommended next skills (excluding already-unlocked) plus relevant
// current save metrics. An "apply all" button adds the top 3 to the Build
// Planner via the shared skill-tools-store.

import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Lightbulb,
  Trophy,
  Users,
  ShoppingBag,
  Coins,
  Recycle,
  Check,
  CloudRain,
  Cloud,
  Zap,
  Banknote,
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, skillDescFor } from '@/lib/i18n'
import {
  recommendNextSkills,
  getUnlockedSet,
  type StrategyMode,
} from '@/lib/skill-engine'
import { getWeather, hasSkill43, SKILL_43_PERK_INDEX } from '@/lib/online-order-engine'
import { useSkillToolsStore } from '@/lib/skill-tools-store'
import { ConfidenceBadge } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'
import { toast } from 'sonner'

type Mode = StrategyMode

const MODE_META: Record<Mode, { icon: React.ReactNode; key: string }> = {
  employee: { icon: <Users className="h-3.5 w-3.5" />, key: 'skilllab.t3.mode.employee' },
  customer: { icon: <ShoppingBag className="h-3.5 w-3.5" />, key: 'skilllab.t3.mode.customer' },
  checkout: { icon: <Coins className="h-3.5 w-3.5" />, key: 'skilllab.t3.mode.checkout' },
  recycling: { icon: <Recycle className="h-3.5 w-3.5" />, key: 'skilllab.t3.mode.recycle' },
}

export function NextStepRecommender() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const addManyToBuild = useSkillToolsStore((s) => s.addManyToBuild)
  const [mode, setMode] = useState<Mode>('employee')

  const recs = useMemo(
    () => recommendNextSkills(snapshot, mode, 3),
    [snapshot, mode],
  )

  const unlockedSet = useMemo(() => getUnlockedSet(snapshot), [snapshot])
  const metrics = useMemo(() => computeMetrics(snapshot, unlockedSet), [snapshot, unlockedSet])

  const applyAll = () => {
    if (recs.length === 0) return
    addManyToBuild(
      recs.map((r) => r.skill.id),
      'next-step',
    )
    toast.success(t('skilllab.t3.applied'))
  }

  return (
    <div className="space-y-4">
      {/* Today hero card (state-aware 1-2 line actionable) */}
      <Card
        className={
          metrics.weather.isBad
            ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-rose-500/5'
            : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-muted/30'
        }
      >
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {metrics.weather.isBad ? (
              <CloudRain className="h-7 w-7 shrink-0 text-amber-500" />
            ) : (
              <Cloud className="h-7 w-7 shrink-0 text-emerald-500" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                <span>Day {snapshot?.day ?? 1}</span>
                <Badge variant={metrics.weather.isBad ? 'destructive' : 'secondary'} className="text-[10px]">
                  {metrics.weather.label}
                </Badge>
                {metrics.hasSkill43 ? (
                  <Badge variant="default" className="bg-fuchsia-500 text-[10px]">
                    skill 43 ✓
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    skill 43 ✗
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {stateAwareHint(mode, metrics)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">現金</div>
            <div className="font-mono text-lg font-bold tabular-nums">${metrics.cash.toFixed(0)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              {t('skilllab.t3.title')}
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="mode-weighted ROI × unlocked-state filter + save context"
              sources={['skill-engine.recommendNextSkills', 'online-order-engine.getWeather']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            variant="outline"
            className="flex w-full flex-wrap gap-1 rounded-md"
          >
            {(Object.keys(MODE_META) as Mode[]).map((m) => (
              <ToggleGroupItem
                key={m}
                value={m}
                variant="outline"
                className="flex-1 gap-1.5 px-3 py-2 text-xs"
                aria-label={t(MODE_META[m].key)}
              >
                {MODE_META[m].icon}
                {t(MODE_META[m].key)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Current metrics row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t('skilllab.t3.metric.employees')} value={String(metrics.employeeCount)} icon={<Users className="h-3.5 w-3.5" />} />
            <Metric label={t('skilllab.t3.metric.speedSkills')} value={String(metrics.speedSkills)} icon={<Zap className="h-3.5 w-3.5" />} accent="emerald" />
            <Metric label={t('skilllab.t3.metric.checkoutSkills')} value={String(metrics.checkoutSkills)} icon={<Coins className="h-3.5 w-3.5" />} accent="amber" />
            <Metric label={t('skilllab.t3.metric.recycleSkills')} value={String(metrics.recycleSkills)} icon={<Recycle className="h-3.5 w-3.5" />} accent="primary" />
          </div>
        </CardContent>
      </Card>

      {/* Top 3 recommendations */}
      {recs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Check className="h-10 w-10 text-emerald-500" />
            <div className="text-sm text-muted-foreground">{t('skilllab.t3.noRec')}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {recs.map((rec) => {
            const s = rec.skill
            return (
              <Card key={s.id} className="border-l-4 border-l-amber-500">
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-2 sm:w-32 sm:shrink-0">
                    <span
                      className={
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ' +
                        (rec.rank === 1
                          ? 'bg-amber-500 text-white'
                          : rec.rank === 2
                            ? 'bg-zinc-400 text-white'
                            : 'bg-orange-700/80 text-white')
                      }
                    >
                      <Trophy className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('skilllab.rank')} #{rec.rank}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        score {rec.score.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {skillNameFor(s, lang) || s.id}
                      </span>
                      <CategoryBadge skill={s} />
                      {s.perk != null && (
                        <Badge variant="outline" className="text-[9px]">
                          perk#{s.perk}
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-md border bg-amber-500/5 p-2 text-xs">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        {t('skilllab.t3.why')}
                      </div>
                      <div className="text-foreground/90">{rec.reason}</div>
                    </div>
                    {s.effect && (
                      <code className="block w-full truncate rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
                        {s.effect}
                      </code>
                    )}
                    {skillDescFor(s, lang) && (
                      <div className="text-[11px] text-muted-foreground">
                        {skillDescFor(s, lang)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <div className="flex justify-end">
            <Button onClick={applyAll} disabled={recs.length === 0}>
              <Check className="mr-2 h-4 w-4" />
              {t('skilllab.t3.applyAll')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface Metrics {
  employeeCount: number
  speedSkills: number
  checkoutSkills: number
  customerSkills: number
  recycleSkills: number
  /** Current cash. */
  cash: number
  /** Approx. outstanding invoices (snapshot.invoices.length). */
  unpaidInvoices: number
  /** Box recycle factor from perk 8 (UpgradesManager.boxRecycleFactor = 4). */
  boxRecycleFactor: number
  /** Whether skill 43 is unlocked. */
  hasSkill43: boolean
  /** Today weather. */
  weather: { isBad: boolean; label: string }
}

function computeMetrics(
  snapshot: ReturnType<typeof useSaveStore.getState>['snapshot'],
  unlockedSet: Set<number>,
): Metrics {
  const employeeCount = snapshot?.employees?.length ?? 0
  const speedSkills = ENC.skills.filter(
    (s) => s.perk != null && unlockedSet.has(s.perk) && s.effect.toLowerCase().includes('speed'),
  ).length
  const checkoutSkills = ENC.skills.filter(
    (s) =>
      s.perk != null &&
      unlockedSet.has(s.perk) &&
      /checkout|selfcheckout|productcheckout|extracheckoutmoney/.test(s.effect.toLowerCase()),
  ).length
  const customerSkills = ENC.skills.filter(
    (s) =>
      s.perk != null &&
      unlockedSet.has(s.perk) &&
      /extracustomersperk|bystander/.test(s.effect.toLowerCase()),
  ).length
  const recycleSkills = ENC.skills.filter(
    (s) => s.perk != null && unlockedSet.has(s.perk) && s.effect.toLowerCase().includes('recycle'),
  ).length
  // boxRecycleFactor: perk 8 = boxRecycleFactor = 4 (from perk_effects_final.json).
  // Without perk 8, recycle uses default factor (≈1); with perk 8 it becomes 4.
  const boxRecycleFactor = unlockedSet.has(8) ? 4 : 1
  const unpaidInvoices = snapshot?.invoices?.length ?? 0
  const cash = snapshot?.money ?? 0
  const hasSkill43Flag = hasSkill43(snapshot)
  const weather = getWeather(snapshot?.day ?? 1)
  return {
    employeeCount,
    speedSkills,
    checkoutSkills,
    customerSkills,
    recycleSkills,
    cash,
    unpaidInvoices,
    boxRecycleFactor,
    hasSkill43: hasSkill43Flag,
    weather,
  }
}

// ============================================================
// State-aware context card: 1-2 line actionable summary derived
// from real save state + the active strategy mode.
// ============================================================

function stateAwareHint(mode: Mode, m: Metrics): string {
  // Universal signal: if the player is on a bad-weather day but has no skill 43,
  // surface that across all modes (highest-leverage unlock).
  if (m.weather.isBad && !m.hasSkill43) {
    return `今天是 ${m.weather.label}，但你還沒解鎖技能 43。解鎖後今天就能 ×3 線上訂單收入。`
  }
  switch (mode) {
    case 'employee': {
      if (m.employeeCount < 3) return `目前只有 ${m.employeeCount} 個員工，建議先解鎖 maxEmployees perks (perk 0/1/2/3/4) 再雇用。`
      if (m.employeeCount < 5) return `${m.employeeCount} 個員工但 speed skills 只有 ${m.speedSkills} 個，補一個 speed perk 效率翻倍。`
      if (m.speedSkills < 2) return `員工速度疊加不足。skill1/3/17/18/19 各給 +0.2 speed，多解幾個效率倍增。`
      return `員工配置已飽和，可改投 cash 進階 ($${m.cash.toFixed(0)})。`
    }
    case 'customer': {
      if (!m.hasSkill43) return `客流端最有槓桿的是技能 43（壞天氣 ×3）。1000 FP 換 N 倍線上訂單收入。`
      if (m.customerSkills < 2) return `已開 skill 43，下一步解 perk 9 / 10 (extraCustomersPerk += 1×2) 把常日客流拉高。`
      return `客流端已飽和，可考慮轉投收銀。`
    }
    case 'checkout': {
      if (m.checkoutSkills < 1) return `收銀端完全沒點：先解 perk 6 (extraCheckoutMoney += 0.1) 或 perk 16 (productCheckoutWait -= 0.15)。`
      if (m.checkoutSkills < 3) return `目前 ${m.checkoutSkills} 個 checkout skill，補 perk 17/18 (productCheckoutWait -= 0.2/0.15) 把結帳排隊壓下去。`
      return `收銀已達標，轉投回收／製造。`
    }
    case 'recycling': {
      if (m.boxRecycleFactor < 4) return `回收倍率只有 ×${m.boxRecycleFactor}，解鎖 perk 8 一口氣拉到 ×4，bales 收益翻 4 倍。`
      if (m.unpaidInvoices > 0) return `有 ${m.unpaidInvoices} 張發票未付，建議解 perk 34 (autopayInvoices) 避免逾期罰款。`
      return `回收 / 發票端已就位。`
    }
  }
}

function Metric({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  accent?: 'primary' | 'emerald' | 'amber'
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
      : accent === 'amber'
        ? 'border-amber-500/30 text-amber-700 dark:text-amber-300'
        : accent === 'primary'
          ? 'border-primary/30 text-primary'
          : ''
  return (
    <div className={`rounded-md border bg-card p-2 ${accentClass}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide opacity-80">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}
