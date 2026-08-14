'use client'

// Tool 2: BuildPlanner — 技能樹 Build Planner
//
// Since skills have NO prerequisites, this is reframed as a build shopping
// list + FP budget planner. The user picks skills, and we show running totals
// (FP cost, already-unlocked, still-needed, FP deficit) + a "build lines"
// visualization grouping the picked skills by their perk_to_category category.

import { useMemo, useState, useEffect } from 'react'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  Plus,
  X,
  Check,
  ShoppingCart,
  Layers,
  Coins,
  TrendingUp,
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, skillDescFor } from '@/lib/i18n'
import {
  getUnlockedSet,
  groupSkillsByCategory,
  presetSkillIds,
  computeFpNeededForPlan,
  FP_COST_PER_SKILL,
  type PresetKey,
} from '@/lib/skill-engine'
import { useSkillToolsStore } from '@/lib/skill-tools-store'
import { ConfidenceBadge, fmt } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'
import { SCROLLBAR_CLASSES_SM } from './types'

export function BuildPlanner() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const buildPlan = useSkillToolsStore((s) => s.buildPlan)
  const addToBuild = useSkillToolsStore((s) => s.addToBuild)
  const removeFromBuild = useSkillToolsStore((s) => s.removeFromBuild)
  const addManyToBuild = useSkillToolsStore((s) => s.addManyToBuild)
  const clearBuild = useSkillToolsStore((s) => s.clearBuild)
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const unlockedSet = useMemo(() => getUnlockedSet(snapshot), [snapshot])

  const allSkills = ENC.skills
  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allSkills
    return allSkills.filter((s) => {
      const name = skillNameFor(s, lang).toLowerCase()
      return (
        name.includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.name.en.toLowerCase().includes(q) ||
        (s.name.zhHant ?? '').toLowerCase().includes(q) ||
        s.effect.toLowerCase().includes(q)
      )
    })
  }, [allSkills, query, lang])

  const planSkills = useMemo(
    () =>
      buildPlan
        .map((id) => ENC.skills.find((s) => s.id === id))
        .filter((s): s is typeof ENC.skills[number] => !!s),
    [buildPlan],
  )

  const totalSkills = planSkills.length
  const totalFp = totalSkills * FP_COST_PER_SKILL
  const alreadyUnlocked = planSkills.filter(
    (s) => s.perk != null && unlockedSet.has(s.perk),
  ).length
  const needBuy = Math.max(0, totalSkills - alreadyUnlocked)
  const needFp = useMemo(
    () => computeFpNeededForPlan(buildPlan, snapshot),
    [buildPlan, snapshot],
  )
  const progressPct = totalSkills > 0 ? (alreadyUnlocked / totalSkills) * 100 : 0

  const planByCategory = useMemo(() => groupSkillsByCategory(planSkills), [planSkills])

  const applyPreset = (preset: PresetKey) => {
    const ids = presetSkillIds(preset)
    addManyToBuild(ids, `preset:${preset}`)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
      {/* LEFT: skill picker */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-emerald-500" />
            {lang === 'en' ? 'Skill Picker' : '技能挑選器'}
            <Badge variant="outline" className="ml-1 text-[10px]">
              {ENC.skills.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs"
              placeholder={t('skilllab.t2.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-[10px] text-muted-foreground">
              {t('skilllab.t2.presets')}:
            </span>
            <PresetButton label={t('skilllab.t2.preset.employee')} onClick={() => applyPreset('employee')} />
            <PresetButton label={t('skilllab.t2.preset.checkout')} onClick={() => applyPreset('checkout')} />
            <PresetButton label={t('skilllab.t2.preset.customer')} onClick={() => applyPreset('customer')} />
            <PresetButton label={t('skilllab.t2.preset.recycle')} onClick={() => applyPreset('recycle')} />
          </div>

          <div className={SCROLLBAR_CLASSES_SM + ' flex-1'}>
            <div className="space-y-1">
              {filteredSkills.map((s) => {
                const inPlan = buildPlan.includes(s.id)
                const isUnlocked = s.perk != null && unlockedSet.has(s.perk)
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      inPlan ? removeFromBuild(s.id) : addToBuild(s.id, 'picker')
                    }
                    className={
                      'flex w-full items-center gap-2 rounded-md border bg-card p-2 text-left text-xs transition-colors hover:bg-accent ' +
                      (inPlan ? 'ring-2 ring-primary ring-offset-1' : '')
                    }
                  >
                    <span
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ' +
                        (inPlan
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-muted-foreground/30 text-muted-foreground')
                      }
                    >
                      {inPlan ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {skillNameFor(s, lang) || s.id}
                        </span>
                        {isUnlocked && (
                          <Badge variant="outline" className="shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px]">
                            {t('skilllab.t4.unlocked')}
                          </Badge>
                        )}
                      </div>
                      {s.effect && (
                        <code className="block truncate font-mono text-[9px] text-muted-foreground">
                          {s.effect}
                        </code>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: build list */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              {t('skilllab.t2.myBuild')}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {totalSkills} {lang === 'en' ? 'skills' : '技能'}
              </Badge>
              {totalSkills > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={clearBuild}
                >
                  <X className="mr-1 h-3 w-3" />
                  {t('skilllab.t2.clear')}
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {/* Running totals */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Total label={t('skilllab.t2.totalSkills')} value={String(totalSkills)} icon={<Layers className="h-3.5 w-3.5" />} />
            <Total label={t('skilllab.t2.totalFp')} value={fmt(totalFp, 0)} icon={<Coins className="h-3.5 w-3.5" />} accent="primary" />
            <Total label={t('skilllab.t2.alreadyUnlocked')} value={String(alreadyUnlocked)} icon={<Check className="h-3.5 w-3.5" />} accent="emerald" />
            <Total label={t('skilllab.t2.needBuy')} value={String(needBuy)} icon={<ShoppingCart className="h-3.5 w-3.5" />} accent="amber" />
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('skilllab.t2.progress')}</span>
              <span className="font-mono">{fmt(progressPct, 0)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* FP still needed */}
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                {t('skilllab.t2.needFp')}
              </span>
              <span className="font-mono text-base font-bold text-amber-700 dark:text-amber-300">
                {fmt(needFp, 0)} FP
              </span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {mounted && snapshot
                ? `${lang === 'en' ? 'Available' : '可用'} ${fmt(snapshot.franchisePoints, 0)} FP`
                : t('skilllab.no.save')}
            </div>
          </div>

          {/* Plan list */}
          {planSkills.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              {t('skilllab.t2.empty')}
            </div>
          ) : (
            <div className={SCROLLBAR_CLASSES_SM + ' flex-1'}>
              <div className="space-y-1.5">
                {planSkills.map((s) => {
                  const isUnlocked = s.perk != null && unlockedSet.has(s.perk)
                  return (
                    <div
                      key={s.id}
                      className={
                        'flex items-start gap-2 rounded-md border bg-card p-2 text-xs ' +
                        (isUnlocked ? 'border-l-2 border-l-emerald-500' : '')
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">
                            {skillNameFor(s, lang) || s.id}
                          </span>
                          <button
                            onClick={() => removeFromBuild(s.id)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label="remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <CategoryBadge skill={s} />
                          {isUnlocked && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px]">
                              {t('skilllab.t4.unlocked')}
                            </Badge>
                          )}
                        </div>
                        {s.effect && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <code className="mt-1 block w-full cursor-help truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                                {s.effect}
                              </code>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md">
                              <div className="space-y-1 text-xs">
                                <div className="font-mono text-[10px] break-all">{s.effect}</div>
                                <div className="text-muted-foreground">{skillDescFor(s, lang)}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Build lines visualization */}
          {planSkills.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t('skilllab.t2.buildLines')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(planByCategory.entries()).map(([cat, skills]) => (
                  <BuildLinePill key={cat} cat={cat} count={skills.length} skills={skills} />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end">
            <ConfidenceBadge
              confidence="confirmed"
              formula={`${FP_COST_PER_SKILL} FP per skill (no prereqs)`}
              note="skill-graph.json _meta.note"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[11px]"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function Total({
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

function BuildLinePill({
  cat,
  count,
  skills,
}: {
  cat: string
  count: number
  skills: typeof ENC.skills
}) {
  const lang = useLang()
  const display = cat === '__uncategorized__' ? (lang === 'en' ? 'Uncategorized' : '未分類') : cat
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[10px]">
          <span className="font-mono font-semibold">{display}</span>
          <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
            {count}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          {skills.map((s) => (
            <div key={s.id} className="truncate">
              {skillNameFor(s, lang) || s.id}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// (End of BuildPlanner)
