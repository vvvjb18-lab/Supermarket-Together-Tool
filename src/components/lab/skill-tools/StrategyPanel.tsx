'use client'

// Tool 7: StrategyPanel — 策略面板
//
// Combines current save's store state with skill analysis for tailored
// recommendations. Auto-detects a store archetype, shows tailored skill recs,
// and renders a 5-axis radar chart via recharts.

import { useMemo, useState, useEffect } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Users,
  User,
  Store,
  TrendingUp,
  LayoutGrid,
  FileQuestion,
  Lightbulb,
  Check,
  Lock,
  Upload,
} from 'lucide-react'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor } from '@/lib/i18n'
import {
  computeStoreProfile,
  computeStrategyRadar,
  tailoredRecommendations,
  FP_COST_PER_SKILL,
  type StoreProfile,
} from '@/lib/skill-engine'
import { ConfidenceBadge, fmt } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'

const PROFILE_ICONS: Record<string, React.ReactNode> = {
  Users: <Users className="h-6 w-6" />,
  User: <User className="h-6 w-6" />,
  Store: <Store className="h-6 w-6" />,
  TrendingUp: <TrendingUp className="h-6 w-6" />,
  LayoutGrid: <LayoutGrid className="h-6 w-6" />,
  FileQuestion: <FileQuestion className="h-6 w-6" />,
}

export function StrategyPanel() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const profile: StoreProfile = useMemo(
    () => computeStoreProfile(snapshot),
    [snapshot],
  )
  const radar = useMemo(() => computeStrategyRadar(snapshot), [snapshot])
  const recs = useMemo(
    () => tailoredRecommendations(snapshot, profile, 5),
    [snapshot, profile],
  )

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
              {t('skilllab.t7.title')}
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

  // (no save state handled above)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
      {/* LEFT: Profile + Recommendations */}
      <div className="space-y-4">
        {/* Profile card */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                {t('skilllab.t7.profile')}
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="heuristic by employees/props/layout/day"
                sources={['snapshot.employees', 'snapshot.storeLayout', 'snapshot.layout', 'snapshot.day']}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {PROFILE_ICONS[profile.icon] ?? <Store className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{profile.archetype}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {profile.description}
                </div>
              </div>
            </div>
            {/* Profile metrics */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Object.entries(profile.metrics).map(([k, v]) => (
                <div key={k} className="rounded-md border bg-card p-1.5 text-center">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  <div className="font-mono text-sm font-bold">{String(v)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tailored recommendations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              {t('skilllab.t7.recommendations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recs.length === 0 ? (
              <div className="flex items-center justify-center rounded-md border border-dashed py-6 text-xs text-muted-foreground">
                {lang === 'en' ? 'No recommendations available.' : '暫無推薦。'}
              </div>
            ) : (
              recs.map((rec) => {
                const s = rec.skill
                return (
                  <div
                    key={s.id}
                    className={
                      'flex items-start gap-2 rounded-md border bg-card p-2.5 text-xs ' +
                      (rec.unlocked ? 'border-l-2 border-l-emerald-500 opacity-80' : '')
                    }
                  >
                    <span
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
                        (rec.unlocked
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')
                      }
                    >
                      {rec.unlocked ? <Check className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                          {skillNameFor(s, lang) || s.id}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {rec.unlocked ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px]">
                              <Check className="mr-0.5 h-2.5 w-2.5" />
                              {t('skilllab.t4.unlocked')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground">
                              <Lock className="mr-0.5 h-2.5 w-2.5" />
                              {FP_COST_PER_SKILL} FP
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <CategoryBadge skill={s} />
                      </div>
                      <div className="mt-1 text-[11px] text-foreground/90">{rec.reason}</div>
                      {s.effect && (
                        <code className="mt-1 block truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                          {s.effect}
                        </code>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: Radar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t('skilllab.t7.radar')}
            </span>
            <ConfidenceBadge
              confidence="proxy"
              formula="unlocked-in-axis / total-in-axis × 100"
              sources={['skill-engine.computeStrategyRadar']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar}>
                <PolarGrid stroke="currentColor" className="text-muted-foreground/30" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {/* Axis breakdown */}
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {radar.map((r) => (
              <div
                key={r.axis}
                className="flex items-center justify-between rounded-md border bg-card px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{r.axis}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.unlocked}/{r.total}
                  </span>
                  <span className="font-mono font-bold">{fmt(r.score, 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

