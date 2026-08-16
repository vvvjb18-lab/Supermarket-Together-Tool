// Online-order economy engine — D2 (Supermarket Together Lab)
//
// Computes the player's expected revenue from a day's online orders,
// given: current perks, current day, current weather, and inventory.
//
// Formulas (all derived from game IL; see save-analyzer/perk_effects_final.json
// and dump_price_callers.cs for IL call-sites):
//
//   season         = clamp(floor((day % 111) / 28), 0, 3)        // 0=春 1=夏 2=秋 3=冬
//   badWeather     = GameData.CalculateTodaysWeather (V9=0..5) >= 4
//   ordersToday    = baseOrders + (badWeather + skill43 ? 3..5 : 0)   // perk 43
//   itemPrice      = basePrice x tierInflation x Random(3.25, 3.5)
//                  x (badWeather && skill43 ? 3 : 1)
//   noComplaints   = true   (online orders never trigger a price complaint,
//                            they auto-pay on Pickup Point)
//
// All functions are pure and UI-agnostic so they can be unit-tested and
// imported by the new OnlineOrders tab (D2) and any future analytics page.

import type { Product, SaveSnapshot } from './types'
import { TIER_INFLATION_VALUES, tierInflationTable } from './data-loader'

// ---------- constants (from IL) ----------

/** Random multiplier for online-order payout. IL: Random(3.25, 3.5). */
export const ONLINE_RANDOM_MIN = 3.25
export const ONLINE_RANDOM_MAX = 3.5

/** Bad-weather price boost (only when perk 43 is also unlocked). */
export const BAD_WEATHER_PRICE_MULT = 3

/** Order count bonus when bad weather AND perk 43 is unlocked. */
export const BAD_WEATHER_ORDERS_BONUS_MIN = 3
export const BAD_WEATHER_ORDERS_BONUS_MAX = 5

/** Per-order item count, default for difficulty 5. */
export const DEFAULT_ITEMS_PER_ORDER = 22

/** Day cycle length, used for season calculation. */
export const SEASON_CYCLE_DAYS = 111
export const SEASON_LENGTH_DAYS = 28

/** perk_effects_final.json perk 43 = orderingExtraCrashOnBadWeather. */
export const SKILL_43_PERK_INDEX = 43

// ---------- season + weather ----------

export const SEASON_LABELS_ZH = ['春', '夏', '秋', '冬'] as const
export const SEASON_LABELS_EN = ['Spring', 'Summer', 'Autumn', 'Winter'] as const

export interface SeasonInfo {
  index: 0 | 1 | 2 | 3
  /** Day number within the 111-day cycle (0..110). */
  dayInCycle: number
  zh: string
  en: string
}

/** clamp(floor((day % 111) / 28), 0, 3). Day 1 → 0 (春). */
export function getSeason(day: number): SeasonInfo {
  const dayInCycle = ((day % SEASON_CYCLE_DAYS) + SEASON_CYCLE_DAYS) % SEASON_CYCLE_DAYS
  const raw = Math.floor(dayInCycle / SEASON_LENGTH_DAYS)
  const index = Math.max(0, Math.min(3, raw)) as 0 | 1 | 2 | 3
  return {
    index,
    dayInCycle,
    zh: SEASON_LABELS_ZH[index],
    en: SEASON_LABELS_EN[index],
  }
}

/**
 * Predicted today's weather (V9 index 0..5).
 *
 * The game computes it deterministically from day + RNG seed, so without
 * a save we approximate using day parity (every 7th day has a chance of bad
 * weather). When a real save is loaded, snapshot.weather overrides this.
 */
export function getWeather(day: number, override?: { isBad?: boolean; label?: string }): {
  isBad: boolean
  /** 0..5 — higher = worse. */
  v9: number
  label: string
} {
  if (override && typeof override.isBad === 'boolean') {
    return { isBad: override.isBad, v9: override.isBad ? 4 : 1, label: override.label ?? (override.isBad ? '壞天氣' : '好天氣') }
  }
  // Deterministic proxy: day % 7 == 6 → bad weather. Good enough as a
  // planning signal until a real save provides snapshot.weather.
  const isBad = day % 7 === 6
  return { isBad, v9: isBad ? 4 : 1, label: isBad ? '壞天氣' : '好天氣' }
}

// ---------- perk detection ----------

/**
 * Check whether a skill/perk is unlocked in a save.
 *
 * The save's `skillUnlocks` field is an array of perk indices (per the
 * perkIndexToSkill mapping). We also accept the encyclopedia's skill.id
 * strings (skill43 etc.) for forward-compat.
 */
export function isSkillUnlocked(snapshot: SaveSnapshot | null, perkIndex: number): boolean {
  if (!snapshot) return false
  const arr = snapshot.skillUnlocks ?? []
  return arr.includes(perkIndex)
}

/** True if the player has perk 43 (orderingExtraCrashOnBadWeather). */
export function hasSkill43(snapshot: SaveSnapshot | null): boolean {
  return isSkillUnlocked(snapshot, SKILL_43_PERK_INDEX)
}

// ---------- per-product online-order pricing ----------

/**
 * Get tier inflation multiplier for a product.
 *
 * Falls back to 1.0 for any tier outside the 0-16 real-value range (tiers
 * 17-54 carry no inflation in the game; player cap is 2.01x basePrice).
 */
export function getTierInflation(tier: number): number {
  if (tier < 0 || tier >= TIER_INFLATION_VALUES.length) return 1.0
  return TIER_INFLATION_VALUES[tier]
}

export interface OnlineOrderLine {
  productId: number
  name: string
  basePrice: number
  tier: number
  tierInflation: number
  /** Items currently in stock for this product. */
  inStock: number
  /** Expected single-item payout (mid of 3.25..3.5). */
  expectedItemPrice: number
  /** Min possible single-item payout (3.25 × 1.0). */
  minItemPrice: number
  /** Max possible single-item payout (3.5 × 1.0; ×3 if bad+skill43). */
  maxItemPrice: number
  /** Expected total revenue if we use all in-stock items. */
  expectedRevenue: number
  minRevenue: number
  maxRevenue: number
  /** Whether the line is bad-weather eligible. */
  isBadWeather: boolean
  hasSkill43: boolean
}

export interface OnlineOrderEconomy {
  day: number
  season: SeasonInfo
  weather: { isBad: boolean; v9: number; label: string }
  /** Total orders today, with optional bad-weather/skill-43 bonus. */
  ordersToday: number
  /** Base orders (no bad weather / no skill 43). */
  baseOrders: number
  /** True if the player has perk 43. */
  hasSkill43: boolean
  /** Items per order, default 22 (difficulty 5). */
  itemsPerOrder: number
  /** Per-product expected revenue if shipped from inventory. */
  lines: OnlineOrderLine[]
  /** Sum of all line.expectedRevenue. */
  totalExpectedRevenue: number
  totalMinRevenue: number
  totalMaxRevenue: number
  /** Top 10 products by expected revenue (pre-sorted). */
  top10ByRevenue: OnlineOrderLine[]
  /** Short actionable string. */
  recommendation: string
}

export interface ComputeOptions {
  /** Override ordersToday (e.g. for what-if sim). */
  ordersOverride?: number
  /** Override items per order. */
  itemsPerOrderOverride?: number
  /** Use these in-stock counts instead of snapshot.inventoryByProduct. */
  inventoryOverride?: Record<number, number>
  /** Force weather outcome (e.g. for the day slider). */
  weatherOverride?: { isBad: boolean; label?: string }
}

/**
 * Compute today's online-order economy.
 *
 * @param snapshot  Current save (null = demo / no-save)
 * @param products  All products to consider (default: all encyclopedia products)
 * @param day       Current game day (default: snapshot.day ?? 1)
 * @param options   Optional overrides for what-if simulation
 */
export function computeOrderDayEconomy(
  snapshot: SaveSnapshot | null,
  products: Product[],
  day?: number,
  options: ComputeOptions = {},
): OnlineOrderEconomy {
  const useDay = day ?? snapshot?.day ?? 1
  const season = getSeason(useDay)
  const skill43 = hasSkill43(snapshot)
  const weather = getWeather(useDay, options.weatherOverride)
  const isBad = weather.isBad
  const priceMult = isBad && skill43 ? BAD_WEATHER_PRICE_MULT : 1

  // Order count
  const baseOrders = Math.max(1, Math.round((snapshot?.difficulty ?? 5) * 0.8))
  let ordersToday = options.ordersOverride ?? baseOrders
  if (isBad && skill43 && options.ordersOverride == null) {
    const bonus = (BAD_WEATHER_ORDERS_BONUS_MIN + BAD_WEATHER_ORDERS_BONUS_MAX) / 2
    ordersToday = baseOrders + Math.round(bonus)
  }
  const itemsPerOrder = options.itemsPerOrderOverride ?? DEFAULT_ITEMS_PER_ORDER

  const inventory: Record<number, number> = options.inventoryOverride ?? snapshot?.inventoryByProduct ?? {}
  const lines: OnlineOrderLine[] = []

  for (const p of products) {
    const stock = inventory[p.id] ?? 0
    if (stock <= 0) continue
    const infl = getTierInflation(p.tier)
    const midRandom = (ONLINE_RANDOM_MIN + ONLINE_RANDOM_MAX) / 2
    const minItemPrice = p.basePricePerUnit * infl * ONLINE_RANDOM_MIN * priceMult
    const expectedItemPrice = p.basePricePerUnit * infl * midRandom * priceMult
    const maxItemPrice = p.basePricePerUnit * infl * ONLINE_RANDOM_MAX * priceMult
    lines.push({
      productId: p.id,
      name: p.name.zhHant || p.name.en || `#${p.id}`,
      basePrice: p.basePricePerUnit,
      tier: p.tier,
      tierInflation: infl,
      inStock: stock,
      expectedItemPrice,
      minItemPrice,
      maxItemPrice,
      expectedRevenue: expectedItemPrice * stock,
      minRevenue: minItemPrice * stock,
      maxRevenue: maxItemPrice * stock,
      isBadWeather: isBad,
      hasSkill43: skill43,
    })
  }

  // Sort by expected revenue desc
  lines.sort((a, b) => b.expectedRevenue - a.expectedRevenue)
  const top10 = lines.slice(0, 10)

  const totalExpected = lines.reduce((s, l) => s + l.expectedRevenue, 0)
  const totalMin = lines.reduce((s, l) => s + l.minRevenue, 0)
  const totalMax = lines.reduce((s, l) => s + l.maxRevenue, 0)

  // Recommendation string
  let recommendation: string
  if (lines.length === 0) {
    recommendation = '目前庫存為 0，無法接線上訂單。先補貨再開 Order Packaging。'
  } else if (isBad && !skill43) {
    recommendation = `今天是 ${weather.label}（V9=${weather.v9}），但你還沒解鎖技能 43。今天預估 $${totalExpected.toFixed(0)}，明天若解鎖技能 43 可上看 $${(totalExpected * BAD_WEATHER_PRICE_MULT).toFixed(0)}（×3 壞天氣加成）。`
  } else if (isBad && skill43) {
    recommendation = `今天是 ${weather.label} + 技能 43 全開！訂單爆發日：預估 $${totalExpected.toFixed(0)}（${ordersToday} 單 × ${itemsPerOrder} 件，×${BAD_WEATHER_PRICE_MULT} 壞天氣加成）。優先備貨高 tier 通脹商品。`
  } else {
    recommendation = `好天氣日，線上訂單正常運作。預估 $${totalExpected.toFixed(0)}（${ordersToday} 單 × ${itemsPerOrder} 件）。若想再衝，可等壞天氣 + 技能 43 雙觸發。`
  }

  return {
    day: useDay,
    season,
    weather,
    ordersToday,
    baseOrders,
    hasSkill43: skill43,
    itemsPerOrder,
    lines,
    totalExpectedRevenue: totalExpected,
    totalMinRevenue: totalMin,
    totalMaxRevenue: totalMax,
    top10ByRevenue: top10,
    recommendation,
  }
}

// ---------- skill 43 ROI ----------

/**
 * If the player DOESN'T have skill 43, compute what they'd gain by unlocking it.
 *
 * Conservative estimate: in a 111-day cycle, ~15 days are bad-weather
 * (every 7th day is bad per getWeather proxy). With skill 43, each of those
 * days gets a 3× price multiplier and +3..5 orders.
 */
export interface Skill43ROI {
  /** Total expected revenue across one 111-day cycle without skill 43. */
  expectedRevenueNoSkill43: number
  /** Total expected revenue across one 111-day cycle WITH skill 43. */
  expectedRevenueWithSkill43: number
  /** expectedRevenueWithSkill43 - expectedRevenueNoSkill43 */
  uplift: number
  /** Days of bad weather in the cycle. */
  badWeatherDays: number
  /** Cost to unlock: 1000 FP. */
  fpCost: number
  /** Daily FP income (proxy = difficulty × 0.4). */
  estimatedDailyFp: number
  /** Days of FP farming needed to unlock. */
  daysToUnlock: number
  /** Final advisory string. */
  verdict: string
}

export function findSkill43ROI(
  snapshot: SaveSnapshot | null,
  products: Product[],
  day?: number,
  options: Omit<ComputeOptions, 'weatherOverride' | 'ordersOverride'> = {},
): Skill43ROI {
  const useDay = day ?? snapshot?.day ?? 1
  // 15 bad-weather days per 111-day cycle (proxy: day % 7 == 6 → 15-16 days)
  const badWeatherDays = 15
  // Per-day revenue averaged across the 111-day cycle
  const goodDay = computeOrderDayEconomy(snapshot, products, useDay, { ...options, weatherOverride: { isBad: false } })
  const badNoSkill = computeOrderDayEconomy(snapshot, products, useDay, { ...options, weatherOverride: { isBad: true } })
  // With skill 43, the bad day is badNoSkill × 3 (price) but a slightly different
  // order count — we use the order-engine's recompute, which already accounts for it.
  const fakeSnapshotWithSkill43: SaveSnapshot | null = snapshot
    ? { ...snapshot, skillUnlocks: [...(snapshot.skillUnlocks ?? []), SKILL_43_PERK_INDEX] }
    : null
  const badWithSkill = computeOrderDayEconomy(fakeSnapshotWithSkill43, products, useDay, {
    ...options,
    weatherOverride: { isBad: true },
  })
  const perDayAvgNoSkill = ((111 - badWeatherDays) * goodDay.totalExpectedRevenue + badWeatherDays * badNoSkill.totalExpectedRevenue) / 111
  const perDayAvgWithSkill = ((111 - badWeatherDays) * goodDay.totalExpectedRevenue + badWeatherDays * badWithSkill.totalExpectedRevenue) / 111
  const expectedRevenueNoSkill43 = perDayAvgNoSkill * 111
  const expectedRevenueWithSkill43 = perDayAvgWithSkill * 111
  const uplift = expectedRevenueWithSkill43 - expectedRevenueNoSkill43

  const estimatedDailyFp = (snapshot?.difficulty ?? 5) * 0.4
  const daysToUnlock = Math.ceil(1000 / Math.max(0.01, estimatedDailyFp))
  const verdict = uplift > 0
    ? `解鎖技能 43 後，一個 111 天週期可多賺 $${uplift.toFixed(0)}（≈$${(uplift / 111).toFixed(0)}/天）。需 ${daysToUnlock} 天農 FP。`
    : '當前庫存為 0，解鎖技能 43 不會改變線上訂單收入。先補貨再評估。'

  return {
    expectedRevenueNoSkill43,
    expectedRevenueWithSkill43,
    uplift,
    badWeatherDays,
    fpCost: 1000,
    estimatedDailyFp,
    daysToUnlock,
    verdict,
  }
}

// ---------- helpers ----------

/** Expose the table for the UI's "tier inflation table" section. */
export function getTierInflationTable() {
  return tierInflationTable
}
