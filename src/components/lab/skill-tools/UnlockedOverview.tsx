'use client'

// Tool 1: UnlockedOverview — 已解鎖技能總覽
//
// Big progress header + two-column unlocked/locked lists (or category-grouped view).

import { useMemo, useState, useEffect } from 'react'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Unlock,
  Lock,
  Check,
  List as ListIcon,
  FolderTree,
  Upload,
  Coins,
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, skillDescFor } from '@/lib/i18n'
import type { Skill } from '@/lib/types'
import {
  getUnlockedSkillIndices,
  getUnlockedSet,
  groupSkillsByCategory,
  FP_COST_PER_SKILL,
  TOTAL_SKILLS,
} from '@/lib/skill-engine'
import { ConfidenceBadge, fmt } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'
import { SCROLLBAR_CLASSES } from './types'

export function UnlockedOverview() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const [mounted, setMounted] = useState(false)
  const [view, setView] = useState<'list' | 'category'>('list')

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const unlockedIndices = useMemo(
    () => getUnlockedSkillIndices(snapshot),
    [snapshot],
  )
  const unlockedSet = useMemo(
    () => getUnlockedSet(snapshot),
    [snapshot],
  )

  const unlockedSkills = useMemo(
    () =>
      ENC.skills.filter(
        (s) => s.perk != null && unlockedSet.has(s.perk),
      ),
    [unlockedSet],
  )
  const lockedSkills = useMemo(
    () =>
      ENC.skills.filter(
        (s) => s.perk != null && !unlockedSet.has(s.perk),
      ),
    [unlockedSet],
  )

  const earnedFp = snapshot?.franchiseExperience ?? 0
  const availableFp = snapshot?.franchisePoints ?? 0
  const spentFp = Math.max(0, earnedFp - availableFp)
  const skillCost = unlockedIndices.length * FP_COST_PER_SKILL
  const unlockPct = TOTAL_SKILLS > 0 ? (unlockedIndices.length / TOTAL_SKILLS) * 100 : 0

  // Empty state: no save loaded
  if (mounted && !snapshot) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-semibold">{t('skilllab.no.save')}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t('skilllab.t1.title')}
            </div>
          </div>
          <Button onClick={() => loadDemo()}>
            <Upload className="mr-2 h-4 w-4" />
            {t('skilllab.load.demo')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-emerald-500" />
              {t('skilllab.t1.title')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {unlockedIndices.length} / {TOTAL_SKILLS}
              </Badge>
              <ConfidenceBadge
                confidence={snapshot?.confidence ?? 'needs-save'}
                formula="snapshot.skillUnlocks[]"
                sources={['save.skill_unlocks.unlockedIndices']}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-end justify-between text-sm">
              <span className="font-semibold">
                {t('skilllab.unlocked.count')} {unlockedIndices.length} / {TOTAL_SKILLS}{' '}
                {lang === 'en' ? 'skills' : '技能'}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {fmt(unlockPct, 1)}%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                style={{ width: `${unlockPct}%` }}
              />
            </div>
          </div>

          {/* FP stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FpStat
              label={t('skilllab.fp.earned')}
              value={fmt(earnedFp, 0)}
              accent="primary"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
            <FpStat
              label={t('skilllab.fp.available')}
              value={fmt(availableFp, 0)}
              accent="emerald"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
            <FpStat
              label={t('skilllab.fp.spent')}
              value={fmt(spentFp, 0)}
              accent="amber"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
            <FpStat
              label={t('skilllab.fp.cost.skill')}
              value={fmt(skillCost, 0)}
              hint={`${unlockedIndices.length} × ${FP_COST_PER_SKILL}`}
              accent="primary"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as 'list' | 'category')}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          <ToggleGroupItem value="list" className="text-xs gap-1.5">
            <ListIcon className="h-3.5 w-3.5" />
            {t('skilllab.t1.list')}
          </ToggleGroupItem>
          <ToggleGroupItem value="category" className="text-xs gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            {t('skilllab.t1.byCategory')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'list' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Unlocked column */}
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Unlock className="h-4 w-4 text-emerald-500" />
                  {t('skilllab.unlocked.count')}
                </span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                  {unlockedSkills.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unlockedSkills.length === 0 ? (
                <EmptyList label={lang === 'en' ? 'No skills unlocked yet.' : '尚未解鎖任何技能。'} />
              ) : (
                <div className={SCROLLBAR_CLASSES}>
                  <div className="space-y-1.5">
                    {unlockedSkills.map((s) => (
                      <SkillRowCard key={s.id} skill={s} unlocked />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Locked column */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  {t('skilllab.t1.locked')}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {lockedSkills.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lockedSkills.length === 0 ? (
                <EmptyList label={lang === 'en' ? 'All skills unlocked!' : '所有技能都已解鎖！'} />
              ) : (
                <div className={SCROLLBAR_CLASSES}>
                  <div className="space-y-1.5">
                    {lockedSkills.map((s) => (
                      <SkillRowCard key={s.id} skill={s} unlocked={false} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <CategoryGroupedView
          unlockedSkills={unlockedSkills}
          lockedSkills={lockedSkills}
        />
      )}
    </div>
  )
}

function FpStat({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string
  value: string
  hint?: string
  accent: 'primary' | 'emerald' | 'amber'
  icon?: React.ReactNode
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
      : accent === 'amber'
        ? 'border-amber-500/30 text-amber-700 dark:text-amber-300'
        : 'border-primary/30 text-primary'
  return (
    <div className={`rounded-lg border bg-card p-3 ${accentClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] opacity-70">{hint}</div>}
    </div>
  )
}

function EmptyList({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      {label}
    </div>
  )
}

function SkillRowCard({ skill, unlocked }: { skill: Skill; unlocked: boolean }) {
  const lang = useLang()
  const name = skillNameFor(skill, lang) || skill.id
  const desc = skillDescFor(skill, lang) || ''
  const eff = skill.effect || ''
  return (
    <div
      className={
        'flex items-start gap-2 rounded-md border bg-card p-2.5 text-xs transition-colors ' +
        (unlocked
          ? 'border-l-2 border-l-emerald-500 border-y-transparent border-r-transparent'
          : 'opacity-70')
      }
    >
      <span
        className={
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' +
          (unlocked ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')
        }
      >
        {unlocked ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{name}</span>
          {skill.perk != null && (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              perk#{skill.perk}
            </span>
          )}
        </div>
        {desc && <div className="truncate text-[11px] text-muted-foreground">{desc}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <CategoryBadge skill={skill} />
          {eff && (
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="block max-w-full cursor-help truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                  {eff}
                </code>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-md">
                <div className="space-y-1 text-xs">
                  <div className="font-mono text-[10px] break-all">{eff}</div>
                  <div className="text-muted-foreground">
                    IL: {skill.il} · FP: {FP_COST_PER_SKILL}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryGroupedView({
  unlockedSkills,
  lockedSkills,
}: {
  unlockedSkills: Skill[]
  lockedSkills: Skill[]
}) {
  const lang = useLang()
  const t = useSkillToolLabel()
  const all = useMemo(() => [...unlockedSkills, ...lockedSkills], [unlockedSkills, lockedSkills])
  const groups = useMemo(() => groupSkillsByCategory(all), [all])
  const unlockedSet = useMemo(() => new Set(unlockedSkills.map((s) => s.id)), [unlockedSkills])

  // Sort groups: with unlocked first (by count desc), then by name.
  const sortedGroups = useMemo(() => {
    return Array.from(groups.entries()).sort((a, b) => {
      const aUnlocked = a[1].filter((s) => unlockedSet.has(s.id)).length
      const bUnlocked = b[1].filter((s) => unlockedSet.has(s.id)).length
      if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked
      return a[0].localeCompare(b[0])
    })
  }, [groups, unlockedSet])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FolderTree className="h-4 w-4 text-emerald-500" />
          {t('skilllab.t1.byCategory')}
          <Badge variant="outline" className="ml-1 text-[10px]">
            {sortedGroups.length} {lang === 'en' ? 'groups' : '群組'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={SCROLLBAR_CLASSES}>
          <div className="space-y-3">
            {sortedGroups.map(([catName, skills]) => {
              const unlockedCount = skills.filter((s) => unlockedSet.has(s.id)).length
              const display = catName === '__uncategorized__' ? '未分類' : catName
              return (
                <div key={catName} className="rounded-md border bg-card/60 p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{display}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {unlockedCount} / {skills.length}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {skills.map((s) => (
                      <SkillRowCard key={s.id} skill={s} unlocked={unlockedSet.has(s.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// (End of UnlockedOverview)
