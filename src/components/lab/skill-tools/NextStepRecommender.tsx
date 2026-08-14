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
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, skillDescFor } from '@/lib/i18n'
import {
  recommendNextSkills,
  getUnlockedSet,
  type StrategyMode,
} from '@/lib/skill-engine'
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              {t('skilllab.t3.title')}
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="mode-weighted ROI × unlocked-state filter"
              sources={['skill-engine.recommendNextSkills']}
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
            <Metric label={t('skilllab.t3.metric.speedSkills')} value={String(metrics.speedSkills)} icon={<Lightbulb className="h-3.5 w-3.5" />} accent="emerald" />
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
  return { employeeCount, speedSkills, checkoutSkills, customerSkills, recycleSkills }
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
