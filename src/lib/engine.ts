// Pure calculation engine for Supermarket Together Lab.
// Every function is deterministic and returns a CalcResult with formula + sources + confidence.
// No UI, no side effects. Importable by any page.

import type {
  Product,
  Necessity,
  CustomerType,
  Container,
  Skill,
  Encyclopedia,
  LayoutProp,
  SaveSnapshot,
  CalcResult,
  Confidence,
  ExploitCandidate,
} from './types'
import { encyclopedia as ENC, exploits as EXPLOITS } from './data-loader'

// ============================================================
// v2.0 engine-level constants (extracted from real game data)
// ============================================================

/**
 * Per-tier price inflation multipliers (extracted from _latest/save.json
 * decoded.TierInflation). Tiers 0-16 have real inflation values (1.13-1.59);
 * tiers 17-54 are 1.0 (no premium surcharge).
 */
export const TIER_INFLATION: number[] = ENC.tiers.map((t) => t.inflation ?? 1.0)

/** The 7 premium product ids. */
export const PREMIUM_PRODUCT_IDS: number[] = ENC.premiumProducts.slice()

/** Avg items per customer visit (from compensatedChances mean). */
export const AVG_ITEMS_PER_CUSTOMER: number =
  ENC.customerTypes.reduce(
    (s, c) => s + c.compensatedChances.reduce((a, b) => a + b, 0),
    0,
  ) / ENC.customerTypes.length


// ============================================================
// Basic product geometry / value
// ============================================================

// ============================================================
// Market price (v2.0)
// ============================================================

export function computeMarketPrice(p: Product): CalcResult<number> {
  const infl = TIER_INFLATION[p.tier] ?? 1.0
  const market = p.basePricePerUnit * infl
  return {
    value: market,
    formula: 'marketPrice = basePricePerUnit x tierInflation[tier]',
    sources: [
      `products[${p.id}].basePricePerUnit=${p.basePricePerUnit}`,
      `tierInflation[${p.tier}]=${infl.toFixed(3)}`,
    ],
    confidence: 'confirmed',
    note: 'tierInflation extracted from real save (17 tiers 1.13-1.59, others 1.0)',
  }
}

// ---- WeakMap memos for pure product → number functions ----
// These pure functions are called many times per render (shelf efficiency
// precomputes demand per product, store optimization iterates over all props
// twice, restock plan scores all 339 products). The same product object is
// passed in repeatedly, so we memoize by reference.

const _boxValueMemo = new WeakMap<Product, CalcResult<number>>()
const _colliderVolumeMemo = new WeakMap<Product, CalcResult<number>>()
const _valueDensityMemo = new WeakMap<Product, CalcResult<number>>()
const _boxValueDensityMemo = new WeakMap<Product, CalcResult<number>>()

export function computeBoxValue(p: Product): CalcResult<number> {
  const cached = _boxValueMemo.get(p)
  if (cached) return cached
  const value = p.basePricePerUnit * p.maxItemsPerBox
  const result: CalcResult<number> = {
    value,
    formula: 'boxValue = basePricePerUnit × maxItemsPerBox',
    sources: [`products[${p.id}].basePricePerUnit=${p.basePricePerUnit}`, `products[${p.id}].maxItemsPerBox=${p.maxItemsPerBox}`],
    confidence: 'confirmed',
  }
  _boxValueMemo.set(p, result)
  return result
}

export function computeColliderVolume(p: Product): CalcResult<number> {
  const cached = _colliderVolumeMemo.get(p)
  if (cached) return cached
  const v = p.colliderSize.x * p.colliderSize.y * p.colliderSize.z
  const result: CalcResult<number> = {
    value: v,
    formula: 'colliderVolume = colliderSize.x × y × z (unity units³)',
    sources: [`products[${p.id}].colliderSize=${p.colliderSize.x},${p.colliderSize.y},${p.colliderSize.z}`],
    confidence: 'confirmed',
  }
  _colliderVolumeMemo.set(p, result)
  return result
}

export function computeValueDensity(p: Product): CalcResult<number> {
  const cached = _valueDensityMemo.get(p)
  if (cached) return cached
  const vol = computeColliderVolume(p).value
  if (vol <= 0) {
    const r: CalcResult<number> = { value: 0, formula: 'valueDensity = basePricePerUnit / colliderVolume', sources: [], confidence: 'confirmed', note: 'zero volume' }
    _valueDensityMemo.set(p, r)
    return r
  }
  const result: CalcResult<number> = {
    value: p.basePricePerUnit / vol,
    formula: 'valueDensity = basePricePerUnit / colliderVolume',
    sources: [`basePricePerUnit=${p.basePricePerUnit}`, `colliderVolume=${vol.toFixed(6)}`],
    confidence: 'confirmed',
  }
  _valueDensityMemo.set(p, result)
  return result
}

export function computeBoxValueDensity(p: Product): CalcResult<number> {
  const cached = _boxValueDensityMemo.get(p)
  if (cached) return cached
  const vol = computeColliderVolume(p).value
  const box = computeBoxValue(p).value
  if (vol <= 0) {
    const r: CalcResult<number> = { value: 0, formula: 'boxValueDensity = boxValue / colliderVolume', sources: [], confidence: 'confirmed', note: 'zero volume' }
    _boxValueDensityMemo.set(p, r)
    return r
  }
  const result: CalcResult<number> = {
    value: box / vol,
    formula: 'boxValueDensity = boxValue / colliderVolume',
    sources: [`boxValue=${box}`, `colliderVolume=${vol.toFixed(6)}`],
    confidence: 'confirmed',
  }
  _boxValueDensityMemo.set(p, result)
  return result
}

// ============================================================
// Demand proxy
// ------------------------------------------------------------
// For every customer type, take necessitiesChances[necessityIndex].
// For each necessity pool, distribute weight over RAW TOKENS (preserving duplicates).
// Product demand proxy = Σ (weight / rawPoolLength) for every token hit.
//
// This is a PROXY: true customer spawn distribution and runtime product
// selection method are not fully extracted. We assume:
//  - equal customer-type spawn (configurable in simulator)
//  - uniform pick within a necessity's raw token pool
//  - one purchase per customer (maxProductsCustomersToBuy=5 in tuning, but
//    for a single-necessity proxy we count one hit per chosen necessity)
// ============================================================

export interface DemandOptions {
  customerWeights?: number[] // per-customer-type spawn weight (default: equal = 1)
  mode?: 'raw' | 'unique' // raw preserves duplicate tokens; unique dedupes
}

export function computeDemandProxy(
  productId: number,
  necessities: Necessity[],
  customerTypes: CustomerType[],
  opts: DemandOptions = {},
): CalcResult<number> {
  const mode = opts.mode ?? 'raw'
  const cw = opts.customerWeights
  let total = 0
  const hits: string[] = []
  for (let ci = 0; ci < customerTypes.length; ci++) {
    const cust = customerTypes[ci]
    const w = cw ? cw[ci] ?? 0 : 1
    if (w <= 0) continue
    const chances = cust.necessitiesChances
    for (let ni = 0; ni < necessities.length; ni++) {
      const chance = chances[ni] ?? 0
      if (chance <= 0) continue
      const nec = necessities[ni]
      const tokens = mode === 'unique' ? Array.from(new Set(nec.rawTokens)) : nec.rawTokens
      if (tokens.length === 0) continue
      const hitsCount = tokens.filter((t) => t === productId).length
      if (hitsCount === 0) continue
      // contribution = customerWeight × necessityChance × (tokenHits / poolSize)
      const contribution = w * chance * (hitsCount / tokens.length)
      total += contribution
      hits.push(`cust[${ci}]×${w} × nec[${ni}]×${chance} × ${hitsCount}/${tokens.length}`)
    }
  }
  // normalize by sum of customer weights so it reads as "expected purchases per customer"
  const weightSum = cw ? cw.reduce((a, b) => a + b, 0) : customerTypes.length
  const normalized = weightSum > 0 ? total / weightSum : 0
  return {
    value: normalized,
    formula:
      mode === 'raw'
        ? 'demandProxy = Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight  (per single purchase; multiply by AVG_ITEMS_PER_CUSTOMER for per-visit rate)'
        : 'demandProxy (unique mode) = Σcust Σnec (custWeight × necChance × 1/uniquePoolSize if product present) / ΣcustWeight',
    sources: hits.slice(0, 6),
    confidence: 'proxy',
    note: 'Assumes equal customer spawn + uniform pick within necessity pool. True runtime selection unverified.',
  }
}

// ============================================================
// Per-customer-visit demand (v2.0)
// ============================================================
// Scales the per-purchase demand proxy by each customer's compensatedChances
// sum so the result represents "expected purchases per customer visit".
// ============================================================

export function computeDemandPerVisit(
  productId: number,
  necessities: Necessity[] = ENC.necessities,
  customerTypes: CustomerType[] = ENC.customerTypes,
  opts: DemandOptions = {},
): CalcResult<number> {
  const mode = opts.mode ?? 'raw'
  const cw = opts.customerWeights
  let total = 0
  const hits: string[] = []
  for (let ci = 0; ci < customerTypes.length; ci++) {
    const cust = customerTypes[ci]
    const w = cw ? cw[ci] ?? 0 : 1
    if (w <= 0) continue
    const itemsPerVisit = cust.compensatedChances.reduce((a, b) => a + b, 0)
    const chances = cust.necessitiesChances
    for (let ni = 0; ni < necessities.length; ni++) {
      const chance = chances[ni] ?? 0
      if (chance <= 0) continue
      const nec = necessities[ni]
      const tokens = mode === 'unique' ? Array.from(new Set(nec.rawTokens)) : nec.rawTokens
      if (tokens.length === 0) continue
      const hitsCount = tokens.filter((t) => t === productId).length
      if (hitsCount === 0) continue
      const contribution = w * chance * itemsPerVisit * (hitsCount / tokens.length)
      total += contribution
      hits.push(`cust[${ci}]*${w} x itemsPerVisit=${itemsPerVisit.toFixed(3)} x nec[${ni}]*${chance} x ${hitsCount}/${tokens.length}`)
    }
  }
  const weightSum = cw ? cw.reduce((a, b) => a + b, 0) : customerTypes.length
  const normalized = weightSum > 0 ? total / weightSum : 0
  return {
    value: normalized,
    formula: 'demandPerVisit = Scust Snec (custWeight x itemsPerVisit x necChance x tokenHits/rawPoolSize) / ScustWeight',
    sources: hits.slice(0, 6),
    confidence: 'proxy',
    note: 'itemsPerVisit = ScompensatedChances (avg items per customer visit, ranges 0.75-2.01). Higher accuracy than computeDemandProxy for per-visit metrics.',
  }
}

export function computeWeightedRevenueProxy(
  p: Product,
  demand: number,
): CalcResult<number> {
  return {
    value: demand * p.basePricePerUnit,
    formula: 'weightedRevenueProxy = demandProxy × basePricePerUnit',
    sources: [`demandProxy=${demand.toFixed(6)}`, `basePricePerUnit=${p.basePricePerUnit}`],
    confidence: 'proxy',
  }
}

export function computeWeightedBoxProxy(p: Product, demand: number): CalcResult<number> {
  return {
    value: demand * computeBoxValue(p).value,
    formula: 'weightedBoxProxy = demandProxy × boxValue',
    sources: [`demandProxy=${demand.toFixed(6)}`, `boxValue=${computeBoxValue(p).value.toFixed(2)}`],
    confidence: 'proxy',
  }
}

// ============================================================
// Salt Monopoly Probe
// ============================================================

export interface SaltProbeResult {
  saltProduct: Product
  saltRoute9: CalcResult<number> // demand via necessity[9]
  saltRoute10: CalcResult<number> // demand via necessity[10] staple
  saltTotalDemand: CalcResult<number>
  saltBoxValue: CalcResult<number>
  saltVolume: CalcResult<number>
  saltValueDensity: CalcResult<number>
  comparison: {
    product: Product
    basePrice: number
    boxValue: number
    volume: number
    demandProxy: number
    shelfEfficiency: number
  }[]
  conclusion: string
  confidence: Confidence
}

export function computeSaltProbe(): SaltProbeResult {
  const nec = ENC.necessities
  const custs = ENC.customerTypes
  const salt = ENC.products.find((p) => p.id === 4)!
  const nec9 = nec[9] // Salt single product, rawIds "4-4-4-4-4"
  const nec10 = nec[10] // Staple Groceries, 62 raw tokens

  // Route via necessity[9]: only customer #47 has weight 0.5
  let route9 = 0
  const route9Hits: string[] = []
  for (let ci = 0; ci < custs.length; ci++) {
    const w = 1 // equal spawn
    const chance = custs[ci].necessitiesChances[9] ?? 0
    if (chance <= 0) continue
    // raw pool = [4,4,4,4,4], length 5, salt hits 5/5 = 1.0
    const hits = nec9.rawTokens.filter((t) => t === 4).length
    const contribution = (w * chance * hits) / nec9.rawTokens.length
    route9 += contribution
    route9Hits.push(`cust[${ci}] weight=${w} × nec[9] chance=${chance} × ${hits}/${nec9.rawTokens.length}`)
  }
  route9 = route9 / custs.length // normalize by equal-spawn sum

  // Route via necessity[10]: staple, 62 tokens, salt appears once
  let route10 = 0
  const route10Hits: string[] = []
  for (let ci = 0; ci < custs.length; ci++) {
    const w = 1
    const chance = custs[ci].necessitiesChances[10] ?? 0
    if (chance <= 0) continue
    const hits = nec10.rawTokens.filter((t) => t === 4).length // =1
    const contribution = (w * chance * hits) / nec10.rawTokens.length
    route10 += contribution
    route10Hits.push(`cust[${ci}] × nec[10] chance=${chance} × ${hits}/${nec10.rawTokens.length}`)
  }
  route10 = route10 / custs.length

  const total = route9 + route10

  // comparison: pick a sample of early products + premium electronics
  const compareIds = [0, 1, 2, 3, 4, 5, 9, 11, 48, 54, 108, 173, 175, 287, 296, 299]
  const comparison = compareIds
    .map((id) => ENC.products.find((p) => p.id === id))
    .filter((p): p is Product => !!p)
    .map((p) => {
      const demand = computeDemandProxy(p.id, nec, custs).value
      const vol = computeColliderVolume(p).value
      const box = computeBoxValue(p).value
      return {
        product: p,
        basePrice: p.basePricePerUnit,
        boxValue: box,
        volume: vol,
        demandProxy: demand,
        shelfEfficiency: vol > 0 ? (demand * box) / vol : 0,
      }
    })
    .sort((a, b) => b.demandProxy - a.demandProxy)

  return {
    saltProduct: salt,
    saltRoute9: {
      value: route9,
      formula: 'Σcust (custWeight × nec[9].chance × 5/5) / 58  — only cust#47 has chance=0.5',
      sources: route9Hits,
      confidence: 'confirmed',
      note: 'necessity[9] rawIds="4-4-4-4-4", salt hits 5/5 tokens',
    },
    saltRoute10: {
      value: route10,
      formula: 'Σcust (custWeight × nec[10].chance × 1/62) / 58  — salt appears once in 62-token staple pool',
      sources: route10Hits,
      confidence: 'confirmed',
      note: 'uniform random assumption → ~1.61% hit per staple-weighted customer',
    },
    saltTotalDemand: {
      value: total,
      formula: 'saltTotalDemand = route9 + route10',
      sources: [`route9=${route9.toFixed(6)}`, `route10=${route10.toFixed(6)}`],
      confidence: 'proxy',
      note: 'sum of two confirmed routes; proxy because spawn distribution unverified',
    },
    saltBoxValue: computeBoxValue(salt),
    saltVolume: computeColliderVolume(salt),
    saltValueDensity: computeValueDensity(salt),
    comparison,
    conclusion:
      `Salt 是已確認的特殊機制（necessity[9] 單一商品、rawIds="4-4-4-4-4"），但不是已確認的賺錢 exploit。Route 9（鹽必要性池）只有 customer #47 觸發、機率 0.5/58 ≈ 0.86%，但這只是「單次購買」機率；真實每位 customer 平均買 ${AVG_ITEMS_PER_CUSTOMER.toFixed(2)} 件，所以鹽的真實 demand proxy 需乘以這個平均件數。Route 10（Staple Groceries）只佔 1/62 ≈ 1.61%。整體需求偏低（basePrice 僅 $0.45, market $0.45×tierInflation[0]=${TIER_INFLATION[0].toFixed(2)}），就算全顧客湧入鹽區，毛利仍遠低於 USB 1TB 等 premium 商品。結論：鹽是 confirmed mechanic、unproven exploit，數學上不值得囤鹽，僅有迷因/挑戰價值。`,
    confidence: 'exploit',
  }
}

// ============================================================
// Necessity coverage (given a stocked product set)
// ============================================================

export interface NecessityCoverage {
  necessityIndex: number
  necessityName: string
  totalWeight: number // sum of customer chances for this necessity
  stockedTokens: number // raw tokens covered by stocked products
  totalTokens: number
  coverage: number // 0..1
  missingProducts: number[]
}

export function computeNecessityCoverage(
  stockedProductIds: Set<number>,
  necessities: Necessity[] = ENC.necessities,
  customerTypes: CustomerType[] = ENC.customerTypes,
): CalcResult<NecessityCoverage[]> {
  const coverage: NecessityCoverage[] = necessities.map((nec) => {
    const totalWeight = customerTypes.reduce((s, c) => s + (c.necessitiesChances[nec.index] ?? 0), 0)
    const stockedTokens = nec.rawTokens.filter((t) => t >= 0 && stockedProductIds.has(t)).length
    const missing = Array.from(new Set(nec.rawTokens.filter((t) => t >= 0 && !stockedProductIds.has(t))))
    return {
      necessityIndex: nec.index,
      necessityName: nec.name.en,
      totalWeight,
      stockedTokens,
      totalTokens: nec.rawTokens.length,
      coverage: nec.rawTokens.length > 0 ? stockedTokens / nec.rawTokens.length : 0,
      missingProducts: missing,
    }
  })
  return {
    value: coverage,
    formula: 'coverage = stockedRawTokens / totalRawTokens  (per necessity, weighted by Σ customer chances)',
    sources: [`necessities=${necessities.length}`, `customerTypes=${customerTypes.length}`, `stockedProducts=${stockedProductIds.size}`],
    confidence: 'proxy',
    note: 'Raw token mode preserves duplicates (Salt counts 5×).',
  }
}

// ============================================================
// Shelf efficiency (per layout prop)
// ============================================================

export interface DuplicatedProductInfo {
  productId: number
  otherProps: number[] // other SELLING-zone props that also carry this product
}

export interface PropEfficiency {
  propIndex: number
  buildableId: number
  zoneCode: number
  totalUnits: number
  distinctProducts: number
  shelfValue: number // sum of count × basePrice
  demandCoverage: number // sum of count × demandProxy (proxy)
  emptySlots: number // inventory entries with count 0 or product -1
  negativeAnomalies: number
  duplicatedProducts: number // distinct product kinds that ALSO appear on another SELLING prop
  duplicatedProductIds: number[] // the product ids (for display)
  duplicatedWithProps: DuplicatedProductInfo[] // detail: which products + which other props
  efficiency: number // shelfValue × demandCoverage normalized
}

export function computeShelfEfficiency(
  layout: LayoutProp[],
  products: Product[] = ENC.products,
  necessities: Necessity[] = ENC.necessities,
  customerTypes: CustomerType[] = ENC.customerTypes,
): CalcResult<PropEfficiency[]> {
  const productById = new Map(products.map((p) => [p.id, p]))
  // precompute demand proxies
  const demandCache = new Map<number, number>()
  for (const p of products) {
    demandCache.set(p.id, computeDemandProxy(p.id, necessities, customerTypes).value)
  }
  // Cross-prop duplication only counts SELLING-zone props (zoneCode !== 1).
  // Warehouse storage shelves (zoneCode=1) do not compete with selling shelves
  // and therefore never contribute to "duplicated" flags.
  const sellingProps = layout.filter((p) => p.zoneCode !== 1)
  // product → list of selling-prop indices that carry it (deduped per prop)
  const productToSellingProps = new Map<number, number[]>()
  for (const prop of sellingProps) {
    const seen = new Set<number>()
    for (const inv of prop.inventory) {
      if (inv.product < 0 || inv.count <= 0) continue
      if (seen.has(inv.product)) continue // same product on same prop = 1 appearance
      seen.add(inv.product)
      const arr = productToSellingProps.get(inv.product) ?? []
      arr.push(prop.index)
      productToSellingProps.set(inv.product, arr)
    }
  }
  const result: PropEfficiency[] = layout.map((prop) => {
    let totalUnits = 0
    let shelfValue = 0
    let demandCoverage = 0
    let emptySlots = 0
    let negativeAnomalies = 0
    const seen = new Set<number>()
    const duplicatedProductIds: number[] = []
    const duplicatedWithProps: DuplicatedProductInfo[] = []
    for (const inv of prop.inventory) {
      if (inv.product < 0 || inv.count === 0) {
        emptySlots++
        continue
      }
      if (inv.count < 0) {
        negativeAnomalies++
        continue
      }
      totalUnits += inv.count
      const p = productById.get(inv.product)
      if (p) {
        shelfValue += inv.count * p.basePricePerUnit
        demandCoverage += inv.count * (demandCache.get(inv.product) ?? 0)
      }
      if (seen.has(inv.product)) continue // dedupe within prop
      seen.add(inv.product)
      // Cross-prop duplication — only flagged for SELLING props.
      if (prop.zoneCode !== 1) {
        const allProps = productToSellingProps.get(inv.product) ?? []
        const otherProps = allProps.filter((i) => i !== prop.index)
        if (otherProps.length > 0) {
          duplicatedProductIds.push(inv.product)
          duplicatedWithProps.push({ productId: inv.product, otherProps })
        }
      }
    }
    const efficiency = shelfValue * (1 + demandCoverage * 100)
    return {
      propIndex: prop.index,
      buildableId: prop.buildableId,
      zoneCode: prop.zoneCode,
      totalUnits,
      distinctProducts: seen.size,
      shelfValue,
      demandCoverage,
      emptySlots,
      negativeAnomalies,
      duplicatedProducts: duplicatedProductIds.length,
      duplicatedProductIds,
      duplicatedWithProps,
      efficiency,
    }
  })
  return {
    value: result,
    formula: 'shelfValue = Σ count×basePrice; demandCoverage = Σ count×demandProxy; efficiency = shelfValue×(1+demandCoverage×100); duplicated = distinct products also on another selling-zone prop (warehouse excluded)',
    sources: [`layout props=${layout.length}`, `selling props=${sellingProps.length}`, `products=${products.length}`],
    confidence: 'proxy',
  }
}

// ============================================================
// Store optimization recommendations
// Three orthogonal strategies: space utilization, profit, demand.
// Each returns a 0..100 score, a theoretical target, and a list of
// concrete actions tied to specific props so the UI can highlight them.
// ============================================================

export type OptimizationActionType =
  | 'restock' // fill empty slots / empty shelf
  | 'replace-low-value' // swap low-value products for higher-value ones
  | 'consolidate' // merge duplicated products onto one shelf
  | 'fill-gap' // add a product to cover an uncovered necessity
  | 'relocate-to-warehouse' // move excess stock to storage

export interface OptimizationAction {
  type: OptimizationActionType
  propIndex: number
  detailZh: string
  detailEn: string
  impact: number // estimated score delta if applied
  productId?: number
  relatedProps?: number[]
}

export interface OptimizationStrategy {
  key: 'space' | 'profit' | 'demand'
  score: number // 0..100
  targetScore: number // theoretical max
  gap: number // target - score
  actions: OptimizationAction[]
  formulaZh: string
  formulaEn: string
}

export interface StoreOptimization {
  space: OptimizationStrategy
  profit: OptimizationStrategy
  demand: OptimizationStrategy
}

/**
 * Compute three orthogonal optimization strategies for the current store layout.
 *
 * - SPACE: how full are the selling shelves? Target = 100% filled.
 * - PROFIT: shelf value per slot vs. theoretical max (each slot holding the
 *   highest value-density product that fits the container class).
 * - DEMAND: how many of the 11 necessity pools are covered by at least one
 *   selling shelf? Target = all 11.
 */
export function computeStoreOptimization(
  layout: LayoutProp[],
  efficiencies: PropEfficiency[],
  products: Product[] = ENC.products,
  necessities: Necessity[] = ENC.necessities,
  customerTypes: CustomerType[] = ENC.customerTypes,
): CalcResult<StoreOptimization> {
  const demandCache = new Map<number, number>()
  for (const p of products) {
    demandCache.set(p.id, computeDemandProxy(p.id, necessities, customerTypes).value)
  }
  const effByIndex = new Map(efficiencies.map((e) => [e.propIndex, e]))
  const sellingProps = layout.filter((p) => p.zoneCode !== 1)

  // -------- SPACE strategy --------
  // score = filledSlots / totalSlots × 100 (selling props only)
  let totalSlots = 0
  let filledSlots = 0
  const spaceActions: OptimizationAction[] = []
  for (const prop of sellingProps) {
    const eff = effByIndex.get(prop.index)
    if (!eff) continue
    const slots = prop.inventory.length || 1
    totalSlots += slots
    const filled = slots - eff.emptySlots
    filledSlots += filled
    if (eff.totalUnits === 0) {
      spaceActions.push({
        type: 'restock',
        propIndex: prop.index,
        detailZh: `貨架 #${prop.index} 完全空置 — 從倉庫補上高 demand 商品`,
        detailEn: `Shelf #${prop.index} is empty — restock with high-demand products from storage`,
        impact: 15,
      })
    } else if (eff.emptySlots > 0) {
      spaceActions.push({
        type: 'restock',
        propIndex: prop.index,
        detailZh: `貨架 #${prop.index} 有 ${eff.emptySlots} 個空格 — 補滿可提升空間利用`,
        detailEn: `Shelf #${prop.index} has ${eff.emptySlots} empty slots — fill to improve space use`,
        impact: Math.min(10, eff.emptySlots * 2),
      })
    }
  }
  const spaceScore = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0
  spaceActions.sort((a, b) => b.impact - a.impact)

  // -------- PROFIT strategy --------
  // score = current total shelf value / theoretical max × 100
  // theoretical max per slot = highest (basePrice × demandProxy) among all products
  // of the same containerClass as the prop. If we can't resolve containerClass,
  // use the global best.
  const bestValueByClass = new Map<number, number>() // containerClass → best unit value
  for (const p of products) {
    const v = p.basePricePerUnit * (demandCache.get(p.id) ?? 0)
    const prev = bestValueByClass.get(p.containerClass) ?? 0
    if (v > prev) bestValueByClass.set(p.containerClass, v)
  }
  const globalBestValue = Math.max(...bestValueByClass.values(), 1)
  let currentProfit = 0
  let maxProfit = 0
  const profitActions: OptimizationAction[] = []
  for (const prop of sellingProps) {
    const eff = effByIndex.get(prop.index)
    if (!eff) continue
    currentProfit += eff.shelfValue
    const slots = prop.inventory.length || 1
    // resolve container class for this prop
    const container = ENC.containers.find((c) => c.containerID === prop.containerID)
    const cls = container?.containerClass ?? 0
    const bestVal = bestValueByClass.get(cls) ?? globalBestValue
    // assume each filled slot holds ~20 units of the best product (proxy)
    const propMax = slots * 20 * bestVal
    maxProfit += propMax
    // flag low-value props: value per slot below 30% of theoretical
    const valPerSlot = slots > 0 ? eff.shelfValue / slots : 0
    const maxPerSlot = 20 * bestVal
    if (valPerSlot < maxPerSlot * 0.3 && eff.totalUnits > 0) {
      profitActions.push({
        type: 'replace-low-value',
        propIndex: prop.index,
        detailZh: `貨架 #${prop.index} 單位價值偏低 ($${valPerSlot.toFixed(2)}/格) — 替換為高價值高需求商品可提升利潤`,
        detailEn: `Shelf #${prop.index} has low per-slot value ($${valPerSlot.toFixed(2)}/slot) — swap for higher-value products`,
        impact: 12,
      })
    }
  }
  const profitScore = maxProfit > 0 ? Math.min(100, Math.round((currentProfit / maxProfit) * 100)) : 0
  profitActions.sort((a, b) => b.impact - a.impact)

  // -------- DEMAND strategy --------
  // score = covered necessities / total necessities × 100
  const necProductSets = necessities.map((n) => new Set(n.productIds))
  const sellingProductIds = new Set<number>()
  for (const prop of sellingProps) {
    for (const inv of prop.inventory) {
      if (inv.product >= 0 && inv.count > 0) sellingProductIds.add(inv.product)
    }
  }
  let coveredCount = 0
  const uncoveredNecIdx: number[] = []
  necProductSets.forEach((set, idx) => {
    let covered = false
    for (const pid of set) {
      if (sellingProductIds.has(pid)) {
        covered = true
        break
      }
    }
    if (covered) coveredCount++
    else uncoveredNecIdx.push(idx)
  })
  const demandScore = necProductSets.length > 0 ? Math.round((coveredCount / necProductSets.length) * 100) : 0
  const demandActions: OptimizationAction[] = []
  for (const necIdx of uncoveredNecIdx.slice(0, 6)) {
    const nec = necessities[necIdx]
    if (!nec) continue
    // suggest the first product from this necessity that isn't on any selling shelf
    const missing = nec.productIds.find((pid) => !sellingProductIds.has(pid))
    if (missing !== undefined) {
      // suggest placing it on the empty/lowest-value selling shelf
      const targetProp = sellingProps
        .map((p) => ({ p, eff: effByIndex.get(p.index) }))
        .filter((x) => x.eff && (x.eff.totalUnits === 0 || x.eff.emptySlots > 0))
        .sort((a, b) => (a.eff!.emptySlots - b.eff!.emptySlots))[0]?.p
      demandActions.push({
        type: 'fill-gap',
        propIndex: targetProp?.index ?? -1,
        productId: missing,
        detailZh: `需求缺口「${nec.name.zhHant}」未被覆蓋 — 補上商品 #${missing} 到貨架 #${targetProp?.index ?? '?'}`,
        detailEn: `Demand gap "${nec.name.en}" uncovered — add product #${missing} to shelf #${targetProp?.index ?? '?'}`,
        impact: Math.round(100 / necProductSets.length),
      })
    }
  }

  // Also surface consolidation actions (duplicated products)
  for (const eff of efficiencies) {
    if (eff.duplicatedProducts > 0) {
      const firstDup = eff.duplicatedWithProps[0]
      if (firstDup) {
        profitActions.push({
          type: 'consolidate',
          propIndex: eff.propIndex,
          productId: firstDup.productId,
          relatedProps: firstDup.otherProps,
          detailZh: `商品 #${firstDup.productId} 同時出現在貨架 #${eff.propIndex} 與 #${firstDup.otherProps.join(', ')} — 集中可騰出空間`,
          detailEn: `Product #${firstDup.productId} on shelf #${eff.propIndex} also on #${firstDup.otherProps.join(', ')} — consolidate to free space`,
          impact: 5,
        })
      }
    }
  }
  profitActions.sort((a, b) => b.impact - a.impact)

  const space: OptimizationStrategy = {
    key: 'space',
    score: spaceScore,
    targetScore: 100,
    gap: 100 - spaceScore,
    actions: spaceActions.slice(0, 8),
    formulaZh: '已填格數 / 總格數 × 100（僅計算售賣區貨架）',
    formulaEn: 'filledSlots / totalSlots × 100 (selling-zone shelves only)',
  }
  const profit: OptimizationStrategy = {
    key: 'profit',
    score: profitScore,
    targetScore: 100,
    gap: 100 - profitScore,
    actions: profitActions.slice(0, 8),
    formulaZh: '當前總貨架價值 / 理論最大價值 × 100（每格假設 20 件最高價值商品）',
    formulaEn: 'currentShelfValue / theoreticalMax × 100 (assumes 20 units/slot of best product)',
  }
  const demand: OptimizationStrategy = {
    key: 'demand',
    score: demandScore,
    targetScore: 100,
    gap: 100 - demandScore,
    actions: demandActions.slice(0, 8),
    formulaZh: `已覆蓋需求池 / 總需求池 × 100（${necProductSets.length} 個需求池）`,
    formulaEn: `coveredNecessities / totalNecessities × 100 (${necProductSets.length} pools)`,
  }

  return {
    value: { space, profit, demand },
    formula: '3 strategies: space=filledSlots/totalSlots; profit=shelfValue/theoreticalMax; demand=coveredNec/totalNec',
    sources: [
      `selling props=${sellingProps.length}`,
      `total slots=${totalSlots}`,
      `covered nec=${coveredCount}/${necProductSets.length}`,
    ],
    confidence: 'proxy',
  }
}

// ============================================================
// Store health / dashboard scores
// ============================================================
// Every dimension returns null (= no data) when the snapshot lacks the
// inputs needed to compute it honestly. The dashboard UI renders "—" with a
// `needs-save` confidence badge for null values instead of faking 30/60/50
// defaults that lie about a "Store Health 75" with no data behind it.

export interface DashboardScores {
  /** Composite 0..100, or null if any input sub-score is null. */
  storeHealth: CalcResult<number | null>
  demandCoverage: CalcResult<number | null>
  stockRisk: CalcResult<number | null>
  shelfEfficiency: CalcResult<number | null>
  employeeEfficiency: CalcResult<number | null>
}

function _wrap<T>(value: T | null, formula: string, confidence: Confidence, sources: string[] = []): CalcResult<T | null> {
  return { value, formula, sources, confidence: confidence === 'confirmed' && value === null ? 'needs-save' : confidence }
}

export function computeDashboardScores(snapshot: SaveSnapshot | null): DashboardScores {
  const hasInv = !!(snapshot && Object.keys(snapshot.inventoryByProduct).length > 0)
  const hasLayout = !!(snapshot && snapshot.storeLayout.length > 0)
  const hasEmployees = !!(snapshot && snapshot.employees.length > 0)

  // demand coverage: null unless inventory exists
  let demandCov: number | null = null
  if (hasInv && snapshot) {
    const stocked = new Set(
      Object.entries(snapshot.inventoryByProduct)
        .filter(([, c]) => (c as number) > 0)
        .map(([id]) => Number(id)),
    )
    const cov = computeNecessityCoverage(stocked).value
    const totalWeight = cov.reduce((s, c) => s + c.totalWeight, 0)
    const coveredWeight = cov.reduce((s, c) => s + c.coverage * c.totalWeight, 0)
    demandCov = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0
  }

  // stock risk: null unless inventory exists
  let stockRisk: number | null = null
  if (hasInv && snapshot) {
    const entries = Object.entries(snapshot.inventoryByProduct)
    const low = entries.filter(([, c]) => (c as number) > 0 && (c as number) < 5).length
    const total = entries.filter(([, c]) => (c as number) > 0).length
    stockRisk = total > 0 ? (low / total) * 100 : 0
  }

  // shelf efficiency: null if no layout; if layout has zero inventory it's 0% (not 60)
  let shelfEff: number | null = null
  if (hasLayout && snapshot) {
    const eff = computeShelfEfficiency(snapshot.storeLayout).value
    const emptyTotal = eff.reduce((s, p) => s + p.emptySlots, 0)
    const slotTotal = eff.reduce((s, p) => s + (p.emptySlots + p.distinctProducts), 0)
    shelfEff = slotTotal > 0 ? Math.max(0, 100 - (emptyTotal / slotTotal) * 100) : 0
  }

  // employee efficiency: null unless employees exist
  let empEff: number | null = null
  if (hasEmployees && snapshot) {
    const avgLevel = snapshot.employees.reduce((s, e) => {
      const levels = Object.values(e.skills).map((sk) => sk.level)
      return s + (levels.reduce((a, b) => a + b, 0) / (levels.length || 1))
    }, 0) / snapshot.employees.length
    empEff = Math.min(100, 30 + avgLevel * 14)
  }

  // composite: only valid when ALL four sub-scores are present
  let storeHealth: number | null = null
  if (demandCov != null && stockRisk != null && shelfEff != null && empEff != null) {
    storeHealth = Math.max(
      0,
      Math.min(
        100,
        demandCov * 0.35 + (100 - stockRisk) * 0.25 + shelfEff * 0.25 + empEff * 0.15,
      ),
    )
  }

  return {
    storeHealth: _wrap(
      storeHealth,
      'storeHealth = 0.35×demandCov + 0.25×(100−stockRisk) + 0.25×shelfEff + 0.15×empEff (null if any sub-score missing)',
      'proxy',
    ),
    demandCoverage: _wrap(demandCov, 'Σ(nec.coverage × nec.totalWeight) / Σ nec.totalWeight × 100', 'proxy'),
    stockRisk: _wrap(stockRisk, '(lowStockProducts / totalStockedProducts) × 100, low=<5 units', 'proxy'),
    shelfEfficiency: _wrap(shelfEff, '100 − (emptySlots/totalSlots)×100', 'proxy'),
    employeeEfficiency: _wrap(empEff, 'min(100, 30 + avgLevel×14)', 'proxy'),
  }
}

// ============================================================
// Restock plan (knapsack-style greedy under budget)
// ============================================================

export type RestockStrategy =
  | 'balanced'
  | 'demand-coverage'
  | 'high-profit'
  | 'high-density'
  | 'premium-push'
  | 'seasonal-prep'
  | 'early-game-cheap-fill'

export interface RestockRecommendation {
  productId: number
  productName: string
  buyBoxes: number
  units: number
  costEstimate: number
  revenueProxy: number
  reason: string
  priority: number
}

export function computeRestockPlan(
  snapshot: SaveSnapshot | null,
  strategy: RestockStrategy,
  budget: number,
  options: { season?: number } = {},
): CalcResult<RestockRecommendation[]> {
  const products = ENC.products
  const necessities = ENC.necessities
  const custs = ENC.customerTypes
  const inv = snapshot?.inventoryByProduct ?? {}
  const unlocked = snapshot?.unlockedProducts ?? products.map((p) => p.id)
  const unlockedSet = new Set(unlocked)

  // score each product
  const scored = products
    .filter((p) => unlockedSet.has(p.id))
    .map((p) => {
      const demand = computeDemandProxy(p.id, necessities, custs).value
      const box = computeBoxValue(p).value
      const vol = computeColliderVolume(p).value
      const density = computeValueDensity(p).value
      const current = (inv[p.id] as number) ?? 0
      const isPremium = ENC.premiumProducts.includes(p.id)
      const isSeasonal = options.season != null && ENC.seasons[options.season]?.productIds.includes(p.id)
      let score = 0
      let reason = ''
      switch (strategy) {
        case 'demand-coverage':
          score = demand
          reason = `demand proxy ${demand.toFixed(5)}; current ${current} units`
          break
        case 'high-profit':
          score = demand * box
          reason = `weighted box proxy ${(demand * box).toFixed(3)}`
          break
        case 'high-density':
          score = density
          reason = `value density ${density.toFixed(2)} $/unit³`
          break
        case 'premium-push':
          score = (isPremium ? 2 : 0.1) * box
          reason = isPremium ? 'premium product, high box value' : 'filler'
          break
        case 'seasonal-prep':
          score = (isSeasonal ? 3 : 0.05) * demand * box
          reason = isSeasonal ? `in-season (${ENC.seasons[options.season!].name.en})` : 'off-season filler'
          break
        case 'early-game-cheap-fill':
          score = p.tier <= 5 ? (1 / (p.basePricePerUnit + 0.1)) * (demand + 0.01) : -1
          reason = `tier ${p.tier} cheap fill, base $${p.basePricePerUnit}`
          break
        case 'balanced':
        default:
          score = demand * box * 0.5 + density * 0.2 + (current < 10 ? 5 : 0)
          reason = `balanced: demand×box ${(demand * box).toFixed(3)}, density ${density.toFixed(1)}, stock ${current}`
          break
      }
      // urgency boost if low stock & has demand
      if (current < 5 && demand > 0.001) {
        score *= 1.5
        reason += '; LOW STOCK urgency ×1.5'
      }
      return { p, demand, box, vol, current, score, reason }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  // greedy knapsack: take boxes while budget remains
  const recs: RestockRecommendation[] = []
  let remaining = budget
  for (const s of scored) {
    if (remaining <= 0) break
    const boxCost = s.box // buying one box costs ≈ boxValue (wholesale ≈ base × units)
    if (boxCost <= 0) continue
    const maxBoxesByBudget = Math.floor(remaining / boxCost)
    const desiredBoxes = Math.max(1, Math.min(maxBoxesByBudget, Math.ceil((50 - s.current) / s.p.maxItemsPerBox)))
    if (desiredBoxes <= 0) continue
    const boxes = Math.max(1, Math.min(desiredBoxes, maxBoxesByBudget))
    if (boxes <= 0) continue
    const cost = boxes * boxCost
    const units = boxes * s.p.maxItemsPerBox
    const revenue = s.demand * units * s.p.basePricePerUnit
    recs.push({
      productId: s.p.id,
      productName: s.p.name.en,
      buyBoxes: boxes,
      units,
      costEstimate: cost,
      revenueProxy: revenue,
      reason: s.reason,
      priority: recs.length + 1,
    })
    remaining -= cost
  }
  return {
    value: recs,
    formula: `greedy knapsack: score by strategy=${strategy}, take boxes while budget≥0; boxCost≈boxValue`,
    sources: [`budget=${budget}`, `candidates=${scored.length}`, `strategy=${strategy}`],
    confidence: 'proxy',
    note: 'boxCost assumes wholesale ≈ base×units; real wholesale price unverified.',
  }
}

// ============================================================
// Exploit classification
// ============================================================

// Exploit candidates are analyst-curated, not algorithm-derived. They live
// in data/exploits.json so the next iteration (scripted extraction from the
// /supermarket-tool-temp save-analyzer) can update them without touching TS.
//
// Backward-compat shim: classifyExploitCandidates() returns the same array.
// Prefer the `exploits` export from data-loader for new code.

export const EXPLOIT_CANDIDATES: ExploitCandidate[] = EXPLOITS

export function classifyExploitCandidates(): ExploitCandidate[] {
  return EXPLOIT_CANDIDATES
}

// ============================================================
// Skill ROI
// ============================================================

export type SkillStrategy =
  | 'employee-automation'
  | 'checkout-speed'
  | 'customer-volume'
  | 'manufacturing'
  | 'anti-theft'
  | 'early-cash'
  | 'late-scale'

export interface SkillROI {
  skill: Skill
  category: string
  roiProxy: number
  synergyTags: string[]
  confidence: Confidence
  note: string
}

export function computeSkillRecommendations(strategy: SkillStrategy): CalcResult<SkillROI[]> {
  const rois: SkillROI[] = ENC.skills.map((s) => {
    const eff = s.effect.toLowerCase()
    let category = 'other'
    if (eff.includes('speed')) category = 'employee-speed'
    else if (eff.includes('checkout') || eff.includes('selfcheckout') || eff.includes('productcheckout')) category = 'checkout'
    else if (eff.includes('customer') || eff.includes('extracustomers') || eff.includes('bystander')) category = 'customer-volume'
    else if (eff.includes('recycle')) category = 'recycling'
    else if (eff.includes('maxemployees') || eff.includes('employee')) category = 'employee-count'
    else if (eff.includes('manufacturing') || eff.includes('reroll') || eff.includes('ordering')) category = 'ordering'
    else if (eff.includes('debt') || eff.includes('electric') || eff.includes('autopay')) category = 'finance'

    let roi = 1
    const tags: string[] = []
    if (eff.includes('extraemployeespeedfactor')) {
      roi = 8
      tags.push('speed', 'automation')
    }
    if (eff.includes('maxemployees')) {
      const m = eff.match(/maxemployees\s*\+=\s*(\d+)/)
      roi = m ? 6 + Number(m[1]) * 2 : 5
      tags.push('headcount')
    }
    if (eff.includes('productcheckoutwait') || eff.includes('employeeitemplacewait') || eff.includes('selfcheckoutwait')) {
      roi = 7
      tags.push('throughput')
    }
    if (eff.includes('allowedSimultaneousSales')) {
      const m = eff.match(/allowedSimultaneousSales\s*\+=\s*(\d+)/g)
      roi = m ? 5 + m.length * 1.5 : 5
      tags.push('sales-cap')
    }
    if (eff.includes('extracustomersperk')) roi = Math.max(roi, 6)
    if (eff.includes('recycle')) {
      roi = Math.max(roi, 5)
      tags.push('recycling')
    }
    if (eff.includes('electricfactor') || eff.includes('autopay')) {
      roi = Math.max(roi, 5)
      tags.push('finance')
    }
    if (eff.includes('rerollsperday')) {
      roi = Math.max(roi, 4)
      tags.push('ordering')
    }
    if (s.description.en === '' && eff === '') roi = 0.5

    // strategy weighting
    let weight = 1
    switch (strategy) {
      case 'employee-automation':
        weight = tags.includes('speed') ? 3 : tags.includes('headcount') ? 2 : 0.5
        break
      case 'checkout-speed':
        weight = tags.includes('throughput') ? 3 : 0.5
        break
      case 'customer-volume':
        weight = category === 'customer-volume' ? 3 : 0.5
        break
      case 'manufacturing':
        weight = category === 'ordering' ? 2 : 0.7
        break
      case 'anti-theft':
        weight = eff.includes('surveillance') ? 3 : 0.3
        break
      case 'early-cash':
        weight = tags.includes('finance') ? 2.5 : tags.includes('sales-cap') ? 2 : 0.6
        break
      case 'late-scale':
        weight = tags.includes('headcount') ? 2.5 : tags.includes('speed') ? 2 : 0.7
        break
    }
    return {
      skill: s,
      category,
      roiProxy: roi * weight,
      synergyTags: tags,
      confidence: s.description.en ? 'proxy' : 'unverified',
      note: s.effect || '(no effect extracted — possibly reserved slot)',
    }
  })
  rois.sort((a, b) => b.roiProxy - a.roiProxy)
  return {
    value: rois,
    formula: `roiProxy = baseScore × strategyWeight; strategy=${strategy}; all perks cost 1000 FP`,
    sources: [`skills=${ENC.skills.length}`, `strategy=${strategy}`],
    confidence: 'proxy',
    note: 'Exact % values for some skills not fully extracted from IL; effect text shown verbatim.',
  }
}

// ============================================================
// Employee speed / XP
// ============================================================

export function computeEmployeeSpeed(level: number, extraEmployeeSpeedFactor: number): CalcResult<number> {
  const speed = 2.5 * (1 + 0.05 * level + extraEmployeeSpeedFactor)
  return {
    value: speed,
    formula: 'speed = 2.5 × (1 + 0.05×level + extraEmployeeSpeedFactor)',
    sources: [`level=${level}`, `extraEmployeeSpeedFactor=${extraEmployeeSpeedFactor}`, 'IL: UpdateEmployeeStats r4:2.5, r4:0.05'],
    confidence: 'confirmed',
    note: 'level cap=5 per skill; extraEmployeeSpeedFactor max=1 (maxEmployeeSpeedFactor)',
  }
}

export function computeXpToNextLevel(level: number): CalcResult<number> {
  return {
    value: 1000 + 100 * level,
    formula: 'xpToNextLevel = 1000 + 100×level',
    sources: [`level=${level}`, 'IL: SetEmployeesLevels i4:1000, i4:100'],
    confidence: 'confirmed',
  }
}

// ============================================================
// Pricing lab
// ============================================================

export interface PriceSuggestion {
  base: number
  /** Computed market price (base x tierInflation). */
  marketPrice: number
  /** 0% complaint price = market x 2.01. */
  safePrice: number
  /** ~50% accept price = market x 2.25. */
  balancedPrice: number
  /** ~0% accept price = market x 2.5. */
  aggressivePrice: number
  /** 2.01 */
  safeMultiplier: number
  /** 2.25 */
  balancedMultiplier: number
  /** 2.5 */
  aggressiveMultiplier: number
  /** balancedPrice / base */
  markupBalanced: number
  confidence: Confidence
  note: string
}

export function computePriceSuggestion(p: Product): CalcResult<PriceSuggestion> {
  const base = p.basePricePerUnit
  const market = computeMarketPrice(p).value
  // v2.0: customer complaint threshold per IL = marketPrice × Random(2.01, 2.5).
  // - safePrice     = market × 2.01  (0% complaint)
  // - balancedPrice = market × 2.25  (~50% accept)
  // - aggressive    = market × 2.5   (~0% accept — full complaint)
  const safePrice = market * 2.01
  const balancedPrice = market * 2.25
  const aggressivePrice = market * 2.5
  return {
    value: {
      base,
      marketPrice: market,
      safePrice,
      balancedPrice,
      aggressivePrice,
      safeMultiplier: 2.01,
      balancedMultiplier: 2.25,
      aggressiveMultiplier: 2.5,
      markupBalanced: balancedPrice / base,
      confidence: 'confirmed',
      note: `Complaint threshold = market × Random(2.01, 2.5). safePrice=$${safePrice.toFixed(2)} (0% complain), balanced=$${balancedPrice.toFixed(2)} (~50% accept), aggressive=$${aggressivePrice.toFixed(2)} (~0% accept).`,
    },
    formula: 'market=base×tierInflation; safe=market×2.01; balanced=market×2.25; aggressive=market×2.5',
    sources: [
      `basePricePerUnit=${base}`,
      `tierInflation[${p.tier}]=${TIER_INFLATION[p.tier]?.toFixed(3) ?? 1.0}`,
      `marketPrice=${market.toFixed(2)}`,
    ],
    confidence: 'confirmed',
  }
}

// ============================================================
// Sale impulse formula (v2.0)
// ============================================================
// Per extracted game IL: ExtraProductsOnSaleToAdd chance =
//   salePerPriceChanceReductionFactor.Evaluate(clamp(basePrice, 0, 199)) / 100
//   + 0.01 x (discount / 5)
// discount is clamped to [5, 45] and integer-divided by 5.
// salePerPriceChanceReductionFactor is an AnimationCurve (proxy: linear /200).
// ============================================================

export interface SaleImpulseResult {
  basePrice: number
  discount: number
  baseChance: number
  discountChance: number
  totalChance: number
  confidence: Confidence
  note: string
}

export function computeSaleImpulseChance(
  basePrice: number,
  discount: number,
  curve: (x: number) => number = (x) => Math.max(0, x) / 200,
): CalcResult<SaleImpulseResult> {
  const d = Math.max(5, Math.min(45, Math.floor(discount)))
  const clampedBase = Math.max(0, Math.min(199, basePrice))
  const baseChance = curve(clampedBase)
  const discountChance = 0.01 * (d / 5)
  const totalChance = Math.min(1, baseChance + discountChance)
  return {
    value: {
      basePrice,
      discount: d,
      baseChance,
      discountChance,
      totalChance,
      confidence: 'proxy',
      note: 'salePerPriceChanceReductionFactor is an AnimationCurve (proxy: linear /200); discount clamp [5,45] integer-divided by 5. Low-price items approach near-100% impulse purchase.',
    },
    formula: 'chance = saleCurve(clamp(base,0,199))/100 + 0.01*(discount/5)',
    sources: [`basePrice=${basePrice}`, `discount=${d}%`, `clampedBase=${clampedBase}`],
    confidence: 'proxy',
  }
}

// ============================================================
// Customer simulator
// ============================================================

export interface SimulationConfig {
  n: number
  customerWeights?: number[]
  mode: 'raw' | 'unique'
  stockedProductIds?: Set<number>
}

export interface SimulationResult {
  productHits: Map<number, number>
  missedSales: Map<number, number>
  totalCustomers: number
  totalHits: number
  missedHits: number
  demandCoverage: number
  topMissing: { productId: number; name: string; missed: number }[]
  topOverstockedLowDemand: { productId: number; name: string; units: number; demand: number }[]
}

export function simulateCustomers(cfg: SimulationConfig): CalcResult<SimulationResult> {
  const nec = ENC.necessities
  const custs = ENC.customerTypes
  const products = ENC.products
  const productById = new Map(products.map((p) => [p.id, p]))
  const cw = cfg.customerWeights ?? custs.map(() => 1)
  const weightSum = cw.reduce((a, b) => a + b, 0)
  const stocked = cfg.stockedProductIds ?? new Set<number>(products.map((p) => p.id))

  const productHits = new Map<number, number>()
  const missedSales = new Map<number, number>()
  let totalHits = 0
  let missedHits = 0

  for (let i = 0; i < cfg.n; i++) {
    // pick customer type by weight
    let r = Math.random() * weightSum
    let ci = 0
    for (; ci < custs.length; ci++) {
      r -= cw[ci]
      if (r <= 0) break
    }
    if (ci >= custs.length) ci = custs.length - 1
    const cust = custs[ci]
    // v2.0: determine how many items this customer will buy using compensatedChances
    //   - mode 0 (random): always 1 item
    //   - mode 1 (necessity): adds 0-1 extra items
    //   - mode 2 (premium): adds 0-1 extra items from premiumIndexes
    // We pick items by sampling necessity for each item; premium mode is entered with
    // probability compensatedChances[2] / (sum of compensatedChances).
    const cc = cust.compensatedChances
    const ccSum = cc.reduce((a, b) => a + b, 0)
    // sample k = 1 + Bernoulli(extra) where extra ~ Binomial-like from mode 1 weight
    const baseCount = 1
    const extraChance = ccSum > 0 ? cc[1] / ccSum : 0
    const premiumChance = ccSum > 0 ? cc[2] / ccSum : 0
    const k = baseCount + (Math.random() < extraChance ? 1 : 0) + (Math.random() < premiumChance ? 1 : 0)
    const isPremiumItem = Math.random() < premiumChance

    for (let item = 0; item < k; item++) {
      let chosen = -1
      if (isPremiumItem && cust.premiumIndexes && cust.premiumIndexes.length > 0) {
        // premium mode: pick from premiumIndexes uniformly
        const idx = cust.premiumIndexes[Math.floor(Math.random() * cust.premiumIndexes.length)]
        chosen = products.find((p) => p.id === idx)?.id ?? -1
        if (chosen < 0) continue
      } else {
        // necessity mode: pick necessity by chance, then uniform product from pool
        const chances = cust.necessitiesChances
        const chanceSum = chances.reduce((a, b) => a + Math.max(0, b), 0)
        if (chanceSum <= 0) continue
        let r2 = Math.random() * chanceSum
        let ni = -1
        for (let m = 0; m < chances.length; m++) {
          r2 -= Math.max(0, chances[m])
          if (r2 <= 0) {
            ni = m
            break
          }
        }
        if (ni < 0) ni = chances.length - 1
        const pool = nec[ni]
        if (!pool || pool.rawTokens.length === 0) continue
        const tokens = cfg.mode === 'unique' ? Array.from(new Set(pool.rawTokens)) : pool.rawTokens
        chosen = tokens[Math.floor(Math.random() * tokens.length)]
        if (chosen < 0) continue
      }
      totalHits++
      if (stocked.has(chosen)) {
        productHits.set(chosen, (productHits.get(chosen) ?? 0) + 1)
      } else {
        missedSales.set(chosen, (missedSales.get(chosen) ?? 0) + 1)
        missedHits++
      }
    }
  }

  const demandCoverage = totalHits > 0 ? (totalHits - missedHits) / totalHits : 0

  const topMissing = Array.from(missedSales.entries())
    .map(([pid, missed]) => ({ productId: pid, name: productById.get(pid)?.name.en ?? `#${pid}`, missed }))
    .sort((a, b) => b.missed - a.missed)
    .slice(0, 10)

  // overstocked low demand: products with high inventory but low demand proxy
  const topOverstockedLowDemand = products
    .map((p) => {
      const demand = computeDemandPerVisit(p.id, nec, custs, { mode: cfg.mode }).value
      return { productId: p.id, name: p.name.en, units: 0, demand }
    })
    .filter((x) => x.demand < 0.0005)
    .slice(0, 10)

  return {
    value: { productHits, missedSales, totalCustomers: cfg.n, totalHits, missedHits, demandCoverage, topMissing, topOverstockedLowDemand },
    formula: `v2.0 Monte Carlo: pick cust by weight, sample items k~1+Bin(extraChance)+Bin(premiumChance), each item picks necessity (or premium pool if premium mode), product uniform from ${cfg.mode} pool`,
    sources: [`n=${cfg.n}`, `mode=${cfg.mode}`, `customerWeights=${cw.length}`, `AVG_ITEMS_PER_CUSTOMER=${AVG_ITEMS_PER_CUSTOMER.toFixed(3)}`],
    confidence: 'proxy',
    note: `v2.0: multi-item purchase (compensatedChances) + premium mode (premiumIndexes) per extracted encyclopedia. AVG items/customer = ${AVG_ITEMS_PER_CUSTOMER.toFixed(3)}.`,
  }
}

// ============================================================
// Export helpers
// ============================================================

export function exportMarkdownReport(snapshot: SaveSnapshot | null): string {
  const scores = computeDashboardScores(snapshot)
  const salt = computeSaltProbe()
  const exploits = classifyExploitCandidates()
  let md = '# Supermarket Together Lab — 報告\n\n'
  md += `生成時間: ${new Date().toISOString()}\n\n`
  md += '## Dashboard 分數\n\n'
  const fmtScore = (v: number | null, d = 1): string => (v == null ? '—' : v.toFixed(d))
  md += `- Store Health: ${fmtScore(scores.storeHealth.value)} (${scores.storeHealth.confidence})\n`
  md += `- Demand Coverage: ${fmtScore(scores.demandCoverage.value)}%\n`
  md += `- Stock Risk: ${fmtScore(scores.stockRisk.value)}%\n`
  md += `- Shelf Efficiency: ${fmtScore(scores.shelfEfficiency.value, 0)}\n`
  md += `- Employee Efficiency: ${fmtScore(scores.employeeEfficiency.value, 0)}\n\n`
  md += '## Salt Monopoly Probe\n\n'
  md += `- Route 9 (Salt necessity): ${salt.saltRoute9.value.toFixed(6)}\n`
  md += `- Route 10 (Staple): ${salt.saltRoute10.value.toFixed(6)}\n`
  md += `- Total demand proxy: ${salt.saltTotalDemand.value.toFixed(6)}\n`
  md += `- Box value: $${salt.saltBoxValue.value.toFixed(2)}\n`
  md += `- Conclusion: ${salt.conclusion}\n\n`
  md += '## Exploit Candidates\n\n'
  for (const e of exploits) {
    md += `### ${e.title} [${e.category} / ${e.confidence}]\n\n`
    md += `**Evidence:**\n${e.evidence.map((x) => `- ${x}`).join('\n')}\n\n`
    md += `**Formula:** ${e.formula}\n\n`
    md += `**Recommendation:** ${e.recommendation}\n\n`
    md += `**Risk:** ${e.risk}\n\n`
  }
  return md
}
