// Core domain types for Supermarket Together Lab.
// All shapes mirror the generated encyclopedia.json + demo-save.json.

export interface LocalizedName {
  en: string
  zhHans: string
  zhHant: string
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export interface Product {
  id: number
  name: LocalizedName
  brand: string
  group: number | null
  groupName: { en: string; zhHant: string }
  basePricePerUnit: number
  playerPrice: number
  tier: number
  tierName: string
  category: { en: string; zhHant: string }
  maxItemsPerBox: number
  isStackable: boolean
  containerClass: number
  boxClass: number
  hasTrueCollider: boolean
  colliderSize: Vec3
  colliderCenter: Vec3
  trueColliderSize: Vec3 | null
}

export interface Tier {
  id: number
  name: string
  category: LocalizedName
  inflation: number
  group: number
}

export interface ProductGroup {
  id: number
  name: LocalizedName
  color: RGBA
}

export interface Necessity {
  index: number
  name: { en: string; zhHant: string }
  rawIds: string
  rawTokens: number[] // preserves duplicates (e.g. Salt = [4,4,4,4,4])
  productIds: number[] // unique
  groups: Record<string, number>
}

export interface Season {
  index: number
  name: { en: string; zhHant: string }
  productIds: number[]
}

export interface CustomerType {
  index: number
  compensatedChances: number[] // length 3
  necessitiesChances: number[] // length 11
  premiumIndexes: number[]
  topSummary: string
}

export interface Container {
  containerClass: number
  containerID: number
  cost: number
  shelfLength: number
  shelfWidth: number
  shelfHeight: number
  energyCost: number
  energyWorkingHours: number
  employeeHappiness: number
  isVolumeRestricted: boolean
  productVolumeLimit: number
  buildableName: string
}

export interface Skill {
  id: string
  name: LocalizedName
  description: LocalizedName
  effect: string
  il: string
  perk: number | null
}

export interface Buildable {
  id: number
  name: LocalizedName
}

export interface Achievement {
  steamId: string
  /** Player-facing Steam display name (English). */
  name: string
  /** Steam global unlock percentage (0-100). */
  globalPercent: number
  /** Steam achievement description (the "how to unlock" text shown to players). */
  description?: string
  /** Traditional Chinese translation of the display name. */
  zhHant?: string
  /** Traditional Chinese translation of the description. */
  zhHantDesc?: string
  /** True if the achievement requires collective/co-op progress. */
  collective?: boolean
  /** Layout restriction if any ('classic' | 'plaza'). */
  layout?: 'classic' | 'plaza'
}

export interface AchievementStat {
  index: number
  description: string
}

export interface EmployeeTask {
  id: number
  key: string
  name: LocalizedName
  color: string
}

// ---------- Skill tree graph (extracted from Unity UI hierarchy) ----------

export interface SkillGraphNode {
  id: string // 'perk0' | 'cat0' | ...
  type: 'perk' | 'category'
  index: number
  name_en: string
  name_zhHant?: string
  raw_name: string
  skill_id?: string // 'skill1' etc. (only for non-placeholder perks)
  desc_en?: string
  is_placeholder: boolean
  x: number
  y: number
  size?: number
}

export interface SkillGraphEdge {
  line: number
  from: string
  to: string
  from_type: 'perk' | 'category'
  to_type: 'perk' | 'category'
}

export interface PerkToCategoryEntry {
  category_id: string
  category_name: string
  distance: number
}

export interface SkillTreeGraph {
  _meta: {
    source: string
    extraction_method: string
    coordinate_system: string
    total_nodes: number
    total_edges: number
    note: string
  }
  nodes: SkillGraphNode[]
  edges: SkillGraphEdge[]
  adjacency: Record<string, string[]>
  perk_to_category: Record<string, PerkToCategoryEntry>
  unmatched_lines: Array<{
    line: number
    ep1: [number, number]
    ep2: [number, number]
    p1_id: string | null
    d1: number
    p2_id: string | null
    d2: number
  }>
}

export interface ManufacturingProduct {
  id: number
  name: LocalizedName
  linkedProductID: number
  itemsPerBox: number
  isStackable: boolean
  size: Vec3
}

/**
 * A single manufacturing recipe (index 0..29 == manufacturingProducts[].id).
 * `baseGroups` is a list of slots; each slot is a list of alternative product
 * ids (the game picks one per slot). `combinable` lists the optional "general
 * products" a player can add. Extracted from ManufacturingBase .ctor IL.
 */
export interface ManufacturingRecipe {
  id: number
  baseGroups: number[][]
  combinable: number[]
  itemsPerBox: number
}

export interface LayoutProp {
  index: number
  /**
   * Numeric id of the placed buildable. In save propdata this is the 2nd
   * pipe-field (`zoneCode|containerID|posX|rot|posZ|angle`). For known
   * containers containerID === buildable.id (verified across all 42
   * encyclopedia containers). For decoration/unmapped ids (198, 200, 216…)
   * there is no matching container/buildable and the prop is rendered as
   * "裝飾物 #ID".
   */
  buildableId: number
  /** Same value as buildableId; kept as a separate field for clarity. */
  containerID: number
  /** Zone code from propdata parts[0]: 0=主店, 1=倉儲, 2=結帳, 3=自助結帳. */
  zoneCode: number
  posX: number
  posZ: number
  rotation: number
  angle: number
  inventory: { product: number; count: number }[]
}

export interface Encyclopedia {
  meta: {
    game: string
    steamAppId: number
    unityVersion: string
    source: string
    counts: Record<string, number>
  }
  products: Product[]
  tiers: Tier[]
  productGroups: ProductGroup[]
  necessities: Necessity[]
  seasons: Season[]
  customerTypes: CustomerType[]
  containers: Container[]
  skills: Skill[]
  buildables: Buildable[]
  manufacturingBuildables: Buildable[]
  achievements: Achievement[]
  achievementStats: AchievementStat[]
  employeeTasks: EmployeeTask[]
  manufacturingProducts: ManufacturingProduct[]
  premiumProducts: number[]
  config: Record<string, Record<string, string>>
  storeLayout: LayoutProp[]
  layoutMeta: { totalProps: number; totalInventoryUnits: number }
}

// ---------- save snapshot ----------
export type Confidence = 'confirmed' | 'proxy' | 'unverified' | 'exploit' | 'demo' | 'needs-save' | 'needs-runtime'

export interface SaveSnapshot {
  source: string
  parseStatus: 'ok' | 'demo' | 'partial' | 'failed' | 'empty'
  confidence: Confidence
  detectedFields: string[]
  unknownFields: string[]
  money: number
  franchisePoints: number
  day: number
  unlockedProductTiers: number[]
  unlockedProducts: number[]
  productPlayerPricing: Record<number, number>
  perks: string[]
  extraUpgrades: string[]
  employees: EmployeeRecord[]
  storeLayout: LayoutProp[]
  inventoryByProduct: Record<number, number>
  storageInventory: Record<number, number>
  weather: string
  temperature: number[]
  roomId: string | null
  playerSlots: number
  parsedAt: string

  // ---- ES3-only extras (populated when parsing a real .es3 save) ----
  /** Total franchise XP accumulated (FranchiseExperience field). */
  franchiseExperience?: number
  /** Outstanding loan principal (LoanAmount). */
  loanAmount?: number
  /** Daily loan repayment (LoanPaymentPerDay). */
  loanPaymentPerDay?: number
  /** Game difficulty setting 1-5 (Difficulty). */
  difficulty?: number
  /** Store name chosen by the player (StoreName). */
  storeName?: string
  /** Supermarket brand name (SupermarketName). */
  supermarketName?: string
  /** Supermarket brand color RGBA (SupermarketColor). */
  supermarketColor?: { r: number; g: number; b: number; a: number }
  /** Last franchise level awarded (LastAwardedLevel). */
  lastAwardedLevel?: number
  /** Number of floor-expansion slots purchased (SpaceBought). */
  spaceBought?: number
  /** Number of storage-expansion slots purchased (StorageBought). */
  storageBought?: number
  /** Per-tier price inflation multipliers (TierInflation). */
  tierInflation?: number[]
  /** Per-recipe manufacturing unlock flags (ManufacUnlockedRecipes). */
  manufacUnlockedRecipes?: boolean[]
  /** Player-owned manufacturing recipes (ManufacPlayerRecipes). */
  manufacPlayerRecipes?: string[]
  /** Outstanding supplier invoices as raw pipe-strings (CurrentInvoicesArray). */
  invoices?: string[]
  /** Door open/closed states (DoorStates). */
  doorStates?: number[]
  /** Addon purchase flags (AddonsBought). */
  addonsBought?: boolean[]
  /** Store space upgrade flags (StoreSpaceUpgrades). */
  storeSpaceUpgrades?: boolean[]
  /** Storage space upgrade flags (StorageSpaceUpgrades). */
  storageSpaceUpgrades?: boolean[]
  /** Total count of decoration props (decopropdata + decopaintabledata). */
  decoPropsCount?: number
  /** Employee reroll counter (HiredRerollTimes). */
  hiredRerollTimes?: number
  /** Whether employees have ever been rerolled (HiredHasRerolled). */
  hiredHasRerolled?: boolean
  /** Store layout variant (Layout: 0=classic, 1=plaza). */
  layout?: number
  /** Indices of unlocked skills (from skill_unlocks.unlockedIndices). */
  skillUnlocks?: number[]
  /** Perk-index → skill-index mapping (from skill_unlocks.perkIndexToSkill). */
  perkIndexToSkill?: number[]
  /**
   * Full daily-statistics history parsed from the `stats_history` top-level
   * key of the v1.1 extracted save.json (source: StoreFile0stats.es3).
   * Present only when the upload carries that key.
   */
  statsHistory?: StatsHistory
}

export interface EmployeeRecord {
  id: string
  name: string
  salary: number
  skills: Record<string, { level: number; xp: number }>
  task: number // employeeTasks id
}

// ---------- calculation result wrapper ----------
export interface CalcResult<T> {
  value: T
  formula: string
  sources: string[]
  confidence: Confidence
  note?: string
}

// ---------- exploit candidate (analyst-curated; lives in data/exploits.json) ----------
export type ExploitCategory = 'confirmed-monster' | 'proxy-strong' | 'suspicious' | 'meme-trap'

export interface ExploitCandidate {
  id: string
  title: string
  category: ExploitCategory
  confidence: Confidence
  evidence: string[]
  formula: string
  recommendation: string
  risk: string
  productIds?: number[]
}

// ---------- room sync ----------
export type RoomRole = 'host' | 'member'

export interface RoomMember {
  id: string
  name: string
  role: RoomRole
  color: string
  cursor?: { x: number; y: number; view?: string } | null
  lastSeen: number
}

export interface TaskAssignment {
  id: string
  playerId: string
  category: 'buy' | 'restock' | 'manufacturing' | 'checkout' | 'security' | 'other'
  label: string
  done: boolean
  assignedTo?: string
  productId?: number
  quantity?: number
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  assignedTo?: string
}

export interface PriceExperiment {
  id: string
  productId: number
  oldPrice: number
  newPrice: number
  observedSales: string
  observedComplaints: string
  conclusion: string
  updatedAt: number
  updatedBy: string
}

export interface Room {
  id: string
  code: string
  name: string
  createdAt: number
  members: RoomMember[]
  snapshot: SaveSnapshot | null
  checklist: ChecklistItem[]
  tasks: TaskAssignment[]
  pricePlan: PriceExperiment[]
  restockPlan: RestockItem[]
  shelfAssignments: Record<string, string> // propIndex -> playerId
  skillVotes: Record<string, string[]> // skillId -> playerIds
  events: RoomEvent[]
}

export interface RestockItem {
  id: string
  productId: number
  boxes: number
  units: number
  costEstimate: number
  revenueProxy: number
  reason: string
  assignedTo?: string
}

export interface RoomEvent {
  id: string
  ts: number
  playerId: string
  type: string
  payload: Record<string, unknown>
}

// ---------- daily statistics history (StoreFile0stats.es3) ----------
// The game writes one stats block per game day into a separate, cleartext
// `StoreFile0stats.es3` next to the main save. Key format is `day{N}stat{Name}`.
// Each day carries 28 scalar + 4 list values (per-Product arrays, indexed by
// product id). See save-analyzer/extract_stats_history.py for the extractor.
//
// Two game-side key typos are normalised here:
//   'omplainedAboutFilth'      -> complainedAboutFilth  (missing leading 'c')
//   'totalsProductsSoldThisDay'-> totalProductsSoldThisDay (extra 's')
// And `totalProductsAcquiredThisDay` is a known game bug: the IL second loop
// re-sums productsSold (not productsAcquired), so it always equals
// totalProductsSoldThisDay — do NOT use it to derive purchase volume.

export interface DailyStat {
  day: number
  customers: number
  /** Net daily profit (revenue − expenses) as recorded by the game. */
  benefits: number
  /** Cumulative franchise XP (NOT reset daily). */
  franchiseExperience: number
  timesRobbed: number
  moneySpentOnProducts: number
  notFoundProductsCount: number
  tooExpensiveProductsCount: number
  lightCost: number
  rentCost: number
  employeesCost: number
  /** Normalised from the bug key 'omplainedAboutFilth'. */
  complainedAboutFilth: number
  /** Normalised from the bug key 'totalsProductsSoldThisDay'. */
  totalProductsSoldThisDay: number
  /** KNOWN GAME BUG: always equals totalProductsSoldThisDay (unreliable). */
  totalProductsAcquiredThisDay: number
  productsPlacedInContainers: number
  totalBoxesRecycled: number
  totalBalesRecycled: number
  totalBoxesAddedToBaler: number
  totalTrashCollected: number
  stolenProductsCollectedFromFloor: number
  analyzedCustomers: number
  caughtThievesWhenAnalyzing: number
  salesMade: number
  extraProductsSoldThankToSales: number
  paidInvoices: number
  onlineOrdersMade: number
  moneyMadeByOnlineOrders: number
  repairedDevices: number
  bystandersConvertedIntoCustomers: number
  /** Per-product units sold this day (index = product id). */
  productsSoldList: number[]
  /** Per-product units acquired this day (index = product id) — UNRELIABLE (game bug). */
  productsAcquiredList: number[]
  /** Per-product revenue this day (index = product id). */
  revenuePerProductSoldList: number[]
  /** Per-product purchase cost this day (index = product id). */
  costPerProductAcquiredList: number[]
}

export interface StatsHistory {
  source: string
  days: number[]
  scalarStats: string[]
  listStats: string[]
  /** day (string) -> DailyStat */
  data: Record<string, DailyStat>
  /** Length of the per-product list arrays (== product count, usually 339). */
  productCount: number
  parseWarnings: string[]
}
