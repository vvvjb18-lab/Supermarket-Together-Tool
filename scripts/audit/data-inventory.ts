// ============================================================================
// Data Value Audit — Step 1: data-inventory.ts
// 列出項目所有數據檔案（save-analyzer 挖掘產物 + 網站打包數據 + public 數據），
// 並依角色分類。只做 stat，不讀內容。
//
// 執行：從 repo root 跑 → node scripts/audit/data-inventory.ts
// 輸出：scripts/audit/_out/inventory.json
// ============================================================================
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, extname, resolve } from 'node:path'

const CWD = process.cwd()
const OUT_DIR = join(CWD, 'scripts', 'audit', '_out')

interface FileEntry {
  root: string
  relPath: string
  ext: string
  sizeBytes: number
  role: string
  category: string
}

interface RootDef {
  key: string
  path: string
  label: string
}

const ROOTS: RootDef[] = [
  { key: 'save-analyzer', path: resolve(CWD, '..', 'save-analyzer'), label: '遊戲數據挖掘工作區 (save-analyzer)' },
  { key: 'site-data', path: join(CWD, 'src', 'lib', 'data'), label: '網站打包數據 (src/lib/data)' },
  { key: 'site-public', path: join(CWD, 'public'), label: '網站公開數據 (public)' },
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__pycache__', '.zscripts', 'assetripper', '__bak_archive', 'download'])

// 挖掘產物的「最終資料產品」白名單（非 IL 中間 dump）
const CURATED_NAMES = new Set([
  'game_encyclopedia.json', 'stats_history.json', 'stats_history.csv',
  'perk_effects_final.json', 'perk_effects.json', 'perk_effects_v2.json', 'perk_effects_v2.txt',
  'store_layout.json', 'buildables.json', 'steam_achievements.json',
  'skill_tree.json', 'skill_tree_graph.json', 'skill_tree_graph_v2.json', 'skill_tree_edges_rematch.json',
  'skill_tree_lines.json', 'skill_tree_hierarchy.json', 'skill_tree_gos.json', 'skill_tree_gos2.json',
  'game-schema.json', 'structure.json', 'structure_segments.json', 'taxonomy_level0.json',
  'perks_in_perks_go.json', 'necessity_map.txt', 'unlocked_report.txt',
])

function classify(root: string, rel: string, ext: string, name: string): { role: string; category: string } {
  if (root === 'site-data' || root === 'site-public') {
    if (ext === '.json' || ext === '.csv' || ext === '.tsv') return { role: 'bundled-data', category: '網站已打包數據' }
    return { role: 'site-asset', category: '網站靜態資源' }
  }
  // save-analyzer
  if (ext === '.py' || ext === '.cs' || ext === '.ps1' || ext === '.sh' || ext === '.cjs' || ext === '.mjs') {
    return { role: 'script', category: '挖掘 / 建構腳本' }
  }
  if (ext === '.exe' || ext === '.dll') return { role: 'binary', category: '編譯工具' }
  if (ext === '.html' || ext === '.svg') return { role: 'viz', category: '可視化產物' }
  if (ext === '.md') return { role: 'doc', category: '文檔' }
  if (ext === '.txt') {
    return name.startsWith('_')
      ? { role: 'intermediate', category: 'IL 中間 dump' }
      : { role: 'doc', category: '文檔 / 筆記' }
  }
  if (ext === '.es3' || ext === '.assets' || ext === '.resource' || ext === '.resS') {
    return { role: 'game-asset', category: '遊戲原始資產' }
  }
  if (ext === '.json' || ext === '.csv' || ext === '.tsv') {
    const isIl = name.startsWith('ar_') || name.startsWith('ar2_') || name.startsWith('_')
      || rel.includes('_explore') || rel.includes('_latest') || rel.includes('_tmp')
      || ['ilconst.json', 'discover_static.json', 'fields2.json', 'ar_assets_list.json', 'ar_match.json', 'ar_match2.json'].includes(name)
    const isCurated = rel.includes('enc_split') || CURATED_NAMES.has(name)
    if (isIl && !isCurated) return { role: 'il-dump', category: 'IL 中間萃取' }
    return { role: 'curated-data', category: '挖掘數據產物' }
  }
  if (ext === '.ts' || ext === '.tsx') return { role: 'source', category: '程式碼' }
  return { role: 'other', category: '其他' }
}

function walk(dir: string, root: RootDef, out: FileEntry[], depth = 0): void {
  if (depth > 14) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase())) continue
      walk(full, root, out, depth + 1)
    } else if (e.isFile()) {
      let size = 0
      try { size = statSync(full).size } catch { /* ignore */ }
      const rel = relative(root.path, full).replace(/\\/g, '/')
      const ext = extname(e.name).toLowerCase()
      const c = classify(root.key, rel, ext, e.name)
      out.push({ root: root.key, relPath: rel, ext, sizeBytes: size, role: c.role, category: c.category })
    }
  }
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const files: FileEntry[] = []
  for (const r of ROOTS) {
    if (!existsSync(r.path)) {
      console.error(`[warn] root 不存在，略過：${r.path}`)
      continue
    }
    walk(r.path, r, files)
  }

  const byRoot: Record<string, number> = {}
  const byRole: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const f of files) {
    byRoot[f.root] = (byRoot[f.root] || 0) + 1
    byRole[f.role] = (byRole[f.role] || 0) + 1
    byCategory[f.category] = (byCategory[f.category] || 0) + 1
  }

  const dataAssets = files.filter((f) => f.role === 'bundled-data' || f.role === 'curated-data' || f.role === 'il-dump')

  const out = {
    generatedAt: new Date().toISOString(),
    cwd: CWD,
    roots: ROOTS.map((r) => ({ key: r.key, label: r.label, exists: existsSync(r.path) })),
    summary: {
      totalFiles: files.length,
      byRoot,
      byRole,
      byCategory,
      dataAssetCount: dataAssets.length,
    },
    files: files.sort((a, b) => a.root.localeCompare(b.root) || a.relPath.localeCompare(b.relPath)),
    dataAssets: dataAssets.sort((a, b) => a.root.localeCompare(b.root) || b.sizeBytes - a.sizeBytes),
  }

  writeFileSync(join(OUT_DIR, 'inventory.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(`[data-inventory] 總檔案 ${files.length}，資料資產 ${dataAssets.length}`)
  console.log('  byRole:', JSON.stringify(byRole))
  console.log('  byRoot:', JSON.stringify(byRoot))
  console.log(`  → ${join(OUT_DIR, 'inventory.json')}`)
}

main()
