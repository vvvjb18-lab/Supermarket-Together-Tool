'use client'

// Tool 6: SaveDiffAnalyzer — 存檔差異分析
//
// Two file inputs (Save A older, Save B newer). Parse each via parseSaveFile
// (which auto-routes between extracted / clean-snapshot / raw ES3 formats).
// Diff: newly-unlocked skills, skill count change, FP/Day/Money deltas, etc.
// Timeline visual with newly-unlocked skills as nodes along the line.

import { useMemo, useState, useCallback, useRef } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitCompare,
  Upload,
  FileJson,
  Calendar,
  Coins,
  Users,
  Layout,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Unlock,
} from 'lucide-react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useLang, useSkillToolLabel, skillNameFor } from '@/lib/i18n'
import {
  parseSaveFile,
  type ES3ParseResult,
} from '@/lib/es3-parser'
import type { SaveSnapshot } from '@/lib/types'
import {
  getUnlockedSkillIndices,
  FP_COST_PER_SKILL,
} from '@/lib/skill-engine'
import { ConfidenceBadge, fmt, fmtMoney } from '@/components/shared/primitives'
import { CategoryBadge } from './category-badge'

interface SaveSlot {
  fileName: string
  snapshot: SaveSnapshot | null
  result: ES3ParseResult | null
  error: string | null
}

const EMPTY_SLOT: SaveSlot = {
  fileName: '',
  snapshot: null,
  result: null,
  error: null,
}

export function SaveDiffAnalyzer() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const [a, setA] = useState<SaveSlot>(EMPTY_SLOT)
  const [b, setB] = useState<SaveSlot>(EMPTY_SLOT)
  const aInputRef = useRef<HTMLInputElement>(null)
  const bInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File, target: 'a' | 'b') => {
      const setter = target === 'a' ? setA : setB
      try {
        const text = await file.text()
        const result = parseSaveFile(text, file.name)
        if (result.status === 'failed' || !result.snapshot) {
          setter({
            fileName: file.name,
            snapshot: null,
            result,
            error: result.warnings.join('; ') || 'parse failed',
          })
          return
        }
        setter({
          fileName: file.name,
          snapshot: result.snapshot,
          result,
          error: null,
        })
      } catch (e: any) {
        setter({
          fileName: file.name,
          snapshot: null,
          result: null,
          error: e?.message ?? 'unknown error',
        })
      }
    },
    [],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'a' | 'b') => {
    const file = e.target.files?.[0]
    if (file) handleFile(file, target)
    // Reset input value so picking the same file again re-triggers.
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent, target: 'a' | 'b') => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file, target)
  }

  const reset = () => {
    setA(EMPTY_SLOT)
    setB(EMPTY_SLOT)
  }

  const diff = useMemo(() => computeDiff(a.snapshot, b.snapshot), [a, b])
  const hasBoth = a.snapshot && b.snapshot

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-primary" />
              {t('skilllab.t6.title')}
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={reset}>
              <RefreshCw className="mr-1 h-3 w-3" />
              {t('skilllab.t6.recompare')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FileDropZone
            label={t('skilllab.t6.saveA')}
            slot={a}
            onPick={() => aInputRef.current?.click()}
            onDrop={(e) => handleDrop(e, 'a')}
            accent="muted"
          />
          <input
            ref={aInputRef}
            type="file"
            accept=".json,.es3"
            className="hidden"
            onChange={(e) => handleInputChange(e, 'a')}
          />
          <FileDropZone
            label={t('skilllab.t6.saveB')}
            slot={b}
            onPick={() => bInputRef.current?.click()}
            onDrop={(e) => handleDrop(e, 'b')}
            accent="emerald"
          />
          <input
            ref={bInputRef}
            type="file"
            accept=".json,.es3"
            className="hidden"
            onChange={(e) => handleInputChange(e, 'b')}
          />
        </CardContent>
      </Card>

      {/* Hint when only one is loaded */}
      {!hasBoth && (a.snapshot || b.snapshot) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {t('skilllab.t6.needBoth')}
          </CardContent>
        </Card>
      )}

      {/* Empty state when neither loaded */}
      {!a.snapshot && !b.snapshot && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FileJson className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {lang === 'en'
                ? 'Upload two save files (A older, B newer) to compare.'
                : '上傳兩個存檔（A 舊、B 新）以進行比較。'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff results */}
      {hasBoth && diff && (
        <>
          {/* KPI changes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-primary" />
                {t('skilllab.t6.otherKpi')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiChange
                icon={<Unlock className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.skillCount')}
                a={diff.aSkillCount}
                b={diff.bSkillCount}
                delta={diff.bSkillCount - diff.aSkillCount}
              />
              <KpiChange
                icon={<Coins className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.fpChange')}
                a={diff.aFpEarned}
                b={diff.bFpEarned}
                delta={diff.bFpEarned - diff.aFpEarned}
              />
              <KpiChange
                icon={<Calendar className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.dayChange')}
                a={diff.aDay}
                b={diff.bDay}
                delta={diff.bDay - diff.aDay}
              />
              <KpiChange
                icon={<Coins className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.moneyChange')}
                a={diff.aMoney}
                b={diff.bMoney}
                delta={diff.bMoney - diff.aMoney}
                isMoney
              />
              <KpiChange
                icon={<Users className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.employees')}
                a={diff.aEmployees}
                b={diff.bEmployees}
                delta={diff.bEmployees - diff.aEmployees}
              />
              <KpiChange
                icon={<Layout className="h-3.5 w-3.5" />}
                label={t('skilllab.t6.props')}
                a={diff.aProps}
                b={diff.bProps}
                delta={diff.bProps - diff.aProps}
              />
            </CardContent>
          </Card>

          {/* Newly unlocked skills */}
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Unlock className="h-4 w-4 text-emerald-500" />
                  {t('skilllab.t6.newSkills')}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                    +{diff.newlyUnlocked.length}
                  </Badge>
                  <ConfidenceBadge
                    confidence="confirmed"
                    formula="B.skillUnlocks \\ A.skillUnlocks"
                    sources={['save.skill_unlocks.unlockedIndices']}
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {diff.newlyUnlocked.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed py-8 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t('skilllab.t6.noChange')}
                </div>
              ) : (
                <>
                  {/* Timeline visual */}
                  <TimelineVisual
                    aDay={diff.aDay}
                    bDay={diff.bDay}
                    newSkills={diff.newlyUnlocked}
                  />
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {diff.newlyUnlocked.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start gap-2 rounded-md border border-l-2 border-l-emerald-500 bg-card p-2 text-xs"
                      >
                        <Unlock className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold">
                              {skillNameFor(s, lang) || s.id}
                            </span>
                            {s.perk != null && (
                              <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                                perk#{s.perk}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <CategoryBadge skill={s} />
                            <Badge variant="outline" className="text-[9px]">
                              {FP_COST_PER_SKILL} FP
                            </Badge>
                          </div>
                          {s.effect && (
                            <code className="mt-1 block truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                              {s.effect}
                            </code>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function FileDropZone({
  label,
  slot,
  onPick,
  onDrop,
  accent,
}: {
  label: string
  slot: SaveSlot
  onPick: () => void
  onDrop: (e: React.DragEvent) => void
  accent: 'muted' | 'emerald'
}) {
  const lang = useLang()
  const t = useSkillToolLabel()
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-500/40 hover:border-emerald-500/70 bg-emerald-500/5'
      : 'border-muted-foreground/30 hover:border-muted-foreground/60'
  return (
    <div
      onClick={onPick}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className={
        'flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ' +
        accentClass
      }
    >
      {slot.error ? (
        <>
          <AlertCircle className="h-6 w-6 text-rose-500" />
          <div className="text-xs font-semibold text-rose-600">{t('skilllab.t6.parseError')}</div>
          <div className="max-w-full break-all text-[10px] text-muted-foreground">{slot.error}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{slot.fileName}</div>
        </>
      ) : slot.snapshot ? (
        <>
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <div className="text-sm font-semibold">{slot.fileName}</div>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <Badge variant="outline">Day {slot.snapshot.day}</Badge>
            <Badge variant="outline">{fmtMoney(slot.snapshot.money)}</Badge>
            <Badge variant="outline">
              <Users className="mr-1 h-2.5 w-2.5" />
              {slot.snapshot.employees.length}
            </Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {getUnlockedSkillIndices(slot.snapshot).length}/44
            </Badge>
          </div>
        </>
      ) : (
        <>
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{t('skilllab.t6.drop')}</div>
          {lang === 'en' ? (
            <div className="text-[10px] text-muted-foreground">.json or .es3</div>
          ) : (
            <div className="text-[10px] text-muted-foreground">.json 或 .es3</div>
          )}
        </>
      )}
    </div>
  )
}

function KpiChange({
  icon,
  label,
  a,
  b,
  delta,
  isMoney,
}: {
  icon: React.ReactNode
  label: string
  a: number
  b: number
  delta: number
  isMoney?: boolean
}) {
  const fmtV = (v: number) => (isMoney ? fmtMoney(v) : fmt(v, 0))
  const deltaColor =
    delta > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta < 0
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'
  const deltaStr = delta > 0 ? `+${isMoney ? fmtMoney(delta) : fmt(delta, 0)}` : delta < 0 ? `${isMoney ? fmtMoney(delta) : fmt(delta, 0)}` : '0'
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-sm">{fmtV(a)}</span>
        <span className="text-[10px]">→</span>
        <span className="font-mono text-sm font-bold">{fmtV(b)}</span>
      </div>
      <div className={`mt-0.5 font-mono text-[11px] ${deltaColor}`}>{deltaStr}</div>
    </div>
  )
}

interface DiffResult {
  aSkillCount: number
  bSkillCount: number
  aFpEarned: number
  bFpEarned: number
  aDay: number
  bDay: number
  aMoney: number
  bMoney: number
  aEmployees: number
  bEmployees: number
  aProps: number
  bProps: number
  newlyUnlocked: typeof ENC.skills
}

function computeDiff(
  a: SaveSnapshot | null,
  b: SaveSnapshot | null,
): DiffResult | null {
  if (!a || !b) return null
  const aIdx = new Set(getUnlockedSkillIndices(a))
  const bIdx = new Set(getUnlockedSkillIndices(b))
  const newlyUnlockedPerks = Array.from(bIdx).filter((idx) => !aIdx.has(idx))
  const newlyUnlocked = ENC.skills.filter(
    (s) => s.perk != null && newlyUnlockedPerks.includes(s.perk),
  )
  return {
    aSkillCount: aIdx.size,
    bSkillCount: bIdx.size,
    aFpEarned: a.franchiseExperience ?? 0,
    bFpEarned: b.franchiseExperience ?? 0,
    aDay: a.day,
    bDay: b.day,
    aMoney: a.money,
    bMoney: b.money,
    aEmployees: a.employees?.length ?? 0,
    bEmployees: b.employees?.length ?? 0,
    aProps: a.storeLayout?.length ?? 0,
    bProps: b.storeLayout?.length ?? 0,
    newlyUnlocked,
  }
}

function TimelineVisual({
  aDay,
  bDay,
  newSkills,
}: {
  aDay: number
  bDay: number
  newSkills: typeof ENC.skills
}) {
  const lang = useLang()
  const daySpan = Math.max(1, bDay - aDay)
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {lang === 'en' ? 'Timeline' : '時間軸'}
      </div>
      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-[6px] top-0 h-full w-0.5 bg-gradient-to-b from-muted-foreground/40 to-emerald-500" />
        {/* A node */}
        <div className="relative mb-3">
          <span className="absolute -left-[14px] top-1 h-3 w-3 rounded-full border-2 border-muted-foreground bg-background" />
          <div className="text-xs">
            <span className="font-mono font-semibold">Day {aDay}</span>
            <span className="ml-2 text-muted-foreground">
              {lang === 'en' ? 'Save A' : '存檔 A'}
            </span>
          </div>
        </div>
        {/* Newly unlocked skills along the line */}
        {newSkills.map((s, i) => {
          // Distribute along the timeline proportionally (just for visual).
          const pct = newSkills.length > 1 ? (i / (newSkills.length - 1)) * 100 : 50
          return (
            <div key={s.id} className="relative mb-2" style={{ marginLeft: `${pct * 0.2}%` }}>
              <span className="absolute -left-[14px] top-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
              <div className="text-xs">
                <span className="font-medium">{skillNameFor(s, lang) || s.id}</span>
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  +{FP_COST_PER_SKILL} FP
                </span>
              </div>
            </div>
          )
        })}
        {/* B node */}
        <div className="relative mt-3">
          <span className="absolute -left-[14px] top-1 h-3 w-3 rounded-full border-2 border-emerald-500 bg-emerald-500" />
          <div className="text-xs">
            <span className="font-mono font-semibold">Day {bDay}</span>
            <span className="ml-2 text-muted-foreground">
              {lang === 'en' ? 'Save B' : '存檔 B'} (+{daySpan}d)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// (End of SaveDiffAnalyzer)
