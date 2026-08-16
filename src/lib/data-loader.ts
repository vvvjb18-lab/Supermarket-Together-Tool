// Loads the generated encyclopedia.json and demo-save.json into typed objects.
import encyclopediaJson from './data/encyclopedia.json'
import demoSaveJson from './data/demo-save.json'
import skillGraphJson from './data/skill-graph.json'
import exploitsJson from './data/exploits.json'
import tierInflationJson from './data/tier-inflation.json'
import manufacturingRecipesJson from './data/manufacturing-recipes.json'
import perkEffectsJson from './data/perk-effects.json'
import type { Encyclopedia, SaveSnapshot, Product, Tier, ProductGroup, Buildable, Container, SkillTreeGraph, LayoutProp, ExploitCandidate, ManufacturingRecipe, Skill } from './types'

// ---------- tier inflation table (D2: online-orders engine) ----------
// The encyclopedia bundles the same numbers in encyclopedia.tiers[].inflation,
// but exposing them as a separate, flat array makes them consumable by pure
// functions in src/lib/online-order-engine.ts without dragging the full
// Encyclopedia type around. The 0-16 real values (1.13-1.59) are the only
// tiers where the game applies a sale-price surcharge above 2.01x base.
export interface TierInflationEntry {
  id: number
  inflation: number
  category: string
}
const _tierInflationTable: TierInflationEntry[] = (tierInflationJson as { tiers: TierInflationEntry[] }).tiers
export const tierInflationTable: TierInflationEntry[] = _tierInflationTable
/** Flat number[] (id -> multiplier) for fast lookup; mirrors engine.TIER_INFLATION. */
export const TIER_INFLATION_VALUES: number[] = _tierInflationTable.map((t) => t.inflation)

/**
 * Ensure every LayoutProp carries the canonical `containerID` + `zoneCode`
 * fields. Older bundled data (encyclopedia.json / demo-save.json generated
 * before the propdata fix) only has `buildableId` and may even have a wrong
 * one (the v1.0 extractor read zoneCode as buildableId). This normaliser
 * guarantees the fields exist; correcting the actual *values* is done by
 * re-parsing decoded.propdata at save-load time (see es3-parser.ts) and by
 * the one-shot patch script scripts/fix-layout-props.ts.
 */
function normalizeLayoutProps(props: LayoutProp[]): LayoutProp[] {
  return props.map((p) => ({
    ...p,
    containerID: typeof p.containerID === 'number' ? p.containerID : p.buildableId,
    zoneCode: typeof p.zoneCode === 'number' ? p.zoneCode : 0,
  }))
}

const _encyclopedia = encyclopediaJson as unknown as Encyclopedia
_encyclopedia.storeLayout = normalizeLayoutProps(_encyclopedia.storeLayout ?? [])

// ---------- perk effects overlay (D2: real IL effect strings) ----------
// The bundled encyclopedia's skills[].effect / .il are misaligned from skill 12
// onward (a +4 shift) and skills 40-43 carry "(no matching perk in IL)". The
// perk-effects.json table is the authoritative perkIndex -> effect mapping
// (ManageExtraPerks switch IL, cross-checked against localization names), so we
// overlay it here once. Everything downstream (skill-engine, skill-tools,
// skills.tsx, skill-tree.tsx) then reads the corrected value automatically.
export interface PerkEffectEntry {
  perkIndex: number
  nameEn: string
  effect: string
  rawIl: string
  note?: string
}
const _perkEffects = (perkEffectsJson as { perks: PerkEffectEntry[] }).perks
export const perkEffects: PerkEffectEntry[] = _perkEffects
const _perkEffectByIndex = new Map<number, PerkEffectEntry>(_perkEffects.map((p) => [p.perkIndex, p]))

_encyclopedia.skills = _encyclopedia.skills.map((s: Skill) => {
  if (s.perk == null) return s
  const pe = _perkEffectByIndex.get(s.perk)
  if (!pe) return s
  return { ...s, effect: pe.effect, il: pe.rawIl }
})

export const encyclopedia = _encyclopedia

const _demoSave = demoSaveJson as unknown as SaveSnapshot
_demoSave.storeLayout = normalizeLayoutProps(_demoSave.storeLayout ?? [])
export const demoSave = _demoSave

export const skillGraph = skillGraphJson as unknown as SkillTreeGraph

export const exploits = exploitsJson as unknown as ExploitCandidate[]

// 30 IL-extracted manufacturing recipes (index == manufacturingProducts[].id).
export const manufacturingRecipes = (manufacturingRecipesJson as { recipes: ManufacturingRecipe[] }).recipes

// pre-indexed maps for fast lookup
export const productById = new Map<number, Product>(encyclopedia.products.map((p) => [p.id, p]))
export const tierById = new Map<number, Tier>(encyclopedia.tiers.map((t) => [t.id, t]))
export const groupById = new Map<number, ProductGroup>(encyclopedia.productGroups.map((g) => [g.id, g]))
export const buildableById = new Map<number, Buildable>(encyclopedia.buildables.map((b) => [b.id, b]))
export const containerByBuildableName = new Map<string, Container>(encyclopedia.containers.map((c) => [c.buildableName, c]))
export const containerByID = new Map<number, Container>(encyclopedia.containers.map((c) => [c.containerID, c]))

/**
 * Look up the Container record (buildableName, shelfLength/Width/Height,
 * containerClass, cost, …) for a given containerID / buildableId.
 *
 * In Supermarket Together save propdata the 2nd pipe-field is the
 * containerID, and for all 42 encyclopedia containers containerID ===
 * buildable.id (verified). Unmapped ids (e.g. 198, 200, 216 decoration
 * props) return undefined and should be rendered as "裝飾物 #ID".
 */
export function containerInfoFor(containerID: number): Container | undefined {
  return containerByID.get(containerID)
}

/**
 * containerClass → human label + color. Mirrors the encyclopedia's
 * containerClass field: 0=貨架, 1=冰箱, 2=冷凍櫃, 3=農產, 4=釘板,
 * 69=置物, 99=結帳. Unmapped → 'decoration'.
 */
export type ContainerClassKey =
  | 'shelf' | 'fridge' | 'freezer' | 'produce' | 'pegboard' | 'storage' | 'checkout' | 'decoration'

export const CONTAINER_CLASS_META: Record<ContainerClassKey, { labelZh: string; labelEn: string; color: string }> = {
  shelf:       { labelZh: '貨架',     labelEn: 'Shelf',         color: '#10b981' }, // emerald-500
  fridge:      { labelZh: '冰箱',     labelEn: 'Fridge',        color: '#0ea5e9' }, // sky-500
  freezer:     { labelZh: '冷凍櫃',   labelEn: 'Freezer',       color: '#06b6d4' }, // cyan-500
  produce:     { labelZh: '農產品',   labelEn: 'Produce',       color: '#84cc16' }, // lime-500
  pegboard:    { labelZh: '釘板架',   labelEn: 'Pegboard',      color: '#f59e0b' }, // amber-500
  storage:     { labelZh: '置物架',   labelEn: 'Storage',       color: '#71717a' }, // zinc-500
  checkout:    { labelZh: '結帳台',   labelEn: 'Checkout',      color: '#a855f7' }, // purple-500
  decoration:  { labelZh: '裝飾物',   labelEn: 'Decoration',    color: '#94a3b8' }, // slate-400
}

export function containerClassKeyFor(containerID: number): ContainerClassKey {
  const c = containerByID.get(containerID)
  if (!c) return 'decoration'
  switch (c.containerClass) {
    case 0: return 'shelf'
    case 1: return 'fridge'
    case 2: return 'freezer'
    case 3: return 'produce'
    case 4: return 'pegboard'
    case 69: return 'storage'
    case 99: return 'checkout'
    default: return 'decoration'
  }
}

export function productName(id: number): string {
  return productById.get(id)?.name.en ?? `#${id}`
}

export function productZhName(id: number): string {
  return productById.get(id)?.name.zhHant ?? `#${id}`
}
