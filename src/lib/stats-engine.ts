// Statistics analysis engine.
//
// Turns the parsed StatsHistory (daily scalars + per-product lists) into
// decision-useful signals, and — crucially — WIRES IT BACK into the rest of
// the tool. The existing engine derives "demand" from customer-type weights
// (a proxy); the stats file gives us the player's REAL per-product daily sales,
// revenue and purchase cost. This module exposes that ground truth so the
// operations view can rank restocks / flag dead stock / price-check from real
// history instead of theory.

import { encyclopedia as ENC, productById, productZhName } from './data-loader'
import { computeMarketPrice, TIER_INFLATION } from './engine'
import type { DailyStat, SaveSnapshot, StatsHistory } from './types'

// ---------- summary ----------

export interface StatsSummary {
  totalDays: number
  firstDay: number
  lastDay: number
  latest: DailyStat | null
  totals: {
    customers: number
    benefits: number
    revenueEstimate: number
    onlineRevenue: number
    storeRevenueEstimate: number
    moneySpent: number
    lightCost: number
    rentCost: number
    employeesCost: number
    totalSoldUnits: number
    notFound: number
    tooExpensive: number
    timesRobbed: number
  }
  averages: {
    customers: number
    benefits: number
    revenueEstimate: number
    basketSize: number // revenue / customers
    unitsPerCustomer: number
  }
}

/** Sum a DailyStat's known visible expenses (excludes loan/invoice which stats doesn't store as amounts). */
function visibleExpenses(d: DailyStat): number {
  return d.moneySpentOnProducts + d.lightCost + d.rentCost + d.employeesCost
}

export function computeStatsSummary(history: StatsHistory): StatsSummary {
  const days = history.days
  const stats = days.map((d) => history.data[String(d)]).filter(Boolean)
  const latest = stats.length > 0 ? stats[stats.length - 1] : null

  const sum = (f: (d: DailyStat) => number) => stats.reduce((a, d) => a + f(d), 0)
  const totals = {
    customers: sum((d) => d.customers),
    benefits: sum((d) => d.benefits),
    revenueEstimate: sum((d) => d.benefits + visibleExpenses(d)),
    onlineRevenue: sum((d) => d.moneyMadeByOnlineOrders),
    storeRevenueEstimate: sum((d) => d.benefits + visibleExpenses(d) - d.moneyMadeByOnlineOrders),
    moneySpent: sum((d) => d.moneySpentOnProducts),
    lightCost: sum((d) => d.lightCost),
    rentCost: sum((d) => d.rentCost),
    employeesCost: sum((d) => d.employeesCost),
    totalSoldUnits: sum((d) => d.totalProductsSoldThisDay),
    notFound: sum((d) => d.notFoundProductsCount),
    tooExpensive: sum((d) => d.tooExpensiveProductsCount),
    timesRobbed: sum((d) => d.timesRobbed),
  }
  const n = Math.max(1, stats.length)
  const averages = {
    customers: totals.customers / n,
    benefits: totals.benefits / n,
    revenueEstimate: totals.revenueEstimate / n,
    basketSize: totals.customers > 0 ? totals.revenueEstimate / totals.customers : 0,
    unitsPerCustomer: totals.customers > 0 ? totals.totalSoldUnits / totals.customers : 0,
  }

  return {
    totalDays: stats.length,
    firstDay: days[0] ?? 0,
    lastDay: days[days.length - 1] ?? 0,
    latest,
    totals,
    averages,
  }
}

// ---------- profit breakdown (stats × snapshot loan) ----------

export interface ProfitBreakdown {
  day: number
  benefits: number
  storeRevenueEstimate: number
  onlineRevenue: number
  moneySpent: number
  lightCost: number
  rentCost: number
  employeesCost: number
  /** Only populated when a main save snapshot supplies LoanPaymentPerDay. */
  loanPayment: number | null
  /** benefits − all accounted expenses (≈ retained cash, proxy). */
  netCashProxy: number
}

export function computeProfitBreakdown(history: StatsHistory, snapshot: SaveSnapshot | null): ProfitBreakdown | null {
  const latest = history.data[String(history.days[history.days.length - 1])]
  if (!latest) return null
  const loanPayment = snapshot?.loanPaymentPerDay ?? null
  const storeRevenue = latest.benefits + visibleExpenses(latest) - latest.moneyMadeByOnlineOrders
  const netCashProxy = latest.benefits - (loanPayment ?? 0)
  return {
    day: latest.day,
    benefits: latest.benefits,
    storeRevenueEstimate: storeRevenue,
    onlineRevenue: latest.moneyMadeByOnlineOrders,
    moneySpent: latest.moneySpentOnProducts,
    lightCost: latest.lightCost,
    rentCost: latest.rentCost,
    employeesCost: latest.employeesCost,
    loanPayment,
    netCashProxy,
  }
}

// ---------- per-product performance (REAL sales/revenue/cost) ----------

export interface ProductPerformance {
  productId: number
  name: string
  totalSold: number
  totalRevenue: number
  totalCost: number
  avgPrice: number
  grossProfit: number
  grossMargin: number
  avgDailySold: number
  recentDailySold: number
  activeDays: number
  /** avgPrice / (basePrice × tierInflation). >1 = marked up over market, <1 = discounted. */
  fairMultiplier: number
  /**
   * "Fair gross margin" assuming the player sold at the market-clearing price
   * (basePrice × tierInflation). Useful for comparing actual pricing power
   * against the theoretical optimum; 1.0 = matched the market, >1 = better.
   */
  fairMarginVsMarket: number
  tier: number
  tierInflation: number
}

const RECENT_WINDOW = 7

export function computeProductPerformance(history: StatsHistory): ProductPerformance[] {
  const stats = history.days.map((d) => history.data[String(d)]).filter(Boolean)
  if (stats.length === 0) return []
  const productCount = history.productCount || ENC.products.length
  const out: ProductPerformance[] = []

  for (let pid = 0; pid < productCount; pid++) {
    let totalSold = 0
    let totalRevenue = 0
    let totalCost = 0
    let activeDays = 0
    let recentSold = 0
    stats.forEach((d, i) => {
      const sold = d.productsSoldList[pid] ?? 0
      totalSold += sold
      totalRevenue += d.revenuePerProductSoldList[pid] ?? 0
      totalCost += d.costPerProductAcquiredList[pid] ?? 0
      if (sold > 0) activeDays++
      if (i >= stats.length - RECENT_WINDOW) recentSold += sold
    })

    if (totalSold <= 0 && totalRevenue <= 0 && totalCost <= 0) continue

    const p = productById.get(pid)
    const tier = p?.tier ?? 0
    const tierInflation = TIER_INFLATION[tier] ?? 1.0
    const marketPrice = (p?.basePricePerUnit ?? 0) * tierInflation

    const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0
    const grossProfit = totalRevenue - totalCost
    const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0
    const avgDailySold = activeDays > 0 ? totalSold / activeDays : 0
    const recentDailySold = recentSold / RECENT_WINDOW

    // fairMultiplier: how much the player actually charged vs. the game's
    // market-clearing price. 1.0 = matched market; 2.0 = the customer's
    // complaint threshold. Tier-inflation-aware.
    const fairMultiplier = marketPrice > 0 ? avgPrice / marketPrice : 0
    // fairMarginVsMarket: (avgPrice − marketPrice) / marketPrice, i.e. the
    // mark-up (or discount) the player achieved over the baseline.
    const fairMarginVsMarket = marketPrice > 0 ? (avgPrice - marketPrice) / marketPrice : 0

    out.push({
      productId: pid,
      name: productById.get(pid)?.name.zhHant ?? productById.get(pid)?.name.en ?? `#${pid}`,
      totalSold,
      totalRevenue,
      totalCost,
      avgPrice,
      grossProfit,
      grossMargin,
      avgDailySold,
      recentDailySold,
      activeDays,
      fairMultiplier,
      fairMarginVsMarket,
      tier,
      tierInflation,
    })
  }

  return out
}

// ---------- best / worst day hero KPIs ----------

export interface DayExtreme {
  /** "best" = highest benefits; "worst" = lowest (most negative) benefits. */
  kind: 'best' | 'worst'
  day: number
  benefits: number
  revenueEstimate: number
  onlineRevenue: number
  customers: number
  notFound: number
  tooExpensive: number
  /** Short one-liner: "壞天氣日 + 線上訂單爆發" or "缺貨日" etc. */
  summary: string
}

/** Compute the highest- and lowest-`benefits` days from the stats history. */
export function computeDayExtremes(history: StatsHistory): { best: DayExtreme | null; worst: DayExtreme | null } {
  const stats = history.days.map((d) => history.data[String(d)]).filter(Boolean)
  if (stats.length === 0) return { best: null, worst: null }
  let best: DailyStat = stats[0]
  let worst: DailyStat = stats[0]
  for (const d of stats) {
    if (d.benefits > best.benefits) best = d
    if (d.benefits < worst.benefits) worst = d
  }
  const toExtreme = (kind: 'best' | 'worst', d: DailyStat): DayExtreme => {
    const revenueEstimate = d.benefits + visibleExpenses(d)
    let summary: string
    if (d.moneyMadeByOnlineOrders > 0 && d.onlineOrdersMade >= 5) {
      summary = `線上訂單爆發：${d.onlineOrdersMade} 單 / $${d.moneyMadeByOnlineOrders.toFixed(0)}（可能是壞天氣 × 技能 43）`
    } else if (d.notFoundProductsCount > 10) {
      summary = `缺貨日：${d.notFoundProductsCount} 次找不到商品 — 補貨排程需調整`
    } else if (d.tooExpensiveProductsCount > 10) {
      summary = `定價過高：${d.tooExpensiveProductsCount} 次太貴投訴 — 降價或回到 ≤2.01× 市價`
    } else if (d.customers < 5) {
      summary = `客流極低：僅 ${d.customers} 位顧客 — 廣告牌 / 解鎖類別可能有問題`
    } else if (d.timesRobbed > 0) {
      summary = `被偷 ${d.timesRobbed} 次 — 加防盜 / 監控`
    } else {
      summary = `${d.customers} 顧客 · ${d.moneyMadeByOnlineOrders > 0 ? '線上 $' + d.moneyMadeByOnlineOrders.toFixed(0) : '純店內'}`
    }
    return {
      kind,
      day: d.day,
      benefits: d.benefits,
      revenueEstimate,
      onlineRevenue: d.moneyMadeByOnlineOrders,
      customers: d.customers,
      notFound: d.notFoundProductsCount,
      tooExpensive: d.tooExpensiveProductsCount,
      summary,
    }
  }
  return { best: toExtreme('best', best), worst: toExtreme('worst', worst) }
}

export interface StatsDiagnostics {
  totalNotFound: number
  totalTooExpensive: number
  avgNotFoundPerDay: number
  avgTooExpensivePerDay: number
  /** 'stockout' | 'pricing' | 'balanced' | 'quiet' */
  mode: 'stockout' | 'pricing' | 'balanced' | 'quiet'
  verdict: string
}

export function computeDiagnostics(history: StatsHistory): StatsDiagnostics {
  const stats = history.days.map((d) => history.data[String(d)]).filter(Boolean)
  const n = Math.max(1, stats.length)
  const totalNotFound = stats.reduce((a, d) => a + d.notFoundProductsCount, 0)
  const totalTooExpensive = stats.reduce((a, d) => a + d.tooExpensiveProductsCount, 0)
  const avgNotFound = totalNotFound / n
  const avgTooExpensive = totalTooExpensive / n

  let mode: StatsDiagnostics['mode'] = 'quiet'
  let verdict = '客流量低或資料不足，尚無明顯缺貨／定價訊號。'
  if (avgNotFound > 3 && avgTooExpensive > 3) {
    mode = 'balanced'
    verdict = '缺貨與太貴投訴同時偏高——庫存結構與定價都需要調整。'
  } else if (avgNotFound > 3) {
    mode = 'stockout'
    verdict = '缺貨漏單明顯多於太貴投訴——優先補高銷量商品，而非減價。'
  } else if (avgTooExpensive > 3) {
    mode = 'pricing'
    verdict = '太貴投訴明顯多於缺貨——優先檢視定價是否超 2.01× 市價。'
  }

  return {
    totalNotFound,
    totalTooExpensive,
    avgNotFoundPerDay: avgNotFound,
    avgTooExpensivePerDay: avgTooExpensive,
    mode,
    verdict,
  }
}

// ---------- diagnostics (not-found vs too-expensive) ----------
// ---------- next-day actions (stats × snapshot × encyclopedia) ----------

export type NextActionKind = 'restock' | 'dead-stock' | 'pricing' | 'watch' | 'info'

export interface NextDayAction {
  kind: NextActionKind
  productId?: number
  title: string
  detail: string
  priority: number
}

export function computeNextDayActions(history: StatsHistory, snapshot: SaveSnapshot | null): NextDayAction[] {
  const perf = computeProductPerformance(history)
  const inv = snapshot?.inventoryByProduct ?? {}
  const actions: NextDayAction[] = []
  const latest = history.data[String(history.days[history.days.length - 1])]

  // 1. Real-sales restock: high recent velocity, low current stock.
  const restockCandidates = perf
    .filter((p) => p.recentDailySold > 0)
    .map((p) => {
      const current = (inv[p.productId] as number) ?? 0
      const daysLeft = p.recentDailySold > 0 ? current / p.recentDailySold : Infinity
      return { p, current, daysLeft }
    })
    .filter((x) => x.daysLeft < 1.5)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8)

  for (const { p, current, daysLeft } of restockCandidates) {
    const market = productById.get(p.productId) ? computeMarketPrice(productById.get(p.productId)!).value : 0
    actions.push({
      kind: 'restock',
      productId: p.productId,
      title: `補貨 ${p.name}`,
      detail: `近 7 日日均賣 ${p.recentDailySold.toFixed(1)} 件、現有 ${current} 件（約 ${daysLeft.toFixed(1)} 天）。近 7 日毛利率 ${(p.grossMargin * 100).toFixed(0)}%、市價 $${market.toFixed(2)}。`,
      priority: Math.max(1, 100 - Math.round(daysLeft * 20)),
    })
  }

  // 2. Dead stock: has inventory but near-zero real sales.
  const deadCandidates = perf
    .filter((p) => {
      const current = (inv[p.productId] as number) ?? 0
      return current > 0 && p.recentDailySold < 0.05 && p.totalSold === 0
    })
    .sort((a, b) => (inv[b.productId] as number) - (inv[a.productId] as number))
    .slice(0, 5)

  for (const p of deadCandidates) {
    const current = (inv[p.productId] as number) ?? 0
    actions.push({
      kind: 'dead-stock',
      productId: p.productId,
      title: `清死貨 ${p.name}`,
      detail: `有 ${current} 件庫存但全程零銷量。考慮下架／5% 特價清庫存／停止補貨。`,
      priority: 60,
    })
  }

  // 3. Pricing flag from real complaints.
  if (latest && latest.tooExpensiveProductsCount >= 3) {
    actions.push({
      kind: 'pricing',
      title: '檢視定價',
      detail: `昨日 ${latest.tooExpensiveProductsCount} 次「太貴」投訴。用定價實驗頁找出超 2.01× 市價的商品。`,
      priority: 70,
    })
  }

  // 4. Online orders signal.
  if (latest && latest.onlineOrdersMade > 0) {
    actions.push({
      kind: 'info',
      title: '線上訂單是盈利主力',
      detail: `線上訂單收入 $${latest.moneyMadeByOnlineOrders.toFixed(0)}（${latest.onlineOrdersMade} 單），遠高於店內。維持 Order Packaging 運作。`,
      priority: 55,
    })
  }

  // 5. Robbery / cash-flow hint when loan exists.
  if (snapshot?.loanAmount != null && snapshot.loanAmount > 0) {
    actions.push({
      kind: 'info',
      title: '現金流優先於擴張',
      detail: `尚有貸款 $${snapshot.loanAmount.toFixed(0)}（每日 $${(snapshot.loanPaymentPerDay ?? 0).toFixed(0)}）。先確保薪資／貸款現金，再補貨。`,
      priority: 50,
    })
  }

  actions.sort((a, b) => b.priority - a.priority)
  return actions.slice(0, 15)
}

// ---------- chart series helper ----------

export interface SeriesPoint {
  day: number
  [key: string]: number
}

export function buildDailySeries(history: StatsHistory, snapshot: SaveSnapshot | null): SeriesPoint[] {
  const loan = snapshot?.loanPaymentPerDay ?? 0
  return history.days
    .map((day) => {
      const d = history.data[String(day)]
      if (!d) return null
      const revenueEst = d.benefits + visibleExpenses(d)
      return {
        day,
        benefits: d.benefits,
        customers: d.customers,
        revenue: Math.round(revenueEst * 100) / 100,
        onlineRevenue: d.moneyMadeByOnlineOrders,
        notFound: d.notFoundProductsCount,
        tooExpensive: d.tooExpensiveProductsCount,
        moneySpent: d.moneySpentOnProducts,
        employeesCost: d.employeesCost,
        rentCost: d.rentCost,
        lightCost: d.lightCost,
        loan,
      }
    })
    .filter(Boolean) as SeriesPoint[]
}

// re-export product name helper so the UI doesn't need data-loader directly
export function productLabel(pid: number): string {
  return productZhName(pid)
}
