// ============================================================================
// Data Value Audit — Step 2: data-profile.ts
// 分析每個「資料資產」的欄位 / schema / 樣本。大型檔（>4MB）只讀檔頭猜結構，不整檔載入。
//
// 執行：node scripts/audit/data-profile.ts
// 輸出：scripts/audit/_out/profile.json
// ============================================================================
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, extname, resolve } from 'node:path'

const CWD = process.cwd()
const OUT_DIR = join(CWD, 'scripts', 'audit', '_out')
const LARGE = 4 * 1024 * 1024 // 4 MB

const ROOTS = [
  { key: 'site-data', path: join(CWD, 'src', 'lib', 'data') },
  { key: 'site-public', path: join(CWD, 'public') },
  { key: 'save-analyzer', path: resolve(CWD, '..', 'save-analyzer') },
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__pycache__', 'assetripper', '_explore', '_latest', '_jstest', '_tmp', '__bak_archive', 'download', 'snapshots', 'tools', 'saveanalyzer'])

function shouldProfile(name: string, rel: string): boolean {
  if (name.startsWith('_') || name.startsWith('ar_') || name.startsWith('ar2_')) return false
  if (['ar_assets_list.json', 'ilconst.json', 'discover_static.json', 'fields2.json', 'ar_match.json', 'ar_match2.json'].includes(name)) return false
  if (rel.startsWith('_')) return false
  return true
}

interface FieldInfo {
  key: string
  type: string
  count?: number
  elementKeys?: string[]
  sample?: string
}

interface FileProfile {
  root: string
  relPath: string
  sizeBytes: number
  kind: 'json' | 'table' | 'large' | 'unparseable'
  shape?: string
  topLevel?: FieldInfo[]
  columns?: string[]
  rowCount?: number
  note?: string
}

function trunc(s: string, n = 120): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? clean.slice(0, n) + '…' : clean
}

function describe(value: unknown): { type: string; count?: number; elementKeys?: string[]; sample?: string } {
  if (Array.isArray(value)) {
    const el = value[0]
    let elementKeys: string[] = []
    if (el && typeof el === 'object' && !Array.isArray(el)) elementKeys = Object.keys(el)
    return { type: 'array', count: value.length, elementKeys, sample: trunc(JSON.stringify(el)) }
  }
  if (value && typeof value === 'object') {
    return { type: 'object', elementKeys: Object.keys(value as object), sample: `{${Object.keys(value as object).slice(0, 8).join(', ')}}` }
  }
  if (value === null) return { type: 'null' }
  return { type: typeof value, sample: trunc(String(value)) }
}

function profileJson(text: string): { shape: string; topLevel: FieldInfo[] } {
  const data = JSON.parse(text)
  const shape = Array.isArray(data) ? 'array' : typeof data === 'object' ? 'object' : typeof data
  const topLevel: FieldInfo[] = []
  if (Array.isArray(data)) {
    const d = describe(data)
    topLevel.push({ key: '<root>', type: d.type, count: d.count, elementKeys: d.elementKeys, sample: d.sample })
  } else if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      const d = describe((data as Record<string, unknown>)[k])
      topLevel.push({ key: k, type: d.type, count: d.count, elementKeys: d.elementKeys, sample: d.sample })
    }
  } else {
    topLevel.push({ key: '<root>', type: typeof data, sample: trunc(String(data)) })
  }
  return { shape, topLevel }
}

function profileTable(text: string, delim: string): { columns: string[]; rowCount: number; sampleRow: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0)
  const columns = lines[0].split(delim)
  const rowCount = Math.max(0, lines.length - 1)
  return { columns, rowCount, sampleRow: trunc(lines[1] || '') }
}

function collect(): { root: string; path: string; rel: string; ext: string; size: number }[] {
  const out: { root: string; path: string; rel: string; ext: string; size: number }[] = []
  const walk = (dir: string, rootKey: string, base: string, depth: number) => {
    if (depth > 12) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name.toLowerCase())) continue
        walk(join(dir, e.name), rootKey, base, depth + 1)
      } else {
        const ext = extname(e.name).toLowerCase()
        if (!['.json', '.csv', '.tsv'].includes(ext)) continue
        const rel = relative(base, join(dir, e.name)).replace(/\\/g, '/')
        if (!shouldProfile(e.name, rel)) continue
        let size = 0
        try { size = statSync(join(dir, e.name)).size } catch { /* ignore */ }
        out.push({ root: rootKey, path: join(dir, e.name), rel, ext, size })
      }
    }
  }
  for (const r of ROOTS) {
    if (existsSync(r.path)) walk(r.path, r.key, r.path, 0)
  }
  return out
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const files = collect()
  const profiles: FileProfile[] = []

  for (const f of files) {
    const p: FileProfile = { root: f.root, relPath: f.rel, sizeBytes: f.size, kind: 'json' }
    try {
      if (f.size > LARGE) {
        p.kind = 'large'
        const head = readFileSync(f.path, 'utf8').slice(0, 2048)
        p.shape = head.trimStart().startsWith('[') ? 'array' : head.trimStart().startsWith('{') ? 'object' : 'text'
        p.note = `檔案 >4MB，未整檔解析（僅讀檔頭判斷為 ${p.shape}）`
      } else if (f.ext === '.json') {
        const text = readFileSync(f.path, 'utf8')
        const r = profileJson(text)
        p.kind = 'json'
        p.shape = r.shape
        p.topLevel = r.topLevel
      } else {
        const text = readFileSync(f.path, 'utf8')
        const delim = f.ext === '.tsv' ? '\t' : ','
        const r = profileTable(text, delim)
        p.kind = 'table'
        p.columns = r.columns
        p.rowCount = r.rowCount
      }
    } catch (err) {
      p.kind = 'unparseable'
      p.note = err instanceof Error ? err.message : String(err)
    }
    profiles.push(p)
  }

  const out = {
    generatedAt: new Date().toISOString(),
    profiledCount: profiles.length,
    files: profiles.sort((a, b) => a.root.localeCompare(b.root) || a.relPath.localeCompare(b.relPath)),
  }
  writeFileSync(join(OUT_DIR, 'profile.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(`[data-profile] 已剖析 ${profiles.length} 個資料檔`)
  console.log(`  → ${join(OUT_DIR, 'profile.json')}`)
}

main()
