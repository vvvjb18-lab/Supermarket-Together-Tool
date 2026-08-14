'use client'

// ============================================================
// SkillsDataTable — Full-featured 44-skills data table
// Features: search, category filter pills, column sort, export TSV,
//           detail row expansion with parsed effect, zebra striping,
//           sticky header, responsive horizontal scroll.
// ============================================================

import { useMemo, useState, useCallback } from 'react'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  getSkillCategoryForSkill,
  categoryColor,
  isSkillUnlocked,
  parseEffectForMetric,
  FP_COST_PER_SKILL,
  TOTAL_SKILLS,
  type ParsedEffect,
  type SkillCategory,
} from '@/lib/skill-engine'
import { useSaveStore } from '@/lib/store'
import { useLang, useSkillToolLabel, skillNameFor, type Lang } from '@/lib/i18n'
import type { Skill } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Filter,
  Unlock,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SCROLLBAR_CLASSES } from './types'
import { ConfidenceBadge } from '@/components/shared/primitives'

// ============================================================
// Types
// ============================================================

type SortKey = 'index' | 'id' | 'name' | 'category' | 'effect' | 'status'
type SortDir = 'asc' | 'desc'

interface SkillRow {
  skill: Skill
  perkIndex: number | null
  name: string
  category: SkillCategory | null
  categoryColor: string
  effectText: string
  parsedEffects: ParsedEffect[]
  unlocked: boolean
}

// ============================================================
// Helper: download TSV
// ============================================================

function downloadTsv(data: Record<string, string | number>[], filename: string) {
  if (data.length === 0) return
  const keys = Object.keys(data[0])
  const header = keys.join('\t')
  const rows = data.map((r) => keys.map((k) => String(r[k] ?? '')).join('\t'))
  const tsv = [header, ...rows].join('\n')
  const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// Sort indicator (declared outside render to satisfy ESLint)
// ============================================================

function SortIndicator({ column, current, dir }: { column: SortKey; current: SortKey; dir: SortDir }) {
  if (current !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
  return dir === 'asc'
    ? <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    : <ArrowDown className="ml-1 h-3 w-3 text-primary" />
}

// ============================================================
// Main Component
// ============================================================

export function SkillsDataTable() {
  const lang = useLang()
  const t = useSkillToolLabel()
  const snapshot = useSaveStore((s) => s.snapshot)

  // State
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set()) // empty = all

  // Build all 44 skill rows
  const allRows: SkillRow[] = useMemo(() => {
    return ENC.skills.map((skill) => {
      const cat = getSkillCategoryForSkill(skill)
      const catColor = cat ? categoryColor(cat.name) : '#71717a'
      const parsed = parseEffectForMetric(skill.effect)
      const effectText = parsed.length > 0
        ? parsed.map((p) => `${p.metric} ${p.delta}`).join('; ')
        : skill.effect || '—'
      return {
        skill,
        perkIndex: skill.perk,
        name: skillNameFor(skill, lang),
        category: cat,
        categoryColor: catColor,
        effectText,
        parsedEffects: parsed,
        unlocked: isSkillUnlocked(skill, snapshot),
      }
    })
  }, [lang, snapshot])

  // All available categories (name, color, count)
  const allCategories = useMemo(() => {
    const cats = new Map<string, { color: string; count: number }>()
    for (const row of allRows) {
      if (row.category) {
        const existing = cats.get(row.category.name)
        if (existing) existing.count++
        else cats.set(row.category.name, { color: row.categoryColor, count: 1 })
      }
    }
    return Array.from(cats.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allRows])

  // Filtered + sorted rows
  const visibleRows = useMemo(() => {
    let list = allRows

    // Text search
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.skill.id.toLowerCase().includes(q) ||
        r.effectText.toLowerCase().includes(q) ||
        (r.category?.name ?? '').toLowerCase().includes(q)
      )
    }

    // Category filter
    if (categoryFilter.size > 0) {
      list = list.filter((r) => {
        if (!r.category) return false
        return categoryFilter.has(r.category.name)
      })
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      let av: string | number | boolean, bv: string | number | boolean
      switch (sortKey) {
        case 'index':
          av = a.perkIndex ?? 99
          bv = b.perkIndex ?? 99
          break
        case 'id':
          av = a.skill.id.toLowerCase()
          bv = b.skill.id.toLowerCase()
          break
        case 'name':
          av = a.name.toLowerCase()
          bv = b.name.toLowerCase()
          break
        case 'category':
          av = a.category?.name ?? 'zzz'
          bv = b.category?.name ?? 'zzz'
          break
        case 'effect':
          av = a.effectText.toLowerCase()
          bv = b.effectText.toLowerCase()
          break
        case 'status':
          av = a.unlocked
          bv = b.unlocked
          break
        default:
          av = 0; bv = 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [allRows, query, categoryFilter, sortKey, sortDir])

  // Toggle sort
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  // Toggle row expansion
  const toggleExpand = useCallback((skillId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) next.delete(skillId)
      else next.add(skillId)
      return next
    })
  }, [])

  // Toggle category filter
  const toggleCategory = useCallback((catName: string) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(catName)) next.delete(catName)
      else next.add(catName)
      return next
    })
  }, [])

  // Export TSV
  const handleExport = useCallback(() => {
    const data = visibleRows.map((r) => ({
      perk_index: r.perkIndex ?? '',
      skill_id: r.skill.id,
      name: r.name,
      category: r.category?.name ?? '',
      effect: r.effectText,
      fp_cost: FP_COST_PER_SKILL,
      status: r.unlocked ? 'unlocked' : 'locked',
    }))
    downloadTsv(data, `skills-table-${new Date().toISOString().slice(0, 10)}.tsv`)
  }, [visibleRows])

  // Count unlocked in visible rows
  const unlockedCount = useMemo(
    () => visibleRows.filter((r) => r.unlocked).length,
    [visibleRows],
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-500" />
            {t('skilllab.dt.title')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {visibleRows.length} / {TOTAL_SKILLS}
            </Badge>
            {unlockedCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                <Unlock className="mr-1 h-2.5 w-2.5" />
                {unlockedCount} {t('skilllab.dt.unlocked')}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={handleExport}
            >
              <Download className="h-3 w-3" />
              {t('skilllab.dt.exportTsv')}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Search + filter bar */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder={t('skilllab.dt.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {categoryFilter.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setCategoryFilter(new Set())}
              >
                {t('skilllab.dt.clearFilter')}
              </Button>
            )}
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground mr-1">
              {t('skilllab.dt.categoryFilter')}:
            </span>
            {allCategories.map(({ name: catName, color, count }) => {
              const isActive = categoryFilter.has(catName)
              return (
                <button
                  key={catName}
                  onClick={() => toggleCategory(catName)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all',
                    isActive
                      ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                      : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {catName}
                  <span className="opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className={cn('overflow-auto rounded-md border', SCROLLBAR_CLASSES.replace('max-h-[480px]', 'max-h-[600px]'))}>
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead
                  className="w-10 cursor-pointer text-right"
                  onClick={() => toggleSort('index')}
                >
                  <span className="inline-flex items-center">
                    # <SortIndicator column="index" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
                <TableHead className="w-8" />
                <TableHead
                  className="min-w-[120px] cursor-pointer"
                  onClick={() => toggleSort('name')}
                >
                  <span className="inline-flex items-center">
                    {t('skilllab.dt.colName')} <SortIndicator column="name" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => toggleSort('id')}
                >
                  <span className="inline-flex items-center">
                    Skill ID <SortIndicator column="id" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
                <TableHead
                  className="min-w-[100px] cursor-pointer"
                  onClick={() => toggleSort('category')}
                >
                  <span className="inline-flex items-center">
                    {t('skilllab.dt.colCategory')} <SortIndicator column="category" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
                <TableHead
                  className="min-w-[180px] cursor-pointer"
                  onClick={() => toggleSort('effect')}
                >
                  <span className="inline-flex items-center">
                    {t('skilllab.dt.colEffect')} <SortIndicator column="effect" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
                <TableHead className="text-right">{t('skilllab.dt.colFpCost')}</TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => toggleSort('status')}
                >
                  <span className="inline-flex items-center">
                    {t('skilllab.dt.colStatus')} <SortIndicator column="status" current={sortKey} dir={sortDir} />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row, i) => {
                const isExpanded = expandedRows.has(row.skill.id)
                const isEven = i % 2 === 0
                return (
                  <SkillRowComponent
                    key={row.skill.id}
                    row={row}
                    isExpanded={isExpanded}
                    isEven={isEven}
                    onToggleExpand={toggleExpand}
                    t={t}
                    lang={lang}
                  />
                )
              })}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    {t('skilllab.dt.noResults')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer summary */}
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">{t('skilllab.dt.totalSkills')}</div>
            <div className="font-mono text-lg font-bold">{TOTAL_SKILLS}</div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">{t('skilllab.dt.unlocked')}</div>
            <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {allRows.filter((r) => r.unlocked).length}
            </div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">{t('skilllab.dt.locked')}</div>
            <div className="font-mono text-lg font-bold text-muted-foreground">
              {allRows.filter((r) => !r.unlocked).length}
            </div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">{t('skilllab.dt.totalFpCost')}</div>
            <div className="font-mono text-lg font-bold">
              {`${(TOTAL_SKILLS * FP_COST_PER_SKILL / 1000).toFixed(0)}K`} FP
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Skill Row (with expandable detail)
// ============================================================

function SkillRowComponent({
  row,
  isExpanded,
  isEven,
  onToggleExpand,
  t,
  lang,
}: {
  row: SkillRow
  isExpanded: boolean
  isEven: boolean
  onToggleExpand: (id: string) => void
  t: (key: string) => string
  lang: Lang
}) {
  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer',
          isEven ? 'bg-muted/20' : '',
          isExpanded && 'bg-primary/5',
        )}
        onClick={() => onToggleExpand(row.skill.id)}
      >
        {/* # index */}
        <TableCell className="text-right font-mono text-xs text-muted-foreground">
          {row.perkIndex ?? '—'}
        </TableCell>

        {/* Expand chevron */}
        <TableCell className="w-8 px-0">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </TableCell>

        {/* Name */}
        <TableCell>
          <div className="font-medium text-xs leading-tight">{row.name || row.skill.id}</div>
          {lang !== 'en' && row.skill.name.en && (
            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {row.skill.name.en}
            </div>
          )}
        </TableCell>

        {/* Skill ID */}
        <TableCell className="font-mono text-[10px] text-muted-foreground">
          {row.skill.id}
        </TableCell>

        {/* Category */}
        <TableCell>
          {row.category ? (
            <Badge
              variant="outline"
              className="text-[10px] gap-1"
              style={{
                backgroundColor: `${row.categoryColor}20`,
                color: row.categoryColor,
                borderColor: `${row.categoryColor}50`,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: row.categoryColor }}
              />
              {row.category.name}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </TableCell>

        {/* Effect */}
        <TableCell>
          <span className="text-xs leading-relaxed text-muted-foreground whitespace-normal line-clamp-2">
            {row.effectText}
          </span>
        </TableCell>

        {/* FP Cost */}
        <TableCell className="text-right font-mono text-xs">
          {FP_COST_PER_SKILL}
        </TableCell>

        {/* Status */}
        <TableCell className="text-center">
          {row.unlocked ? (
            <Badge
              variant="outline"
              className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            >
              <Unlock className="mr-0.5 h-2.5 w-2.5" />
              {t('skilllab.dt.unlocked')}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[9px] bg-muted/50 text-muted-foreground border-muted"
            >
              <Lock className="mr-0.5 h-2.5 w-2.5" />
              {t('skilllab.dt.locked')}
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {isExpanded && (
        <TableRow className={cn('bg-primary/3')}>
          <TableCell colSpan={8} className="p-0">
            <div className="animate-in slide-in-from-top-2 duration-200 space-y-3 px-6 py-4">
              {/* Raw effect string */}
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  {t('skilllab.dt.rawEffect')}
                </div>
                <code className="block w-full rounded bg-muted px-2 py-1.5 font-mono text-[10px] break-all leading-relaxed">
                  {row.skill.effect || '(no effect string)'}
                </code>
              </div>

              {/* Parsed effects */}
              {row.parsedEffects.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    {t('skilllab.dt.parsedEffects')}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {row.parsedEffects.map((pe, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
                      >
                        <span className="text-xs font-medium">{pe.metric}</span>
                        <span className="font-mono text-xs font-bold text-primary">
                          {pe.delta}
                        </span>
                        <span className="ml-auto text-[9px] text-muted-foreground truncate max-w-[120px]">
                          {pe.raw}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional details */}
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span>
                  IL: <code className="font-mono bg-muted px-1 rounded">{row.skill.il}</code>
                </span>
                <span>
                  Perk: <code className="font-mono bg-muted px-1 rounded">{row.perkIndex ?? 'null'}</code>
                </span>
                <span>
                  {t('skilllab.dt.colFpCost')}: <code className="font-mono bg-muted px-1 rounded">{FP_COST_PER_SKILL}</code>
                </span>
                <ConfidenceBadge
                  confidence={row.parsedEffects.length > 0 && row.parsedEffects.some((p) => p.delta !== '未提取') ? 'confirmed' : 'unverified'}
                  formula={row.parsedEffects.length > 0 ? row.parsedEffects[0].raw : 'no effect'}
                />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
