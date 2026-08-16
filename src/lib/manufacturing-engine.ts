// Manufacturing economy engine — D1 (Supermarket Together Lab)
//
// Ports the IL-derived manufacturing price formula (ManufacturingBase
// .CalculateManufacturedBasePrice) into pure TypeScript so the manufacturing
// page can rank recipes by REAL input→output economics instead of the old
// "linkedProductID single-product proxy" (which was always id 0 in the bundle).
//
// Formula (IL, see scripts/generate-manufacturing-recipes.mjs for the raw table):
//   unitPrice = Σ_slot[ avg(marketPrice(ingredient) × 2.0) ] / itemsPerBox
//             + Σ_combinable[ marketPrice(p) × 2.5 ] / itemsPerBox
//
//   boxValue  = unitPrice × itemsPerBox
//             = Σ_slot[ avg(marketPrice × 2.0) ] + Σ_combinable[ marketPrice × 2.5 ]
//   boxRevenue = boxValue × 2.01          (0-complaint sell cap)
//   inputCost  = Σ_slot[ min-or-avg marketPrice(ingredient) ]  (what you pay for base ingredients)
//
// Combinable products are the "general products" a player can optionally add
// to a base recipe: each one contributes 2.5× its market price to the output
// box value (vs. 2.0× for base slots), so combinables are themselves a profit
// amplifier. The minimal-cost figure (inputCostMin) excludes combinable input
// cost to match save-analyzer/manufacturing_arbitrage.py's `group_cost_min`;
// a full-cost figure is also exposed for honesty.

import { productById } from './data-loader'
import { TIER_INFLATION } from './engine'
import type { ManufacturingRecipe } from './types'

/** Plain-number market price of a product id (basePrice × tier inflation). */
export function marketPriceOf(pid: number): number {
  const p = productById.get(pid)
  if (!p) return 0
  return p.basePricePerUnit * (TIER_INFLATION[p.tier] ?? 1.0)
}

/** 0-complaint sell-price cap (2.01× market). */
export const MANUFACTURING_SELL_MULTIPLIER = 2.01

/** Seconds per manufactured product (config.manufacturing.productionBaseTimeSeconds). */
export const PRODUCTION_BASE_TIME_SECONDS = 30

/**
 * Derived unit price of a manufactured product (IL CalculateManufacturedBasePrice).
 * Assumes no combinable products added.
 */
export function computeRecipeUnitPrice(recipe: ManufacturingRecipe): number {
  let total = 0
  for (const group of recipe.baseGroups) {
    if (group.length === 0) continue
    let sub = 0
    for (const pid of group) sub += marketPriceOf(pid) * 2.0
    total += sub / group.length
  }
  return recipe.itemsPerBox > 0 ? total / recipe.itemsPerBox : 0
}

/** Base-ingredient input cost: sum over slots of the min/avg market price. */
export function computeRecipeInputCost(recipe: ManufacturingRecipe, mode: 'min' | 'avg'): number {
  let total = 0
  for (const group of recipe.baseGroups) {
    if (group.length === 0) continue
    const prices = group.map((pid) => marketPriceOf(pid))
    total += mode === 'min' ? Math.min(...prices) : prices.reduce((a, b) => a + b, 0) / prices.length
  }
  return total
}

export interface ManufacturingEconomy {
  recipeId: number
  /** Derived manufactured unit price (no combinables). */
  unitPrice: number
  /** unitPrice × itemsPerBox. */
  boxValue: number
  /** boxValue × 2.01 (0-complaint sell cap). */
  boxRevenue: number
  /** Cheapest base-ingredient cost (excludes combinable input). */
  inputCostMin: number
  /** Average base-ingredient cost. */
  inputCostAvg: number
  /** What the combinable products cost to source (1× market each). */
  combinableInputCost: number
  /** Value the combinable products add to the output box (2.5× market each). */
  combinableOutputValue: number
  /** Number of combinable products available to this recipe. */
  combinableCount: number
  /** boxRevenue − inputCostMin. */
  profitMin: number
  /** boxRevenue − inputCostAvg − combinableInputCost (full-cost view). */
  profitFull: number
  /** boxRevenue / inputCostMin. */
  multiplierMin: number
  /** boxRevenue / (inputCostAvg + combinableInputCost). */
  multiplierFull: number
  /** Seconds to produce one box. */
  productionSeconds: number
}

export function computeRecipeEconomy(recipe: ManufacturingRecipe): ManufacturingEconomy {
  const unitPrice = computeRecipeUnitPrice(recipe)
  const boxValue = unitPrice * recipe.itemsPerBox
  const boxRevenue = boxValue * MANUFACTURING_SELL_MULTIPLIER
  const inputCostMin = computeRecipeInputCost(recipe, 'min')
  const inputCostAvg = computeRecipeInputCost(recipe, 'avg')
  const combinableInputCost = recipe.combinable.reduce((a, pid) => a + marketPriceOf(pid), 0)
  const combinableOutputValue = recipe.combinable.reduce((a, pid) => a + marketPriceOf(pid) * 2.5, 0)

  const profitMin = boxRevenue - inputCostMin
  const profitFull = boxRevenue - inputCostAvg - combinableInputCost
  return {
    recipeId: recipe.id,
    unitPrice,
    boxValue,
    boxRevenue,
    inputCostMin,
    inputCostAvg,
    combinableInputCost,
    combinableOutputValue,
    combinableCount: recipe.combinable.length,
    profitMin,
    profitFull,
    multiplierMin: inputCostMin > 0 ? boxRevenue / inputCostMin : 0,
    multiplierFull: inputCostAvg + combinableInputCost > 0 ? boxRevenue / (inputCostAvg + combinableInputCost) : 0,
    productionSeconds: PRODUCTION_BASE_TIME_SECONDS,
  }
}
