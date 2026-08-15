# -*- coding: utf-8 -*-
"""Patch engine.ts to use real game formulas from encyclopedia v2.0."""
from pathlib import Path

ENGINE = Path("F:/游戲副本/supermarket-tool-temp/src/lib/engine.ts")
SRC = ENGINE.read_text(encoding="utf-8")

# --- Patch 1: insert constants block after `import { encyclopedia as ENC }` ---
TIER_INFLATION_BLOCK = '''import { encyclopedia as ENC } from './data-loader'

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
'''

assert "import { encyclopedia as ENC } from './data-loader'" in SRC
SRC = SRC.replace(
    "import { encyclopedia as ENC } from './data-loader'\n",
    TIER_INFLATION_BLOCK + "\n",
    1,
)

# --- Patch 2: Add computeMarketPrice + update PriceSuggestion interface ---
NEW_PRICE_IFACE = '''export interface PriceSuggestion {
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
}'''
OLD_PRICE_IFACE = '''export interface PriceSuggestion {
  base: number
  conservative: number
  balanced: number
  aggressive: number
  markupBalanced: number
  confidence: Confidence
  note: string
}'''
assert OLD_PRICE_IFACE in SRC
SRC = SRC.replace(OLD_PRICE_IFACE, NEW_PRICE_IFACE, 1)

MARKET_PRICE_BLOCK = '''// ============================================================
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

export function computeBoxValue(p: Product): CalcResult<number> {'''
SRC = SRC.replace(
    "export function computeBoxValue(p: Product): CalcResult<number> {",
    MARKET_PRICE_BLOCK,
    1,
)

# --- Patch 3: Rewrite computePriceSuggestion to use real accept range ---
OLD_PRICE_FUNC = '''export function computePriceSuggestion(p: Product): CalcResult<PriceSuggestion> {
  const base = p.basePricePerUnit
  // No extracted customer price-acceptance formula → proxy only.
  const conservative = base * 1.0
  const balanced = base * 1.15
  const aggressive = base * 1.4
  return {
    value: {
      base,
      conservative,
      balanced,
      aggressive,
      markupBalanced: 0.15,
      confidence: 'needs-runtime',
      note: 'Exact customer price-acceptance formula not extracted; suggestions are heuristic markup tiers. Validate in-game.',
    },
    formula: 'conservative=base×1.0; balanced=base×1.15; aggressive=base×1.40 (heuristic, NOT extracted)',
    sources: [`basePricePerUnit=${base}`],
    confidence: 'needs-runtime',
  }
}'''

NEW_PRICE_FUNC = '''export function computePriceSuggestion(p: Product): CalcResult<PriceSuggestion> {
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
}'''

assert OLD_PRICE_FUNC in SRC, "Could not find old price function"
SRC = SRC.replace(OLD_PRICE_FUNC, NEW_PRICE_FUNC, 1)

# --- Patch 4: Add computeSaleImpulseChance after computePriceSuggestion ---
SALE_IMPULSE_BLOCK = '''
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
'''

# Insert before "// ============================================================" Customer simulator
CUST_SIM_MARKER = '// ============================================================\n// Customer simulator'
assert CUST_SIM_MARKER in SRC
SRC = SRC.replace(CUST_SIM_MARKER, SALE_IMPULSE_BLOCK.lstrip() + '\n' + CUST_SIM_MARKER, 1)

# --- Patch 5: Add computeDemandPerVisit before computeWeightedRevenueProxy ---
COMPOUNDED_DEMAND_BLOCK = '''// ============================================================
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

'''

assert 'export function computeWeightedRevenueProxy' in SRC
SRC = SRC.replace(
    "export function computeWeightedRevenueProxy",
    COMPOUNDED_DEMAND_BLOCK + "export function computeWeightedRevenueProxy",
    1,
)

# --- Patch 6: Update demand formula string to mention AVG_ITEMS_PER_CUSTOMER ---
OLD_DEMAND_FORMULA = "'demandProxy = Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight'"
NEW_DEMAND_FORMULA = "'demandProxy = Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight  (per single purchase; multiply by AVG_ITEMS_PER_CUSTOMER for per-visit rate)'"
assert OLD_DEMAND_FORMULA in SRC
SRC = SRC.replace(OLD_DEMAND_FORMULA, NEW_DEMAND_FORMULA, 1)

# --- Patch 7: Salt probe conclusion update ---
OLD_SALT_CONCL = '''    conclusion:
      'Salt 是已確認的特殊機制（necessity[9] 單一商品、rawIds="4-4-4-4-4"），但不是已確認的賺錢 exploit。它有壟斷路徑（route 9），但只有 customer #47 觸發、且單價極低（$0.45）。透過 Staple Groceries 路徑只佔 1/62 ≈ 1.61% 機率。整體 demand proxy 偏低，單位利潤受限。建議實測而非盲信。','''

NEW_SALT_CONCL = f'''    conclusion:
      `Salt 是已確認的特殊機制（necessity[9] 單一商品、rawIds="4-4-4-4-4"），但不是已確認的賺錢 exploit。Route 9（鹽必要性池）只有 customer #47 觸發、機率 0.5/58 ≈ 0.86%，但這只是「單次購買」機率；真實每位 customer 平均買 {{AVG_ITEMS_PER_CUSTOMER.toFixed(2)}} 件，所以鹽的真實 demand proxy 需乘以這個平均件數。Route 10（Staple Groceries）只佔 1/62 ≈ 1.61%。整體需求偏低（basePrice 僅 $0.45, market $0.45×tierInflation[0]=${{TIER_INFLATION[0].toFixed(2)}}），就算全顧客湧入鹽區，毛利仍遠低於 USB 1TB 等 premium 商品。結論：鹽是 confirmed mechanic、unproven exploit，數學上不值得囤鹽，僅有迷因/挑戰價值。`,'''

assert OLD_SALT_CONCL in SRC, "Could not find old salt conclusion"
SRC = SRC.replace(OLD_SALT_CONCL, NEW_SALT_CONCL, 1)

# --- Save ---
ENGINE.write_text(SRC, encoding="utf-8")
print(f"engine.ts patched. New size: {len(SRC)} bytes")
