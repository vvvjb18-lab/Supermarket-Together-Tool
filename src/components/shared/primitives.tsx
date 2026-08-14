// Shared UI primitives for Supermarket Together Lab.
'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Confidence } from '@/lib/types'
import { useLang, t } from '@/lib/i18n'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const CONF_KEY: Record<Confidence, string> = {
  confirmed: 'conf.confirmed',
  proxy: 'conf.proxy',
  unverified: 'conf.unverified',
  exploit: 'conf.exploit',
  demo: 'conf.demo',
  'needs-save': 'conf.needs-save',
  'needs-runtime': 'conf.needs-runtime',
}

const CONF_STYLE: Record<Confidence, string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  proxy: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  unverified: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
  exploit: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  demo: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  'needs-save': 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  'needs-runtime': 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
}

export function ConfidenceBadge({
  confidence,
  formula,
  sources,
  note,
  className,
}: {
  confidence: Confidence
  formula?: string
  sources?: string[]
  note?: string
  className?: string
}) {
  const lang = useLang()
  const hasDetail = formula || (sources && sources.length > 0) || note
  const badge = (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-semibold uppercase tracking-wide gap-1', CONF_STYLE[confidence], className)}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {t(CONF_KEY[confidence], lang)}
    </Badge>
  )
  if (!hasDetail) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <div className="space-y-1 text-xs">
          {formula && <div><span className="font-mono text-muted-foreground">formula:</span> {formula}</div>}
          {sources && sources.length > 0 && (
            <div>
              <span className="font-mono text-muted-foreground">sources:</span>
              <ul className="ml-3 list-disc">
                {sources.slice(0, 5).map((s, i) => (
                  <li key={i} className="font-mono text-[10px]">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {note && <div className="italic text-muted-foreground">{note}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// Generic stat / score card
export function StatCard({
  label,
  value,
  unit,
  confidence,
  formula,
  hint,
  accent,
}: {
  label: string
  value: string | number
  unit?: string
  confidence?: Confidence
  formula?: string
  hint?: string
  accent?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const accentClass =
    accent === 'good'
      ? 'border-emerald-500/30'
      : accent === 'warn'
        ? 'border-amber-500/30'
        : accent === 'bad'
          ? 'border-rose-500/30'
          : ''
  return (
    <div className={cn('rounded-lg border bg-card p-3 shadow-sm', accentClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {confidence && <ConfidenceBadge confidence={confidence} formula={formula} />}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

// Compact data row used in lists
export function DataRow({
  index,
  title,
  subtitle,
  right,
  onClick,
  highlight,
}: {
  index?: number | string
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  onClick?: () => void
  highlight?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm transition-colors',
        onClick && 'cursor-pointer hover:bg-accent',
        highlight && 'border-fuchsia-500/40 bg-fuchsia-500/5',
      )}
    >
      {index != null && <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">{index}</span>}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 text-right text-xs">{right}</div>}
    </div>
  )
}

// tiny inline bar
export function MiniBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ScoreRing({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 28
  const c = 2 * Math.PI * r
  const dash = (v / 100) * c
  const color = v >= 70 ? '#10b981' : v >= 40 ? '#f59e0b' : '#f43f5e'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-foreground text-sm font-bold" style={{ transform: 'rotate(90deg)', transformOrigin: '36px 36px' }}>
          {Math.round(v)}
        </text>
      </svg>
      <div className="text-center">
        <div className="text-xs font-semibold">{label}</div>
        {sublabel && <div className="text-[10px] text-muted-foreground">{sublabel}</div>}
      </div>
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  confidence,
  formula,
  note,
  right,
}: {
  title: string
  description?: string
  confidence?: Confidence
  formula?: string
  note?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {confidence && <ConfidenceBadge confidence={confidence} formula={formula} note={note} />}
        </div>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// TooltipProvider wrapper to use across the app
export function WithTooltips({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
}

// format helpers
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toFixed(digits)
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
