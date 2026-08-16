// ============================================================================
// Data Value Audit — Step 3: data-usage-audit.ts
// 掃描 src/**/*.ts(x) 對每個資料資產 / encyclopedia 欄位的引用。
// 找出「完全沒被代碼引用」的數據（＝浪費的數據）。
//
// 執行：node scripts/audit/data-usage-audit.ts
// 輸出：scripts/audit/_out/usage-audit.json
// ============================================================================
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const CWD = process.cwd()
const SRC = join(CWD, 'src')
const OUT_DIR = join(CWD, 'scripts', 'audit', '_out')

interface AssetDef {
  asset: string
  kind: 'bundled' | 'mined'
  tokens: string[]
}

// 網站打包數據：用「導出符號 / 檔名字串」做引用判定
const BUNDLED_ASSETS: AssetDef[] = [
  { asset: 'encyclopedia.json', kind: 'bundled', tokens: ['encyclopedia', 'productById', 'tierById', 'groupById', 'buildableById', 'containerByBuildableName', 'containerByID', 'containerInfoFor', 'productName', 'productZhName', 'CONTAINER_CLASS_META', 'containerClassKeyFor'] },
  { asset: 'demo-save.json', kind: 'bundled', tokens: ['demoSave', 'demo-save.json'] },
  { asset: 'skill-graph.json', kind: 'bundled', tokens: ['skillGraph', 'skill-graph.json'] },
  { asset: 'exploits.json', kind: 'bundled', tokens: ['exploits.json', 'ExploitCandidate', 'exploits'] },
  { asset: 'tier-inflation.json', kind: 'bundled', tokens: ['tierInflationTable', 'TIER_INFLATION_VALUES', 'tier-inflation.json'] },
  { asset: 'perks.tsv', kind: 'bundled', tokens: ['perks.tsv', 'perks_table.tsv'] },
  { asset: 'demo-stats.json (public)', kind: 'bundled', tokens: ['demo-stats.json', 'demoStats'] },
  { asset: 'level0-geometry.json', kind: 'bundled', tokens: ['level0-geometry', 'level0Geometry'] },
]

// save-analyzer 挖掘產物：用「檔名 stem」搜尋 src 是否提到（有遷移/回流線索）
const MINED_ASSETS: AssetDef[] = [
  { asset: 'stats_history.json', kind: 'mined', tokens: ['stats_history', 'statsHistory', 'stats_history.json'] },
  { asset: 'perk_effects_final.json', kind: 'mined', tokens: ['perk_effects_final', 'perk_effects_final.json', 'perkEffects'] },
  { asset: 'perk_effects_v2.json', kind: 'mined', tokens: ['perk_effects_v2'] },
  { asset: 'perk_effects.json', kind: 'mined', tokens: ['perk_effects.json'] },
  { asset: 'manufacturing_arbitrage.py (30 recipes)', kind: 'mined', tokens: ['manufacturing_arbitrage', 'baseRecipes', 'combinableVariations'] },
  { asset: 'store_layout.json', kind: 'mined', tokens: ['store_layout.json', 'storeLayout'] },
  { asset: 'buildables.json', kind: 'mined', tokens: ['buildables.json'] },
  { asset: 'steam_achievements.json', kind: 'mined', tokens: ['steam_achievements.json', 'steamAchievements'] },
  { asset: 'game-schema.json', kind: 'mined', tokens: ['game-schema.json'] },
  { asset: 'structure_segments.json', kind: 'mined', tokens: ['structure_segments'] },
  { asset: 'taxonomy_level0.json', kind: 'mined', tokens: ['taxonomy_level0'] },
  { asset: 'necessity_map.txt', kind: 'mined', tokens: ['necessity_map', 'necessityMap'] },
  { asset: 'perks_in_perks_go.json', kind: 'mined', tokens: ['perks_in_perks_go'] },
  { asset: 'ilconst.json', kind: 'mined', tokens: ['ilconst'] },
  { asset: 'discover_static.json', kind: 'mined', tokens: ['discover_static'] },
  { asset: 'skill_tree_graph_v2.json', kind: 'mined', tokens: ['skill_tree_graph_v2'] },
  { asset: 'game_encyclopedia.json (raw)', kind: 'mined', tokens: ['game_encyclopedia.json'] },
]

// encyclopedia 欄位級：欄位名 → 用於匹配的代碼 token
const ENCYCLOPEDIA_FIELDS: { field: string; tokens: string[] }[] = [
  { field: 'products', tokens: ['encyclopedia.products', 'productById', 'productName', 'productZhName'] },
  { field: 'tiers', tokens: ['encyclopedia.tiers', 'tierById', 'TIER_INFLATION', 'tierInflation'] },
  { field: 'productGroups', tokens: ['encyclopedia.productGroups', 'groupById', 'productGroup'] },
  { field: 'necessities', tokens: ['encyclopedia.necessities', 'necessities'] },
  { field: 'seasons', tokens: ['encyclopedia.seasons', 'seasons', 'getSeason'] },
  { field: 'customerTypes', tokens: ['encyclopedia.customerTypes', 'customerTypes'] },
  { field: 'containers', tokens: ['encyclopedia.containers', 'containerByBuildableName', 'containerByID', 'containerInfoFor', 'CONTAINER_CLASS_META'] },
  { field: 'skills', tokens: ['encyclopedia.skills', 'skillGraph', 'skillEngine'] },
  { field: 'buildables', tokens: ['encyclopedia.buildables', 'buildableById', 'buildable'] },
  { field: 'manufacturingBuildables', tokens: ['encyclopedia.manufacturingBuildables', 'manufacturingBuildables'] },
  { field: 'achievements', tokens: ['encyclopedia.achievements', 'achievements'] },
  { field: 'achievementStats', tokens: ['encyclopedia.achievementStats', 'achievementStats'] },
  { field: 'employeeTasks', tokens: ['encyclopedia.employeeTasks', 'employeeTasks'] },
  { field: 'manufacturingProducts', tokens: ['encyclopedia.manufacturingProducts', 'manufacturingProducts'] },
  { field: 'premiumProducts', tokens: ['encyclopedia.premiumProducts', 'premiumProducts'] },
  { field: 'config', tokens: ['encyclopedia.config', 'gameTuning'] },
  { field: 'storeLayout', tokens: ['encyclopedia.storeLayout', 'storeLayout', 'store-layout'] },
  { field: 'layoutMeta', tokens: ['encyclopedia.layoutMeta', 'layoutMeta'] },
  { field: 'meta', tokens: ['encyclopedia.meta', '.meta.counts'] },
]

function collectSrcFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 12) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next') continue
        walk(full, depth + 1)
      } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
        out.push(full)
      }
    }
  }
  walk(SRC, 0)
  return out
}

function relOf(p: string): string {
  return relative(CWD, p).replace(/\\/g, '/')
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const srcFiles = collectSrcFiles()
  const contents: { file: string; text: string }[] = srcFiles.map((f) => ({ file: relOf(f), text: readFileSync(f, 'utf8') }))

  function refsFor(tokens: string[]): { files: string[]; count: number } {
    const files: string[] = []
    let count = 0
    for (const c of contents) {
      let n = 0
      for (const t of tokens) {
        let i = c.text.indexOf(t)
        while (i !== -1) { n++; i = c.text.indexOf(t, i + 1) }
      }
      if (n > 0) { files.push(c.file); count += n }
    }
    return { files, count }
  }

  const bundled = BUNDLED_ASSETS.map((a) => {
    const r = refsFor(a.tokens)
    return { asset: a.asset, kind: a.kind, used: r.count > 0, refCount: r.count, referencedBy: r.files }
  })

  const mined = MINED_ASSETS.map((a) => {
    const r = refsFor(a.tokens)
    return { asset: a.asset, kind: a.kind, used: r.count > 0, refCount: r.count, referencedBy: r.files }
  })

  const fields = ENCYCLOPEDIA_FIELDS.map((f) => {
    const r = refsFor(f.tokens)
    return { field: f.field, used: r.count > 0, refCount: r.count, referencedBy: r.files }
  })

  const unusedBundled = bundled.filter((b) => !b.used).map((b) => b.asset)
  const unusedMined = mined.filter((m) => !m.used).map((m) => m.asset)
  const unusedFields = fields.filter((f) => !f.used).map((f) => f.field)

  const out = {
    generatedAt: new Date().toISOString(),
    scannedSrcFiles: srcFiles.length,
    bundledAssets: bundled,
    minedAssets: mined,
    encyclopediaFields: fields,
    summary: {
      unusedBundled,
      unusedMined,
      unusedEncyclopediaFields: unusedFields,
      totalBundled: bundled.length,
      totalMined: mined.length,
      totalFields: fields.length,
    },
  }

  writeFileSync(join(OUT_DIR, 'usage-audit.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(`[data-usage-audit] 掃描 ${srcFiles.length} 個 src 檔`)
  console.log('  未引用 bundled:', JSON.stringify(unusedBundled))
  console.log('  未引用 mined  :', JSON.stringify(unusedMined))
  console.log('  未引用 field  :', JSON.stringify(unusedFields))
  console.log(`  → ${join(OUT_DIR, 'usage-audit.json')}`)
}

main()
