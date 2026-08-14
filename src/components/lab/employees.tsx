'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { computeEmployeeSpeed, computeXpToNextLevel } from '@/lib/engine'
import { useRoomStore, useSaveStore } from '@/lib/store'
import { useLang, employeeTaskIdNameFor } from '@/lib/i18n'
import {
  ConfidenceBadge,
  StatCard,
  fmt,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  ChevronDown,
  Gauge,
  Zap,
  Crown,
  ListChecks,
  Users,
  Cog,
  UserCheck,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Parse employeeConfig.skills JSON string
const EMP_SKILLS_RAW = ENC.config.employeeConfig?.skills
let EMP_SKILLS: { key: string; zhHant: string; zhHans: string }[] = []
try {
  EMP_SKILLS = EMP_SKILLS_RAW ? JSON.parse(EMP_SKILLS_RAW) : []
} catch {
  EMP_SKILLS = []
}

// Map skill role key to corresponding employee task
const ROLE_TO_TASK: Record<string, number> = {
  cashier: 1,
  restocker: 2,
  storage: 3,
  security: 4,
  technician: 5,
  ordering: 0, // no direct task; maps to NoTask / general
  manufacturing: 7,
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  cashier: '結帳櫃台作業，縮短 productCheckoutWait（0.75s）',
  restocker: '補貨上貨架，影響 employeeItemPlaceWait（0.2s）',
  storage: '倉儲進出，管理 storageInventory',
  security: '防盜巡邏，影響 surveillanceFactor',
  technician: '設備維修，影響 self-checkout 機台',
  ordering: '線上訂貨 rerollsPerDay，影響商品多樣性',
  manufacturing: '製造區產線，產出 30 種製造品',
}

const STATIC_CHECKLIST = [
  '確認員工任務分配（7 角色 → 8 任務）',
  '檢查員工技能等級是否達上限（lv 5）',
  '驗證 extraEmployeeSpeedFactor 上限（1.0）',
  '確認薪水符合 initialSalary=5000 起跳',
  '員工 XP 是否即將升級',
  '製造區員工已就位',
]

export function Employees() {
  const lang = useLang()
  const [level, setLevel] = useState(2)
  const [factor, setFactor] = useState(0)
  const snapshot = useSaveStore((s) => s.snapshot)

  const speedRes = useMemo(() => computeEmployeeSpeed(level, factor), [level, factor])
  const xpRes = useMemo(() => computeXpToNextLevel(level), [level])

  // Real hired employees from save (ES3 parsed)
  const hiredEmployees = useMemo(() => {
    if (!snapshot?.employees?.length) return []
    return snapshot.employees.map((emp, i) => {
      const skillKeys = EMP_SKILLS.map((s) => s.key)
      const skillEntries = Object.entries(emp.skills).map(([k, v], idx) => ({
        key: k,
        label: EMP_SKILLS[idx]?.zhHant ?? k,
        value: v.level,
        idx,
      }))
      const topSkill = skillEntries.reduce((a, b) => (b.value > a.value ? b : a), skillEntries[0])
      const avgSkill = skillEntries.reduce((a, b) => a + b.value, 0) / skillEntries.length
      const taskId = emp.task
      const task = ENC.employeeTasks.find((t) => t.id === taskId)
      const taskLabel = employeeTaskIdNameFor(taskId, lang)
      // Speed proxy: use average skill as level proxy (capped at 5)
      const levelProxy = Math.min(5, Math.round(avgSkill / 2))
      const speedProxy = computeEmployeeSpeed(levelProxy, 0).value
      return { emp, idx: i, skillEntries, topSkill, avgSkill, task, taskLabel, levelProxy, speedProxy }
    })
  }, [snapshot, lang])

  const totalSalary = useMemo(
    () => hiredEmployees.reduce((a, b) => a + b.emp.salary, 0),
    [hiredEmployees],
  )

  // Chart data: speed vs level (0-5) for factor=0, 0.5, 1.0
  const speedChart = useMemo(() => {
    const rows: { level: number; f0: number; f05: number; f1: number }[] = []
    for (let lv = 0; lv <= 5; lv++) {
      rows.push({
        level: lv,
        f0: computeEmployeeSpeed(lv, 0).value,
        f05: computeEmployeeSpeed(lv, 0.5).value,
        f1: computeEmployeeSpeed(lv, 1.0).value,
      })
    }
    return rows
  }, [])

  // Level/XP/speed table 0-5
  const levelTable = useMemo(() => {
    return Array.from({ length: 6 }, (_, lv) => ({
      level: lv,
      xp: computeXpToNextLevel(lv).value,
      speed: computeEmployeeSpeed(lv, 0).value,
    }))
  }, [])

  // Speed perk equivalent
  const perkEquivalent = useMemo(() => {
    // 1 perk adds +0.2 to extraEmployeeSpeedFactor
    // 1 level adds +0.05 to (0.05 * level) term
    // so 1 perk = 4 levels of speed benefit
    const perkValue = 0.2
    const levelValue = 0.05
    const perksToLevel = (n: number) => n * levelValue / perkValue
    return {
      perkValue,
      levelValue,
      perksEq1Level: 1 / 4, // 0.25 perks = 1 level
      levelsPerPerk: 4,
      examples: [1, 2, 3, 4, 5].map((n) => ({
        perks: n,
        speedGain: perkValue * n,
        equivalentLevels: perksToLevel(n),
      })),
    }
  }, [])

  // Room
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const toggleChecklist = useRoomStore((s) => s.toggleChecklist)

  // Local role assignments (playerId per role)
  const [roleAssign, setRoleAssign] = useState<Record<string, string>>({})
  const members = room?.members ?? []

  // Filter room.checklist for staff-related items (by keyword)
  const staffChecklist = useMemo(() => {
    if (!room) return null
    const kw = ['員工', '任務', '薪水', 'skill', 'employee', 'staff', '防盜', '巡邏']
    const filtered = room.checklist.filter((c) =>
      kw.some((k) => c.label.toLowerCase().includes(k.toLowerCase())),
    )
    return filtered.length > 0 ? filtered : room.checklist
  }, [room])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">員工實驗室</h1>
        <p className="text-sm text-muted-foreground">
          速度公式 · XP 升級曲線 · 角色任務指派 · 與房間成員同步
        </p>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="當前速度"
          value={fmt(speedRes.value, 3)}
          unit="u/s"
          confidence="confirmed"
          formula={speedRes.formula}
          hint={`lv=${level} · factor=${factor.toFixed(1)}`}
          accent="good"
        />
        <StatCard
          label="XP 升級閾值"
          value={xpRes.value.toLocaleString()}
          unit="xp"
          confidence="confirmed"
          formula={xpRes.formula}
          hint={`level ${level} → ${level + 1}`}
          accent="neutral"
        />
        <StatCard
          label="速度上限 (factor=1, lv=5)"
          value={fmt(computeEmployeeSpeed(5, 1).value, 3)}
          unit="u/s"
          confidence="confirmed"
          formula="2.5 × (1 + 0.05×5 + 1)"
          hint="maxEmployeeSpeedFactor=1"
          accent="warn"
        />
        <StatCard
          label="每 perk 速度增益"
          value="+0.2"
          unit="factor"
          confidence="confirmed"
          formula="skill1/3 effect: extraEmployeeSpeedFactor += 0.2"
          hint="等於 4 個等級的增益"
          accent="neutral"
        />
      </div>

      {/* Hired Employees Roster (from real save) */}
      {hiredEmployees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-500" />
                已雇用員工花名冊
                <Badge variant="secondary" className="text-[10px]">{hiredEmployees.length} 人</Badge>
              </span>
              <ConfidenceBadge
                confidence="confirmed"
                formula="HiredEmployeesData pipe-string → {name, task, salary, skills[7]}"
                sources={['ES3: HiredEmployeesData', 'employeeConfig.skillOrder']}
                note="技能值語義為 reverse-engineered proxy（0-10 量級，非遊戲內 level 0-5）"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border bg-card p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <Users className="h-3 w-3" /> 雇用數
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold">{hiredEmployees.length}</div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <DollarSign className="h-3 w-3" /> 每日薪資總額
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                  ${totalSalary.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <Gauge className="h-3 w-3" /> 平均速度 proxy
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {fmt(hiredEmployees.reduce((a, b) => a + b.speedProxy, 0) / hiredEmployees.length, 3)} u/s
                </div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <Crown className="h-3 w-3" /> 最強技能
                </div>
                <div className="mt-0.5 text-sm font-bold">
                  {hiredEmployees[0]?.topSkill?.label ?? '—'}
                </div>
              </div>
            </div>

            {/* Employee cards */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {hiredEmployees.map(({ emp, idx, skillEntries, topSkill, avgSkill, task, taskLabel, levelProxy, speedProxy }) => (
                <div
                  key={emp.id}
                  className="rounded-lg border bg-card p-3 space-y-2"
                  style={{ borderLeftColor: task?.color ?? '#6b7280', borderLeftWidth: 3 }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {idx}
                        </span>
                        <span className="truncate text-sm font-bold">{emp.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-8 text-[10px] text-muted-foreground">
                        <code className="rounded bg-muted px-1">{emp.id.split(':').slice(0, 2).join(':')}</code>
                        <span>·</span>
                        <span
                          className="rounded px-1 py-0.5 font-medium"
                          style={{
                            backgroundColor: `${task?.color ?? '#6b7280'}20`,
                            color: task?.color === '#ffffff' ? undefined : task?.color,
                          }}
                        >
                          {taskLabel}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                        ${emp.salary.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-muted-foreground">/day</div>
                    </div>
                  </div>

                  {/* Skill bars */}
                  <div className="space-y-1">
                    {skillEntries.map((s) => {
                      const maxVal = 10
                      const pct = (s.value / maxVal) * 100
                      const isTop = s.key === topSkill.key
                      return (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{s.label}</span>
                          <div className="relative h-3 flex-1 overflow-hidden rounded bg-muted">
                            <div
                              className={cn(
                                'h-full rounded transition-all',
                                isTop ? 'bg-emerald-500' : pct > 50 ? 'bg-sky-400' : 'bg-zinc-400',
                              )}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                          <span className={cn(
                            'w-5 shrink-0 text-right font-mono text-[10px] tabular-nums',
                            isTop && 'font-bold text-emerald-600 dark:text-emerald-400',
                          )}>
                            {s.value}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer stats */}
                  <div className="grid grid-cols-3 gap-1 border-t pt-2 text-center">
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground">平均</div>
                      <div className="font-mono text-xs font-bold">{fmt(avgSkill, 1)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground">速度 proxy</div>
                      <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(speedProxy, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground">建議角色</div>
                      <div className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400">
                        {topSkill.label}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Note */}
            <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-[11px] text-sky-800 dark:text-sky-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <div>
                技能值來自 ES3 <code className="rounded bg-muted px-0.5">HiredEmployeesData</code> pipe-string
                第 2-8 欄（7 個值，對應 <code className="rounded bg-muted px-0.5">employeeConfig.skillOrder</code>）。
                量級為 0-10，確切語義（XP/1000 或 skill points）未經遊戲原始碼確認 — 標記為 proxy。
                速度 proxy 使用 <code className="rounded bg-muted px-0.5">levelProxy = min(5, round(avg/2))</code> 代入速度公式。
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Speed calculator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-500" />
              速度計算機
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="speed = 2.5 × (1 + 0.05×level + extraEmployeeSpeedFactor)"
              sources={[
                'IL: UpdateEmployeeStats r4:2.5',
                'IL: UpdateEmployeeStats r4:0.05',
                'config.employeeSpeedFormula',
              ]}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">技能等級 (level)</Label>
                <Badge variant="outline" className="font-mono text-xs">{level} / 5</Badge>
              </div>
              <Slider
                value={[level]}
                min={0}
                max={5}
                step={1}
                onValueChange={(v) => setLevel(v[0])}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">額外速度因子 (extraEmployeeSpeedFactor)</Label>
                <Badge variant="outline" className="font-mono text-xs">{factor.toFixed(1)} / 1.0</Badge>
              </div>
              <Slider
                value={[factor]}
                min={0}
                max={1}
                step={0.1}
                onValueChange={(v) => setFactor(v[0])}
              />
            </div>
          </div>

          {/* Formula display */}
          <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
            <div className="text-muted-foreground">{'// 計算過程'}</div>
            <div className="mt-1">
              speed = 2.5 × (1 + 0.05×{level} + {factor.toFixed(1)})
            </div>
            <div>
              {'       = 2.5 × (1 + '}{(0.05 * level).toFixed(2)}{' + '}{factor.toFixed(2)}{')'}
            </div>
            <div>
              {'       = 2.5 × '}{(1 + 0.05 * level + factor).toFixed(3)}
            </div>
            <div className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
              → {fmt(speedRes.value, 4)} u/s
            </div>
          </div>

          {/* Chart */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                速度 vs 等級（factor = 0 / 0.5 / 1.0）
              </span>
              <ConfidenceBadge confidence="confirmed" formula="3 條曲線對應 3 個 factor 值" />
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={speedChart} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="level"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'level', position: 'insideBottom', offset: -2, fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} domain={[2, 5.5]} />
                  <RTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null
                      return (
                        <div className="rounded-md border bg-background p-2 text-xs shadow-md">
                          <div className="font-semibold">level = {label}</div>
                          {payload.map((p) => (
                            <div key={p.dataKey as string} className="font-mono">
                              <span
                                className="mr-1 inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: p.color }}
                              />
                              {p.dataKey}: {fmt(Number(p.value), 3)} u/s
                            </div>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="f0" name="factor=0" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="f05" name="factor=0.5" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="f1" name="factor=1.0" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Level/XP table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              等級 / XP / 速度 對照表（factor=0）
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="xpToNextLevel = 1000 + 100×level"
              sources={['IL: SetEmployeesLevels i4:1000, i4:100']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">等級</th>
                  <th className="py-2 pr-4 font-medium">XP 至下一級</th>
                  <th className="py-2 pr-4 font-medium">速度 (factor=0)</th>
                  <th className="py-2 pr-4 font-medium">相對 lv0 增益</th>
                  <th className="py-2 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {levelTable.map((row) => {
                  const baseSpeed = levelTable[0].speed
                  const gain = ((row.speed - baseSpeed) / baseSpeed) * 100
                  const isCap = row.level === 5
                  const isCurrent = row.level === level
                  return (
                    <tr
                      key={row.level}
                      className={cn(
                        'border-b last:border-0',
                        isCurrent && 'bg-emerald-500/5',
                      )}
                    >
                      <td className="py-2 pr-4 font-mono font-bold">{row.level}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">{row.xp.toLocaleString()} xp</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">{fmt(row.speed, 3)} u/s</td>
                      <td className="py-2 pr-4 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        +{fmt(gain, 1)}%
                      </td>
                      <td className="py-2">
                        {isCap ? (
                          <Badge variant="outline" className="text-[10px] text-amber-600">CAP</Badge>
                        ) : isCurrent ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600">current</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Speed perk equivalent */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-fuchsia-500" />
              Perk ↔ 等級 等效換算
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="1 perk (+0.2 factor) ≡ 4 levels (+0.05×4)"
              sources={['skill1: extraEmployeeSpeedFactor += 0.2', 'speed formula 0.05×level']}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-md border bg-muted/40 p-2 text-xs">
            1 個 +0.2 速度 perk 等於 <span className="font-bold text-fuchsia-600">{perkEquivalent.levelsPerPerk}</span> 個等級的邊際效益（同樣使 0.05×n = 0.2）。
            <br />
            <span className="text-muted-foreground">
              注意：等級受 lv cap=5 限制（最大 0.25 加成），但 perk 不受此限（factor 上限 1.0，最大 +1.0）。
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {perkEquivalent.examples.map((ex) => (
              <div key={ex.perks} className="rounded-md border bg-card p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">{ex.perks} perks</div>
                <div className="text-base font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  +{ex.speedGain.toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground">factor</div>
                <div className="mt-1 border-t pt-1 text-[10px]">
                  ≡ <span className="font-mono font-bold">{fmt(ex.equivalentLevels, 1)}</span> levels
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Role assignment panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-500" />
              角色任務指派
            </span>
            <ConfidenceBadge
              confidence="confirmed"
              formula="7 skill roles × 8 employee tasks"
              sources={['employeeConfig.skills', 'employeeTasks']}
              note={room ? '已連接房間' : '未連接房間 — 指派僅本地'}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex flex-wrap gap-2">
            {ENC.employeeTasks.map((t) => (
              <Badge
                key={t.id}
                variant="outline"
                className="text-[10px] gap-1"
                style={{
                  backgroundColor: `${t.color}20`,
                  borderColor: `${t.color}50`,
                  color: t.color === '#ffffff' ? undefined : t.color,
                }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.id}: {employeeTaskIdNameFor(t.id, lang)}
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {EMP_SKILLS.map((role) => {
              const taskId = ROLE_TO_TASK[role.key] ?? 0
              const task = ENC.employeeTasks.find((t) => t.id === taskId)
              const color = task?.color ?? '#ffffff'
              const assigned = roleAssign[role.key]
              const member = room?.members.find((m) => m.id === assigned)
              return (
                <div
                  key={role.key}
                  className="rounded-md border bg-card p-3"
                  style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{role.zhHant}</div>
                      <code className="text-[10px] text-muted-foreground">{role.key}</code>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: `${color}20`, color: color === '#ffffff' ? undefined : color }}
                    >
                      {employeeTaskIdNameFor(taskId, lang)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {ROLE_DESCRIPTIONS[role.key] ?? ''}
                  </p>
                  <div className="mt-2">
                    {room ? (
                      <Select
                        value={assigned ?? ''}
                        onValueChange={(v) => setRoleAssign((p) => ({ ...p, [role.key]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="指派玩家…" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">
                              <span className="flex items-center gap-1">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: m.color }}
                                />
                                {m.name} {m.id === selfId && '(我)'}
                                {m.role === 'host' && ' · host'}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded border border-dashed bg-muted/30 px-2 py-1 text-center text-[10px] text-muted-foreground">
                        未連接房間
                      </div>
                    )}
                  </div>
                  {member && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: member.color }} />
                      指派給 {member.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily staff checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-emerald-500" />
              每日員工清單
            </span>
            <ConfidenceBadge
              confidence={room ? 'confirmed' : 'unverified'}
              formula={room ? 'room.checklist (synced)' : 'static suggested list'}
              note={room ? '與房間成員即時同步' : '建立房間以共享檢查清單'}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {room && staffChecklist && staffChecklist.length > 0 ? (
            <div className="space-y-1.5">
              {staffChecklist.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleChecklist(item.id)}
                  />
                  <span className={cn('flex-1', item.done && 'text-muted-foreground line-through')}>
                    {item.label}
                  </span>
                  {item.assignedTo && (
                    <Badge variant="outline" className="text-[10px]">
                      {room.members.find((m) => m.id === item.assignedTo)?.name ?? '已指派'}
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <div>
              <div className="mb-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                未連接房間 — 顯示建議靜態清單。建立房間以共享給隊員。
              </div>
              <div className="space-y-1.5">
                {STATIC_CHECKLIST.map((label, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground"
                  >
                    <Checkbox disabled />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee config reference (collapsible) */}
      <Collapsible>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <CardTitle className="flex cursor-pointer items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Cog className="h-4 w-4 text-zinc-500" />
                  員工設定參考（employeeConfig）
                </span>
                <div className="flex items-center gap-2">
                  <ConfidenceBadge confidence="confirmed" formula="encyclopedia.config.employeeConfig" />
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </div>
              </CardTitle>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">欄位</th>
                      <th className="py-2 pr-4 font-medium">值</th>
                      <th className="py-2 font-medium">說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ConfigRow field="initialSalary" value="5000" note="員工初始薪水" />
                    <ConfigRow field="initialSkillValues" value="[1000×7]" note="7 個技能初始值皆 1000" />
                    <ConfigRow field="skillOrder" value="cashier→restocker→storage→security→technician→ordering→manufacturing" note="7 個技能槽順序" />
                    <ConfigRow field="levelUpXp" value="1000 + 100×level" note="每級升級 XP 閾值" />
                    <ConfigRow field="employeeSpeed" value="2.5 × (1 + 0.05×level + factor)" note="速度公式（base 2.5, +0.05/level）" />
                    <ConfigRow field="productCheckoutWait" value="0.75s" note="結帳等待時間" />
                    <ConfigRow field="employeeItemPlaceWait" value="0.2s" note="員工補貨放置等待" />
                    <ConfigRow field="minSelfCheckoutWait" value="1.1s" note="自助結帳最小等待" />
                    <ConfigRow field="maxSelfCheckoutWait" value="2.25s" note="自助結帳最大等待" />
                    <ConfigRow field="maxDummyNPCs" value="10" note="店內最大 NPC 數" />
                  </tbody>
                </table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Caution */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold">限制：</span>
          maxEmployeeSpeedFactor=1（上限）；每技能等級上限 lv=5。超出部分不計入速度計算。
          <Button variant="link" className="ml-1 h-auto p-0 text-xs text-amber-700 dark:text-amber-300" disabled>
            詳見 config.employeeSpeedFormula
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfigRow({ field, value, note }: { field: string; value: string; note: string }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 font-mono text-xs">{field}</td>
      <td className="py-2 pr-4 font-mono text-xs font-bold">{value}</td>
      <td className="py-2 text-xs text-muted-foreground">{note}</td>
    </tr>
  )
}
