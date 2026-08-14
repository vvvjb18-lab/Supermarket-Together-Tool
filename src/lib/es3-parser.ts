// EasySave3 (.es3 / .json) parser for Supermarket Together save files.
//
// Real saves from the game use ES3's compact JSON format with a known quirk:
// primitive values are inline-glued onto the "__type" string with NO comma
// and NO "value" key:
//   {"__type" : "bool"false}      (should be {"__type":"bool","value":false})
//   {"__type" : "float"3.26}      (should be {"__type":"float","value":3.26})
//   {"__type" : "int"-5}          (should be {"__type":"int","value":-5})
//   {"__type" : "string""text"}   (should be {"__type":"string","value":"text"})
//
// On top of that, the game wraps every top-level field in an ES3 envelope
// { __type, value }, and wraps arrays in PMDataWrapper { value: { array: [...] } }.
//
// This module:
//  1. Fixes the inline-glued primitives via targeted regexes.
//  2. Parses the now-valid JSON.
//  3. Unwraps __type/value envelopes recursively.
//  4. Maps PascalCase game fields (Funds, Day, ProductPlayerPricing,
//     propdata*, propinfoproduct*, HiredEmployeesData, ...) to the
//     SaveSnapshot shape that the rest of the app expects.
//
// Confidence policy: data extracted from a real save is 'confirmed'.
// Heuristic-only fields (employee pipe-string sub-fields we cannot verify)
// stay 'proxy' via a separate note.

import { encyclopedia as ENC } from './data-loader'
import type {
  SaveSnapshot,
  EmployeeRecord,
  LayoutProp,
  Confidence,
} from './types'

export interface ES3ParseResult {
  snapshot: SaveSnapshot
  detected: string[]
  unknown: string[]
  confidence: Confidence
  status: 'ok' | 'demo' | 'partial' | 'failed' | 'empty'
  /** Per-field raw ES3 type tally, surfaced in the UI for transparency. */
  typeTally: Record<string, number>
  /** Warnings emitted during parse (non-fatal). */
  warnings: string[]
  /** Number of fields the ES3 unwrap successfully extracted a value from. */
  fieldCount: number
  /** Pre-fix byte length vs post-fix byte length (debug). */
  bytesIn: number
  bytesOut: number
}

// ---------- Step 1: regex fixer for inline-glued primitives ----------

/**
 * Repair EasySave3's malformed inline-glued primitive values so the text
 * becomes valid JSON. Order matters: bool/float/int first, string last
 * (the string regex is greedy on quotes).
 */
export function fixES3InlineValues(text: string): string {
  return text
    .replace(/"bool"(\s*)(true|false)/g, '"bool",$1"value" : $2')
    .replace(/"float"(\s*)(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g, '"float",$1"value" : $2')
    .replace(/"int"(\s*)(-?\d+)/g, '"int",$1"value" : $2')
    .replace(/"string"(\s*)"/g, '"string",$1"value" : "')
}

// ---------- Step 2: envelope unwrappers ----------

/** Recursively unwrap { __type, value } envelopes → value. */
function unwrap(node: any): any {
  if (
    node &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    '__type' in node &&
    'value' in node &&
    Object.keys(node).length <= 2
  ) {
    return unwrap(node.value)
  }
  return node
}

/** PMDataWrapper: { __type: "...PMDataWrapper...", value: { array: [...] } } → array (each element unwrapped). */
function unwrapPMArray(node: any): any[] {
  const inner = unwrap(node)
  if (inner && typeof inner === 'object' && 'array' in inner && Array.isArray(inner.array)) {
    return inner.array.map(unwrap)
  }
  if (Array.isArray(inner)) return inner.map(unwrap)
  return []
}

/** Get a scalar field: data[FieldName] -> unwrap -> number|string|boolean|null */
function scalar(data: any, field: string): any {
  if (!(field in data)) return undefined
  return unwrap(data[field])
}

function numField(data: any, field: string): number | undefined {
  const v = scalar(data, field)
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    if (!Number.isNaN(n)) return n
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return undefined
}

function strField(data: any, field: string): string | undefined {
  const v = scalar(data, field)
  if (typeof v === 'string') return v
  if (v == null) return undefined
  return String(v)
}

// ---------- Step 3: field-specific parsers ----------

/**
 * Parse a propdata string like "0|1|-1,430456|0|4,553804|89,99998".
 * Format (inferred from sample + encyclopedia coord ranges):
 *   index | buildableId | posX(comma-decimal) | posY | posZ(comma-decimal) | angle(comma-decimal)
 * posY is always 0 for floor-anchored props; we capture it for completeness.
 */
function parsePropData(index: number, raw: string): Omit<LayoutProp, 'inventory'> {
  const parts = raw.split('|').map((s) => s.trim())
  const toNum = (s: string | undefined): number => {
    if (!s) return 0
    return Number(s.replace(',', '.'))
  }
  const buildableId = parts.length > 1 ? Math.round(toNum(parts[1])) : 0
  const posX = parts.length > 2 ? toNum(parts[2]) : 0
  const posY = parts.length > 3 ? toNum(parts[3]) : 0
  const posZ = parts.length > 4 ? toNum(parts[4]) : 0
  const angleRaw = parts.length > 5 ? toNum(parts[5]) : 0
  // Snap to nearest 90° (game uses 0/90/180/270; tiny float drift is common).
  const angle = Math.round(angleRaw / 90) * 90
  const rotation = ((angle % 360) + 360) % 360
  return { index, buildableId, posX, posZ, rotation, angle }
}

/**
 * Parse a propinfoproduct array [p1,c1,p2,c2,...] → inventory pairs.
 * Drops pairs where product id is < 0 (sentinel for empty slot).
 */
function parsePropInventory(arr: number[]): { product: number; count: number }[] {
  const out: { product: number; count: number }[] = []
  for (let i = 0; i + 1 < arr.length; i += 2) {
    const product = arr[i]
    const count = arr[i + 1]
    if (typeof product === 'number' && typeof count === 'number' && product >= 0) {
      out.push({ product, count })
    }
  }
  return out
}

/**
 * Parse an employee pipe-delimited string. Sample:
 *   "5|83|6|10|7|8|10|8|10|big sb|0|5780|16900|1070|1086|1000|1000|1000"
 * Inferred layout (heuristic — exact meaning of trailing numerics is unverified):
 *   slot | modelId | skill1..skill7 (7 levels) | name | task | xp | extra1..extra5
 * We extract name/task/xp reliably and treat skill levels as a 7-tuple proxy.
 */
function parseEmployeeString(raw: string, slot: number): EmployeeRecord | null {
  if (!raw || raw.trim() === '') return null
  const parts = raw.split('|')
  if (parts.length < 10) return null

  const id = parts[0] ?? String(slot)
  const modelId = parts[1] ?? '0'
  // 7 skill levels sit between modelId (idx 1) and name (idx 9).
  const skillLevels = parts.slice(2, 9).map((s) => Number(s || 0))
  const name = parts[9] ?? `Employee ${slot}`
  const task = parts.length > 10 ? Math.max(0, Math.round(Number(parts[10] || 0))) : 0
  const xp = parts.length > 11 ? Number(parts[11] || 0) : 0
  const salary = parts.length > 12 ? Number(parts[12] || 0) : 0

  const skills: Record<string, { level: number; xp: number }> = {}
  skillLevels.forEach((lvl, i) => {
    skills[`skill_${i}`] = { level: lvl, xp: 0 }
  })

  return {
    id: `slot${slot}:${id}:${modelId}`,
    name: name || `Employee ${slot}`,
    salary,
    skills,
    task,
  }
}

// ---------- Step 4: top-level ES3 → SaveSnapshot mapper ----------

const ENC_TIER_IDS = ENC.tiers.map((t) => t.id)

export function parseES3Save(text: string, fileName: string): ES3ParseResult {
  const detected: string[] = []
  const unknown: string[] = []
  const warnings: string[] = []
  const typeTally: Record<string, number> = {}
  const bytesIn = text.length

  // Step 1+2: fix + parse
  let data: any = null
  let fixed = text
  try {
    // Try strict JSON first (some users may have already-prettified copies).
    data = JSON.parse(text)
  } catch {
    try {
      fixed = fixES3InlineValues(text)
      data = JSON.parse(fixed)
    } catch (e: any) {
      return {
        snapshot: emptySnapshot(fileName, 'failed'),
        detected: [],
        unknown: [],
        confidence: 'unverified',
        status: 'failed',
        typeTally,
        warnings: [`JSON parse failed after ES3 fix: ${e?.message ?? 'unknown'}`],
        fieldCount: 0,
        bytesIn,
        bytesOut: fixed.length,
      }
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      snapshot: emptySnapshot(fileName, 'failed'),
      detected: [],
      unknown: [],
      confidence: 'unverified',
      status: 'failed',
      typeTally,
      warnings: ['Top-level value is not a JSON object.'],
      fieldCount: 0,
      bytesIn,
      bytesOut: fixed.length,
    }
  }

  // Tally ES3 types for transparency.
  for (const v of Object.values(data) as any[]) {
    if (v && typeof v === 'object' && '__type' in v && typeof v.__type === 'string') {
      // Strip the mscorlib / Assembly-CSharp suffix for readability.
      const t = v.__type.split(',')[0].replace(/^ES3PlayMaker\./, '')
      typeTally[t] = (typeTally[t] ?? 0) + 1
    }
  }

  // ---- scalar envelope fields ----
  const money = numField(data, 'Funds')
  if (money != null) detected.push('Funds (money)')

  const franchisePoints = numField(data, 'FranchisePoints')
  if (franchisePoints != null) detected.push('FranchisePoints')

  const franchiseExperience = numField(data, 'FranchiseExperience')
  if (franchiseExperience != null) detected.push('FranchiseExperience')

  const day = numField(data, 'Day')
  if (day != null) detected.push('Day')

  const difficulty = numField(data, 'Difficulty')
  if (difficulty != null) detected.push('Difficulty')

  const lastAwardedLevel = numField(data, 'LastAwardedLevel')
  if (lastAwardedLevel != null) detected.push('LastAwardedLevel')

  const playersAddFunds = numField(data, 'PlayersAddFunds')
  if (playersAddFunds != null) detected.push('PlayersAddFunds')

  const spaceBought = numField(data, 'SpaceBought')
  if (spaceBought != null) detected.push('SpaceBought')

  const storageBought = numField(data, 'StorageBought')
  if (storageBought != null) detected.push('StorageBought')

  const loanAmount = numField(data, 'LoanAmount')
  if (loanAmount != null) detected.push('LoanAmount')

  const loanPaymentPerDay = numField(data, 'LoanPaymentPerDay')
  if (loanPaymentPerDay != null) detected.push('LoanPaymentPerDay')

  const hiredRerollTimes = numField(data, 'HiredRerollTimes')
  if (hiredRerollTimes != null) detected.push('HiredRerollTimes')

  const hiredHasRerolled = scalar(data, 'HiredHasRerolled')
  if (hiredHasRerolled != null) detected.push('HiredHasRerolled')

  const storeName = strField(data, 'StoreName')
  if (storeName != null) detected.push('StoreName')

  const supermarketName = strField(data, 'SupermarketName')
  if (supermarketName != null) detected.push('SupermarketName')

  const layout = numField(data, 'Layout')
  if (layout != null) detected.push('Layout')

  const hasGeneratedOrganizers = scalar(data, 'hasGeneratedOrganizers')
  if (hasGeneratedOrganizers != null) detected.push('hasGeneratedOrganizers')

  // ---- SupermarketColor (Color type) ----
  const colorNode = data.SupermarketColor
  let supermarketColor: { r: number; g: number; b: number; a: number } | undefined
  if (colorNode && typeof colorNode === 'object' && 'value' in colorNode) {
    const c = colorNode.value
    if (c && typeof c === 'object') {
      supermarketColor = { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 1 }
      detected.push('SupermarketColor')
    }
  }

  // ---- PMDataWrapper arrays ----
  const pricingArr = unwrapPMArray(data.ProductPlayerPricing)
  const productPlayerPricing: Record<number, number> = {}
  if (pricingArr.length > 0) {
    pricingArr.forEach((p, i) => {
      if (typeof p === 'number' && Number.isFinite(p)) productPlayerPricing[i] = p
    })
    detected.push(`ProductPlayerPricing (${pricingArr.length} entries)`)
  }

  const tierBools = unwrapPMArray(data.UnlockedProductTiers)
  let unlockedProductTiers: number[] = ENC_TIER_IDS
  let unlockedProducts: number[] = ENC.products.map((p) => p.id)
  if (tierBools.length > 0) {
    unlockedProductTiers = tierBools
      .map((b, i) => (b === true ? i : -1))
      .filter((i) => i >= 0)
    const tierSet = new Set(unlockedProductTiers)
    unlockedProducts = ENC.products.filter((p) => tierSet.has(p.tier)).map((p) => p.id)
    detected.push(`UnlockedProductTiers (${unlockedProductTiers.length}/${tierBools.length})`)
  }

  const tierInflation = unwrapPMArray(data.TierInflation).filter(
    (v): v is number => typeof v === 'number',
  )
  if (tierInflation.length > 0) detected.push(`TierInflation (${tierInflation.length})`)

  const addonsBought = unwrapPMArray(data.AddonsBought).filter(
    (v): v is boolean => typeof v === 'boolean',
  )
  if (addonsBought.length > 0) detected.push(`AddonsBought (${addonsBought.length})`)

  const extraUpgradeFlags = unwrapPMArray(data.ExtraUpgrades).filter(
    (v): v is boolean => typeof v === 'boolean',
  )
  if (extraUpgradeFlags.length > 0) detected.push(`ExtraUpgrades (${extraUpgradeFlags.length})`)

  const storeSpaceUpgrades = unwrapPMArray(data.StoreSpaceUpgrades).filter(
    (v): v is boolean => typeof v === 'boolean',
  )
  if (storeSpaceUpgrades.length > 0) detected.push(`StoreSpaceUpgrades (${storeSpaceUpgrades.length})`)

  const storageSpaceUpgrades = unwrapPMArray(data.StorageSpaceUpgrades).filter(
    (v): v is boolean => typeof v === 'boolean',
  )
  if (storageSpaceUpgrades.length > 0) detected.push(`StorageSpaceUpgrades (${storageSpaceUpgrades.length})`)

  const manufacUnlockedRecipes = unwrapPMArray(data.ManufacUnlockedRecipes).filter(
    (v): v is boolean => typeof v === 'boolean',
  )
  if (manufacUnlockedRecipes.length > 0)
    detected.push(`ManufacUnlockedRecipes (${manufacUnlockedRecipes.filter(Boolean).length}/${manufacUnlockedRecipes.length})`)

  const manufacPlayerRecipes = unwrapPMArray(data.ManufacPlayerRecipes).filter(
    (v): v is string => typeof v === 'string',
  )
  if (manufacPlayerRecipes.length > 0) detected.push(`ManufacPlayerRecipes (${manufacPlayerRecipes.length})`)

  const doorStates = unwrapPMArray(data.DoorStates).filter(
    (v): v is number => typeof v === 'number',
  )
  if (doorStates.length > 0) detected.push(`DoorStates (${doorStates.length})`)

  const invoices = unwrapPMArray(data.CurrentInvoicesArray).filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
  if (invoices.length > 0) detected.push(`CurrentInvoicesArray (${invoices.length})`)

  const demolishableValues = unwrapPMArray(data.DemolishableValues).filter(
    (v): v is string => typeof v === 'string',
  )
  if (demolishableValues.length > 0) detected.push(`DemolishableValues (${demolishableValues.length})`)

  const paintableValues = unwrapPMArray(data.PaintableValues).filter(
    (v): v is string => typeof v === 'string',
  )
  if (paintableValues.length > 0) detected.push(`PaintableValues (${paintableValues.length})`)

  // ---- Employees (pipe-delimited strings) ----
  const empStrings = unwrapPMArray(data.HiredEmployeesData).filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
  const employees: EmployeeRecord[] = []
  empStrings.forEach((s, i) => {
    const emp = parseEmployeeString(s, i)
    if (emp) employees.push(emp)
  })
  if (employees.length > 0) detected.push(`HiredEmployeesData (${employees.length})`)

  // ---- Store layout: propdata{N} + propinfoproduct{N} ----
  const storeLayout: LayoutProp[] = []
  const inventoryByProduct: Record<number, number> = {}
  let propIndex = 0
  for (let i = 0; ; i++) {
    const pdKey = `propdata${i}`
    if (!(pdKey in data)) break
    const pdStr = unwrap(data[pdKey])
    if (typeof pdStr !== 'string') {
      warnings.push(`propdata${i} is not a string; skipped`)
      propIndex++
      continue
    }
    const base = parsePropData(i, pdStr)
    const pipKey = `propinfoproduct${i}`
    let inv: { product: number; count: number }[] = []
    if (pipKey in data) {
      const pipArr = unwrap(data[pipKey])
      if (Array.isArray(pipArr)) {
        inv = parsePropInventory(pipArr as number[])
      } else {
        warnings.push(`propinfoproduct${i} is not an array`)
      }
    }
    storeLayout.push({ ...base, inventory: inv })
    inv.forEach(({ product, count }) => {
      inventoryByProduct[product] = (inventoryByProduct[product] ?? 0) + count
    })
    propIndex++
  }
  if (storeLayout.length > 0) detected.push(`StoreLayout (${storeLayout.length} props)`)

  // ---- Decoration props (decopropdata{N} / decopaintabledata{N} / decopicturedata{N}) — captured but not deeply modeled ----
  const decoProps: { kind: 'deco' | 'paintable' | 'picture'; index: number; raw: string }[] = []
  for (let i = 0; ; i++) {
    const k = `decopropdata${i}`
    if (!(k in data)) break
    const v = unwrap(data[k])
    if (typeof v === 'string') decoProps.push({ kind: 'deco', index: i, raw: v })
  }
  for (let i = 0; ; i++) {
    const k = `decopaintabledata${i}`
    if (!(k in data)) break
    const v = unwrap(data[k])
    if (typeof v === 'string') decoProps.push({ kind: 'paintable', index: i, raw: v })
  }
  for (let i = 0; ; i++) {
    const k = `decopicturedata${i}`
    if (!(k in data)) break
    const v = unwrap(data[k])
    if (typeof v === 'string') decoProps.push({ kind: 'picture', index: i, raw: v })
  }
  if (decoProps.length > 0) detected.push(`DecorationProps (${decoProps.length})`)

  // ---- Unknown top-level keys (anything we don't recognize) ----
  const KNOWN_KEYS = new Set<string>([
    'Difficulty', 'PlayersAddFunds', 'Layout', 'StoreName', 'Day',
    'FranchiseExperience', 'FranchisePoints', 'Funds', 'LastAwardedLevel',
    'SupermarketName', 'SupermarketColor', 'hasGeneratedOrganizers',
    'SpaceBought', 'StorageBought', 'AddonsBought', 'ExtraUpgrades',
    'StoreSpaceUpgrades', 'StorageSpaceUpgrades', 'ProductPlayerPricing',
    'TierInflation', 'UnlockedProductTiers', 'PaintableValues', 'DoorStates',
    'HiredEmployeesData', 'HiredRerollTimes', 'HiredHasRerolled',
    'DemolishableValues', 'CurrentInvoicesArray', 'LoanAmount',
    'LoanPaymentPerDay', 'ManufacUnlockedRecipes', 'ManufacPlayerRecipes',
  ])
  Object.keys(data).forEach((k) => {
    if (!KNOWN_KEYS.has(k) && !/^propdata\d+$/.test(k) && !/^propinfoproduct\d+$/.test(k) &&
        !/^decopropdata\d+$/.test(k) && !/^decopaintabledata\d+$/.test(k) &&
        !/^decopicturedata\d+$/.test(k)) {
      unknown.push(k)
    }
  })

  // ---- Build the snapshot ----
  const fieldCount = detected.length
  const status: ES3ParseResult['status'] = fieldCount >= 8 ? 'ok' : fieldCount >= 3 ? 'partial' : 'failed'
  const confidence: Confidence = fieldCount >= 8 ? 'confirmed' : fieldCount >= 3 ? 'proxy' : 'unverified'

  const snapshot: SaveSnapshot = {
    source: `es3:${fileName}`,
    parseStatus: status,
    confidence,
    detectedFields: detected,
    unknownFields: unknown,
    money: money ?? 0,
    franchisePoints: franchisePoints ?? 0,
    day: day ?? 1,
    unlockedProductTiers,
    unlockedProducts,
    productPlayerPricing,
    perks: [],
    extraUpgrades: extraUpgradeFlags.map((b, i) => `extra_${i}:${b ? 1 : 0}`),
    employees,
    storeLayout: storeLayout.length > 0 ? storeLayout : ENC.storeLayout,
    inventoryByProduct,
    storageInventory: {},
    weather: 'unknown',
    temperature: [],
    roomId: null,
    playerSlots: 0,
    parsedAt: new Date().toISOString(),
    // ES3-only extras (optional on SaveSnapshot):
    franchiseExperience,
    loanAmount,
    loanPaymentPerDay,
    difficulty,
    storeName,
    supermarketName,
    supermarketColor,
    lastAwardedLevel,
    spaceBought,
    storageBought,
    tierInflation,
    manufacUnlockedRecipes,
    manufacPlayerRecipes,
    invoices,
    doorStates,
    addonsBought,
    storeSpaceUpgrades,
    storageSpaceUpgrades,
    decoPropsCount: decoProps.length,
    hiredRerollTimes,
    hiredHasRerolled: typeof hiredHasRerolled === 'boolean' ? hiredHasRerolled : undefined,
  }

  return {
    snapshot,
    detected,
    unknown,
    confidence,
    status,
    typeTally,
    warnings,
    fieldCount,
    bytesIn,
    bytesOut: fixed.length,
  }
}

function emptySnapshot(fileName: string, status: SaveSnapshot['parseStatus']): SaveSnapshot {
  return {
    source: `es3:${fileName}`,
    parseStatus: status,
    confidence: 'unverified',
    detectedFields: [],
    unknownFields: [],
    money: 0,
    franchisePoints: 0,
    day: 1,
    unlockedProductTiers: ENC_TIER_IDS,
    unlockedProducts: ENC.products.map((p) => p.id),
    productPlayerPricing: {},
    perks: [],
    extraUpgrades: [],
    employees: [],
    storeLayout: ENC.storeLayout,
    inventoryByProduct: {},
    storageInventory: {},
    weather: 'unknown',
    temperature: [],
    roomId: null,
    playerSlots: 0,
    parsedAt: new Date().toISOString(),
  }
}

// ---------- Convenience: try strict-JSON snapshot first, then ES3 ----------

/**
 * Try to parse a save file in two passes:
 *  1. If the text is already a clean SaveSnapshot JSON (e.g. demo-save.json
 *     or a previously-exported snapshot), use it directly.
 *  2. Otherwise, treat it as an EasySave3 .es3/.json file and run the ES3 parser.
 *
 * Returns a unified ES3ParseResult shape so the UI can render a single panel.
 */
export function parseSaveFile(text: string, fileName: string): ES3ParseResult {
  // Pass 1: clean snapshot?
  try {
    const data = JSON.parse(text)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const looksLikeSnapshot =
        'parseStatus' in data ||
        ('money' in data && 'day' in data) ||
        ('storeLayout' in data && 'inventoryByProduct' in data)
      const looksLikeES3 = Object.values(data).some(
        (v) => v && typeof v === 'object' && '__type' in (v as object),
      )
      if (looksLikeSnapshot && !looksLikeES3) {
        // Already a clean snapshot — wrap and return.
        const detected = (data.detectedFields ?? ['clean-snapshot']) as string[]
        const snapshot: SaveSnapshot = {
          source: `upload:${fileName}`,
          parseStatus: data.parseStatus ?? 'ok',
          confidence: data.confidence ?? 'confirmed',
          detectedFields: detected,
          unknownFields: data.unknownFields ?? [],
          money: data.money ?? 0,
          franchisePoints: data.franchisePoints ?? 0,
          day: data.day ?? 1,
          unlockedProductTiers: data.unlockedProductTiers ?? ENC_TIER_IDS,
          unlockedProducts: data.unlockedProducts ?? ENC.products.map((p) => p.id),
          productPlayerPricing: data.productPlayerPricing ?? {},
          perks: data.perks ?? [],
          extraUpgrades: data.extraUpgrades ?? [],
          employees: data.employees ?? [],
          storeLayout: data.storeLayout ?? ENC.storeLayout,
          inventoryByProduct: data.inventoryByProduct ?? {},
          storageInventory: data.storageInventory ?? {},
          weather: data.weather ?? 'unknown',
          temperature: data.temperature ?? [],
          roomId: data.roomId ?? null,
          playerSlots: data.playerSlots ?? 0,
          parsedAt: new Date().toISOString(),
        }
        return {
          snapshot,
          detected,
          unknown: snapshot.unknownFields,
          confidence: snapshot.confidence,
          status: snapshot.parseStatus as ES3ParseResult['status'],
          typeTally: {},
          warnings: ['Loaded as pre-cleaned snapshot (no ES3 unwrap needed).'],
          fieldCount: detected.length,
          bytesIn: text.length,
          bytesOut: text.length,
        }
      }
    }
  } catch {
    // not strict JSON — fall through to ES3 path
  }

  // Pass 2: ES3
  return parseES3Save(text, fileName)
}
