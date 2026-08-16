// Generate src/lib/data/manufacturing-recipes.json from the IL-extracted
// recipe table (source: save-analyzer/manufacturing_arbitrage.py, which in turn
// was extracted from ManufacturingBase .ctor IL).
//
// Run from repo root:  node scripts/generate-manufacturing-recipes.mjs
//
// Recipe format per baseProductID (0..29, == encyclopedia.manufacturingProducts[].id):
//   baseRecipes[i]  : "g1|g2|..."  where each g is "id1-id2-..." (alternatives within a slot)
//   combinable[i]   : "id1-id2-..." (optional combinable product ids) or ""
//   itemsPerBox[i]  : int  (== encyclopedia.manufacturingProducts[i].itemsPerBox)
//
// Manufacturing price IL (CalculateManufacturedBasePrice):
//   unitPrice = Σ_slot[ avg(marketPrice(ingredient) × 2.0) ] / itemsPerBox
//             + Σ_combinable[ marketPrice(p) × 2.5 ] / itemsPerBox

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// --- IL-extracted tables (verbatim from manufacturing_arbitrage.py) ---
const baseRecipes = [
  '7-19-23|314|1-38-39|9',
  '7-19-23|314|1-38-39|3-33-34',
  '7-19-23|314|1-38-39|18',
  '7-19-23|314|1-38-39|318',
  '23|314|1-38-39|318',
  '7-19-23|314|1-38-39',
  '7-19-23|314|1-38-39',
  '7-19-23|21|5-24-25-27-28-41|48|49',
  '7-19-23|21|5-24-25-27-28-41|48|49',
  '7-19-23|21|5-24-25-27-28-41|48|49',
  '7-19-23|21|5-24-25-27-28-41|48|49',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|43-44-45|28',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|43-44-45',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|205',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|201',
  '7-19-23|49-6|4|1-38-39|9|12',
  '203|205|206-9-4',
  '201|191|194',
  '11|49-6|4',
  '3-33-34|131|4|9|12',
  '0-16-36|206-255|4|9|12',
  '7-19-23|314|1-38-39|3-33-34|133-127-128',
  '1-38-39|4',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|20-32-35|43-44-45',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|191',
  '21|49-6|5-24-25-27-28-41|7-19-23|314-315|316|212',
  '49-6|5-24-25-27-28-41|7-19-23|314-315|317',
  '49-6|5-24-25-27-28-41|7-19-23|314-315',
  '1-38-39|48|53',
]

const combinableVariations = [
  '', '', '', '', '', '',
  '201-196-191-194-197-199-209-211-213-212',
  '201-196-202-197-194-199-209-317-123',
  '201-196-202-197-194-199-209-317-123-43-44-4',
  '201-196-202-197-194-199-209-317-123-43-44-4',
  '201-196-202-197-194-199-209-317-123',
  '201-196-191-194-197-199-209-211-213-212-20-32-25',
  '', '', '', '',
  '133-127-128-129-135-148-131-207-31-300-208-205-43-44-45',
  '',
  '197-199-209-211-213',
  '133-127-128-129-135-148-131-207-206-300-208-205-43-44-45-10-14-15',
  '', '',
  '206-10-14-15-21-49-9-12-43-44-45-31-300-208',
  '21-3-6-9-12-133-127-129-31-131-205-206-203-0-300-208',
  '', '', '',
  '201-196-191-194-197-199-209-211-53-313-306-307-308-309-310',
  '4-201-196-191-194-197-199-209-211-53-313-306-307-308-309-310',
  '201-196-191-194-197-199-209-211-213-212',
]

const itemsPerBox = [
  20, 20, 20, 20, 20, 20, 20, 30, 30, 30, 40, 10, 10, 10, 10, 10,
  12, 15, 15, 30, 25, 25, 30, 40, 25, 40, 25, 25, 30, 50,
]

function parseGroups(s) {
  return s.split('|').map((g) => g.split('-').filter(Boolean).map((x) => parseInt(x, 10)))
}

function parseIds(s) {
  return s ? s.split('-').filter(Boolean).map((x) => parseInt(x, 10)) : []
}

if (baseRecipes.length !== 30 || combinableVariations.length !== 30 || itemsPerBox.length !== 30) {
  throw new Error(`table length mismatch: ${baseRecipes.length}/${combinableVariations.length}/${itemsPerBox.length}`)
}

const recipes = baseRecipes.map((br, i) => ({
  id: i,
  baseGroups: parseGroups(br),
  combinable: parseIds(combinableVariations[i]),
  itemsPerBox: itemsPerBox[i],
}))

const out = {
  meta: {
    source: 'save-analyzer/manufacturing_arbitrage.py (ManufacturingBase .ctor IL)',
    formula: 'unitPrice = Σ_slot[ avg(marketPrice(ingredient) × 2.0) ] / itemsPerBox + Σ_combinable[ marketPrice(p) × 2.5 ] / itemsPerBox',
    sellMultiplier: 2.01,
    sellMultiplierNote: '0-complaint price cap (2.01× market)',
    productionBaseTimeSeconds: 30,
    recipeCount: 30,
  },
  recipes,
}

const target = join(root, 'src/lib/data/manufacturing-recipes.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`wrote ${recipes.length} recipes -> ${target}`)
console.log('combinable non-empty count:', recipes.filter((r) => r.combinable.length > 0).length)
