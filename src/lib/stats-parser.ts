// Parser for Supermarket Together's daily-statistics file (StoreFile0stats.es3).
//
// Unlike the main save, this file is CLEARTEXT JSON (no EasySave3 inline-glue
// quirk) and lives next to StoreFile0.es3. Key format is `day{N}stat{Name}`.
// Each day holds 28 scalar + 4 per-product list values (lists are indexed by
// product id).
//
// Two game-side key typos are normalised here (and the correct spellings are
// also accepted for forward-compat):
//   'omplainedAboutFilth'        -> complainedAboutFilth
//   'totalsProductsSoldThisDay'  -> totalProductsSoldThisDay
//
// `totalProductsAcquiredThisDay` is a known game bug (always equals
// totalProductsSoldThisDay) and is flagged, never silently trusted.

import type { DailyStat, StatsHistory } from './types'

// raw stat name -> DailyStat scalar field. Multiple raw names map to one field
// so both the bug key and the corrected key resolve correctly.
const SCALAR_FIELDS: Record<string, keyof DailyStat> = {
  customers: 'customers',
  benefits: 'benefits',
  franchiseExperience: 'franchiseExperience',
  timesRobbed: 'timesRobbed',
  moneySpentOnProducts: 'moneySpentOnProducts',
  notFoundProductsCount: 'notFoundProductsCount',
  tooExpensiveProductsCount: 'tooExpensiveProductsCount',
  lightCost: 'lightCost',
  rentCost: 'rentCost',
  employeesCost: 'employeesCost',
  // bug key (missing leading 'c')
  omplainedAboutFilth: 'complainedAboutFilth',
  // correct spelling (forward-compat)
  complainedAboutFilth: 'complainedAboutFilth',
  // bug key (extra 's')
  totalsProductsSoldThisDay: 'totalProductsSoldThisDay',
  // correct spelling (forward-compat)
  totalProductsSoldThisDay: 'totalProductsSoldThisDay',
  totalProductsAcquiredThisDay: 'totalProductsAcquiredThisDay',
  productsPlacedInContainers: 'productsPlacedInContainers',
  totalBoxesRecycled: 'totalBoxesRecycled',
  totalBalesRecycled: 'totalBalesRecycled',
  totalBoxesAddedToBaler: 'totalBoxesAddedToBaler',
  totalTrashCollected: 'totalTrashCollected',
  stolenProductsCollectedFromFloor: 'stolenProductsCollectedFromFloor',
  analyzedCustomers: 'analyzedCustomers',
  caughtThievesWhenAnalyzing: 'caughtThievesWhenAnalyzing',
  salesMade: 'salesMade',
  extraProductsSoldThankToSales: 'extraProductsSoldThankToSales',
  paidInvoices: 'paidInvoices',
  onlineOrdersMade: 'onlineOrdersMade',
  moneyMadeByOnlineOrders: 'moneyMadeByOnlineOrders',
  repairedDevices: 'repairedDevices',
  bystandersConvertedIntoCustomers: 'bystandersConvertedIntoCustomers',
}

const LIST_FIELDS: Record<string, keyof DailyStat> = {
  productsSoldList: 'productsSoldList',
  productsAcquiredList: 'productsAcquiredList',
  revenuePerProductSoldList: 'revenuePerProductSoldList',
  costPerProductAcquiredList: 'costPerProductAcquiredList',
}

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

function unwrapArray(node: any): any[] {
  const v = unwrap(node)
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object' && Array.isArray(v.array)) return v.array
  return []
}

function toNumber(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return 0
}

function emptyDailyStat(day: number): DailyStat {
  return {
    day,
    customers: 0,
    benefits: 0,
    franchiseExperience: 0,
    timesRobbed: 0,
    moneySpentOnProducts: 0,
    notFoundProductsCount: 0,
    tooExpensiveProductsCount: 0,
    lightCost: 0,
    rentCost: 0,
    employeesCost: 0,
    complainedAboutFilth: 0,
    totalProductsSoldThisDay: 0,
    totalProductsAcquiredThisDay: 0,
    productsPlacedInContainers: 0,
    totalBoxesRecycled: 0,
    totalBalesRecycled: 0,
    totalBoxesAddedToBaler: 0,
    totalTrashCollected: 0,
    stolenProductsCollectedFromFloor: 0,
    analyzedCustomers: 0,
    caughtThievesWhenAnalyzing: 0,
    salesMade: 0,
    extraProductsSoldThankToSales: 0,
    paidInvoices: 0,
    onlineOrdersMade: 0,
    moneyMadeByOnlineOrders: 0,
    repairedDevices: 0,
    bystandersConvertedIntoCustomers: 0,
    productsSoldList: [],
    productsAcquiredList: [],
    revenuePerProductSoldList: [],
    costPerProductAcquiredList: [],
  }
}

const SCALAR_KEYS = new Set(Object.values(SCALAR_FIELDS))
const LIST_KEYS = new Set(Object.values(LIST_FIELDS))

/**
 * Normalise arbitrary stats input (raw `day{N}stat{Name}` flat object OR the
 * preprocessed `{ days, scalar_stats, list_stats, data }` shape) into a
 * `Record<day, Record<statName, rawValue>>` where statName is the RAW game name
 * (before field mapping).
 */
function normalizeToRaw(
  data: any,
  warnings: string[],
): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {}

  // Preprocessed shape (extract_stats_history.py output).
  if (data && typeof data === 'object' && !Array.isArray(data) && data.data && typeof data.data === 'object') {
    for (const [dayStr, statsObj] of Object.entries(data.data) as [string, any][]) {
      const day = Number(dayStr)
      if (!Number.isFinite(day)) continue
      out[dayStr] = {}
      if (statsObj && typeof statsObj === 'object') {
        for (const [stat, v] of Object.entries(statsObj)) {
          out[dayStr][stat] = v
        }
      }
    }
    return out
  }

  // Raw flat object: day{N}stat{Name} -> value
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, v] of Object.entries(data) as [string, any][]) {
      const m = /^day(\d+)stat(.+)$/.exec(key)
      if (!m) continue
      const dayStr = m[1]
      const stat = m[2]
      ;(out[dayStr] ??= {})[stat] = v
    }
    return out
  }

  warnings.push('無法辨識 stats 檔案結構（非 day{N}stat{Name} 亦非預處理 data 格式）。')
  return out
}

export function parseStatsFile(text: string, fileName: string): StatsHistory {
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch (e: any) {
    throw new Error(`無法解析 stats 檔案（非合法 JSON）：${e?.message ?? 'unknown'}`)
  }
  return parseStatsObject(data, fileName)
}

/**
 * Normalise an already-parsed stats object (raw `day{N}stat{Name}` flat object
 * OR the preprocessed `{ days, scalar_stats, list_stats, data }` shape) into a
 * typed StatsHistory. Used by both the standalone stats upload path and the
 * v1.1 combined save.json `stats_history` key.
 */
export function parseStatsObject(data: any, fileName: string): StatsHistory {
  const warnings: string[] = []
  const raw = normalizeToRaw(data, warnings)
  const days = Object.keys(raw)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)

  const dataMap: Record<string, DailyStat> = {}
  let productCount = 0
  const scalarStats: string[] = []
  const listStats: string[] = []

  for (const day of days) {
    const statObj = raw[String(day)]
    const daily = emptyDailyStat(day)

    for (const [rawName, v] of Object.entries(statObj)) {
      if (rawName in LIST_FIELDS) {
        const field = LIST_FIELDS[rawName]
        const arr = unwrapArray(v)
        productCount = Math.max(productCount, arr.length)
        ;(daily as any)[field] = arr
        if (!listStats.includes(rawName)) listStats.push(rawName)
      } else if (rawName in SCALAR_FIELDS) {
        const field = SCALAR_FIELDS[rawName]
        ;(daily as any)[field] = toNumber(v)
        if (!scalarStats.includes(rawName)) scalarStats.push(rawName)
      }
      // unknown stat names are ignored silently (future game fields).
    }

    dataMap[String(day)] = daily
  }

  // Flag the two game bugs as parse warnings so the UI can surface them.
  if (listStats.includes('productsAcquiredList')) {
    warnings.push('productsAcquiredList 有已知遊戲 bug：第二次迴圈誤加總 productsSold，實際等同 sold，勿用於計算入貨量。')
  }
  if (scalarStats.includes('totalsProductsSoldThisDay') || scalarStats.includes('totalProductsSoldThisDay')) {
    warnings.push('totalProductsAcquiredThisDay 有已知遊戲 bug：永遠等於 totalProductsSoldThisDay。')
  }

  return {
    source: `upload:${fileName}`,
    days,
    scalarStats,
    listStats,
    data: dataMap,
    productCount,
    parseWarnings: warnings,
  }
}

/** Normalised display name for a raw stat key (maps bug keys to corrected labels). */
export const STAT_LABELS_ZH: Record<string, string> = {
  customers: '顧客數',
  benefits: '當日淨利',
  franchiseExperience: '累計 FP 經驗',
  timesRobbed: '被偷次數',
  moneySpentOnProducts: '採購支出',
  notFoundProductsCount: '缺貨次數',
  tooExpensiveProductsCount: '太貴投訴',
  lightCost: '電費',
  rentCost: '租金',
  employeesCost: '員工薪資',
  complainedAboutFilth: '髒亂投訴',
  totalProductsSoldThisDay: '當日售出件數',
  totalProductsAcquiredThisDay: '當日入貨件數（bug）',
  productsPlacedInContainers: '上架件數',
  totalBoxesRecycled: '回收紙箱',
  totalBalesRecycled: '回收打包',
  totalBoxesAddedToBaler: '進打包機紙箱',
  totalTrashCollected: '撿垃圾',
  stolenProductsCollectedFromFloor: '撿回被偷貨',
  analyzedCustomers: '分析顧客',
  caughtThievesWhenAnalyzing: '分析抓小偷',
  salesMade: '特價成交',
  extraProductsSoldThankToSales: '特價衝動購買',
  paidInvoices: '已繳發票數',
  onlineOrdersMade: '線上訂單數',
  moneyMadeByOnlineOrders: '線上訂單收入',
  repairedDevices: '維修設備',
  bystandersConvertedIntoCustomers: '路人轉顧客',
}

export function statLabelZh(rawName: string): string {
  return STAT_LABELS_ZH[rawName] ?? rawName
}

export { SCALAR_KEYS, LIST_KEYS }
