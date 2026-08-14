// Pure functions computing the Complete Game Atlas relationship graph
// from the encyclopedia. No React, no side effects — safe to import anywhere.
//
// All 18 entity types are modelled as graph nodes; relationships between
// types (foreign-key style references inside the data) become edges whose
// `count` is the total number of concrete cross-references.

import { encyclopedia, productById } from './data-loader'
import type {
  Product,
  Tier,
  ProductGroup,
  Necessity,
  Season,
  CustomerType,
  ManufacturingProduct,
  Buildable,
  Container,
  Skill,
  Achievement,
  EmployeeTask,
  LayoutProp,
} from './types'

// ---------- categories ----------

export type EntityCategory =
  | 'product' // 商品 — emerald
  | 'classification' // 分類 — sky
  | 'demand' // 需求 — amber
  | 'store' // 店面 — violet
  | 'player' // 玩家 — fuchsia
  | 'system' // 系統 — zinc

export interface CategoryMeta {
  key: EntityCategory
  labelZh: string
  labelEn: string
  color: string // hex used for SVG fills
}

export const ENTITY_CATEGORIES: CategoryMeta[] = [
  { key: 'product', labelZh: '商品', labelEn: 'Products', color: '#10b981' },
  { key: 'classification', labelZh: '分類', labelEn: 'Classification', color: '#0ea5e9' },
  { key: 'demand', labelZh: '需求', labelEn: 'Demand', color: '#f59e0b' },
  { key: 'store', labelZh: '店面', labelEn: 'Store', color: '#8b5cf6' },
  { key: 'player', labelZh: '玩家', labelEn: 'Player', color: '#d946ef' },
  { key: 'system', labelZh: '系統', labelEn: 'System', color: '#71717a' },
]

export const CATEGORY_COLOR: Record<EntityCategory, string> = {
  product: '#10b981',
  classification: '#0ea5e9',
  demand: '#f59e0b',
  store: '#8b5cf6',
  player: '#d946ef',
  system: '#71717a',
}

// ---------- entity type metadata (18 types) ----------

export type EntityTypeKey =
  | 'products'
  | 'premiumProducts'
  | 'manufacturingProducts'
  | 'tiers'
  | 'productGroups'
  | 'necessities'
  | 'customerTypes'
  | 'seasons'
  | 'containers'
  | 'buildables'
  | 'manufacturingBuildables'
  | 'storeLayout'
  | 'skills'
  | 'achievements'
  | 'achievementStats'
  | 'employeeTasks'
  | 'config'
  | 'layoutMeta'

export interface EntityTypeInfo {
  key: EntityTypeKey
  labelZh: string
  labelEn: string
  count: number
  category: EntityCategory
  color: string
}

function countOf(key: EntityTypeKey): number {
  switch (key) {
    case 'products':
      return encyclopedia.products.length
    case 'premiumProducts':
      return encyclopedia.premiumProducts.length
    case 'manufacturingProducts':
      return encyclopedia.manufacturingProducts.length
    case 'tiers':
      return encyclopedia.tiers.length
    case 'productGroups':
      return encyclopedia.productGroups.length
    case 'necessities':
      return encyclopedia.necessities.length
    case 'customerTypes':
      return encyclopedia.customerTypes.length
    case 'seasons':
      return encyclopedia.seasons.length
    case 'containers':
      return encyclopedia.containers.length
    case 'buildables':
      return encyclopedia.buildables.length
    case 'manufacturingBuildables':
      return encyclopedia.manufacturingBuildables.length
    case 'storeLayout':
      return encyclopedia.storeLayout.length
    case 'skills':
      return encyclopedia.skills.length
    case 'achievements':
      return encyclopedia.achievements.length
    case 'achievementStats':
      return encyclopedia.achievementStats.length
    case 'employeeTasks':
      return encyclopedia.employeeTasks.length
    case 'config':
      return Object.keys(encyclopedia.config).length
    case 'layoutMeta':
      return Object.keys(encyclopedia.layoutMeta).length
  }
}

const ENTITY_META: Record<EntityTypeKey, { labelZh: string; labelEn: string; category: EntityCategory }> = {
  products: { labelZh: '商品', labelEn: 'Products', category: 'product' },
  premiumProducts: { labelZh: '頂級商品', labelEn: 'Premium Products', category: 'product' },
  manufacturingProducts: { labelZh: '製造商品', labelEn: 'Manufacturing Products', category: 'product' },
  tiers: { labelZh: '價格階層', labelEn: 'Price Tiers', category: 'classification' },
  productGroups: { labelZh: '商品群組', labelEn: 'Product Groups', category: 'classification' },
  necessities: { labelZh: '需求類別', labelEn: 'Necessities', category: 'demand' },
  customerTypes: { labelZh: '顧客類型', labelEn: 'Customer Types', category: 'demand' },
  seasons: { labelZh: '季節', labelEn: 'Seasons', category: 'demand' },
  containers: { labelZh: '貨架容器', labelEn: 'Containers', category: 'store' },
  buildables: { labelZh: '可建造物', labelEn: 'Buildables', category: 'store' },
  manufacturingBuildables: { labelZh: '製造設備', labelEn: 'Manufacturing Buildables', category: 'store' },
  storeLayout: { labelZh: '店面佈局', labelEn: 'Store Layout', category: 'store' },
  skills: { labelZh: '技能', labelEn: 'Skills', category: 'player' },
  achievements: { labelZh: '成就', labelEn: 'Achievements', category: 'player' },
  achievementStats: { labelZh: '成就統計', labelEn: 'Achievement Stats', category: 'player' },
  employeeTasks: { labelZh: '員工任務', labelEn: 'Employee Tasks', category: 'player' },
  config: { labelZh: '遊戲設定', labelEn: 'Config', category: 'system' },
  layoutMeta: { labelZh: '佈局摘要', labelEn: 'Layout Meta', category: 'system' },
}

export const ENTITY_TYPES: EntityTypeInfo[] = (
  Object.keys(ENTITY_META) as EntityTypeKey[]
).map((key) => {
  const meta = ENTITY_META[key]
  return {
    key,
    labelZh: meta.labelZh,
    labelEn: meta.labelEn,
    count: countOf(key),
    category: meta.category,
    color: CATEGORY_COLOR[meta.category],
  }
})

export function entityTypeInfo(key: EntityTypeKey): EntityTypeInfo | undefined {
  return ENTITY_TYPES.find((e) => e.key === key)
}

// ---------- fixed SVG node positions for View 1 (1200 x 800 viewBox) ----------
//
// Layout: 3 concentric rings.
//   center  — system (config, layoutMeta)
//   inner   — 5 category hubs (productGroups, tiers, necessities, seasons, customerTypes)
//   outer   — 11 leaf entities (products, manufacturingProducts, premiumProducts,
//             buildables, containers, manufacturingBuildables, storeLayout,
//             skills, achievements, achievementStats, employeeTasks)

export interface AtlasNode {
  id: EntityTypeKey
  x: number
  y: number
  r: number
  color: string
  label: string
  labelEn: string
  category: EntityCategory
}

function nodeRadius(count: number): number {
  const r = 24 + Math.log2(count + 1) * 4
  return Math.min(r, 48)
}

const NODE_POSITIONS: Record<EntityTypeKey, { x: number; y: number }> = {
  // center — system hub
  config: { x: 560, y: 400 },
  layoutMeta: { x: 660, y: 400 },

  // inner ring — category hubs
  necessities: { x: 600, y: 175 },
  productGroups: { x: 340, y: 270 },
  customerTypes: { x: 860, y: 270 },
  tiers: { x: 340, y: 540 },
  seasons: { x: 860, y: 540 },

  // outer ring — leaves (商品 cluster on left, 店面 on right, 玩家 on bottom)
  products: { x: 130, y: 400 },
  manufacturingProducts: { x: 150, y: 230 },
  premiumProducts: { x: 150, y: 570 },

  buildables: { x: 1060, y: 210 },
  containers: { x: 1110, y: 340 },
  manufacturingBuildables: { x: 1110, y: 460 },
  storeLayout: { x: 1060, y: 590 },

  skills: { x: 330, y: 690 },
  employeeTasks: { x: 200, y: 720 },
  achievements: { x: 510, y: 720 },
  achievementStats: { x: 690, y: 720 },
}

export const ATLAS_NODES: AtlasNode[] = ENTITY_TYPES.map((e) => {
  const pos = NODE_POSITIONS[e.key]
  return {
    id: e.key,
    x: pos.x,
    y: pos.y,
    r: nodeRadius(e.count),
    color: e.color,
    label: e.labelZh,
    labelEn: e.labelEn,
    category: e.category,
  }
})

export function atlasNodeById(id: EntityTypeKey): AtlasNode | undefined {
  return ATLAS_NODES.find((n) => n.id === id)
}

// ---------- relationship edges (computed from real data references) ----------

export interface AtlasEdge {
  from: EntityTypeKey
  to: EntityTypeKey
  count: number
  label: string // short description of the reference field
}

function countCustomerNecessityPairs(): number {
  let n = 0
  for (const ct of encyclopedia.customerTypes) {
    for (const w of ct.necessitiesChances) {
      if (w > 0) n += 1
    }
  }
  return n
}

function countCustomerPremiumPairs(): number {
  let n = 0
  for (const ct of encyclopedia.customerTypes) {
    n += ct.premiumIndexes.length
  }
  return n
}

function countNecessityProductPairs(): number {
  let n = 0
  for (const nec of encyclopedia.necessities) {
    n += nec.productIds.length
  }
  return n
}

function countSeasonProductPairs(): number {
  let n = 0
  for (const s of encyclopedia.seasons) {
    n += s.productIds.length
  }
  return n
}

function countContainerBuildablePairs(): number {
  const buildableEnNames = new Set(encyclopedia.buildables.map((b) => b.name.en))
  let n = 0
  for (const c of encyclopedia.containers) {
    if (buildableEnNames.has(c.buildableName)) n += 1
  }
  return n
}

export const ATLAS_EDGES: AtlasEdge[] = [
  // 分類 chain: productGroup ← tier ← product
  { from: 'productGroups', to: 'tiers', count: encyclopedia.tiers.length, label: 'tier.group' },
  { from: 'tiers', to: 'products', count: encyclopedia.products.length, label: 'product.tier' },
  { from: 'productGroups', to: 'products', count: encyclopedia.products.filter((p) => p.group != null).length, label: 'product.group' },

  // 商品 cross-references
  { from: 'manufacturingProducts', to: 'products', count: encyclopedia.manufacturingProducts.length, label: 'linkedProductID' },
  { from: 'premiumProducts', to: 'products', count: encyclopedia.premiumProducts.length, label: 'id subset' },

  // 需求 chain: product ↔ necessity, product ↔ season
  { from: 'necessities', to: 'products', count: countNecessityProductPairs(), label: 'necessity.productIds' },
  { from: 'seasons', to: 'products', count: countSeasonProductPairs(), label: 'season.productIds' },

  // customer → necessity (weight>0 pairs) + customer → premium
  { from: 'customerTypes', to: 'necessities', count: countCustomerNecessityPairs(), label: 'necessitiesChances[i]' },
  { from: 'customerTypes', to: 'premiumProducts', count: countCustomerPremiumPairs(), label: 'premiumIndexes' },

  // 店面 chain: buildable → storeLayout, container → buildable
  { from: 'buildables', to: 'storeLayout', count: encyclopedia.storeLayout.length, label: 'buildableId' },
  { from: 'containers', to: 'buildables', count: countContainerBuildablePairs(), label: 'buildableName' },

  // 玩家 ↔ 系統 soft edges
  { from: 'skills', to: 'config', count: 1, label: 'perkSystem' },
  { from: 'employeeTasks', to: 'config', count: 1, label: 'employeeConfig' },
  { from: 'achievements', to: 'achievementStats', count: encyclopedia.achievementStats.length, label: 'shared index' },
]

export const TOTAL_RELATIONSHIPS = ATLAS_EDGES.reduce((s, e) => s + e.count, 0)

// ---------- sample items for side panel ----------

export interface SampleItem {
  id: string
  name: string
  sub?: string
}

export function getEntityTypeSamples(key: EntityTypeKey, count = 5): SampleItem[] {
  switch (key) {
    case 'products':
      return encyclopedia.products.slice(0, count).map((p) => ({
        id: `#${p.id}`,
        name: p.name.zhHant || p.name.en,
        sub: p.brand,
      }))
    case 'premiumProducts':
      return encyclopedia.premiumProducts.slice(0, count).map((id) => {
        const p = productById.get(id)
        return { id: `#${id}`, name: p?.name.zhHant || p?.name.en || `Product ${id}`, sub: p?.brand }
      })
    case 'manufacturingProducts':
      return encyclopedia.manufacturingProducts.slice(0, count).map((m) => ({
        id: `#${m.id}`,
        name: m.name.zhHant || m.name.en,
        sub: `→ #${m.linkedProductID}`,
      }))
    case 'tiers':
      return encyclopedia.tiers.slice(0, count).map((t) => ({
        id: `T${t.id}`,
        name: `${t.name} · ${t.category.zhHant || t.category.en}`,
        sub: `inflation ×${t.inflation}`,
      }))
    case 'productGroups':
      return encyclopedia.productGroups.slice(0, count).map((g) => ({
        id: `G${g.id}`,
        name: g.name.zhHant || g.name.en,
      }))
    case 'necessities':
      return encyclopedia.necessities.slice(0, count).map((n) => ({
        id: `N${n.index}`,
        name: n.name.zhHant || n.name.en,
        sub: `${n.productIds.length} items`,
      }))
    case 'customerTypes':
      return encyclopedia.customerTypes.slice(0, count).map((c) => ({
        id: `C${c.index}`,
        name: c.topSummary || `Customer ${c.index}`,
      }))
    case 'seasons':
      return encyclopedia.seasons.slice(0, count).map((s) => ({
        id: `S${s.index}`,
        name: s.name.zhHant || s.name.en,
        sub: `${s.productIds.length} items`,
      }))
    case 'containers':
      return encyclopedia.containers.slice(0, count).map((c) => ({
        id: `C${c.containerID}`,
        name: c.buildableName,
        sub: `$${c.cost}`,
      }))
    case 'buildables':
      return encyclopedia.buildables.slice(0, count).map((b) => ({
        id: `B${b.id}`,
        name: b.name.zhHant || b.name.en,
      }))
    case 'manufacturingBuildables':
      return encyclopedia.manufacturingBuildables.slice(0, count).map((b) => ({
        id: `MB${b.id}`,
        name: b.name.zhHant || b.name.en,
      }))
    case 'storeLayout':
      return encyclopedia.storeLayout.slice(0, count).map((l) => ({
        id: `P${l.index}`,
        name: `Prop #${l.index}`,
        sub: `buildable ${l.buildableId}`,
      }))
    case 'skills':
      return encyclopedia.skills.slice(0, count).map((s) => ({
        id: s.id,
        name: s.name.zhHant || s.name.en,
        sub: s.perk != null ? `perk ${s.perk}` : undefined,
      }))
    case 'achievements':
      return encyclopedia.achievements.slice(0, count).map((a) => ({
        id: a.steamId,
        name: a.zhHant || a.name,
        sub: `${a.globalPercent}%`,
      }))
    case 'achievementStats':
      return encyclopedia.achievementStats.slice(0, count).map((a) => ({
        id: `AS${a.index}`,
        name: a.description,
      }))
    case 'employeeTasks':
      return encyclopedia.employeeTasks.slice(0, count).map((t) => ({
        id: `ET${t.id}`,
        name: t.name.zhHant || t.name.en,
      }))
    case 'config':
      return Object.keys(encyclopedia.config).slice(0, count).map((k) => ({
        id: k,
        name: k,
        sub: `${Object.keys(encyclopedia.config[k]).length} keys`,
      }))
    case 'layoutMeta':
      return Object.entries(encyclopedia.layoutMeta).map(([k, v]) => ({
        id: k,
        name: k,
        sub: String(v),
      }))
  }
}

// ---------- relationships for a given entity type (side panel) ----------

export interface RelationshipInfo {
  direction: 'out' | 'in'
  targetType: EntityTypeKey
  targetLabelZh: string
  count: number
  label: string
}

export function getRelationships(key: EntityTypeKey): RelationshipInfo[] {
  const out: RelationshipInfo[] = []
  for (const e of ATLAS_EDGES) {
    if (e.from === key) {
      const target = entityTypeInfo(e.to)
      out.push({
        direction: 'out',
        targetType: e.to,
        targetLabelZh: target?.labelZh ?? e.to,
        count: e.count,
        label: e.label,
      })
    } else if (e.to === key) {
      const target = entityTypeInfo(e.from)
      out.push({
        direction: 'in',
        targetType: e.from,
        targetLabelZh: target?.labelZh ?? e.from,
        count: e.count,
        label: e.label,
      })
    }
  }
  return out
}

// ---------- View 2: product hierarchy tree (ProductGroup → Tier → Product) ----------

export interface HierarchyTier {
  tier: Tier
  products: Product[]
}
export interface HierarchyGroup {
  group: ProductGroup
  tiers: HierarchyTier[]
  totalProducts: number
}

export function productHierarchy(): HierarchyGroup[] {
  return encyclopedia.productGroups.map((group) => {
    const groupTiers = encyclopedia.tiers
      .filter((t) => t.group === group.id)
      .map((tier) => ({
        tier,
        products: encyclopedia.products.filter((p) => p.tier === tier.id),
      }))
      .filter((ht) => ht.products.length > 0 || true) // keep all tiers even if empty
    const totalProducts = groupTiers.reduce((s, t) => s + t.products.length, 0)
    return { group, tiers: groupTiers, totalProducts }
  })
}

// ---------- View 3: customer demand chain ----------

export interface DemandLink {
  necessity: Necessity
  weight: number
  products: Product[]
}

export function customerDemandChain(customerIndex: number): DemandLink[] {
  const ct = encyclopedia.customerTypes[customerIndex]
  if (!ct) return []
  const links: DemandLink[] = []
  for (let i = 0; i < ct.necessitiesChances.length; i++) {
    const w = ct.necessitiesChances[i]
    if (w <= 0) continue
    const nec = encyclopedia.necessities[i]
    if (!nec) continue
    const products = nec.productIds
      .map((pid) => productById.get(pid))
      .filter((p): p is Product => p != null)
    links.push({ necessity: nec, weight: w, products })
  }
  // sort by weight desc — heaviest demand first
  links.sort((a, b) => b.weight - a.weight)
  return links
}

export function customerDemandStats(customerIndex: number): {
  topThree: DemandLink[]
  totalProducts: number
  coveredGroups: { id: number; name: string; count: number }[]
} {
  const chain = customerDemandChain(customerIndex)
  const topThree = chain.slice(0, 3)
  const productSet = new Set<number>()
  for (const link of chain) {
    for (const p of link.products) productSet.add(p.id)
  }
  const groupMap = new Map<number, number>()
  for (const pid of productSet) {
    const p = productById.get(pid)
    if (p && p.group != null) {
      groupMap.set(p.group, (groupMap.get(p.group) ?? 0) + 1)
    }
  }
  const coveredGroups = Array.from(groupMap.entries())
    .map(([id, count]) => {
      const g = encyclopedia.productGroups.find((x) => x.id === id)
      return { id, name: g?.name.zhHant || g?.name.en || `Group ${id}`, count }
    })
    .sort((a, b) => b.count - a.count)
  return { topThree, totalProducts: productSet.size, coveredGroups }
}

// ---------- View 4: manufacturing chains ----------

export interface ManufacturingChain {
  mfg: ManufacturingProduct
  baseProduct: Product | null
  isNecessityComponent: boolean
  isSeasonal: boolean
}

export function manufacturingChains(): ManufacturingChain[] {
  // pre-index necessity and season product membership
  const necessityProducts = new Set<number>()
  for (const n of encyclopedia.necessities) {
    for (const pid of n.productIds) necessityProducts.add(pid)
  }
  const seasonalProducts = new Set<number>()
  for (const s of encyclopedia.seasons) {
    for (const pid of s.productIds) seasonalProducts.add(pid)
  }
  return encyclopedia.manufacturingProducts.map((mfg) => {
    const baseProduct = productById.get(mfg.linkedProductID) ?? null
    return {
      mfg,
      baseProduct,
      isNecessityComponent: baseProduct ? necessityProducts.has(baseProduct.id) : false,
      isSeasonal: baseProduct ? seasonalProducts.has(baseProduct.id) : false,
    }
  })
}

// ---------- re-export a few helpers consumers may want ----------

export function tierProducts(tierId: number): Product[] {
  return encyclopedia.products.filter((p) => p.tier === tierId)
}

export function groupTiers(groupId: number): Tier[] {
  return encyclopedia.tiers.filter((t) => t.group === groupId)
}

export function buildableName(buildableId: number): string {
  const b: Buildable | undefined = encyclopedia.buildables.find((x) => x.id === buildableId)
  return b ? b.name.zhHant || b.name.en : `Buildable ${buildableId}`
}

// re-exported types for the component layer
export type {
  Product,
  Tier,
  ProductGroup,
  Necessity,
  Season,
  CustomerType,
  ManufacturingProduct,
  Skill,
  Achievement,
  EmployeeTask,
  Container,
  LayoutProp,
}
