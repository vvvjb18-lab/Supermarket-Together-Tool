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

// ---------- achievement names (use data-builtin zhHant; fall back to English) ----------

export function achievementNameFor(a: Achievement, lang: Lang): string {
  const en = a.name
  const zh = a.zhHant
  if (lang === 'en') return en
  if (lang === 'zhHant') return zh || en
  // both
  if (zh && zh !== en) return `${zh} / ${en}`
  return en
}

/** Localized achievement description (the "how to unlock" text). */
export function achievementDescFor(a: Achievement, lang: Lang): string {
  const en = a.description ?? ''
  const zh = a.zhHantDesc ?? ''
  if (lang === 'en') return en
  if (lang === 'zhHant') return zh || en
  // both — prefer zh, en in parens if both present and different
  if (en && zh && en !== zh) return `${zh}\n${en}`
  return zh || en
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

// ============================================================
// Skill Lab tool UI strings (Task 11-b)
// ============================================================
// Append-only: resolvers for the 7 Skill Lab tools' chrome labels.
// Does NOT modify existing exports above.

const SKILL_TOOL_STRINGS: Record<string, { en: string; zhHant: string }> = {
  // Lab header / shell
  'skilllab.title': { en: 'Skill Strategy Lab', zhHant: '技能策略實驗室' },
  'skilllab.subtitle': {
    en: '44 Franchise Perks · 1000 FP each · no prerequisites · 7 strategy tools',
    zhHant: '44 個 Franchise Perk · 統一 1000 FP · 無前置 · 7 大策略工具',
  },
  'skilllab.tab.tools': { en: 'Strategy Tools', zhHant: '策略工具' },
  'skilllab.tab.graph': { en: 'Skill Tree Graph', zhHant: '技能樹圖譜' },
  'skilllab.tab.table': { en: '44-Perk Table', zhHant: '44 技能總表' },
  'skilllab.tab.roi': { en: 'ROI Ranking', zhHant: 'ROI 排序' },

  // Sub-tab labels (Tool 1..7)
  'skilllab.tool.overview': { en: 'Unlocked Overview', zhHant: '已解鎖總覽' },
  'skilllab.tool.build': { en: 'Build Planner', zhHant: 'Build 規劃' },
  'skilllab.tool.next': { en: 'Next-Step Recs', zhHant: '下一步推薦' },
  'skilllab.tool.compare': { en: 'Benefit Comparator', zhHant: '收益對比' },
  'skilllab.tool.fp': { en: 'FP Simulator', zhHant: 'FP 模擬' },
  'skilllab.tool.diff': { en: 'Save Diff', zhHant: '存檔差異' },
  'skilllab.tool.strategy': { en: 'Strategy Panel', zhHant: '策略面板' },

  // FP strip
  'skilllab.unlocked.count': { en: 'Unlocked', zhHant: '已解鎖' },
  'skilllab.fp.earned': { en: 'FP Earned', zhHant: '已賺 FP' },
  'skilllab.fp.available': { en: 'FP Available', zhHant: '可用 FP' },
  'skilllab.fp.spent': { en: 'FP Spent', zhHant: '已花 FP' },
  'skilllab.fp.cost.skill': { en: 'Skill Cost', zhHant: '技能花費' },
  'skilllab.load.save': { en: 'Load Save', zhHant: '載入存檔' },
  'skilllab.load.demo': { en: 'Load Demo Save', zhHant: '載入範本存檔' },
  'skilllab.no.save': {
    en: 'No save loaded. Demo data has no skill state — load a real save for live numbers.',
    zhHant: '尚未載入存檔。範本資料沒有技能狀態 — 載入真實存檔以顯示實際數字。',
  },

  // Tool 1: UnlockedOverview
  'skilllab.t1.title': { en: 'Unlocked Overview', zhHant: '已解鎖技能總覽' },
  'skilllab.t1.list': { en: 'List', zhHant: '列表' },
  'skilllab.t1.byCategory': { en: 'By Category', zhHant: '按類別' },
  'skilllab.t1.locked': { en: 'Locked', zhHant: '未解鎖' },

  // Tool 2: BuildPlanner
  'skilllab.t2.title': { en: 'Build Planner', zhHant: '技能樹 Build Planner' },
  'skilllab.t2.search': { en: 'Search skill…', zhHant: '搜尋技能…' },
  'skilllab.t2.myBuild': { en: 'My Build List', zhHant: '我的 Build 清單' },
  'skilllab.t2.empty': { en: 'Empty — pick skills from the list', zhHant: '尚無選擇 — 從左側列表挑選技能' },
  'skilllab.t2.totalSkills': { en: 'Total Skills', zhHant: '總技能數' },
  'skilllab.t2.totalFp': { en: 'Total FP Cost', zhHant: '總 FP 成本' },
  'skilllab.t2.alreadyUnlocked': { en: 'Already Unlocked', zhHant: '已解鎖' },
  'skilllab.t2.needBuy': { en: 'Need to Buy', zhHant: '還需購買' },
  'skilllab.t2.needFp': { en: 'FP Still Needed', zhHant: '尚需 FP' },
  'skilllab.t2.progress': { en: 'Distance to Complete', zhHant: '距離完成' },
  'skilllab.t2.buildLines': { en: 'Build Lines (visual branches)', zhHant: 'Build 走線（視覺分支）' },
  'skilllab.t2.presets': { en: 'Quick Presets', zhHant: '快速預設' },
  'skilllab.t2.preset.employee': { en: 'Employee Speed', zhHant: '員工效率流' },
  'skilllab.t2.preset.checkout': { en: 'Checkout Flow', zhHant: '收銀流' },
  'skilllab.t2.preset.customer': { en: 'Customer Volume', zhHant: '客流流' },
  'skilllab.t2.preset.recycle': { en: 'Recycle Flow', zhHant: '回收流' },
  'skilllab.t2.clear': { en: 'Clear', zhHant: '清空' },

  // Tool 3: NextStepRecommender
  'skilllab.t3.title': { en: 'Next-Step Recommendations', zhHant: '下一步推薦' },
  'skilllab.t3.mode.employee': { en: 'Employee Eff.', zhHant: '員工效率' },
  'skilllab.t3.mode.customer': { en: 'Customer Vol.', zhHant: '客流' },
  'skilllab.t3.mode.checkout': { en: 'Checkout Rev.', zhHant: '收銀收益' },
  'skilllab.t3.mode.recycle': { en: 'Recycle Rev.', zhHant: '回收收益' },
  'skilllab.t3.why': { en: 'Why recommended', zhHant: '為什麼推薦' },
  'skilllab.t3.applyAll': { en: 'Apply Top 3 to Build', zhHant: '套用全部到 Build' },
  'skilllab.t3.applied': { en: 'Added to Build Planner', zhHant: '已加入 Build 規劃' },
  'skilllab.t3.metric.employees': { en: 'Current employees', zhHant: '目前員工' },
  'skilllab.t3.metric.speedSkills': { en: 'Speed skills unlocked', zhHant: '已解鎖速度技能' },
  'skilllab.t3.metric.checkoutSkills': { en: 'Checkout skills unlocked', zhHant: '已解鎖收銀技能' },
  'skilllab.t3.metric.customerSkills': { en: 'Customer skills unlocked', zhHant: '已解鎖客流技能' },
  'skilllab.t3.metric.recycleSkills': { en: 'Recycle skills unlocked', zhHant: '已解鎖回收技能' },
  'skilllab.t3.noRec': { en: 'No new skills to recommend in this mode.', zhHant: '此模式下沒有可推薦的新技能。' },

  // Tool 4: BenefitComparator
  'skilllab.t4.title': { en: 'Benefit Comparator', zhHant: '技能收益對比器' },
  'skilllab.t4.skillA': { en: 'Skill A', zhHant: '技能 A' },
  'skilllab.t4.skillB': { en: 'Skill B', zhHant: '技能 B' },
  'skilllab.t4.estimate': { en: 'Estimated Impact', zhHant: '收益推估' },
  'skilllab.t4.complementary': { en: 'Complementary', zhHant: '互補' },
  'skilllab.t4.stronger': { en: 'Stronger', zhHant: '較強' },
  'skilllab.t4.vs': { en: 'vs', zhHant: '對比' },
  'skilllab.t4.unlocked': { en: 'Unlocked', zhHant: '已解鎖' },
  'skilllab.t4.locked': { en: 'Locked', zhHant: '未解鎖' },

  // Tool 5: FpInvestmentSimulator
  'skilllab.t5.title': { en: 'FP Investment Simulator', zhHant: 'FP 投資模擬器' },
  'skilllab.t5.currentFp': { en: 'Current FP', zhHant: '目前 FP' },
  'skilllab.t5.dailyFp': { en: 'Daily FP Income', zhHant: '每日 FP 收入' },
  'skilllab.t5.dailyHint': {
    en: 'Estimated by difficulty/customer volume. Adjust to match your run.',
    zhHant: '依難度/客流估計，可自行調整。',
  },
  'skilllab.t5.simBuy': { en: 'Simulate Purchase', zhHant: '模擬購買' },
  'skilllab.t5.selected': { en: 'Selected', zhHant: '已選' },
  'skilllab.t5.totalCost': { en: 'Total Cost', zhHant: '總成本' },
  'skilllab.t5.remaining': { en: 'Remaining FP', zhHant: '剩餘 FP' },
  'skilllab.t5.buyAllNow': { en: 'If you buy all now', zhHant: '如果現在全部購買' },
  'skilllab.t5.shortfall': { en: 'FP short by', zhHant: '你還差' },
  'skilllab.t5.surplus': { en: 'FP surplus', zhHant: '你會剩' },
  'skilllab.t5.daysToComplete': { en: 'Days to complete all', zhHant: '完成全部需' },
  'skilllab.t5.days': { en: 'days', zhHant: '天' },
  'skilllab.t5.reset': { en: 'Reset Simulation', zhHant: '重設模擬' },
  'skilllab.t5.allocation': { en: 'FP Allocation', zhHant: 'FP 分配' },
  'skilllab.t5.spent': { en: 'Spent (unlocked)', zhHant: '已花（已解鎖）' },
  'skilllab.t5.reserve': { en: 'Reserve (sim)', zhHant: '儲備（模擬中）' },

  // Tool 6: SaveDiffAnalyzer
  'skilllab.t6.title': { en: 'Save Diff Analyzer', zhHant: '存檔差異分析' },
  'skilllab.t6.saveA': { en: 'Save A (older)', zhHant: '存檔 A（舊）' },
  'skilllab.t6.saveB': { en: 'Save B (newer)', zhHant: '存檔 B（新）' },
  'skilllab.t6.drop': { en: 'Drop .json here or click to pick', zhHant: '拖曳 .json 到此或點擊選取' },
  'skilllab.t6.newSkills': { en: 'Newly Unlocked Skills', zhHant: '新解鎖技能' },
  'skilllab.t6.skillCount': { en: 'Skill Count Change', zhHant: '技能數量變化' },
  'skilllab.t6.fpChange': { en: 'FP Change', zhHant: 'FP 變化' },
  'skilllab.t6.dayChange': { en: 'Day Change', zhHant: 'Day 變化' },
  'skilllab.t6.moneyChange': { en: 'Money Change', zhHant: '資金變化' },
  'skilllab.t6.otherKpi': { en: 'Other KPI Changes', zhHant: '其他 KPI 變化' },
  'skilllab.t6.recompare': { en: 'Re-compare', zhHant: '重新比較' },
  'skilllab.t6.needBoth': { en: 'Please upload the second save to compare.', zhHant: '請上傳第二個存檔以比較。' },
  'skilllab.t6.parseError': { en: 'Parse error', zhHant: '解析錯誤' },
  'skilllab.t6.employees': { en: 'Employees', zhHant: '員工' },
  'skilllab.t6.props': { en: 'Store Props', zhHant: '店面道具' },
  'skilllab.t6.noChange': { en: 'No new skills unlocked between A and B.', zhHant: 'A→B 之間沒有新解鎖的技能。' },

  // Tool 7: StrategyPanel
  'skilllab.t7.title': { en: 'Strategy Panel', zhHant: '策略面板' },
  'skilllab.t7.profile': { en: 'Store Profile', zhHant: '店鋪型態' },
  'skilllab.t7.recommendations': { en: 'Tailored Skill Recommendations', zhHant: '針對型態的技能推薦' },
  'skilllab.t7.radar': { en: 'Strategy Radar', zhHant: '策略雷達圖' },
  'skilllab.t7.axis.employee': { en: 'Employee Eff.', zhHant: '員工效率' },
  'skilllab.t7.axis.customer': { en: 'Customer', zhHant: '客流' },
  'skilllab.t7.axis.checkout': { en: 'Checkout', zhHant: '結帳' },
  'skilllab.t7.axis.recycle': { en: 'Recycle', zhHant: '回收' },
  'skilllab.t7.axis.finance': { en: 'Finance', zhHant: '財務' },

  // Shared
  'skilllab.category': { en: 'Category', zhHant: '類別' },
  'skilllab.effect': { en: 'Effect', zhHant: '效果' },
  'skilllab.fpCost': { en: 'FP Cost', zhHant: 'FP 成本' },
  'skilllab.rank': { en: 'Rank', zhHant: '排名' },
  'skilllab.perk': { en: 'Perk', zhHant: 'Perk' },

  // Data Table (skilllab.dt.*)
  'skilllab.dt.title': { en: '44 Skills Data Table', zhHant: '44 技能資料表' },
  'skilllab.dt.unlocked': { en: 'Unlocked', zhHant: '已解鎖' },
  'skilllab.dt.locked': { en: 'Locked', zhHant: '未解鎖' },
  'skilllab.dt.exportTsv': { en: 'Export TSV', zhHant: '匯出 TSV' },
  'skilllab.dt.searchPlaceholder': { en: 'Search name / ID / effect…', zhHant: '搜尋名稱 / ID / 效果…' },
  'skilllab.dt.clearFilter': { en: 'Clear filter', zhHant: '清除篩選' },
  'skilllab.dt.categoryFilter': { en: 'Category', zhHant: '類別篩選' },
  'skilllab.dt.colName': { en: 'Name', zhHant: '名稱' },
  'skilllab.dt.colCategory': { en: 'Category', zhHant: '類別' },
  'skilllab.dt.colEffect': { en: 'Effect', zhHant: '效果' },
  'skilllab.dt.colFpCost': { en: 'FP Cost', zhHant: 'FP 成本' },
  'skilllab.dt.colStatus': { en: 'Status', zhHant: '狀態' },
  'skilllab.dt.noResults': { en: 'No skills match the current filters.', zhHant: '沒有技能符合目前篩選條件。' },
  'skilllab.dt.totalSkills': { en: 'Total Skills', zhHant: '總技能數' },
  'skilllab.dt.totalFpCost': { en: 'Total FP Cost (all)', zhHant: '總 FP 成本（全解鎖）' },
  'skilllab.dt.rawEffect': { en: 'Raw Effect String', zhHant: '原始效果字串' },
  'skilllab.dt.parsedEffects': { en: 'Parsed Effects', zhHant: '解析效果' },
}

export function skillToolLabel(key: string, lang: Lang): string {
  const entry = SKILL_TOOL_STRINGS[key]
  if (!entry) return key
  return lang === 'en' ? entry.en : entry.zhHant
}

export function useSkillToolLabel(): (key: string) => string {
  const lang = useLang()
  return (key: string) => skillToolLabel(key, lang)
}
