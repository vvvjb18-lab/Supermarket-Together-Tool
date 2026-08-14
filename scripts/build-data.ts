// One-shot data compiler: reads upload/ files and emits src/lib/data/encyclopedia.json
// Run with: bun run scripts/build-data.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const UPLOAD = '/home/z/my-project/upload'
const OUT = '/home/z/my-project/src/lib/data'
mkdirSync(OUT, { recursive: true })

// ---------- helpers ----------
function parseTsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''))
    return row
  })
}

function num(s: string | undefined | null): number | null {
  if (s === undefined || s === null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function splitInts(s: string, sep = '-'): number[] {
  if (!s) return []
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter((x) => x !== '')
    .map((x) => {
      const n = parseInt(x, 10)
      return Number.isNaN(n) ? -1 : n
    })
}

// ---------- products ----------
const productsTsv = readFileSync(join(UPLOAD, 'products.tsv'), 'utf8')
const productRows = parseTsv(productsTsv)
const products = productRows.map((r) => {
  const colX = num(r.colX) ?? 0.1
  const colY = num(r.colY) ?? 0.1
  const colZ = num(r.colZ) ?? 0.1
  const trueX = num(r.trueX)
  const trueY = num(r.trueY)
  const trueZ = num(r.trueZ)
  const hasTrue = r.hasTrueCollider === '1' || r.hasTrueCollider === 'true'
  return {
    id: num(r.id) ?? 0,
    name: { en: r.name_en ?? '', zhHant: r.name_zhHant ?? '', zhHans: r.name_zhHans ?? r.name_zhHant ?? '' },
    brand: r.brand ?? '',
    group: null as number | null,
    groupName: { en: r.group_en ?? '', zhHant: r.group_zhHant ?? '' },
    basePricePerUnit: num(r.basePrice) ?? 0,
    playerPrice: num(r.basePrice) ?? 0,
    tier: num(r.tier) ?? 0,
    tierName: r.tierName ?? '',
    category: { en: r.category_en ?? '', zhHant: r.category_zhHant ?? '' },
    maxItemsPerBox: num(r.maxItemsPerBox) ?? 1,
    isStackable: r.isStackable === '1' || r.isStackable === 'true' || r.isStackable === '✓',
    containerClass: num(r.containerClass) ?? 0,
    boxClass: num(r.boxClass) ?? 0,
    hasTrueCollider: hasTrue,
    colliderSize: { x: colX, y: colY, z: colZ },
    colliderCenter: { x: 0, y: 0, z: 0 },
    trueColliderSize:
      hasTrue && trueX != null && trueY != null && trueZ != null
        ? { x: trueX, y: trueY, z: trueZ }
        : null,
  }
})

// ---------- necessities ----------
const necessitiesJson = JSON.parse(readFileSync(join(UPLOAD, 'necessities.json'), 'utf8'))
const necessities = necessitiesJson.map((n: any, i: number) => ({
  index: n.index ?? i,
  name: { en: n.name?.en ?? '', zhHant: n.name?.zhHant ?? '' },
  rawIds: n.rawIds ?? '',
  rawTokens: splitInts(n.rawIds ?? '', '-'),
  productIds: (n.productIds ?? []).map((x: any) => Number(x)),
  groups: n.groups ?? {},
}))

// ---------- customers (full 11-weight arrays parsed from md) ----------
const customersTsv = readFileSync(join(UPLOAD, 'customers.tsv'), 'utf8')
const customerRows = parseTsv(customersTsv)
const customersBase = customerRows.map((r) => ({
  index: num(r.id) ?? 0,
  compensatedChances: [1, 0, 0] as number[],
  necessitiesChances: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as number[],
  premiumIndexes: [] as number[],
  topSummary: r.top_necessities_summary ?? '',
}))

// ---------- parse md for tables & key-values ----------
const md = readFileSync(join(UPLOAD, 'game_encyclopedia.md'), 'utf8')

function extractTable(sectionTitle: string): string[][] {
  const re = new RegExp(`## ${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, '')
  const m = md.match(re)
  if (!m) return []
  const start = m.index! + m[0].length
  const rest = md.slice(start)
  const lines: string[] = []
  for (const line of rest.split('\n')) {
    if (line.trim().startsWith('|')) lines.push(line)
    else if (lines.length > 0) break
  }
  if (lines.length < 2) return []
  const rows = lines.map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
  const sepIdx = rows.findIndex((r) => r.every((c) => /^-+:?$|^:?-+:?$|^:?-+$/.test(c)))
  const body = sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows.slice(1)
  return [rows[0], ...body]
}

// tiers
const tiersTable = extractTable('Tiers')
const tiers = tiersTable.slice(1).map((row) => ({
  id: num(row[0]) ?? 0,
  name: row[1] ?? '',
  category: { en: row[2] ?? '', zhHans: row[3] ?? '', zhHant: row[4] ?? '' },
  inflation: num(row[5]) ?? 1,
  group: num(row[6]) ?? 0,
}))

// product groups
const groupsTable = extractTable('Product Groups')
const productGroups = groupsTable.slice(1).map((row) => {
  const colorParts = (row[4] ?? '').split(',').map((x) => parseFloat(x.trim()))
  return {
    id: num(row[0]) ?? 0,
    name: { en: row[1] ?? '', zhHans: row[2] ?? '', zhHant: row[3] ?? '' },
    color:
      colorParts.length >= 3
        ? { r: colorParts[0], g: colorParts[1], b: colorParts[2], a: colorParts[3] ?? 1 }
        : { r: 0.5, g: 0.5, b: 0.5, a: 1 },
  }
})

// enrich products with group/category from tier
const tierById = new Map(tiers.map((t) => [t.id, t]))
const groupById = new Map(productGroups.map((g) => [g.id, g]))
for (const p of products) {
  const t = tierById.get(p.tier)
  if (t) {
    p.group = t.group
    p.category = t.category
    p.tierName = t.name
    const g = groupById.get(t.group)
    if (g) p.groupName = g.name
  }
}

// customer types — full 11-weight array from md
const custTable = extractTable('Customer Types')
for (const row of custTable.slice(1)) {
  const idx = num(row[0]) ?? -1
  if (idx < 0) continue
  const comp = (row[1] ?? '').split(',').map((x) => parseFloat(x.trim()))
  const nec = (row[2] ?? '').split(',').map((x) => parseFloat(x.trim()))
  const prem = (row[3] ?? '')
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x))
  const c = customersBase[idx]
  if (c) {
    c.compensatedChances = comp
    c.necessitiesChances = nec
    c.premiumIndexes = prem
  }
}

// seasons
const seasonsTable = extractTable('Seasons')
const seasons = seasonsTable.slice(1).map((row) => ({
  index: num(row[0]) ?? 0,
  name: { en: row[1] ?? '', zhHant: row[2] ?? '' },
  productIds: splitInts(row[3] ?? '', '-'),
}))

// containers
const contTable = extractTable('Containers')
const containers = contTable.slice(1).map((row) => ({
  containerClass: num(row[0]) ?? 0,
  containerID: num(row[1]) ?? 0,
  cost: num(row[2]) ?? 0,
  shelfLength: num(row[3]) ?? 0,
  shelfWidth: num(row[4]) ?? 0,
  shelfHeight: num(row[5]) ?? 0,
  energyCost: num(row[6]) ?? 0,
  energyWorkingHours: num(row[7]) ?? 0,
  employeeHappiness: num(row[8]) ?? 0,
  isVolumeRestricted: row[9] === '✓' || row[9] === '1' || row[9] === 'true',
  productVolumeLimit: num(row[10]) ?? 0,
  buildableName: row[11] ?? '',
}))

// skills
const skillTable = extractTable('Skill Tree')
const skills = skillTable.slice(1).map((row) => ({
  id: row[0] ?? '',
  name: { en: row[1] ?? '', zhHans: row[2] ?? '', zhHant: row[3] ?? '' },
  description: { en: row[4] ?? '', zhHans: row[5] ?? '', zhHant: row[6] ?? '' },
  effect: row[7] ?? '',
  il: row[8] ?? '',
  perk: num(row[9]) ?? null,
}))

// buildables
const buildTable = extractTable('Buildables')
const buildables = buildTable.slice(1).map((row) => ({
  id: num(row[0]) ?? 0,
  name: { en: row[1] ?? '', zhHans: row[2] ?? '', zhHant: row[3] ?? '' },
}))

// manufacturing buildables
const mfgBuildTable = extractTable('Manufacturing Buildables')
const manufacturingBuildables = mfgBuildTable.slice(1).map((row) => ({
  id: num(row[0]) ?? 0,
  name: { en: row[1] ?? '', zhHans: row[2] ?? '', zhHant: row[3] ?? '' },
}))

// achievements
const achTable = extractTable('Achievements')
const achievements = achTable.slice(1).map((row) => ({
  steamId: row[0] ?? '',
  name: row[1] ?? '',
  globalPercent: num(row[2]) ?? 0,
}))

// achievement stats
const achStatsTable = extractTable('Achievement Stats')
const achievementStats = achStatsTable.slice(1).map((row) => ({
  index: num(row[0]) ?? 0,
  description: row[1] ?? '',
}))

// employee tasks
const empTaskTable = extractTable('Employee Tasks')
const employeeTasks = empTaskTable.slice(1).map((row) => ({
  id: num(row[0]) ?? 0,
  key: row[1] ?? '',
  name: { en: row[2] ?? '', zhHans: row[3] ?? '', zhHant: row[4] ?? '' },
  color: row[5] ?? '#ffffff',
}))

// manufacturing products — header: id | en | zhHans | zhHant | linkedProduct | itemsPerBox | stack | size
const mfgTable = extractTable('Manufacturing Products')
const manufacturingProducts = mfgTable.slice(1).map((row) => {
  const sizeParts = (row[7] ?? '').split(',').map((x) => parseFloat(x.trim()))
  return {
    id: num(row[0]) ?? 0,
    name: { en: row[1] ?? '', zhHans: row[2] ?? '', zhHant: row[3] ?? '' },
    linkedProductID: num(row[4]) ?? 0,
    itemsPerBox: num(row[5]) ?? 1,
    isStackable: row[6] === '✓' || row[6] === '1' || row[6] === 'true',
    size: sizeParts.length >= 3 ? { x: sizeParts[0], y: sizeParts[1], z: sizeParts[2] } : { x: 0.1, y: 0.1, z: 0.1 },
  }
})

// current store layout
const layoutTable = extractTable('Current Store Layout')
const storeLayout = layoutTable.slice(1).map((row) => {
  const invStr = row[6] ?? ''
  const inventory: { product: number; count: number }[] = []
  for (const pair of invStr.split(';')) {
    const [p, c] = pair.split(':').map((x) => x.trim())
    if (p === '' || p === undefined) continue
    const pid = parseInt(p, 10)
    const cnt = parseInt(c, 10)
    if (Number.isFinite(pid)) inventory.push({ product: pid, count: Number.isFinite(cnt) ? cnt : 0 })
  }
  return {
    index: num(row[0]) ?? 0,
    buildableId: num(row[1]) ?? 0,
    posX: num(row[2]) ?? 0,
    posZ: num(row[3]) ?? 0,
    rotation: num(row[4]) ?? 0,
    angle: num(row[5]) ?? 0,
    inventory,
  }
})

const premiumProducts = [173, 175, 186, 287, 296, 297, 299]

function extractBullets(sectionTitle: string): Record<string, string> {
  const re = new RegExp(`## ${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, '')
  const m = md.match(re)
  if (!m) return {}
  const start = m.index! + m[0].length
  const rest = md.slice(start)
  const out: Record<string, string> = {}
  for (const line of rest.split('\n')) {
    if (line.startsWith('## ')) break
    const bm = line.match(/^\s*-\s*\*\*([^*]+)\*\*\s*:\s*(.*)$/)
    if (bm) out[bm[1].trim()] = bm[2].trim()
  }
  return out
}

const config = {
  employeeConfig: extractBullets('Employee Config'),
  gameTuning: extractBullets('Game Tuning'),
  employeeProgression: extractBullets('Employee Progression'),
  temperatureSystem: extractBullets('Temperature System'),
  perkSystem: extractBullets('Perk System'),
  employeeSpeedFormula: extractBullets('Employee Speed Formula'),
  upgradePricing: extractBullets('Upgrade Pricing'),
  manufacturing: extractBullets('Manufacturing'),
  upgrades: extractBullets('Upgrades'),
}

const encyclopedia = {
  meta: {
    game: 'Supermarket Together',
    steamAppId: 2709570,
    unityVersion: '2023.2.22f1',
    source: 'game_encyclopedia.md + products.tsv + necessities.json + customers.tsv',
    counts: {
      products: products.length,
      tiers: tiers.length,
      productGroups: productGroups.length,
      manufacturingProducts: manufacturingProducts.length,
      achievements: achievements.length,
      employeeTasks: employeeTasks.length,
      containers: containers.length,
      customerTypes: customersBase.length,
      skills: skills.length,
      buildables: buildables.length,
      necessities: necessities.length,
      seasons: seasons.length,
      storeLayoutProps: storeLayout.length,
      premiumProducts: premiumProducts.length,
    },
  },
  products,
  tiers,
  productGroups,
  necessities,
  seasons,
  customerTypes: customersBase,
  containers,
  skills,
  buildables,
  manufacturingBuildables,
  achievements,
  achievementStats,
  employeeTasks,
  manufacturingProducts,
  premiumProducts,
  config,
  storeLayout,
  layoutMeta: {
    totalProps: storeLayout.length,
    totalInventoryUnits: storeLayout.reduce(
      (sum, p) => sum + p.inventory.reduce((s, i) => s + Math.max(0, i.count), 0),
      0,
    ),
  },
}

writeFileSync(join(OUT, 'encyclopedia.json'), JSON.stringify(encyclopedia, null, 2))

// demo save snapshot derived from storeLayout
const inventoryByProduct = new Map<number, number>()
for (const prop of storeLayout) {
  for (const inv of prop.inventory) {
    if (inv.product < 0) continue
    inventoryByProduct.set(inv.product, (inventoryByProduct.get(inv.product) ?? 0) + Math.max(0, inv.count))
  }
}
const demoSave = {
  source: 'demo:derived-from-storeLayout',
  parseStatus: 'demo' as const,
  confidence: 'demo' as const,
  detectedFields: ['storeLayout', 'inventoryByProduct'],
  unknownFields: [] as string[],
  money: 0,
  franchisePoints: 0,
  day: 1,
  unlockedProductTiers: Array.from(new Set(products.map((p) => p.tier))).sort((a, b) => a - b),
  unlockedProducts: products.map((p) => p.id),
  productPlayerPricing: {} as Record<number, number>,
  perks: [] as string[],
  extraUpgrades: [] as string[],
  employees: [] as any[],
  storeLayout,
  inventoryByProduct: Object.fromEntries(inventoryByProduct),
  storageInventory: {} as Record<number, number>,
  weather: 'unknown',
  temperature: [] as number[],
  roomId: null as string | null,
  playerSlots: 0,
  parsedAt: new Date().toISOString(),
}
writeFileSync(join(OUT, 'demo-save.json'), JSON.stringify(demoSave, null, 2))

console.log('Encyclopedia written:', OUT + '/encyclopedia.json')
console.log('Counts:', encyclopedia.meta.counts)
console.log('Demo save written:', OUT + '/demo-save.json')
