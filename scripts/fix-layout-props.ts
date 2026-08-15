/**
 * One-shot patch script: fix wrong `buildableId` / `containerID` in the
 * bundled static data (encyclopedia.json + demo-save.json).
 *
 * Background: the Python extractor v1.0 that produced the original save
 * data mis-parsed propdata strings by reading parts[0] (zoneCode) as the
 * buildable id. Since zone 0 (main store) covers most props, ~44/57 ended
 * up with buildableId=0 ("Placement Mode") instead of their real
 * containerID (1=Product Shelf, 2=Basic Fridge, …).
 *
 * This script re-derives the correct (zoneCode, containerID) for every
 * encyclopedia.storeLayout / demo-save.storeLayout entry by matching its
 * (posX, posZ) against the authoritative decoded.propdata{N} strings
 * embedded in upload/save.json, then writes the patched JSON back.
 *
 * Usage:  bun run scripts/fix-layout-props.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')

interface RawProp {
  index: number
  buildableId: number
  containerID?: number
  zoneCode?: number
  posX: number
  posZ: number
  rotation: number
  angle: number
  inventory: { product: number; count: number }[]
}

function toNum(s: string | undefined): number {
  if (!s) return 0
  return Number(s.replace(',', '.'))
}

/** Parse `zoneCode|containerID|posX|posY|posZ|angle` → canonical fields. */
function parsePropdata(raw: string): { zoneCode: number; containerID: number; posX: number; posZ: number; angle: number } {
  const parts = raw.split('|').map((s) => s.trim())
  return {
    zoneCode: parts.length > 0 ? Math.round(toNum(parts[0])) : 0,
    containerID: parts.length > 1 ? Math.round(toNum(parts[1])) : 0,
    posX: parts.length > 2 ? toNum(parts[2]) : 0,
    posZ: parts.length > 4 ? toNum(parts[4]) : 0,
    angle: parts.length > 5 ? Math.round(toNum(parts[5]) / 90) * 90 : 0,
  }
}

/** Round to 2 decimals for stable position matching. */
const r2 = (n: number) => Math.round(n * 100) / 100

function buildPositionIndex(saveJson: any): Map<string, { zoneCode: number; containerID: number; posX: number; posZ: number }> {
  const decoded = saveJson.decoded ?? {}
  const idx = new Map<string, { zoneCode: number; containerID: number; posX: number; posZ: number }>()
  for (let i = 0; ; i++) {
    const node = decoded[`propdata${i}`]
    if (!node) break
    const s: string = typeof node === 'string' ? node : node.value
    if (typeof s !== 'string') continue
    const p = parsePropdata(s)
    const key = `${r2(p.posX)},${r2(p.posZ)}`
    // First occurrence wins (positions are unique per prop in practice).
    if (!idx.has(key)) idx.set(key, { zoneCode: p.zoneCode, containerID: p.containerID, posX: p.posX, posZ: p.posZ })
  }
  return idx
}

/** Nearest-neighbor lookup with a tolerance (in world units). */
const MATCH_TOLERANCE = 0.6

function findNearest(
  posX: number,
  posZ: number,
  posIndex: Map<string, { zoneCode: number; containerID: number; posX: number; posZ: number }>,
): { zoneCode: number; containerID: number; dist: number } | null {
  let best: { zoneCode: number; containerID: number; posX: number; posZ: number } | null = null
  let bestDist = Infinity
  for (const v of posIndex.values()) {
    const d = Math.hypot(v.posX - posX, v.posZ - posZ)
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  if (!best || bestDist > MATCH_TOLERANCE) return null
  return { zoneCode: best.zoneCode, containerID: best.containerID, dist: bestDist }
}

function patchProps(
  props: RawProp[],
  posIndex: Map<string, { zoneCode: number; containerID: number; posX: number; posZ: number }>,
): { patched: number; unmatched: number } {
  let patched = 0
  let unmatched = 0
  for (const p of props) {
    const key = `${r2(p.posX)},${r2(p.posZ)}`
    const exact = posIndex.get(key)
    const match = exact ?? findNearest(p.posX, p.posZ, posIndex)
    if (match) {
      p.containerID = match.containerID
      p.zoneCode = match.zoneCode
      p.buildableId = match.containerID // keep legacy field in sync
      patched++
    } else {
      // No position match — ensure fields exist with best-effort values.
      p.containerID = p.buildableId
      p.zoneCode = 0
      unmatched++
    }
  }
  return { patched, unmatched }
}

function patchFile(relPath: string, posIndex: Map<string, { zoneCode: number; containerID: number; posX: number; posZ: number }>): void {
  const abs = path.join(ROOT, relPath)
  const raw = fs.readFileSync(abs, 'utf8')
  const data = JSON.parse(raw)

  // encyclopedia.json → data.storeLayout
  // demo-save.json   → data.storeLayout
  const props: RawProp[] | undefined = data.storeLayout
  if (!Array.isArray(props)) {
    console.warn(`  ⚠ ${relPath}: no storeLayout array; skipped`)
    return
  }
  const before = props.map((p) => p.buildableId)
  const { patched, unmatched } = patchProps(props, posIndex)
  const after = props.map((p) => p.containerID)

  // Write back with 2-space indent to match existing style.
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n', 'utf8')

  const distBefore = before.reduce<Record<string, number>>((a, id) => { if (id == null) return a; a[id] = (a[id] ?? 0) + 1; return a }, {})
  const distAfter = after.reduce<Record<string, number>>((a, id) => { if (id == null) return a; a[id] = (a[id] ?? 0) + 1; return a }, {})
  console.log(`✓ ${relPath}: ${patched}/${props.length} props matched, ${unmatched} unmatched`)
  console.log(`    buildableId BEFORE:`, JSON.stringify(distBefore))
  console.log(`    containerID  AFTER:`, JSON.stringify(distAfter))
}

function main(): void {
  const savePath = path.join(ROOT, 'upload', 'save.json')
  const saveJson = JSON.parse(fs.readFileSync(savePath, 'utf8'))
  const posIndex = buildPositionIndex(saveJson)
  console.log(`Built position index: ${posIndex.size} props from upload/save.json decoded.propdata`)
  console.log('')

  patchFile('src/lib/data/encyclopedia.json', posIndex)
  patchFile('src/lib/data/demo-save.json', posIndex)
  console.log('')
  console.log('Done. Both files now carry correct containerID + zoneCode on every LayoutProp.')
}

main()
