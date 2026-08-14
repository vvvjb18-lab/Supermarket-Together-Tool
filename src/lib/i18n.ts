// Internationalization helpers for Supermarket Together Lab.
// Provides language-aware name resolution for all game entities.
// Language is stored in the UI store (persisted) and defaults to zhHant
// to match the in-game Chinese UI the player sees.

'use client'

import { useUIStore } from './store'
import type { Lang } from './store'
import type {
  Product,
  Skill,
  Buildable,
  ProductGroup,
  Tier,
  Necessity,
  Season,
  EmployeeTask,
  ManufacturingProduct,
  Container,
  CustomerType,
  Achievement,
  LocalizedName,
} from './types'
import {
  productById,
  groupById,
  tierById,
  buildableById,
  encyclopedia,
} from './data-loader'

// ---------- core resolver ----------

/** Pick a display string from a LocalizedName based on the active language. */
export function loc(name: LocalizedName | { en: string; zhHant?: string } | undefined, lang: Lang): string {
  if (!name) return '—'
  const en = (name as LocalizedName).en ?? ''
  const zh = (name as LocalizedName).zhHant ?? (name as { zhHant?: string }).zhHant ?? ''
  if (lang === 'en') return en || zh || '—'
  if (lang === 'zhHant') return zh || en || '—'
  // both
  if (en && zh && en !== zh) return `${zh} / ${en}`
  return zh || en || '—'
}

/** Format a name showing Chinese first with English subtitle (for "both" mode in tight spaces). */
export function locShort(name: LocalizedName | { en: string; zhHant?: string } | undefined, lang: Lang): string {
  if (!name) return '—'
  const en = (name as LocalizedName).en ?? ''
  const zh = (name as LocalizedName).zhHant ?? (name as { zhHant?: string }).zhHant ?? ''
  if (lang === 'en') return en || zh || '—'
  if (lang === 'zhHant') return zh || en || '—'
  // both — prefer zh primary, en in parens if different
  if (en && zh && en !== zh) return `${zh}（${en}）`
  return zh || en || '—'
}

// ---------- entity-specific resolvers (pure, take lang) ----------

export function productNameFor(id: number, lang: Lang): string {
  const p = productById.get(id)
  if (!p) return `#${id}`
  return locShort(p.name, lang)
}

export function productNameOnly(id: number, lang: Lang): string {
  const p = productById.get(id)
  if (!p) return `#${id}`
  return loc(p.name, lang)
}

export function groupNameFor(g: ProductGroup, lang: Lang): string {
  return loc(g.name, lang)
}

export function groupIdNameFor(id: number | null, lang: Lang): string {
  if (id == null) return '—'
  const g = groupById.get(id)
  return g ? loc(g.name, lang) : `#${id}`
}

export function tierNameFor(t: Tier, lang: Lang): string {
  return loc(t.category, lang)
}

export function tierIdNameFor(id: number, lang: Lang): string {
  const t = tierById.get(id)
  return t ? `${t.name} · ${loc(t.category, lang)}` : `Tier ${id}`
}

export function buildableNameFor(b: Buildable, lang: Lang): string {
  return loc(b.name, lang)
}

export function buildableIdNameFor(id: number, lang: Lang): string {
  const b = buildableById.get(id)
  return b ? loc(b.name, lang) : `Buildable ${id}`
}

export function skillNameFor(s: Skill, lang: Lang): string {
  return locShort(s.name, lang)
}

export function skillDescFor(s: Skill, lang: Lang): string {
  return loc(s.description, lang)
}

export function necessityNameFor(n: Necessity, lang: Lang): string {
  return loc(n.name, lang)
}

export function necessityIdNameFor(idx: number, lang: Lang): string {
  const n = encyclopedia.necessities[idx]
  return n ? loc(n.name, lang) : `Necessity ${idx}`
}

export function seasonNameFor(s: Season, lang: Lang): string {
  return loc(s.name, lang)
}

export function seasonIdNameFor(idx: number, lang: Lang): string {
  const s = encyclopedia.seasons[idx]
  return s ? loc(s.name, lang) : `Season ${idx}`
}

export function employeeTaskNameFor(t: EmployeeTask, lang: Lang): string {
  return loc(t.name, lang)
}

export function employeeTaskIdNameFor(id: number, lang: Lang): string {
  const t = encyclopedia.employeeTasks.find((x) => x.id === id)
  return t ? loc(t.name, lang) : `Task ${id}`
}

export function manufacturingNameFor(m: ManufacturingProduct, lang: Lang): string {
  return locShort(m.name, lang)
}

export function manufacturingIdNameFor(id: number, lang: Lang): string {
  const m = encyclopedia.manufacturingProducts.find((x) => x.id === id)
  return m ? locShort(m.name, lang) : `Mfg ${id}`
}

// ---------- container names (map buildableName → Buildable.zhHant) ----------

const containerNameCache = new Map<string, string>()

function resolveContainerName(buildableName: string, lang: Lang): string {
  const cacheKey = `${buildableName}::${lang}`
  const cached = containerNameCache.get(cacheKey)
  if (cached !== undefined) return cached
  // find matching buildable by English name
  const b = encyclopedia.buildables.find((x) => x.name.en === buildableName)
  let result: string
  if (b) {
    result = loc(b.name, lang)
  } else {
    result = buildableName
  }
  containerNameCache.set(cacheKey, result)
  return result
}

export function containerNameFor(c: Container, lang: Lang): string {
  return resolveContainerName(c.buildableName, lang)
}

export function containerIdNameFor(containerID: number, lang: Lang): string {
  const c = encyclopedia.containers.find((x) => x.containerID === containerID)
  return c ? resolveContainerName(c.buildableName, lang) : `Container ${containerID}`
}

// ---------- customer type labels (generated from necessity weights) ----------

/** Build a human-readable label for a customer type from its necessity weights. */
export function customerTypeLabel(ct: CustomerType, lang: Lang): string {
  const weights = ct.necessitiesChances
  const items: { idx: number; w: number }[] = weights
    .map((w, idx) => ({ idx, w }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w)
  if (items.length === 0) return lang === 'en' ? 'No demand' : '無需求'
  const parts = items.slice(0, 3).map(({ idx, w }) => {
    const n = encyclopedia.necessities[idx]
    const nName = n ? loc(n.name, lang) : `#${idx}`
    return `${nName}×${w}`
  })
  return parts.join(lang === 'en' ? ', ' : '、')
}

export function customerTypeIdLabel(idx: number, lang: Lang): string {
  const ct = encyclopedia.customerTypes[idx]
  if (!ct) return `Customer ${idx}`
  return customerTypeLabel(ct, lang)
}

// ---------- achievement names (Steam English + manual zhHant map) ----------

const ACH_ZH: Record<string, string> = {
  Millionaire: '百萬富翁',
  'Restocker A': '補貨員 A',
  'Restocker B': '補貨員 B',
  'Restocker C': '補貨員 C',
  'Recycler A': '回收者 A',
  'Recycler B': '回收者 B',
  'Recycler C': '回收者 C',
  'Customers A': '顧客 A',
  'Customers B': '顧客 B',
  'Customers C': '顧客 C',
  'Enigma Cube': '謎樣方塊',
  'Hidden Cat Plaza': '隱藏貓咪廣場',
  'Franchise Level 5': '加盟等級 5',
  'Franchise Level 10': '加盟等級 10',
  'Franchise Level 25': '加盟等級 25',
  'Franchise Level 50': '加盟等級 50',
  'Franchise Level 75': '加盟等級 75',
  'Franchise Level 100': '加盟等級 100',
  'Franchise Level 150': '加盟等級 150',
  'Franchise Level 200': '加盟等級 200',
  'Franchise Level 250': '加盟等級 250',
  'Franchise Level 300': '加盟等級 300',
  'Franchise Level 400': '加盟等級 400',
  'Franchise Level 500': '加盟等級 500',
  'Fully Stocked': '全數補滿',
  'Storage Master': '倉儲大師',
  'Cart Return': '推車歸位',
  'Big Spender': '大戶消費',
  'Speed Runner': '速通達人',
  'Night Owl': '夜貓子',
  'Early Bird': '早起鳥兒',
  'First Employee': '首位員工',
  'Ten Employees': '十名員工',
  'Full Staff': '滿編員工',
  'Skill Master': '技能大師',
  'Perk Collector': '特權收集者',
  'Manufacturer': '製造商',
  'Seasonal Seller': '季節商人',
  'Salt Tycoon': '鹽業大亨',
  'Layout Designer': '佈局設計師',
  'Clean Sweep': '一掃而空',
  'Price Perfect': '定價完美',
  'Happy Customers': '顧客滿意',
  'No Theft': '零竊盜',
  'Premium Products': '高級商品',
  'Full Tier': '全階層解鎖',
  'Expansionist': '擴張主義者',
  'Self Checkout': '自助結帳',
  'Garden Keeper': '園丁',
  'Pharmacist': '藥劑師',
  'Bartender': '酒保',
}

export function achievementNameFor(a: Achievement, lang: Lang): string {
  const en = a.name
  const zh = ACH_ZH[en]
  if (lang === 'en') return en
  if (lang === 'zhHant') return zh || en
  // both
  if (zh && zh !== en) return `${zh} / ${en}`
  return en
}

export function achievementSteamNameFor(steamId: string, lang: Lang): string {
  const a = encyclopedia.achievements.find((x) => x.steamId === steamId)
  return a ? achievementNameFor(a, lang) : steamId
}

// ---------- React hooks (subscribe to lang so components re-render on switch) ----------

export function useLang(): Lang {
  return useUIStore((s) => s.lang)
}

export function useProductName(id: number): string {
  const lang = useLang()
  return productNameFor(id, lang)
}

export function useProductNameOnly(id: number): string {
  const lang = useLang()
  return productNameOnly(id, lang)
}

// ---------- UI string localization (app chrome labels) ----------

const UI_STRINGS: Record<string, { en: string; zhHant: string }> = {
  // confidence labels
  'conf.confirmed': { en: 'Confirmed', zhHant: '已確認' },
  'conf.proxy': { en: 'Proxy', zhHant: '推算值' },
  'conf.unverified': { en: 'Unverified', zhHant: '未驗證' },
  'conf.exploit': { en: 'Exploit Candidate', zhHant: '漏洞候選' },
  'conf.demo': { en: 'Demo', zhHant: '範本' },
  'conf.needs-save': { en: 'Needs Save', zhHant: '需上傳存檔' },
  'conf.needs-runtime': { en: 'Needs Runtime', zhHant: '需實機驗證' },
  // common chrome
  'app.title': { en: 'Supermarket Together Lab', zhHant: 'Supermarket Together 實驗室' },
  'common.loading': { en: 'Loading…', zhHant: '載入中…' },
  'common.empty': { en: 'No data', zhHant: '尚無資料' },
  'common.search': { en: 'Search…', zhHant: '搜尋…' },
  'common.all': { en: 'All', zhHant: '全部' },
  'common.none': { en: 'None', zhHant: '無' },
}

export function t(key: string, lang: Lang): string {
  const entry = UI_STRINGS[key]
  if (!entry) return key
  return lang === 'en' ? entry.en : entry.zhHant
}

export function useT(): (key: string) => string {
  const lang = useLang()
  return (key: string) => t(key, lang)
}

// ---------- language switcher labels ----------

export const LANG_LABELS: Record<Lang, string> = {
  zhHant: '繁中',
  en: 'EN',
  both: '雙語',
}

export const LANG_FULL_LABELS: Record<Lang, string> = {
  zhHant: '繁體中文',
  en: 'English',
  both: '雙語顯示',
}
