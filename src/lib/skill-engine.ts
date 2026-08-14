// Pure skill analytics engine for the Skill Lab (Task 11-b).
//
// The 44-skills system has NO prerequisites (per skill-graph.json _meta.note):
// every perk costs exactly 1000 FP and can be purchased independently.
// So this engine deliberately avoids prereq-path logic and focuses on:
//   - unlock-state queries
//   - category (perk_to_category) lookups
//   - regex-based effect parsing → structured metrics
//   - store profile / radar scoring
//   - mode-weighted "next best skill" recommendations
//
// All functions are pure (no React, no side effects) so they can be unit-tested
// and imported by any component.

import type { Skill, SaveSnapshot, Confidence } from './types'
import { encyclopedia as ENC, skillGraph } from './data-loader'

// ============================================================
// Constants
// ============================================================

export const FP_COST_PER_SKILL = 1000

/** Total skill count (44). Convenience constant. */
export const TOTAL_SKILLS = ENC.skills.length

// ============================================================
// Lookup maps (built once)
// ============================================================

const SKILL_BY_PERK = new Map<number, Skill>(
  ENC.skills.filter((s) => s.perk != null).map((s) => [s.perk as number, s]),
)

const SKILL_BY_ID = new Map<string, Skill>(ENC.skills.map((s) => [s.id, s]))

/** All perk indices 0..43 that exist in the encyclopedia (sorted). */
export const ALL_PERK_INDICES: number[] = (() => {
  const set = new Set<number>()
  for (const s of ENC.skills) {
    if (s.perk != null) set.add(s.perk)
  }
  // Also include graph perk node indices (44 perk nodes regardless of skill id).
  for (const n of skillGraph.nodes) {
    if (n.type === 'perk') set.add(n.index)
  }
  return Array.from(set).sort((a, b) => a - b)
})()

// ============================================================
// Unlocked-skill state
// ============================================================

/**
 * Normalized set of unlocked perk indices from a save snapshot.
 *
 * The save's `skillUnlocks` field is already an array of perk indices
 * (perkIndexToSkill maps perk → skill, but skillUnlocks uses perk indices).
 * If absent, returns an empty array.
 */
export function getUnlockedSkillIndices(snapshot: SaveSnapshot | null): number[] {
  if (!snapshot?.skillUnlocks) return []
  // Defensive: filter to valid integers and dedupe.
  const seen = new Set<number>()
  const out: number[] = []
  for (const idx of snapshot.skillUnlocks) {
    if (typeof idx === 'number' && Number.isFinite(idx) && !seen.has(idx)) {
      seen.add(idx)
      out.push(idx)
    }
  }
  return out
}

/** Unlocked perk-index set as a Set<number> for O(1) lookups. */
export function getUnlockedSet(snapshot: SaveSnapshot | null): Set<number> {
  return new Set(getUnlockedSkillIndices(snapshot))
}

/**
 * Is a given skill unlocked?
 *
 * Uses the skill's `perk` index. If the skill has perk=null (e.g. skill40-44
 * which have "(no matching perk in IL)"), this returns false — those skills
 * are not in the game's actual unlock array.
 */
export function isSkillUnlocked(skill: Skill, snapshot: SaveSnapshot | null): boolean {
  if (skill.perk == null) return false
  return getUnlockedSet(snapshot).has(skill.perk)
}

// ============================================================
// Category (perk_to_category) helpers
// ============================================================

export interface SkillCategory {
  id: string
  name: string
}

/**
 * Look up the nearest category node for a perk index.
 * Returns null if the perk is not in skillGraph.perk_to_category.
 */
export function getSkillCategory(perkIndex: number): SkillCategory | null {
  // skillGraph.perk_to_category is keyed by node id like 'perk5'.
  const entry = skillGraph.perk_to_category[`perk${perkIndex}`]
  if (!entry) return null
  return { id: entry.category_id, name: entry.category_name }
}

/** Look up the nearest category for a Skill (uses skill.perk). */
export function getSkillCategoryForSkill(skill: Skill): SkillCategory | null {
  if (skill.perk == null) return null
  return getSkillCategory(skill.perk)
}

/**
 * Group an arbitrary list of skills by their perk_to_category category_name.
 * Skills with no category go under '__uncategorized__'.
 */
export function groupSkillsByCategory(skills: Skill[]): Map<string, Skill[]> {
  const m = new Map<string, Skill[]>()
  for (const s of skills) {
    const cat = getSkillCategoryForSkill(s)?.name ?? '__uncategorized__'
    const arr = m.get(cat)
    if (arr) arr.push(s)
    else m.set(cat, [s])
  }
  return m
}

// ============================================================
// categoryColor helper — deterministic hash → HSL color
// ============================================================

/** Generate a stable color for a category name (used for badges / dots). */
export function categoryColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 65% 45%)`
}

// ============================================================
// Effect-string parsing (regex) → structured metrics
// ============================================================

/**
 * Parse a skill `effect` string (e.g. "NPC_Manager.extraEmployeeSpeedFactor += 0.2")
 * into a list of { metric, delta, raw } entries.
 *
 * Be generous with regex; label unverified when pattern is unknown.
 * Patterns we recognize (case-insensitive):
 *
 *   extraEmployeeSpeedFactor += X          → 員工移動速度  +X*100%
 *   maxEmployees += N                       → 最大員工數     +N
 *   extraCustomersPerk += N                 → 額外客流       +N
 *   allowedSimultaneousSales += N           → 同時結帳數     +N
 *   productCheckoutWait -= X                → 結帳等待時間   -X*100%
 *   employeeItemPlaceWait -= X              → 補貨等待       -X*100%
 *   selfcheckoutExtraProductsFromPerk += N  → 自助結帳商品數 +N
 *   minSelfCheckoutWait -= X                → 自助結帳最小等待 -X
 *   maxSelfCheckoutWait -= X                → 自助結帳最大等待 -X
 *   boxRecycleFactor = N                    → 回收倍率       ×N
 *   closestRecyclePerk = 1                  → 就近回收       enabled
 *   employeeRecycleBoxes = 1                → 員工回收箱     enabled
 *   electricFactor = 0.8                    → 電費           -20%
 *   autopayInvoices = 1                     → 自動付款       enabled
 *   rerollsPerDay += N                      → 每日重抽次數   +N
 *   extraCheckoutMoney += X                 → 結帳金額加成   +X*100%
 *   softwareUpgradePerk = 1                 → 軟體升級       enabled
 *   orderingExtraCrashOnBadWeather = 1      → 壞天氣額外訂單 enabled
 */
export interface ParsedEffect {
  metric: string
  delta: string
  raw: string
}

const EFFECT_PATTERNS: { re: RegExp; metric: string; fmt: (m: RegExpMatchArray) => string }[] = [
  {
    re: /extraemployeespeedfactor\s*\+=\s*([0-9.]+)/i,
    metric: '員工移動速度',
    fmt: (m) => `+${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /maxemployees\s*\+=\s*(-?\d+)/i,
    metric: '最大員工數',
    fmt: (m) => `+${parseInt(m[1], 10)}`,
  },
  {
    re: /extracustomersperk\s*\+=\s*(-?\d+)/i,
    metric: '額外客流',
    fmt: (m) => `+${parseInt(m[1], 10)}`,
  },
  {
    re: /allowedsimultaneoussales\s*\+=\s*(-?\d+)/i,
    metric: '同時結帳數',
    fmt: (m) => `+${parseInt(m[1], 10)}`,
  },
  {
    re: /productcheckoutwait\s*-=\s*([0-9.]+)/i,
    metric: '結帳等待時間',
    fmt: (m) => `-${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /employeeitemplacewait\s*-=\s*([0-9.]+)/i,
    metric: '補貨等待',
    fmt: (m) => `-${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /selfcheckoutextraproductsfromperk\s*\+=\s*(-?\d+)/i,
    metric: '自助結帳商品數',
    fmt: (m) => `+${parseInt(m[1], 10)}`,
  },
  {
    re: /minselfcheckoutwait\s*-=\s*([0-9.]+)/i,
    metric: '自助結帳最小等待',
    fmt: (m) => `-${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /maxselfcheckoutwait\s*-=\s*([0-9.]+)/i,
    metric: '自助結帳最大等待',
    fmt: (m) => `-${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /boxrecyclefactor\s*=\s*([0-9.]+)/i,
    metric: '回收倍率',
    fmt: (m) => `×${parseFloat(m[1])}`,
  },
  {
    re: /closestrecycleperk\s*=\s*1/i,
    metric: '就近回收',
    fmt: () => 'enabled',
  },
  {
    re: /employeerecycleboxes\s*=\s*1/i,
    metric: '員工回收箱',
    fmt: () => 'enabled',
  },
  {
    re: /electricfactor\s*=\s*([0-9.]+)/i,
    metric: '電費',
    fmt: (m) => {
      const v = parseFloat(m[1])
      const pct = (1 - v) * 100
      return pct >= 0 ? `-${pct.toFixed(0)}%` : `+${(-pct).toFixed(0)}%`
    },
  },
  {
    re: /autopayinvoices\s*=\s*1/i,
    metric: '自動付款',
    fmt: () => 'enabled',
  },
  {
    re: /rerollsperday\s*\+=\s*(-?\d+)/i,
    metric: '每日重抽次數',
    fmt: (m) => `+${parseInt(m[1], 10)}`,
  },
  {
    re: /extracheckoutmoney\s*\+=\s*([0-9.]+)/i,
    metric: '結帳金額加成',
    fmt: (m) => `+${(parseFloat(m[1]) * 100).toFixed(0)}%`,
  },
  {
    re: /softwareupgradeperk\s*=\s*1/i,
    metric: '軟體升級',
    fmt: () => 'enabled',
  },
  {
    re: /orderingextracrashonbadweather\s*=\s*1/i,
    metric: '壞天氣額外訂單',
    fmt: () => 'enabled',
  },
  {
    re: /convertbystanderstriggerobj/i,
    metric: '路人轉顧客',
    fmt: () => 'enabled',
  },
  {
    re: /clockobj.*clockcontrolslateobj|時間加速/i,
    metric: '時間加速',
    fmt: () => 'enabled',
  },
  {
    re: /auxiliarsetuipallets|額外棧板/i,
    metric: '額外棧板',
    fmt: () => 'enabled',
  },
]

/** Parse an effect string into structured metrics. */
export function parseEffectForMetric(effect: string): ParsedEffect[] {
  if (!effect || !effect.trim()) return []
  const out: ParsedEffect[] = []
  const seen = new Set<string>()
  for (const { re, metric, fmt } of EFFECT_PATTERNS) {
    const m = effect.match(re)
    if (m) {
      const key = metric + '|' + fmt(m)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ metric, delta: fmt(m), raw: m[0] })
    }
  }
  // If nothing matched and effect text is non-trivial, return a single
  // "未提取" entry so the UI can show something.
  if (out.length === 0 && effect.length > 0 && !effect.includes('no matching perk')) {
    out.push({ metric: '效果', delta: '未提取', raw: effect })
  }
  return out
}

// ============================================================
// estimateSkillImpact — used by the Benefit Comparator (Tool 4)
// ============================================================

export interface SkillImpact {
  metric: string
  value: string
  confidence: Confidence
}

/**
 * Estimate the numerical impact of a skill, derived from its effect string.
 *
 * Confidence policy:
 *   - 'confirmed' — pattern matched and the effect text is direct IL code.
 *   - 'proxy'     — pattern matched but value is approximate (e.g. we
 *                   inferred -20% from electricFactor=0.8).
 *   - 'unverified'— no pattern matched (returned as '效果: 未提取').
 */
export function estimateSkillImpact(
  skill: Skill,
  _snapshot?: SaveSnapshot | null,
): SkillImpact[] {
  void _snapshot // currently unused; reserved for future context-aware estimates
  const parsed = parseEffectForMetric(skill.effect)
  if (parsed.length === 0) {
    return [{ metric: '效果', value: '未提取', confidence: 'unverified' }]
  }
  return parsed.map((p) => {
    // 'enabled' / '未提取' are soft — mark proxy; numeric deltas are confirmed
    // because they come straight from the IL effect string.
    const conf: Confidence =
      p.delta === 'enabled' || p.delta === '未提取' ? 'proxy' : 'confirmed'
    return { metric: p.metric, value: p.delta, confidence: conf }
  })
}

// ============================================================
// Strategy mode weights (for NextStepRecommender Tool 3)
// ============================================================

export type StrategyMode = 'employee' | 'customer' | 'checkout' | 'recycling'

interface ModeWeight {
  /** Tag (matches computeSkillRecommendations synergyTags). */
  tag: string
  /** Multiplier applied to base ROI when the tag matches. */
  weight: number
}

const MODE_WEIGHTS: Record<StrategyMode, ModeWeight[]> = {
  employee: [
    { tag: 'speed', weight: 3 },
    { tag: 'headcount', weight: 2.4 },
    { tag: 'automation', weight: 1.5 },
  ],
  customer: [{ tag: 'sales-cap', weight: 2.5 }, { tag: 'customer-volume', weight: 2 }],
  checkout: [
    { tag: 'throughput', weight: 3 },
    { tag: 'sales-cap', weight: 1.5 },
  ],
  recycling: [{ tag: 'recycling', weight: 3 }],
}

// ============================================================
// Categorize a skill (mirrors engine.ts computeSkillRecommendations logic
// but kept here as a pure helper so we don't need to call the heavy ROI fn).
// ============================================================

export interface SkillCategorization {
  category: string
  tags: string[]
}

export function categorizeSkill(skill: Skill): SkillCategorization {
  const eff = skill.effect.toLowerCase()
  let category = 'other'
  if (eff.includes('speed')) category = 'employee-speed'
  else if (eff.includes('checkout') || eff.includes('selfcheckout') || eff.includes('productcheckout'))
    category = 'checkout'
  else if (eff.includes('customer') || eff.includes('extracustomers') || eff.includes('bystander'))
    category = 'customer-volume'
  else if (eff.includes('recycle')) category = 'recycling'
  else if (eff.includes('maxemployees') || eff.includes('employee')) category = 'employee-count'
  else if (eff.includes('manufacturing') || eff.includes('reroll') || eff.includes('ordering'))
    category = 'ordering'
  else if (eff.includes('debt') || eff.includes('electric') || eff.includes('autopay'))
    category = 'finance'

  const tags: string[] = []
  if (eff.includes('extraemployeespeedfactor')) tags.push('speed', 'automation')
  if (eff.includes('maxemployees')) tags.push('headcount')
  if (
    eff.includes('productcheckoutwait') ||
    eff.includes('employeeitemplacewait') ||
    eff.includes('selfcheckoutwait')
  )
    tags.push('throughput')
  if (eff.includes('allowedsimultaneoussales')) tags.push('sales-cap')
  if (eff.includes('extracustomersperk') || eff.includes('bystander')) tags.push('customer-volume')
  if (eff.includes('recycle')) tags.push('recycling')
  if (eff.includes('electricfactor') || eff.includes('autopay')) tags.push('finance')
  if (eff.includes('rerollsperday')) tags.push('ordering')

  return { category, tags }
}

// ============================================================
// recommendNextSkills — for Tool 3
// ============================================================

export interface NextSkillRecommendation {
  skill: Skill
  reason: string
  rank: number
  score: number
}

/**
 * Recommend the next N best skills for a given strategy mode,
 * excluding already-unlocked skills.
 *
 * The reason text is generated in Traditional Chinese, referencing the
 * skill's effect and (when relevant) the current save context.
 */
export function recommendNextSkills(
  snapshot: SaveSnapshot | null,
  mode: StrategyMode,
  count: number,
): NextSkillRecommendation[] {
  const unlocked = getUnlockedSet(snapshot)
  const weights = MODE_WEIGHTS[mode]
  const employeeCount = snapshot?.employees?.length ?? 0
  const speedSkillsUnlocked = ENC.skills.filter(
    (s) => s.perk != null && unlocked.has(s.perk) && s.effect.toLowerCase().includes('speed'),
  ).length
  const checkoutSkillsUnlocked = ENC.skills.filter(
    (s) => s.perk != null && unlocked.has(s.perk) && /checkout|selfcheckout|productcheckout/.test(s.effect.toLowerCase()),
  ).length
  const customerSkillsUnlocked = ENC.skills.filter(
    (s) => s.perk != null && unlocked.has(s.perk) && /extracustomersperk|bystander/.test(s.effect.toLowerCase()),
  ).length
  const recycleSkillsUnlocked = ENC.skills.filter(
    (s) => s.perk != null && unlocked.has(s.perk) && s.effect.toLowerCase().includes('recycle'),
  ).length

  const candidates = ENC.skills.filter((s) => s.perk != null && !unlocked.has(s.perk))

  const scored = candidates.map((s) => {
    const { tags } = categorizeSkill(s)
    let score = 0.5 // base
    for (const w of weights) {
      if (tags.includes(w.tag)) score += w.weight
    }
    // Slight bonus for skills with concrete numeric effects.
    const parsed = parseEffectForMetric(s.effect)
    if (parsed.length > 0 && parsed[0].delta !== '未提取') score += 0.3
    return { skill: s, score, tags }
  })
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, count).map((x, i) => ({
    skill: x.skill,
    rank: i + 1,
    score: x.score,
    reason: generateReason(x.skill, mode, {
      employeeCount,
      speedSkillsUnlocked,
      checkoutSkillsUnlocked,
      customerSkillsUnlocked,
      recycleSkillsUnlocked,
    }),
  }))
}

interface SaveContext {
  employeeCount: number
  speedSkillsUnlocked: number
  checkoutSkillsUnlocked: number
  customerSkillsUnlocked: number
  recycleSkillsUnlocked: number
}

function generateReason(
  skill: Skill,
  mode: StrategyMode,
  ctx: SaveContext,
): string {
  const eff = skill.effect
  const parsed = parseEffectForMetric(eff)
  const delta = parsed[0]?.delta ?? ''
  const metric = parsed[0]?.metric ?? ''
  switch (mode) {
    case 'employee':
      if (eff.includes('extraemployeespeedfactor')) {
        return `你目前有 ${ctx.employeeCount} 名員工，此技能讓${metric} ${delta}，直接提升補貨與結帳效率，員工越多加成越大。`
      }
      if (eff.includes('maxemployees')) {
        return `目前員工 ${ctx.employeeCount} 名，此技能直接 +${eff.match(/maxemployees\s*\+=\s*(\d+)/i)?.[1] ?? 'N'} 最大員工數，擴編人力。`
      }
      if (eff.includes('employeeitemplacewait')) {
        return `降低員工補貨等待 ${delta}，補貨更順暢。`
      }
      return `${metric || '效果'} ${delta || eff} — 員工效率相關加成。`
    case 'customer':
      if (eff.includes('extracustomersperk')) {
        return `已解鎖 ${ctx.customerSkillsUnlocked} 個客流技能，再加一個 ${delta} 客流的技能可進一步放大來客數。`
      }
      if (eff.includes('allowedsimultaneoussales')) {
        return `客流增加後結帳壓力上升，此技能 ${delta} 同時結帳數避免塞車。`
      }
      if (eff.includes('bystander')) {
        return `將路人轉為顧客，直接擴大客流池。`
      }
      return `${metric || '效果'} ${delta || eff} — 客流相關加成。`
    case 'checkout':
      if (eff.includes('productcheckoutwait') || eff.includes('selfcheckoutwait')) {
        return `已解鎖 ${ctx.checkoutSkillsUnlocked} 個收銀技能，此技能降低結帳等待 ${delta}，吞吐量再升級。`
      }
      if (eff.includes('allowedsimultaneoussales')) {
        return `增加同時結帳數 ${delta}，分散尖峰壓力。`
      }
      if (eff.includes('extracheckoutmoney')) {
        return `每筆結帳金額 ${delta}，直接放大單客營收。`
      }
      return `${metric || '效果'} ${delta || eff} — 收銀相關加成。`
    case 'recycling':
      if (eff.includes('boxrecyclefactor')) {
        return `已解鎖 ${ctx.recycleSkillsUnlocked} 個回收技能，此技能將回收倍率設為 ${delta}，回收收益倍增。`
      }
      if (eff.includes('recycle')) {
        return `強化回收鏈（${metric} ${delta}），降低廢棄成本。`
      }
      return `${metric || '效果'} ${delta || eff} — 回收相關加成。`
  }
}

// ============================================================
// Store profile + radar — for Tool 7 StrategyPanel
// ============================================================

export interface StoreProfile {
  archetype: string
  icon: string // lucide icon name (caller maps to component)
  description: string
  metrics: Record<string, number | string>
}

/**
 * Auto-detect a "store archetype" from the snapshot.
 *
 * Heuristics (deliberately simple — labelled proxy because real archetypes
 * depend on player style, not just numbers):
 *   - layout === 1     → 廣場佈局
 *   - employees >= 4   → 重員工
 *   - employees <= 2   → 精簡人力
 *   - storeLayout.length >= 40 → 大型店鋪
 *   - day >= 30        → 中後期
 */
export function computeStoreProfile(snapshot: SaveSnapshot | null): StoreProfile {
  if (!snapshot) {
    return {
      archetype: '未載入存檔',
      icon: 'FileQuestion',
      description: '載入存檔後將自動偵測店鋪型態。',
      metrics: {},
    }
  }
  const employeeCount = snapshot.employees?.length ?? 0
  const propCount = snapshot.storeLayout?.length ?? 0
  const layout = snapshot.layout
  const day = snapshot.day
  const money = snapshot.money
  const difficulty = snapshot.difficulty

  const metrics: Record<string, number | string> = {
    employees: employeeCount,
    props: propCount,
    day,
    money: money.toFixed(0),
    difficulty: difficulty ?? '—',
    layout: layout === 1 ? '廣場' : layout === 0 ? '經典' : '—',
  }

  // Priority: plaza → large+heavy-emp → small → mid-game → default.
  if (layout === 1) {
    return {
      archetype: '廣場佈局 · 大空間策略',
      icon: 'LayoutGrid',
      description:
        '廣場佈局空間大、貨架多，客流與補貨距離都拉長。建議投資員工速度 + 結帳吞吐量 + 客流技能。',
      metrics,
    }
  }
  if (employeeCount >= 4 && propCount >= 30) {
    return {
      archetype: '大型店鋪 · 重員工',
      icon: 'Users',
      description:
        '員工多、走動距離長，速度加成效益最大；客流與結帳壓力也大，建議投資員工速度 + 結帳吞吐量 + 客流。',
      metrics,
    }
  }
  if (employeeCount <= 2) {
    return {
      archetype: '小型店鋪 · 精簡人力',
      icon: 'User',
      description:
        '員工少，每位員工效率至關重要。建議優先投資員工速度、補貨等待降低、自助結帳商品數。',
      metrics,
    }
  }
  if (day >= 30) {
    return {
      archetype: '中後期 · 規模擴張',
      icon: 'TrendingUp',
      description:
        'Day 較高、應已進入規模化階段。建議補齊員工人數上限 + 回收鏈 + 自動付款以降低日常負擔。',
      metrics,
    }
  }
  return {
    archetype: '標準店鋪 · 均衡發展',
    icon: 'Store',
    description: '店鋪規模與人力適中。建議均衡投資員工速度、結帳吞吐量與客流提升。',
    metrics,
  }
}

// ============================================================
// Strategy radar — 5 axes (0-100 score each)
// ============================================================

export interface RadarAxis {
  axis: string
  score: number
  unlocked: number
  total: number
}

/** Compute 5-axis strategy radar: 員工效率 / 客流 / 結帳 / 回收 / 財務. */
export function computeStrategyRadar(snapshot: SaveSnapshot | null): RadarAxis[] {
  const unlocked = getUnlockedSet(snapshot)
  const axes: { axis: string; predicate: (s: Skill) => boolean }[] = [
    {
      axis: '員工效率',
      predicate: (s) => /speed|maxemployees|employeeitemplacewait/i.test(s.effect),
    },
    {
      axis: '客流',
      predicate: (s) => /extracustomersperk|bystander|allowedsimultaneoussales/i.test(s.effect),
    },
    {
      axis: '結帳',
      predicate: (s) => /checkout|selfcheckout|productcheckout|extracheckoutmoney/i.test(s.effect),
    },
    {
      axis: '回收',
      predicate: (s) => /recycle/i.test(s.effect),
    },
    {
      axis: '財務',
      predicate: (s) => /debt|electric|autopay|extracheckoutmoney/i.test(s.effect),
    },
  ]
  return axes.map(({ axis, predicate }) => {
    const relevant = ENC.skills.filter((s) => s.perk != null && predicate(s))
    const total = relevant.length
    const unlockedCount = relevant.filter((s) => unlocked.has(s.perk as number)).length
    const score = total > 0 ? Math.round((unlockedCount / total) * 100) : 0
    return { axis, score, unlocked: unlockedCount, total }
  })
}

// ============================================================
// Tailored recommendations for StrategyPanel (Tool 7)
// ============================================================

export interface TailoredRecommendation {
  skill: Skill
  reason: string
  unlocked: boolean
}

/**
 * Return 3-5 tailored skill recommendations based on the store profile.
 * Excludes already-unlocked skills (unless we don't have enough candidates).
 */
export function tailoredRecommendations(
  snapshot: SaveSnapshot | null,
  profile: StoreProfile,
  count = 5,
): TailoredRecommendation[] {
  const unlocked = getUnlockedSet(snapshot)
  const archetype = profile.archetype
  // Pick a tag-filter based on the archetype.
  let allowedTags: string[] = []
  if (archetype.includes('廣場') || archetype.includes('大型')) {
    allowedTags = ['speed', 'headcount', 'throughput', 'sales-cap']
  } else if (archetype.includes('小型') || archetype.includes('精簡')) {
    allowedTags = ['speed', 'throughput', 'automation']
  } else if (archetype.includes('中後期')) {
    allowedTags = ['headcount', 'recycling', 'finance']
  } else {
    allowedTags = ['speed', 'throughput', 'sales-cap', 'headcount']
  }

  const candidates = ENC.skills
    .filter((s) => s.perk != null)
    .map((s) => {
      const { tags } = categorizeSkill(s)
      const matchingTags = tags.filter((t) => allowedTags.includes(t))
      return { skill: s, tags, matchingTags, unlocked: unlocked.has(s.perk as number) }
    })
    .filter((x) => x.matchingTags.length > 0)

  // Prefer unlocked=false first, then by matchingTags count desc.
  candidates.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1
    return b.matchingTags.length - a.matchingTags.length
  })

  return candidates.slice(0, count).map((x) => ({
    skill: x.skill,
    unlocked: x.unlocked,
    reason: generateTailoredReason(x.skill, x.tags, archetype, profile.metrics),
  }))
}

function generateTailoredReason(
  skill: Skill,
  tags: string[],
  archetype: string,
  metrics: Record<string, number | string>,
): string {
  const emp = metrics.employees ?? '?'
  if (tags.includes('speed')) {
    return `${archetype}：員工 ${emp} 名，速度加成效益最大（${skill.effect}）。`
  }
  if (tags.includes('headcount')) {
    return `${archetype}：擴編人力上限，配合現有 ${emp} 名員工再 +${skill.effect.match(/maxemployees\s*\+=\s*(\d+)/i)?.[1] ?? 'N'}。`
  }
  if (tags.includes('throughput')) {
    return `${archetype}：降低結帳/補貨等待，吞吐量提升。`
  }
  if (tags.includes('sales-cap')) {
    return `${archetype}：增加同時結帳數，分流尖峰壓力。`
  }
  if (tags.includes('recycling')) {
    return `${archetype}：強化回收鏈，降低廢棄成本。`
  }
  if (tags.includes('finance')) {
    return `${archetype}：自動付款 / 電費減免，降低日常營運負擔。`
  }
  return `${archetype}：${skill.effect || skill.id}。`
}

// ============================================================
// Preset filters (for BuildPlanner Tool 2 quick presets)
// ============================================================

export type PresetKey = 'employee' | 'checkout' | 'customer' | 'recycle'

/** Return the skill ids matching a preset build line. */
export function presetSkillIds(preset: PresetKey): string[] {
  const filter: (s: Skill) => boolean = (() => {
    switch (preset) {
      case 'employee':
        return (s) =>
          /speed|maxemployees|employeeitemplacewait/i.test(s.effect) ||
          /employee/i.test(s.id)
      case 'checkout':
        return (s) =>
          /checkout|selfcheckout|productcheckout|allowedsimultaneoussales|extracheckoutmoney/i.test(
            s.effect,
          )
      case 'customer':
        return (s) => /extracustomersperk|bystander/i.test(s.effect)
      case 'recycle':
        return (s) => /recycle/i.test(s.effect)
    }
  })()
  return ENC.skills.filter(filter).map((s) => s.id)
}

// ============================================================
// Misc helpers
// ============================================================

/** Look up a skill by its id. */
export function getSkillById(id: string): Skill | undefined {
  return SKILL_BY_ID.get(id)
}

/** Look up a skill by its perk index. */
export function getSkillByPerk(perk: number): Skill | undefined {
  return SKILL_BY_PERK.get(perk)
}

/** Compute FP spent so far = unlockedCount × FP_COST_PER_SKILL. */
export function computeFpSpent(snapshot: SaveSnapshot | null): number {
  return getUnlockedSkillIndices(snapshot).length * FP_COST_PER_SKILL
}

/**
 * Compute FP "still needed" for a build plan:
 *   (number of plan skills not yet unlocked) × 1000 − current unspent FP
 * (floored at 0 — if the user has enough, returns 0).
 */
export function computeFpNeededForPlan(
  planSkillIds: string[],
  snapshot: SaveSnapshot | null,
): number {
  const unlocked = getUnlockedSet(snapshot)
  let needBuy = 0
  for (const id of planSkillIds) {
    const s = SKILL_BY_ID.get(id)
    if (!s || s.perk == null) continue
    if (!unlocked.has(s.perk)) needBuy++
  }
  const cost = needBuy * FP_COST_PER_SKILL
  const available = snapshot?.franchisePoints ?? 0
  return Math.max(0, cost - available)
}
