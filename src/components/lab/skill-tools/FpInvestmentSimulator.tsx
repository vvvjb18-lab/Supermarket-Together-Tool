'use client'

// Tool 5: FpInvestmentSimulator — FP 投資模擬器
//
// Inputs: current FP, daily FP income estimate. Toggleable skill chips for
// sim purchase. Two prediction cards (buy-now deficit/surplus, days-to-complete).
// Recharts bar showing FP allocation.

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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Calculator,
  RotateCcw,
  Check,
  Lock,
  Calendar,
  PiggyBank,
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor } from '@/lib/i18n'
import {
  getUnlockedSet,
  FP_COST_PER_SKILL,
  TOTAL_SKILLS,
} from '@/lib/skill-engine'
import { useSkillToolsStore } from '@/lib/skill-tools-store'
import { fmt } from '@/components/shared/primitives'
import { SCROLLBAR_CLASSES_SM } from './types'

const DEFAULT_DAILY_FP = 2000

export function FpInvestmentSimulator() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const simSelection = useSkillToolsStore((s) => s.simSelection)
  const toggleSim = useSkillToolsStore((s) => s.toggleSim)
  const clearSim = useSkillToolsStore((s) => s.clearSim)
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const [currentFpInput, setCurrentFpInput] = useState<string>('')
  const [dailyFpInput, setDailyFpInput] = useState<string>(String(DEFAULT_DAILY_FP))

  // currentFp defaults to save.franchisePoints, but user can override.
  const currentFp = useMemo(() => {
    const parsed = parseFloat(currentFpInput)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
    return snapshot?.franchisePoints ?? 0
  }, [currentFpInput, snapshot])

  const dailyFp = useMemo(() => {
    const parsed = parseFloat(dailyFpInput)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return DEFAULT_DAILY_FP
  }, [dailyFpInput])

  const unlockedSet = useMemo(() => getUnlockedSet(snapshot), [snapshot])
  const unlockedCount = unlockedSet.size

  const selectedSkills = useMemo(
    () =>
      ENC.skills.filter(
        (s) => s.perk != null && simSelection.includes(s.perk),
      ),
    [simSelection],
  )

  const selectedCost = selectedSkills.length * FP_COST_PER_SKILL
  const remainingFp = Math.max(0, currentFp - selectedCost)

  // "Buy all now" prediction
  const totalAllCost = TOTAL_SKILLS * FP_COST_PER_SKILL
  const alreadySpent = unlockedCount * FP_COST_PER_SKILL
  const stillOwedForAll = Math.max(0, totalAllCost - alreadySpent - currentFp)
  const surplusIfAll = Math.max(0, currentFp - (totalAllCost - alreadySpent))

  // "Days to complete"
  const deficit = Math.max(0, totalAllCost - alreadySpent - currentFp)
  const daysToComplete = dailyFp > 0 ? Math.ceil(deficit / dailyFp) : 0

  const toggleChip = (perkIdx: number) => {
    // Don't allow toggling already-unlocked skills.
    if (unlockedSet.has(perkIdx)) return
    toggleSim(perkIdx)
  }

  const reset = () => {
    clearSim()
    setCurrentFpInput('')
    setDailyFpInput(String(DEFAULT_DAILY_FP))
  }

  // Chart data
  const chartData = [
    { name: t('skilllab.t5.spent'), value: alreadySpent, color: '#10b981' },
    { name: t('skilllab.t5.reserve'), value: selectedCost, color: '#f59e0b' },
    { name: t('skilllab.t5.remaining'), value: remainingFp, color: '#71717a' },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" />
            {t('skilllab.t5.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t('skilllab.t5.currentFp')}
            </label>
            <Input
              type="number"
              min={0}
              className="mt-1 h-9"
              placeholder={mounted && snapshot ? String(snapshot.franchisePoints ?? 0) : '0'}
              value={currentFpInput}
              onChange={(e) => setCurrentFpInput(e.target.value)}
            />
            {mounted && snapshot && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {lang === 'en' ? 'From save' : '來自存檔'}: {fmt(snapshot.franchisePoints ?? 0, 0)} FP
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t('skilllab.t5.dailyFp')}
            </label>
            <Input
              type="number"
              min={1}
              className="mt-1 h-9"
              value={dailyFpInput}
              onChange={(e) => setDailyFpInput(e.target.value)}
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t('skilllab.t5.dailyHint')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Simulation chips */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-amber-500" />
              {t('skilllab.t5.simBuy')}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <Badge variant="outline">
                {t('skilllab.t5.selected')}: {selectedSkills.length}
              </Badge>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {t('skilllab.t5.totalCost')}: {fmt(selectedCost, 0)} FP
              </Badge>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {t('skilllab.t5.remaining')}: {fmt(remainingFp, 0)} FP
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={reset}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                {t('skilllab.t5.reset')}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={SCROLLBAR_CLASSES_SM}>
            <div className="flex flex-wrap gap-1.5">
              {ENC.skills.map((s) => {
                if (s.perk == null) return null
                const isUnlocked = unlockedSet.has(s.perk)
                const isSelected = simSelection.includes(s.perk)
                const disabled = isUnlocked
                return (
                  <button
                    key={s.id}
                    onClick={() => s.perk != null && toggleChip(s.perk)}
                    disabled={disabled}
                    className={
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition-colors ' +
                      (isUnlocked
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                          : 'border bg-card hover:bg-accent')
                    }
                    title={s.effect || s.id}
                  >
                    {isUnlocked ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : isSelected ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <Lock className="h-2.5 w-2.5 opacity-50" />
                    )}
                    <span className="truncate max-w-[120px]">
                      {skillNameFor(s, lang) || s.id}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Predictions */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PiggyBank className="h-4 w-4 text-amber-500" />
              {t('skilllab.t5.buyAllNow')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={lang === 'en' ? 'Total cost (all 44)' : '總成本（全部 44 個）'} value={`${fmt(totalAllCost, 0)} FP`} />
            <Row label={lang === 'en' ? 'Already spent' : '已花'} value={`${fmt(alreadySpent, 0)} FP`} />
            {stillOwedForAll > 0 ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{t('skilllab.t5.shortfall')}</span>
                  <span className="font-mono text-base font-bold text-rose-700 dark:text-rose-300">
                    {fmt(stillOwedForAll, 0)} FP
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{t('skilllab.t5.surplus')}</span>
                  <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {fmt(surplusIfAll, 0)} FP
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />
              {t('skilllab.t5.daysToComplete')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={lang === 'en' ? 'Deficit' : '缺口'} value={`${fmt(deficit, 0)} FP`} />
            <Row label={t('skilllab.t5.dailyFp')} value={`${fmt(dailyFp, 0)} FP / ${t('skilllab.t5.days')}`} />
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{lang === 'en' ? 'Estimated' : '預估'}</span>
                <span className="font-mono text-base font-bold text-primary">
                  {daysToComplete} {t('skilllab.t5.days')}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {lang === 'en'
                  ? 'Based on your daily FP input.'
                  : '依你輸入的每日 FP 估計。'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allocation chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('skilllab.t5.allocation')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(v: number) => [`${fmt(v, 0)} FP`, '']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  )
}
