'use client'

// Tool 4: BenefitComparator — 技能收益對比器
//
// Two skill selectors (A vs B), side-by-side comparison cards, estimated
// impact via parseEffectForMetric / estimateSkillImpact, vs divider with
// 互補 / 較強 badge.

import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeftRight, Sparkles, GitCompare } from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, skillDescFor } from '@/lib/i18n'
import {
  estimateSkillImpact,
  isSkillUnlocked,
  FP_COST_PER_SKILL,
} from '@/lib/skill-engine'
import { ConfidenceBadge } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'

export function BenefitComparator() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const [aId, setAId] = useState<string>(ENC.skills[0]?.id ?? '')
  const [bId, setBId] = useState<string>(ENC.skills[1]?.id ?? '')

  const skillA = useMemo(() => ENC.skills.find((s) => s.id === aId) ?? null, [aId])
  const skillB = useMemo(() => ENC.skills.find((s) => s.id === bId) ?? null, [bId])

  const impactA = useMemo(
    () => (skillA ? estimateSkillImpact(skillA, snapshot) : []),
    [skillA, snapshot],
  )
  const impactB = useMemo(
    () => (skillB ? estimateSkillImpact(skillB, snapshot) : []),
    [skillB, snapshot],
  )

  const comparison = useMemo(
    () => compareImpacts(impactA, impactB),
    [impactA, impactB],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4 text-primary" />
            {t('skilllab.t4.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SkillSelect
              label={t('skilllab.t4.skillA')}
              value={aId}
              onChange={setAId}
            />
            <SkillSelect
              label={t('skilllab.t4.skillB')}
              value={bId}
              onChange={setBId}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Skill A */}
        {skillA && (
          <ComparisonCard
            skill={skillA}
            unlocked={isSkillUnlocked(skillA, snapshot)}
            impacts={impactA}
            accent="emerald"
            label={t('skilllab.t4.skillA')}
            lang={lang}
            t={t}
          />
        )}

        {/* VS divider */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 rounded-full border-2 border-dashed border-primary/30 bg-card p-3">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('skilllab.t4.vs')}
            </span>
            {comparison.kind === 'complementary' && (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px]">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                {t('skilllab.t4.complementary')}
              </Badge>
            )}
            {comparison.kind === 'stronger' && (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                {t('skilllab.t4.stronger')}:{' '}
                {comparison.winner === 'a' ? t('skilllab.t4.skillA') : t('skilllab.t4.skillB')}
              </Badge>
            )}
            {comparison.kind === 'unknown' && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                —
              </Badge>
            )}
          </div>
        </div>

        {/* Skill B */}
        {skillB && (
          <ComparisonCard
            skill={skillB}
            unlocked={isSkillUnlocked(skillB, snapshot)}
            impacts={impactB}
            accent="primary"
            label={t('skilllab.t4.skillB')}
            lang={lang}
            t={t}
          />
        )}
      </div>

      {/* Comparison rationale */}
      {skillA && skillB && comparison.kind !== 'unknown' && (
        <Card>
          <CardContent className="p-4 text-xs">
            <div className="font-semibold text-muted-foreground mb-1">
              {lang === 'en' ? 'Comparison rationale' : '對比說明'}
            </div>
            <div className="text-foreground/90">{comparison.note}</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SkillSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const lang = useLang()
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {ENC.skills.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {skillNameFor(s, lang) || s.id}
              {s.perk != null && (
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  perk#{s.perk}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ComparisonCard({
  skill,
  unlocked,
  impacts,
  accent,
  label,
  lang,
  t,
}: {
  skill: typeof ENC.skills[number]
  unlocked: boolean
  impacts: ReturnType<typeof estimateSkillImpact>
  accent: 'emerald' | 'primary'
  label: string
  lang: ReturnType<typeof useLang>
  t: (k: string) => string
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/40'
      : 'border-primary/40'
  return (
    <Card className={accentClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {unlocked ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
              {t('skilllab.t4.unlocked')}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {t('skilllab.t4.locked')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="font-semibold">{skillNameFor(skill, lang) || skill.id}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge skill={skill} />
          <Badge variant="outline" className="text-[9px]">
            {FP_COST_PER_SKILL} FP
          </Badge>
        </div>
        {skillDescFor(skill, lang) && (
          <div className="text-xs text-muted-foreground">{skillDescFor(skill, lang)}</div>
        )}
        {skill.effect && (
          <code className="block w-full break-all rounded bg-muted px-2 py-1 font-mono text-[10px]">
            {skill.effect}
          </code>
        )}
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('skilllab.t4.estimate')}
          </div>
          {impacts.length === 0 ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            impacts.map((imp, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{imp.metric}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold">{imp.value}</span>
                  <ConfidenceBadge confidence={imp.confidence} />
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ComparisonResult {
  kind: 'complementary' | 'stronger' | 'unknown'
  winner?: 'a' | 'b'
  note: string
}

function compareImpacts(
  a: ReturnType<typeof estimateSkillImpact>,
  b: ReturnType<typeof estimateSkillImpact>,
): ComparisonResult {
  if (a.length === 0 || b.length === 0) {
    return {
      kind: 'unknown',
      note: '一或兩個技能的效果無法被解析，無法直接對比。',
    }
  }
  // Find common metrics.
  const aMetrics = new Set(a.map((x) => x.metric))
  const bMetrics = new Set(b.map((x) => x.metric))
  const common = [...aMetrics].filter((m) => bMetrics.has(m))

  if (common.length === 0) {
    // Complementary — different metrics.
    const aList = a.map((x) => `${x.metric} ${x.value}`).join('、')
    const bList = b.map((x) => `${x.metric} ${x.value}`).join('、')
    return {
      kind: 'complementary',
      note: `兩個技能影響不同的維度：A 影響 ${aList}；B 影響 ${bList}。可以同時投資，效益疊加。`,
    }
  }

  // Stronger — same metric, compare numeric value.
  for (const metric of common) {
    const aImp = a.find((x) => x.metric === metric)
    const bImp = b.find((x) => x.metric === metric)
    if (!aImp || !bImp) continue
    const aNum = parseFloat((aImp.value.match(/-?\d+(\.\d+)?/) ?? ['0'])[0])
    const bNum = parseFloat((bImp.value.match(/-?\d+(\.\d+)?/) ?? ['0'])[0])
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) continue
    if (aNum === bNum) continue
    // For "+X%" metrics higher is stronger; for "-X%" higher (less negative) is also stronger? Keep simple: higher absolute = stronger.
    const aAbs = Math.abs(aNum)
    const bAbs = Math.abs(bNum)
    if (aAbs === bAbs) continue
    const winner = aAbs > bAbs ? 'a' : 'b'
    return {
      kind: 'stronger',
      winner,
      note: `兩個技能都影響「${metric}」：A=${aImp.value}、B=${bImp.value}。${winner === 'a' ? 'A' : 'B'} 的數值加成較大。`,
    }
  }

  // Common metric exists but no numeric difference.
  return {
    kind: 'complementary',
    note: '兩個技能有重疊的效果維度，但數值無法直接比較，可依其他條件（成本、已解鎖）決定。',
  }
}
