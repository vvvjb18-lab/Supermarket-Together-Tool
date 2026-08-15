'use client'

import { useMemo, useRef, useState } from 'react'
import { useSaveStore, useRoomStore, type Lang } from '@/lib/store'
import { encyclopedia as ENC, containerInfoFor, containerClassKeyFor, CONTAINER_CLASS_META, type ContainerClassKey } from '@/lib/data-loader'
import { computeShelfEfficiency, computeDemandProxy } from '@/lib/engine'
import type { PropEfficiency } from '@/lib/engine'
import { useLang, productNameFor, groupIdNameFor, layoutLabel } from '@/lib/i18n'
import {
  level0Geometry,
  storeBounds,
  structureByCategory,
  DOOR_POSITIONS,
  doorStateFromInt,
  type StructureObject,
  type DoorState,
} from '@/lib/level0-types'
import {
  ConfidenceBadge,
  StatCard,
  SectionHeader,
  MiniBar,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MapIcon,
  ArrowUpDown,
  Lightbulb,
  Boxes,
  X,
  Layers,
  AlertCircle,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  DoorOpen,
} from 'lucide-react'
import type { LayoutProp } from '@/lib/types'

// ============================================================
// Store Layout Analyzer
// ------------------------------------------------------------
// Top-down SVG map of all store props (save data if available,
// else encyclopedia demo layout of 41 props). Each prop is
// positioned by posX/posZ, rotated by angle, colored by
// buildableId. Multiple highlight modes surface empty / low /
// high-value / duplicated / anomaly shelves.
// ============================================================

type HighlightMode =
  | 'none'
  | 'empty'
  | 'low'
  | 'high-value'
  | 'low-value'
  | 'duplicated'
  | 'missing-demand'
  | 'negative'

// Activity-layer color is driven by containerClass (not buildableId), so all
// shelves share emerald, all fridges share sky, all freezers share cyan, etc.
// `containerClassKeyFor(containerID)` resolves 0→shelf, 1→fridge, 2→freezer,
// 3→produce, 4→pegboard, 69→storage, 99→checkout, unmapped→decoration.
const FALLBACK_COLOR = CONTAINER_CLASS_META.decoration.color

function propColor(containerID: number): string {
  return CONTAINER_CLASS_META[containerClassKeyFor(containerID)].color
}

/**
 * Resolve the visual footprint (length × width in world units) for a prop.
 * Uses the container's real `shelfLength` / `shelfWidth` from the
 * encyclopedia when available; falls back to a 0.6 × 0.4 default for
 * unmapped decoration ids.
 *
 * The game's angle (0/90/180/270) rotates the footprint around the prop's
 * centre. For 90°/270° the length and width swap on-screen, so we return
 * both the raw footprint and the angle-aware (drawn) footprint.
 */
function propFootprint(containerID: number): { length: number; width: number; drawW: number; drawH: number } {
  const info = containerInfoFor(containerID)
  if (info) {
    const length = info.shelfLength || 0.6
    const width = info.shelfWidth || 0.4
    return { length, width, drawW: length, drawH: width }
  }
  return { length: 0.6, width: 0.4, drawW: 0.6, drawH: 0.4 }
}

/**
 * Given a prop's snapped angle (0/90/180/270), return the drawn width/height
 * after accounting for the 90° footprint swap. The SVG `<g>` already applies
 * `rotate(-angle)`, so the rect itself is always drawn axis-aligned in the
 * prop's local frame — we just pick which dimension is "long" vs "short".
 */
function propDrawSize(containerID: number, angle: number): { w: number; h: number } {
  const fp = propFootprint(containerID)
  // 90°/270° → length runs along Z (vertical on screen), so swap.
  const swapped = angle % 180 === 90
  return swapped
    ? { w: fp.width, h: fp.length }
    : { w: fp.length, h: fp.width }
}

/** Zone code → label (parts[0] of propdata: 0=主店, 1=倉儲, 2=結帳, 3=自助結帳). */
const ZONE_LABELS: Record<number, { zh: string; en: string }> = {
  0: { zh: '主店', en: 'Main Store' },
  1: { zh: '倉儲', en: 'Warehouse' },
  2: { zh: '結帳', en: 'Checkout' },
  3: { zh: '自助結帳', en: 'Self-Checkout' },
}

function zoneLabel(zoneCode: number | undefined, lang: Lang): string {
  const z = ZONE_LABELS[zoneCode ?? 0]
  if (!z) return lang === 'en' ? `Zone ${zoneCode}` : `區域 ${zoneCode}`
  return lang === 'en' ? z.en : z.zh
}

/** Human label for a prop — uses container.buildableName, or "裝飾物 #ID" for unmapped. */
function propLabel(containerID: number, lang: Lang): string {
  const info = containerInfoFor(containerID)
  if (info) {
    // Prefer the buildable's localized name (matches in-game menu), fall back
    // to the container's buildableName string.
    const b = ENC.buildables.find((x) => x.id === containerID)
    if (b) return lang === 'en' ? b.name.en : (b.name.zhHant || b.name.en)
    return info.buildableName
  }
  return lang === 'en' ? `Decoration #${containerID}` : `裝飾物 #${containerID}`
}

// Door state → color (mirrors `doorStateFromInt`).
const DOOR_COLORS: Record<DoorState, string> = {
  closed: '#ef4444', // red-500
  open: '#22c55e', // green-500
  auto: '#3b82f6', // blue-500
  unknown: '#9ca3af', // gray-400
}

// Layer visibility defaults
const DEFAULT_LAYERS = {
  structure: true,
  activity: true,
  ceiling: false,
  doors: true,
}
type LayerKey = keyof typeof DEFAULT_LAYERS
type LayerState = Record<LayerKey, boolean>

// View padding around the store bounding box (in world units).
const VIEW_PAD = 2

type SortKey = 'efficiency' | 'shelfValue' | 'totalUnits' | 'demandCoverage' | 'emptySlots' | 'distinctProducts'

const HIGHLIGHT_LABELS: { value: HighlightMode; label: string; color: string }[] = [
  { value: 'none', label: '無', color: '#a1a1aa' },
  { value: 'empty', label: '空貨架', color: '#f43f5e' },
  { value: 'low', label: '低庫存', color: '#f59e0b' },
  { value: 'high-value', label: '高價值', color: '#10b981' },
  { value: 'low-value', label: '低價值', color: '#71717a' },
  { value: 'duplicated', label: '重複商品', color: '#a855f7' },
  { value: 'missing-demand', label: '缺高需求', color: '#fb923c' },
  { value: 'negative', label: '負庫存', color: '#e11d48' },
]

export function StoreLayout() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const room = useRoomStore((s) => s.room)
  const assignShelf = useRoomStore((s) => s.assignShelf)

  const layout: LayoutProp[] = useMemo(
    () => snapshot?.storeLayout ?? ENC.storeLayout,
    [snapshot],
  )

  const effResult = useMemo(() => computeShelfEfficiency(layout), [layout])
  const efficiencies = effResult.value

  // Precompute product demand for "missing-demand" highlight.
  const demandCache = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of ENC.products) {
      m.set(p.id, computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value)
    }
    return m
  }, [])

  const [highlight, setHighlight] = useState<HighlightMode>('none')
  // selectedIdx and sortKey are used in the leaderboard + detail card below
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('efficiency')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [assignPlayerId, setAssignPlayerId] = useState<string | undefined>(undefined)

  // ---- Layer visibility (structure / activity / ceiling / doors) ----
  const [layers, setLayers] = useState<LayerState>({ ...DEFAULT_LAYERS })

  // ---- Zoom & pan state for the SVG map ----
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const resetView = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  // Convert a client-space point (clientX, clientY) → SVG user-space point
  // using the SVG's screen CTM (handles viewBox + flip).
  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const transformed = pt.matrixTransform(ctm.inverse())
    return { x: transformed.x, y: transformed.y }
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    // Zoom toward cursor (cursor stays anchored to the same world point).
    const cursor = clientToSvg(e.clientX, e.clientY)
    if (!cursor) return
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newScale = Math.max(0.4, Math.min(8, scale * factor))
    const actualFactor = newScale / scale
    // We apply <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}> inside
    // the SVG, so a world point P maps to viewport point (scale * P + pan).
    // Solve for newPan that keeps `cursor` fixed: newPan = cursor - actualFactor * (cursor - pan)
    setPan({
      x: cursor.x - actualFactor * (cursor.x - pan.x),
      y: cursor.y - actualFactor * (cursor.y - pan.y),
    })
    setScale(newScale)
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Only pan on left-click drag (button 0); ignore right-click.
    if (e.button !== 0) return
    const cursor = clientToSvg(e.clientX, e.clientY)
    if (!cursor) return
    // Record the drag start, but don't capture the pointer or mark as
    // dragging yet — a simple click on a shelf should still fire the
    // shelf's onClick handler. We only "drag" once the cursor moves
    // more than a small threshold.
    dragRef.current = { sx: cursor.x, sy: cursor.y, ox: pan.x, oy: pan.y }
  }
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const cursor = clientToSvg(e.clientX, e.clientY)
    if (!cursor) return
    const dx = cursor.x - dragRef.current.sx
    const dy = cursor.y - dragRef.current.sy
    // Threshold: ignore tiny movements (treat as click, not drag).
    if (!isDragging && Math.hypot(dx, dy) < 0.15) return
    if (!isDragging) {
      setIsDragging(true)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    setPan({
      x: dragRef.current.ox + dx,
      y: dragRef.current.oy + dy,
    })
  }
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
    dragRef.current = null
    setIsDragging(false)
  }

  // ---- Door states from save.json ----
  // Primary: snapshot.doorStates (already parsed by es3-parser).
  // Fallback: raw extraction from snapshot.decoded.DoorStates.value.array.
  const doorStates: number[] = useMemo(() => {
    if (snapshot?.doorStates && snapshot.doorStates.length > 0) {
      return snapshot.doorStates
    }
    // The SaveSnapshot type doesn't expose `decoded` (raw ES3 wrapper),
    // but the runtime object may carry it. Cast to any for safe probing.
    const raw = (snapshot as unknown as {
      decoded?: { DoorStates?: { value?: { array?: { value?: unknown }[] } } }
    })?.decoded?.DoorStates?.value?.array
    if (Array.isArray(raw)) {
      return raw
        .map((d) => (typeof d === 'object' && d !== null ? (d as { value?: unknown }).value : d))
        .filter((v): v is number => typeof v === 'number')
    }
    return []
  }, [snapshot])

  // ---- Structure object groups by category (pre-computed once) ----
  const structureGroups = useMemo(() => {
    const g = structureByCategory
    return {
      floor: g.floor ?? [],
      outerWall: g.outerWall ?? [],
      wallTop: g.wallTop ?? [],
      pillar: g.pillar ?? [],
      ceiling: g.ceiling ?? [],
      beam: g.beam ?? [],
      light: g.light ?? [],
      vent: g.vent ?? [],
    }
  }, [])

  // Map bounds (with padding) for the SVG viewBox.
  // Prefer the level0 storeBounds (covers the full Unity scene), but fall
  // back to shelf-derived bounds if level0 data is somehow missing.
  const bounds = useMemo(() => {
    const hasLevel0 = level0Geometry.objects.length > 0
    if (hasLevel0 && storeBounds) {
      const minX = storeBounds.minX - VIEW_PAD
      const maxX = storeBounds.maxX + VIEW_PAD
      const minZ = storeBounds.minZ - VIEW_PAD
      const maxZ = storeBounds.maxZ + VIEW_PAD
      return { minX, minZ, maxX, maxZ, w: maxX - minX, h: maxZ - minZ }
    }
    if (layout.length === 0) return { minX: 0, minZ: 0, maxX: 10, maxZ: 10, w: 10, h: 10 }
    const xs = layout.map((p) => p.posX)
    const zs = layout.map((p) => p.posZ)
    const minX = Math.min(...xs) - 1
    const maxX = Math.max(...xs) + 1
    const minZ = Math.min(...zs) - 1
    const maxZ = Math.max(...zs) + 1
    return { minX, minZ, maxX, maxZ, w: maxX - minX, h: maxZ - minZ }
  }, [layout])

  // Highlight thresholds.
  const thresholds = useMemo(() => {
    if (efficiencies.length === 0) {
      return { valueTop: 0, valueBottom: 0 }
    }
    const sorted = [...efficiencies].sort((a, b) => a.shelfValue - b.shelfValue)
    const q = Math.max(1, Math.floor(efficiencies.length / 4))
    return {
      valueTop: sorted[sorted.length - q].shelfValue,
      valueBottom: sorted[q - 1].shelfValue,
    }
  }, [efficiencies])

  const getHighlight = (eff: PropEfficiency): { stroke: string; width: number; blink?: boolean } | null => {
    if (highlight === 'none') return null
    switch (highlight) {
      case 'empty':
        return eff.emptySlots > 0 ? { stroke: '#f43f5e', width: 0.08 } : null
      case 'low':
        return eff.totalUnits < 5 ? { stroke: '#f59e0b', width: 0.08 } : null
      case 'high-value':
        return eff.shelfValue >= thresholds.valueTop ? { stroke: '#10b981', width: 0.08 } : null
      case 'low-value':
        return eff.shelfValue <= thresholds.valueBottom ? { stroke: '#71717a', width: 0.08 } : null
      case 'duplicated':
        return eff.duplicatedProducts > 0 ? { stroke: '#a855f7', width: 0.08 } : null
      case 'missing-demand': {
        const prop = layout.find((p) => p.index === eff.propIndex)
        if (!prop) return null
        const maxDemand = Math.max(
          0,
          ...prop.inventory
            .filter((i) => i.product >= 0 && i.count > 0)
            .map((i) => demandCache.get(i.product) ?? 0),
        )
        return maxDemand < 0.002 ? { stroke: '#fb923c', width: 0.08 } : null
      }
      case 'negative':
        return eff.negativeAnomalies > 0 ? { stroke: '#e11d48', width: 0.1, blink: true } : null
    }
    return null
  }

  // Sorted leaderboard rows.
  const sortedEffs = useMemo(() => {
    const arr = [...efficiencies]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [efficiencies, sortKey, sortDir])

  const selectedProp = selectedIdx != null ? layout.find((p) => p.index === selectedIdx) ?? null : null
  const selectedEff = selectedIdx != null ? efficiencies.find((e) => e.propIndex === selectedIdx) ?? null : null

  // Layout-wide aggregates for the report.
  const aggregates = useMemo(() => {
    const totalProps = layout.length
    const totalUnits = efficiencies.reduce((s, e) => s + e.totalUnits, 0)
    const totalShelfValue = efficiencies.reduce((s, e) => s + e.shelfValue, 0)
    const totalEmptySlots = efficiencies.reduce((s, e) => s + e.emptySlots, 0)
    const totalAnomalies = efficiencies.reduce((s, e) => s + e.negativeAnomalies, 0)
    const totalDuplicated = efficiencies.reduce((s, e) => s + e.duplicatedProducts, 0)
    const totalDemandCoverage = efficiencies.reduce((s, e) => s + e.demandCoverage, 0)
    const demandCoveragePct = totalUnits > 0 ? Math.min(100, (totalDemandCoverage / totalUnits) * 1000) : 0

    // Inventory by product (aggregate across props).
    const byProduct = new Map<number, number>()
    for (const prop of layout) {
      for (const inv of prop.inventory) {
        if (inv.product < 0 || inv.count <= 0) continue
        byProduct.set(inv.product, (byProduct.get(inv.product) ?? 0) + inv.count)
      }
    }
    const topProducts = [...byProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pid, count]) => ({ pid, count }))

    // Inventory by group.
    const byGroup = new Map<string, { count: number; value: number }>()
    for (const prop of layout) {
      for (const inv of prop.inventory) {
        if (inv.product < 0 || inv.count <= 0) continue
        const p = ENC.products.find((x) => x.id === inv.product)
        if (!p) continue
        const gname = groupIdNameFor(p.group, lang)
        const cur = byGroup.get(gname) ?? { count: 0, value: 0 }
        cur.count += inv.count
        cur.value += inv.count * p.basePricePerUnit
        byGroup.set(gname, cur)
      }
    }
    const topGroups = [...byGroup.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([name, v]) => ({ name, ...v }))

    return {
      totalProps,
      totalUnits,
      totalShelfValue,
      totalEmptySlots,
      totalAnomalies,
      totalDuplicated,
      demandCoveragePct,
      topProducts,
      topGroups,
    }
  }, [layout, efficiencies, lang])

  // Recommended shelf swaps.
  const swapRecs = useMemo(() => {
    const recs: { from: number; to: number; reason: string }[] = []
    const byEff = [...efficiencies].sort((a, b) => a.efficiency - b.efficiency)
    // Bottom 5 props — suggest action.
    for (const e of byEff.slice(0, 5)) {
      if (e.emptySlots > 0) {
        recs.push({
          from: e.propIndex,
          to: -1,
          reason: `貨架 #${e.propIndex} 有 ${e.emptySlots} 個空格 — 從 storage 補上高 demand 商品`,
        })
      } else if (e.demandCoverage < 0.0001 && e.totalUnits > 0) {
        recs.push({
          from: e.propIndex,
          to: -1,
          reason: `貨架 #${e.propIndex} 商品 demand 偏低 (coverage=${fmt(e.demandCoverage, 5)}) — 考慮替換為高 demand 商品`,
        })
      }
    }
    // Duplicated products across props — suggest consolidation.
    const productToProps = new Map<number, number[]>()
    for (const prop of layout) {
      for (const inv of prop.inventory) {
        if (inv.product < 0 || inv.count <= 0) continue
        const arr = productToProps.get(inv.product) ?? []
        arr.push(prop.index)
        productToProps.set(inv.product, arr)
      }
    }
    let dupCount = 0
    for (const [pid, props] of productToProps) {
      if (props.length > 1 && dupCount < 5) {
        recs.push({
          from: props[0],
          to: props[1],
          reason: `商品 ${productNameFor(pid, lang)} (#${pid}) 同時出現在貨架 #${props[0]} 與 #${props[1]} — 考慮集中放置`,
        })
        dupCount++
      }
    }
    return recs.slice(0, 8)
  }, [layout, efficiencies, lang])

  // Top 5 problematic shelves — quick scan card
  const topProblematic = useMemo(() => {
    return [...efficiencies]
      .map((e) => {
        const issues: string[] = []
        if (e.negativeAnomalies > 0) issues.push(`負庫存 ×${e.negativeAnomalies}`)
        if (e.totalUnits === 0) issues.push('完全空貨架')
        if (e.emptySlots > 0 && e.totalUnits > 0) issues.push(`${e.emptySlots} 空格`)
        if (e.duplicatedProducts > 0) issues.push(`${e.duplicatedProducts} 重複商品`)
        if (e.demandCoverage < 0.0001 && e.totalUnits > 0) issues.push('低需求商品')
        // weight: anomalies matter most, then empties, then duplicates, then low-demand
        const score =
          e.negativeAnomalies * 10 +
          (e.totalUnits === 0 ? 5 : 0) +
          e.emptySlots +
          e.duplicatedProducts * 2 +
          (e.demandCoverage < 0.0001 && e.totalUnits > 0 ? 1 : 0)
        let recommendation = ''
        if (e.negativeAnomalies > 0) recommendation = '檢查存檔資料，可能有資料異常'
        else if (e.totalUnits === 0) recommendation = '從倉庫補上高 demand 商品'
        else if (e.emptySlots > 0) recommendation = `補滿 ${e.emptySlots} 個空格`
        else if (e.duplicatedProducts > 0) recommendation = '集中重複商品到單一貨架'
        else if (e.demandCoverage < 0.0001) recommendation = '替換為高 demand 商品'
        return { e, issues, recommendation, score }
      })
      .filter((x) => x.issues.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [efficiencies])

  const layoutSource = snapshot ? `save (${snapshot.source})` : 'encyclopedia (demo)'

  // Layout type from save: 0 = Classic, 1 = Plaza
  const layoutType = snapshot?.layout ?? null
  const layoutTypeName = layoutType === 1
    ? (lang === 'en' ? 'Plaza' : '廣場')
    : layoutType === 0
      ? (lang === 'en' ? 'Classic' : '經典')
      : null

  // Unique container class count for header
  const uniqueClasses = useMemo(() => {
    const s = new Set<ContainerClassKey>()
    for (const prop of layout) s.add(containerClassKeyFor(prop.containerID))
    return s.size
  }, [layout])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <SectionHeader
        title="店面平面圖分析"
        description={`來源: ${layoutSource} · ${layout.length} props · ${aggregates.totalUnits} units · ${uniqueClasses} container types`}
        confidence={snapshot ? 'confirmed' : 'demo'}
        formula="snapshot.storeLayout ?? encyclopedia.storeLayout"
        note={snapshot ? '從存檔讀取之實際店面配置' : '未上傳存檔 — 顯示百科 demo 配置（41 props）'}
        right={
          <div className="flex items-center gap-2">
            {layoutTypeName && (
              <Badge variant="secondary" className="text-xs">
                {layoutTypeName}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              <Layers className="mr-1 h-3 w-3" /> {layout.length} props
            </Badge>
          </div>
        }
      />

      {/* Map card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapIcon className="h-4 w-4 text-emerald-500" />
              {lang === 'en' ? 'Top-down Map' : '俯視地圖'}
              <span className="text-xs font-normal text-muted-foreground">
                {lang === 'en'
                  ? `bounds X[${storeBounds.minX}, ${storeBounds.maxX}] · Z[${storeBounds.minZ}, ${storeBounds.maxZ}]`
                  : `範圍 X[${storeBounds.minX}, ${storeBounds.maxX}] · Z[${storeBounds.minZ}, ${storeBounds.maxZ}]`}
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{layoutLabel('layout.layers.label', lang)}:</span>
              <ToggleGroup
                type="multiple"
                value={(Object.entries(layers) as [LayerKey, boolean][])
                  .filter(([, v]) => v)
                  .map(([k]) => k)}
                onValueChange={(vals) => {
                  const next: LayerState = {
                    structure: false,
                    activity: false,
                    ceiling: false,
                    doors: false,
                  }
                  for (const v of vals as LayerKey[]) {
                    if (v in next) next[v] = true
                  }
                  setLayers(next)
                }}
                variant="outline"
                size="sm"
                className="flex-wrap"
              >
                <ToggleGroupItem value="structure" className="text-xs">
                  <Layers className="mr-1 h-3 w-3" />
                  {layoutLabel('layout.layer.structure', lang)}
                </ToggleGroupItem>
                <ToggleGroupItem value="activity" className="text-xs">
                  <Boxes className="mr-1 h-3 w-3" />
                  {layoutLabel('layout.layer.activity', lang)}
                </ToggleGroupItem>
                <ToggleGroupItem value="ceiling" className="text-xs">
                  {layoutLabel('layout.layer.ceiling', lang)}
                </ToggleGroupItem>
                <ToggleGroupItem value="doors" className="text-xs">
                  <DoorOpen className="mr-1 h-3 w-3" />
                  {layoutLabel('layout.layer.doors', lang)}
                </ToggleGroupItem>
              </ToggleGroup>
              <span className="ml-1 text-xs text-muted-foreground">{layoutLabel('layout.zoom.label', lang)}:</span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setScale((s) => Math.max(0.4, s / 1.2))}
                  aria-label={layoutLabel('layout.zoom.out', lang)}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="w-10 text-center font-mono text-xs">{Math.round(scale * 100)}%</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setScale((s) => Math.min(8, s * 1.2))}
                  aria-label={layoutLabel('layout.zoom.in', lang)}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2"
                  onClick={resetView}
                  aria-label={layoutLabel('layout.zoom.reset', lang)}
                >
                  <Maximize className="h-3.5 w-3.5" />
                  <span className="text-xs">{layoutLabel('layout.zoom.reset', lang)}</span>
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{lang === 'en' ? 'Highlight mode:' : '高亮模式:'}</span>
            <ToggleGroup
              type="single"
              value={highlight}
              onValueChange={(v) => v && setHighlight(v as HighlightMode)}
              variant="outline"
              size="sm"
              className="flex-wrap"
            >
              {HIGHLIGHT_LABELS.map((h) => (
                <ToggleGroupItem key={h.value} value={h.value} className="text-xs">
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: h.color }}
                  />
                  {h.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* SVG map */}
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-md border bg-muted/30">
                <svg
                  ref={svgRef}
                  viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.w} ${bounds.h}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full touch-none select-none"
                  style={{
                    aspectRatio: `${bounds.w} / ${bounds.h}`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                  }}
                  onWheel={handleWheel}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <defs>
                    <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                      <path
                        d="M 1 0 L 0 0 0 1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="0.02"
                        className="text-muted-foreground/30"
                      />
                    </pattern>
                    <radialGradient id="lightGlow">
                      <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
                      <stop offset="55%" stopColor="#fcd34d" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#fcd34d" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Background grid (covers full viewport, not flipped) */}
                  <rect
                    x={bounds.minX}
                    y={bounds.minZ}
                    width={bounds.w}
                    height={bounds.h}
                    fill="url(#grid)"
                    className="text-muted-foreground/20"
                  />

                  {/* Zoom/pan wrapper */}
                  <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
                    {/* Y-flip wrapper: world Z increases UPWARD on screen,
                        so the entrance (Z=-3) appears at the BOTTOM of the map. */}
                    <g transform={`matrix(1 0 0 -1 0 ${bounds.minZ + bounds.maxZ})`}>
                      {/* ===== STRUCTURE LAYER ===== */}
                      {layers.structure && (
                        <StructureLayerView
                          floor={structureGroups.floor}
                          outerWall={structureGroups.outerWall}
                          wallTop={structureGroups.wallTop}
                          pillar={structureGroups.pillar}
                          minX={bounds.minX}
                          maxX={bounds.maxX}
                          minZ={bounds.minZ}
                          maxZ={bounds.maxZ}
                        />
                      )}

                      {/* ===== CEILING LAYER (overlay, rendered above structure but below activity) ===== */}
                      {layers.ceiling && (
                        <g opacity={0.4} style={{ pointerEvents: 'none' }}>
                          {/* Ceiling tiles — translucent rectangles over the floor area */}
                          {structureGroups.ceiling.map((o, i) => (
                            <rect
                              key={`ceil-${i}`}
                              x={o.x - 2.5}
                              y={o.z - 4}
                              width={5}
                              height={8}
                              fill="#cbd5e1"
                              fillOpacity={0.35}
                              stroke="#94a3b8"
                              strokeOpacity={0.4}
                              strokeWidth={0.04}
                            />
                          ))}
                          {/* Beams — thin dark lines at each beam position */}
                          {structureGroups.beam.map((o, i) => (
                            <rect
                              key={`beam-${i}`}
                              x={o.x - 1.5}
                              y={o.z - 0.08}
                              width={3}
                              height={0.16}
                              fill="#475569"
                              fillOpacity={0.55}
                            />
                          ))}
                          {/* Lights — small yellow circles with glow halo */}
                          {structureGroups.light.map((o, i) => (
                            <g key={`light-${i}`}>
                              <circle cx={o.x} cy={o.z} r={1.2} fill="url(#lightGlow)" />
                              <circle cx={o.x} cy={o.z} r={0.18} fill="#fde68a" stroke="#f59e0b" strokeWidth={0.04} />
                            </g>
                          ))}
                          {/* Vents — small blue squares */}
                          {structureGroups.vent.map((o, i) => (
                            <rect
                              key={`vent-${i}`}
                              x={o.x - 0.35}
                              y={o.z - 0.35}
                              width={0.7}
                              height={0.7}
                              fill="#3b82f6"
                              fillOpacity={0.7}
                              stroke="#1d4ed8"
                              strokeWidth={0.04}
                              rx={0.06}
                            />
                          ))}
                        </g>
                      )}

                      {/* ===== ACTIVITY LAYER (shelves / fridges / freezers / …) ===== */}
                      {layers.activity &&
                        layout.map((prop) => {
                          const eff = efficiencies.find((e) => e.propIndex === prop.index)
                          if (!eff) return null
                          const color = propColor(prop.containerID)
                          const hl = getHighlight(eff)
                          const assignment = room?.shelfAssignments[String(prop.index)]
                          const assignedMember = assignment
                            ? room?.members.find((m) => m.id === assignment)
                            : null
                          const isSelected = selectedIdx === prop.index
                          // Real footprint from containerInfo, with 90° swap.
                          const { w: rectW, h: rectH } = propDrawSize(prop.containerID, prop.angle)
                          return (
                            <g
                              key={prop.index}
                              transform={`translate(${prop.posX}, ${prop.posZ}) rotate(${-prop.angle})`}
                              onClick={() => setSelectedIdx(prop.index)}
                              style={{ cursor: 'pointer' }}
                            >
                              {/* Assigned player ring */}
                              {assignedMember && (
                                <rect
                                  x={-rectW / 2 - 0.08}
                                  y={-rectH / 2 - 0.08}
                                  width={rectW + 0.16}
                                  height={rectH + 0.16}
                                  fill="none"
                                  stroke={assignedMember.color}
                                  strokeWidth={0.06}
                                  rx={0.05}
                                />
                              )}
                              {/* Prop body — real container dimensions */}
                              <rect
                                x={-rectW / 2}
                                y={-rectH / 2}
                                width={rectW}
                                height={rectH}
                                fill={color}
                                stroke={hl?.stroke ?? (isSelected ? '#0a0a0a' : '#00000033')}
                                strokeWidth={hl?.width ?? (isSelected ? 0.08 : 0.02)}
                                rx={0.04}
                                className={hl?.blink ? 'animate-pulse' : ''}
                              />
                              {/* Fridge/freezer door indicator — a thin stripe
                                  along one long edge to hint at the glass door. */}
                              {([1, 2] as number[]).includes(containerInfoFor(prop.containerID)?.containerClass ?? -1) && (
                                <rect
                                  x={-rectW / 2 + 0.04}
                                  y={-rectH / 2 + 0.04}
                                  width={rectW - 0.08}
                                  height={0.08}
                                  fill="#ffffff"
                                  fillOpacity={0.45}
                                  rx={0.02}
                                />
                              )}
                            </g>
                          )
                        })}

                      {/* ===== DOOR LAYER ===== */}
                      {layers.doors &&
                        DOOR_POSITIONS.map((door, i) => {
                          const state = doorStateFromInt(doorStates[i])
                          const color = DOOR_COLORS[state]
                          return (
                            <g key={`door-${i}`} transform={`translate(${door.x} ${door.z})`}>
                              {/* Door swing arc — faint quarter-circle hinting open direction */}
                              <path
                                d="M 0 0 L 1.4 0 A 1.4 1.4 0 0 1 0 1.4 Z"
                                fill={color}
                                fillOpacity={state === 'open' ? 0.35 : 0.12}
                                stroke={color}
                                strokeOpacity={0.5}
                                strokeWidth={0.04}
                              />
                              {/* Door leaf — a horizontal bar across the entrance gap */}
                              <rect
                                x={-0.85}
                                y={-0.1}
                                width={1.7}
                                height={0.2}
                                fill={color}
                                stroke="#00000055"
                                strokeWidth={0.03}
                                rx={0.04}
                              />
                              {/* State indicator dot in the center */}
                              <circle
                                cx={0}
                                cy={0}
                                r={0.12}
                                fill="#ffffff"
                                stroke={color}
                                strokeWidth={0.05}
                              />
                            </g>
                          )
                        })}
                    </g>

                    {/* ===== TEXT LAYER =====
                        Rendered OUTSIDE the Y-flip wrapper so glyphs stay upright.
                        Positions are manually flipped via flippedY = (minZ + maxZ) - z. */}
                    <g style={{ pointerEvents: 'none' }}>
                      {layers.activity &&
                        layout.map((prop) => {
                          const eff = efficiencies.find((e) => e.propIndex === prop.index)
                          if (!eff) return null
                          const flippedY = bounds.minZ + bounds.maxZ - prop.posZ
                          const { w: rectW, h: rectH } = propDrawSize(prop.containerID, prop.angle)
                          return (
                            <g key={`txt-${prop.index}`} transform={`translate(${prop.posX} ${flippedY})`}>
                              <text
                                x={0}
                                y={0}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={0.28}
                                className="fill-white font-bold"
                                style={{ paintOrder: 'stroke', stroke: '#00000080', strokeWidth: 0.03 }}
                              >
                                {eff.totalUnits}
                              </text>
                              <text
                                x={rectW / 2 - 0.04}
                                y={-rectH / 2 + 0.04}
                                textAnchor="end"
                                dominantBaseline="hanging"
                                fontSize={0.13}
                                className="fill-white/80"
                              >
                                #{prop.index}
                              </text>
                            </g>
                          )
                        })}
                      {layers.doors &&
                        DOOR_POSITIONS.map((door, i) => {
                          const state = doorStateFromInt(doorStates[i])
                          const color = DOOR_COLORS[state]
                          const flippedY = bounds.minZ + bounds.maxZ - door.z
                          return (
                            <g key={`door-txt-${i}`} transform={`translate(${door.x} ${flippedY})`}>
                              <text
                                x={0}
                                y={0.55}
                                textAnchor="middle"
                                dominantBaseline="hanging"
                                fontSize={0.42}
                                className="fill-foreground font-bold"
                                style={{ paintOrder: 'stroke', stroke: '#ffffffaa', strokeWidth: 0.04 }}
                              >
                                {door.label}
                              </text>
                              <text
                                x={0}
                                y={1.05}
                                textAnchor="middle"
                                dominantBaseline="hanging"
                                fontSize={0.28}
                                fontWeight="600"
                                fill={color}
                                style={{ paintOrder: 'stroke', stroke: '#ffffffaa', strokeWidth: 0.03 }}
                              >
                                {layoutLabel(`layout.door.${state}`, lang)}
                              </text>
                            </g>
                          )
                        })}
                      {/* Orientation labels (entrance / back of store) */}
                      <text
                        x={(bounds.minX + bounds.maxX) / 2}
                        y={bounds.maxZ - 0.4}
                        textAnchor="middle"
                        dominantBaseline="auto"
                        fontSize={0.55}
                        className="fill-emerald-600/80 dark:fill-emerald-400/80 font-bold"
                      >
                        {layoutLabel('layout.entrance', lang)} ↓
                      </text>
                      <text
                        x={(bounds.minX + bounds.maxX) / 2}
                        y={bounds.minZ + 0.4}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fontSize={0.45}
                        className="fill-muted-foreground"
                      >
                        {layoutLabel('layout.back', lang)}
                      </text>
                    </g>
                  </g>
                </svg>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">{layoutLabel('layout.hint.pan', lang)}</div>

              {/* Legend */}
              <div className="mt-2 space-y-2 text-xs">
                {/* Activity legend — container classes (shelf / fridge / freezer / …) */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground">{layoutLabel('layout.legend.activity', lang)}:</span>
                  {(Object.keys(CONTAINER_CLASS_META) as ContainerClassKey[]).map((k) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: CONTAINER_CLASS_META[k].color }}
                      />
                      <span>{lang === 'en' ? CONTAINER_CLASS_META[k].labelEn : CONTAINER_CLASS_META[k].labelZh}</span>
                    </div>
                  ))}
                  <span className="ml-1 text-muted-foreground">{lang === 'en' ? 'size = real shelfLength × Width' : '尺寸 = 真實貨架長×寬'}</span>
                </div>
                {/* Structure legend */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground">{layoutLabel('layout.legend.structure', lang)}:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm border border-slate-400 bg-slate-200 dark:bg-slate-800" />
                    <span>{layoutLabel('layout.struct.floor', lang)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 border-2 border-slate-600 dark:border-slate-400" />
                    <span>{layoutLabel('layout.struct.outerWall', lang)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-sm bg-slate-500" />
                    <span>{layoutLabel('layout.struct.pillar', lang)}</span>
                  </div>
                </div>
                {/* Door legend */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground">{layoutLabel('layout.legend.doors', lang)}:</span>
                  {(['closed', 'open', 'auto', 'unknown'] as DoorState[]).map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: DOOR_COLORS[s] }}
                      />
                      <span>{layoutLabel(`layout.door.${s}`, lang)}</span>
                    </div>
                  ))}
                  <span className="ml-1 text-muted-foreground">
                    {doorStates.length > 0
                      ? lang === 'en'
                        ? `save: [${doorStates.join(', ')}]`
                        : `存檔: [${doorStates.join(', ')}]`
                      : layoutLabel('layout.door.noSave', lang)}
                  </span>
                </div>
                {/* Ceiling legend (only shown when ceiling layer is enabled) */}
                {layers.ceiling && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted-foreground">{layoutLabel('layout.legend.ceiling', lang)}:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm border border-slate-400 bg-slate-300/40" />
                      <span>{layoutLabel('layout.ceil.ceiling', lang)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 bg-slate-600" />
                      <span>{layoutLabel('layout.ceil.beam', lang)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-300" />
                      <span>{layoutLabel('layout.ceil.light', lang)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
                      <span>{layoutLabel('layout.ceil.vent', lang)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Detail panel */}
            <div>
              {selectedProp && selectedEff ? (
                <PropDetailCard
                  prop={selectedProp}
                  eff={selectedEff}
                  demandCache={demandCache}
                  lang={lang}
                  onClose={() => setSelectedIdx(null)}
                  room={room}
                  onAssign={(playerId) => assignShelf(String(selectedProp.index), playerId)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  <MapIcon className="mb-2 h-8 w-8 opacity-50" />
                  <div>{lang === 'en' ? 'Click any shelf on the map to see details' : '點擊地圖上任一貨架查看詳細資訊'}</div>
                  <div className="mt-1 text-xs">{lang === 'en' ? 'Inventory, efficiency, gaps, anomalies' : '含庫存清單、效率、缺漏、負庫存異常'}</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Layout report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>配置報告</span>
            <ConfidenceBadge
              confidence={snapshot ? 'confirmed' : 'demo'}
              formula={effResult.formula}
              note="庫存資料來自存檔；效率指標為 proxy（含 demandProxy 假設）"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="總貨架數" value={aggregates.totalProps} confidence={snapshot ? 'confirmed' : 'demo'} accent="neutral" />
            <StatCard label="總庫存單位" value={fmt(aggregates.totalUnits, 0)} confidence={snapshot ? 'confirmed' : 'demo'} accent="neutral" />
            <StatCard
              label="總貨架價值"
              value={fmtMoney(aggregates.totalShelfValue)}
              confidence="proxy"
              formula="Σ count × basePrice"
              accent="good"
            />
            <StatCard
              label="空格總數"
              value={aggregates.totalEmptySlots}
              confidence="proxy"
              accent={aggregates.totalEmptySlots > 5 ? 'bad' : 'neutral'}
            />
            <StatCard
              label="負庫存異常"
              value={aggregates.totalAnomalies}
              confidence="proxy"
              accent={aggregates.totalAnomalies > 0 ? 'bad' : 'good'}
              hint={aggregates.totalAnomalies > 0 ? '存檔資料異常' : '正常'}
            />
            <StatCard
              label="Demand Coverage"
              value={fmt(aggregates.demandCoveragePct, 1)}
              unit="%"
              confidence="proxy"
              formula="Σ demandCoverage / totalUnits × 1000"
              accent={aggregates.demandCoveragePct > 30 ? 'good' : 'warn'}
            />
          </div>

          {/* Container class distribution + Zone distribution */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Container class breakdown */}
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                {lang === 'en' ? 'Container Type Distribution' : '容器類型分佈'}
              </h4>
              <div className="space-y-1.5">
                {(() => {
                  const classCounts = new Map<ContainerClassKey, { count: number; units: number; value: number }>()
                  for (const prop of layout) {
                    const key = containerClassKeyFor(prop.containerID)
                    const prev = classCounts.get(key) ?? { count: 0, units: 0, value: 0 }
                    const eff = efficiencies.find((e) => e.propIndex === prop.index)
                    classCounts.set(key, {
                      count: prev.count + 1,
                      units: prev.units + (eff?.totalUnits ?? 0),
                      value: prev.value + (eff?.shelfValue ?? 0),
                    })
                  }
                  const totalProps = layout.length || 1
                  const entries = (Object.keys(CONTAINER_CLASS_META) as ContainerClassKey[])
                    .map((k) => ({ key: k, ...classCounts.get(k)! }))
                    .filter((e) => e.count > 0)
                    .sort((a, b) => b.count - a.count)
                  return entries.map(({ key, count, units, value }) => {
                    const meta = CONTAINER_CLASS_META[key]
                    const pct = ((count / totalProps) * 100).toFixed(1)
                    return (
                      <div key={key} className="flex items-center gap-2 rounded border bg-card px-3 py-1.5 text-xs">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{lang === 'en' ? meta.labelEn : meta.labelZh}</span>
                          <span className="ml-1 text-muted-foreground">{pct}%</span>
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground">{count}× {units}u</span>
                        <span className="shrink-0 font-mono text-emerald-600 dark:text-emerald-400">{fmtMoney(value)}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            {/* Zone distribution */}
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                {lang === 'en' ? 'Zone Distribution' : '區域分佈'}
              </h4>
              <div className="space-y-1.5">
                {(() => {
                  const zoneCounts = new Map<number, { count: number; units: number }>()
                  for (const prop of layout) {
                    const z = prop.zoneCode ?? 0
                    const prev = zoneCounts.get(z) ?? { count: 0, units: 0 }
                    const eff = efficiencies.find((e) => e.propIndex === prop.index)
                    zoneCounts.set(z, {
                      count: prev.count + 1,
                      units: prev.units + (eff?.totalUnits ?? 0),
                    })
                  }
                  const totalProps = layout.length || 1
                  const ZONE_COLORS: Record<number, string> = {
                    0: '#10b981', // emerald — main store
                    1: '#f59e0b', // amber — warehouse
                    2: '#a855f7', // purple — checkout
                    3: '#06b6d4', // cyan — self-checkout
                  }
                  return [...zoneCounts.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([z, { count, units }]) => {
                      const pct = ((count / totalProps) * 100).toFixed(1)
                      return (
                        <div key={z} className="flex items-center gap-2 rounded border bg-card px-3 py-1.5 text-xs">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-sm"
                            style={{ backgroundColor: ZONE_COLORS[z] ?? '#94a3b8' }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{zoneLabel(z, lang)}</span>
                            <span className="ml-1 text-muted-foreground">{pct}%</span>
                          </span>
                          <span className="shrink-0 font-mono text-muted-foreground">{count}× {units}u</span>
                        </div>
                      )
                    })
                })()}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top products */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Top 20 商品（按庫存單位）</h4>
                <ConfidenceBadge confidence={snapshot ? 'confirmed' : 'demo'} />
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                {aggregates.topProducts.map(({ pid, count }, i) => {
                  const p = ENC.products.find((x) => x.id === pid)
                  const demand = demandCache.get(pid) ?? 0
                  const maxCount = aggregates.topProducts[0]?.count || 1
                  return (
                    <div key={pid} className="flex items-center gap-2 rounded border bg-card px-2 py-1.5 text-xs">
                      <span className="w-5 shrink-0 text-right font-mono text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{productNameFor(pid, lang)} <span className="text-muted-foreground">#{pid}</span></div>
                        <div className="truncate text-[10px] text-muted-foreground">{p?.brand} · demand {fmt(demand, 4)}</div>
                      </div>
                      <div className="w-16 shrink-0">
                        <MiniBar value={count} max={maxCount} color={demand > 0.005 ? 'bg-emerald-500' : 'bg-amber-500'} />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* By group */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">依商品分類（按貨架價值）</h4>
                <ConfidenceBadge confidence="proxy" formula="Σ count × basePrice per group" />
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                {aggregates.topGroups.map((g, i) => {
                  const maxValue = aggregates.topGroups[0]?.value || 1
                  return (
                    <div key={g.name} className="flex items-center gap-2 rounded border bg-card px-2 py-1.5 text-xs">
                      <span className="w-5 shrink-0 text-right font-mono text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{g.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{g.count} units</div>
                      </div>
                      <div className="w-20 shrink-0">
                        <MiniBar value={g.value} max={maxValue} color="bg-sky-500" />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono">{fmtMoney(g.value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Recommended swaps */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                建議貨架調整
              </h4>
              <ConfidenceBadge confidence="unverified" note="啟發式建議，需人工評估" />
            </div>
            {swapRecs.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
                目前無明顯問題 — 所有貨架皆有庫存且無重複。
              </div>
            ) : (
              <div className="space-y-1.5">
                {swapRecs.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-xs">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-700 dark:text-amber-300">{i + 1}</span>
                    <div className="min-w-0 flex-1 text-muted-foreground">
                      <span className="text-foreground">{r.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top 5 problematic shelves — quick scan */}
      {topProblematic.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500" />
                Top {topProblematic.length} 問題貨架（快速掃描）
              </span>
              <ConfidenceBadge
                confidence="proxy"
                formula="rank by (negativeAnomalies×10) + (empty?5:0) + emptySlots + (duplicated×2) + lowDemand"
                note="點擊任一列可直接跳到貨架詳情"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {topProblematic.map(({ e, issues, recommendation }, i) => {
                const prop = layout.find((p) => p.index === e.propIndex)
                const pLabel = prop ? propLabel(prop.containerID, lang) : '—'
                return (
                  <div
                    key={e.propIndex}
                    onClick={() => setSelectedIdx(e.propIndex)}
                    className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs transition-colors hover:bg-accent"
                  >
                    <span className="w-6 shrink-0 text-center font-bold text-rose-600 dark:text-rose-400">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {lang === 'en' ? `Prop #${e.propIndex}` : `物件 #${e.propIndex}`} · {pLabel}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        <span className="text-rose-700 dark:text-rose-300">{issues.join('、')}</span>
                        <span className="mx-1">→</span>
                        <span className="text-emerald-700 dark:text-emerald-300">{recommendation}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Efficiency leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-sky-500" />
              貨架效率排行
            </CardTitle>
            <ConfidenceBadge
              confidence="proxy"
              formula={effResult.formula}
              note={effResult.note}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>{lang === 'en' ? 'Container' : '容器'}</TableHead>
                  <SortableTh label="Units" k="totalUnits" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  <SortableTh label="Distinct" k="distinctProducts" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  <SortableTh label="Shelf Value" k="shelfValue" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  <SortableTh label="Demand Cov" k="demandCoverage" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  <SortableTh label="Empty" k="emptySlots" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  <TableHead className="text-right">Anom</TableHead>
                  <TableHead className="text-right">Dup</TableHead>
                  <SortableTh label="Efficiency" k="efficiency" sortKey={sortKey} sortDir={sortDir} onSort={(k, d) => { setSortKey(k); setSortDir(d) }} />
                  {room && <TableHead>分配</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEffs.map((e, i) => {
                  const prop = layout.find((p) => p.index === e.propIndex)
                  const pLabel = prop ? propLabel(prop.containerID, lang) : `#?`
                  const pColor = prop ? propColor(prop.containerID) : FALLBACK_COLOR
                  const assignment = room?.shelfAssignments[String(e.propIndex)]
                  const assignedMember = assignment ? room?.members.find((m) => m.id === assignment) : null
                  return (
                    <TableRow
                      key={e.propIndex}
                      className="cursor-pointer"
                      onClick={() => setSelectedIdx(e.propIndex)}
                      data-state={selectedIdx === e.propIndex ? 'selected' : undefined}
                    >
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: pColor }}
                          />
                          <span className="text-xs">{pLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{e.totalUnits}</TableCell>
                      <TableCell className="text-right font-mono">{e.distinctProducts}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(e.shelfValue)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(e.demandCoverage, 5)}</TableCell>
                      <TableCell className={`text-right font-mono ${e.emptySlots > 0 ? 'text-rose-600' : ''}`}>{e.emptySlots}</TableCell>
                      <TableCell className={`text-right font-mono ${e.negativeAnomalies > 0 ? 'text-rose-600 font-bold' : ''}`}>{e.negativeAnomalies}</TableCell>
                      <TableCell className={`text-right font-mono ${e.duplicatedProducts > 0 ? 'text-fuchsia-600' : ''}`}>{e.duplicatedProducts}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(e.efficiency, 0)}</TableCell>
                      {room && (
                        <TableCell>
                          {assignedMember ? (
                            <Badge variant="outline" className="text-xs" style={{ borderLeft: `3px solid ${assignedMember.color}` }}>
                              {assignedMember.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Room assignment hint when no room */}
      {!room && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Boxes className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">多人房間模式：</span>
              建立或加入房間後，可在此分配每個貨架給特定玩家，並在地图上以該玩家顏色標示。
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room assignment controls */}
      {room && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-fuchsia-500" />
              貨架分配（房間模式）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">選擇玩家後，至下方表格或地图貨架點擊分配：</span>
              <Select value={assignPlayerId} onValueChange={setAssignPlayerId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="選擇玩家" />
                </SelectTrigger>
                <SelectContent>
                  {room.members.filter((m) => m.id).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignPlayerId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (selectedIdx == null) return
                    assignShelf(String(selectedIdx), assignPlayerId)
                  }}
                  disabled={selectedIdx == null}
                >
                  分配貨架 #{selectedIdx ?? '?'} → {room.members.find((m) => m.id === assignPlayerId)?.name}
                </Button>
              )}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              目前已分配 {Object.keys(room.shelfAssignments).length} / {layout.length} 個貨架
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================
// Structure layer — static geometry from level0 scene
// (floor tiles, outer walls, wall tops, pillars).
// Rendered inside the Y-flip wrapper so coords are natural Unity
// world coords (SVG x = world X, SVG y = world Z).
// ============================================================
function StructureLayerView({
  floor,
  outerWall,
  wallTop,
  pillar,
  minX,
  maxX,
  minZ,
  maxZ,
}: {
  floor: StructureObject[]
  outerWall: StructureObject[]
  wallTop: StructureObject[]
  pillar: StructureObject[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Full-floor muted rectangle so the store footprint reads as one shape */}
      <rect
        x={minX + VIEW_PAD}
        y={minZ + VIEW_PAD}
        width={maxX - minX - 2 * VIEW_PAD}
        height={maxZ - minZ - 2 * VIEW_PAD}
        className="fill-muted"
        stroke="#94a3b8"
        strokeOpacity={0.4}
        strokeWidth={0.04}
        rx={0.2}
      />

      {/* Floor tiles — subtle grid pattern showing individual tiles */}
      {floor.map((o, i) => (
        <rect
          key={`floor-${i}`}
          x={o.x - 2.5}
          y={o.z - 4}
          width={5}
          height={8}
          fill="#f1f5f9"
          fillOpacity={0.5}
          className="dark:fill-slate-800"
          stroke="#cbd5e1"
          strokeOpacity={0.6}
          strokeWidth={0.03}
        />
      ))}

      {/* Outer walls — thick dark strokes along the perimeter.
          We draw the 4 perimeter edges (left/right/front/back) using the
          level0 bounding box, plus small markers at each outerWall object
          position to show the actual wall-segment grid. */}
      <g stroke="#475569" strokeWidth={0.4} strokeLinecap="round" className="dark:stroke-slate-400">
        {/* Left wall (X = minX+pad) */}
        <line
          x1={minX + VIEW_PAD}
          y1={minZ + VIEW_PAD}
          x2={minX + VIEW_PAD}
          y2={maxZ - VIEW_PAD}
        />
        {/* Right wall (X = maxX-pad) */}
        <line
          x1={maxX - VIEW_PAD}
          y1={minZ + VIEW_PAD}
          x2={maxX - VIEW_PAD}
          y2={maxZ - VIEW_PAD}
        />
        {/* Back wall (Z = maxZ-pad) — solid, no doors */}
        <line
          x1={minX + VIEW_PAD}
          y1={maxZ - VIEW_PAD}
          x2={maxX - VIEW_PAD}
          y2={maxZ - VIEW_PAD}
        />
        {/* Front wall (Z = minZ+pad) — has 4 door gaps at X = -9, -3, 3, 9 */}
        <line
          x1={minX + VIEW_PAD}
          y1={minZ + VIEW_PAD}
          x2={-10.5}
          y2={minZ + VIEW_PAD}
        />
        <line
          x1={-7.5}
          y1={minZ + VIEW_PAD}
          x2={-4.5}
          y2={minZ + VIEW_PAD}
        />
        <line
          x1={-1.5}
          y1={minZ + VIEW_PAD}
          x2={1.5}
          y2={minZ + VIEW_PAD}
        />
        <line
          x1={4.5}
          y1={minZ + VIEW_PAD}
          x2={7.5}
          y2={minZ + VIEW_PAD}
        />
        <line
          x1={10.5}
          y1={minZ + VIEW_PAD}
          x2={maxX - VIEW_PAD}
          y2={minZ + VIEW_PAD}
        />
      </g>

      {/* Outer-wall object markers — small squares at each wall-segment pivot */}
      {outerWall.map((o, i) => (
        <rect
          key={`ow-${i}`}
          x={o.x - 0.2}
          y={o.z - 0.2}
          width={0.4}
          height={0.4}
          fill="#64748b"
          fillOpacity={0.65}
          className="dark:fill-slate-500"
        />
      ))}

      {/* Wall-top highlight — thin lighter line above the front wall */}
      {wallTop.map((o, i) => (
        <rect
          key={`wt-${i}`}
          x={o.x - 2.5}
          y={o.z - 0.1}
          width={5}
          height={0.2}
          fill="#94a3b8"
          fillOpacity={0.7}
          className="dark:fill-slate-500"
        />
      ))}

      {/* Pillars — small filled squares at each pillar position */}
      {pillar.map((o, i) => (
        <rect
          key={`pillar-${i}`}
          x={o.x - 0.3}
          y={o.z - 0.3}
          width={0.6}
          height={0.6}
          fill="#64748b"
          className="dark:fill-slate-500"
          stroke="#334155"
          strokeOpacity={0.6}
          strokeWidth={0.04}
          rx={0.04}
        />
      ))}
    </g>
  )
}

// ============================================================
// Sortable table header
// ============================================================
function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey, dir: 'asc' | 'desc') => void
}) {
  const active = sortKey === k
  return (
    <TableHead className="text-right">
      <button
        className="inline-flex items-center gap-1 text-xs hover:text-foreground"
        onClick={() => onSort(k, active && sortDir === 'desc' ? 'asc' : 'desc')}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
        {active && <span className="text-[9px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </button>
    </TableHead>
  )
}

// ============================================================
// Prop detail card
// ============================================================
function PropDetailCard({
  prop,
  eff,
  demandCache,
  lang,
  onClose,
  room,
  onAssign,
}: {
  prop: LayoutProp
  eff: PropEfficiency
  demandCache: Map<number, number>
  lang: ReturnType<typeof useLang>
  onClose: () => void
  room: ReturnType<typeof useRoomStore.getState>['room']
  onAssign: (playerId: string) => void
}) {
  const label = propLabel(prop.containerID, lang)
  const classKey = containerClassKeyFor(prop.containerID)
  const classMeta = CONTAINER_CLASS_META[classKey]
  const info = containerInfoFor(prop.containerID)
  const inventory = prop.inventory.filter((i) => i.product >= 0)
  const assignment = room?.shelfAssignments[String(prop.index)]
  const assignedMember = assignment ? room?.members.find((m) => m.id === assignment) : null
  const isDecoration = classKey === 'decoration'

  return (
    <Card className="border-emerald-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: classMeta.color }}
              />
              {lang === 'en' ? `Prop #${prop.index}` : `物件 #${prop.index}`}
              <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                {lang === 'en' ? classMeta.labelEn : classMeta.labelZh}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs font-normal text-muted-foreground">
              {label}
              {isDecoration && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  ({lang === 'en' ? 'unmapped id' : '未對應 ID'})
                </span>
              )}
            </div>
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <div className="rounded border bg-muted/20 px-2 py-1">
            <div className="text-muted-foreground">posX</div>
            <div className="font-mono">{fmt(prop.posX, 2)}</div>
          </div>
          <div className="rounded border bg-muted/20 px-2 py-1">
            <div className="text-muted-foreground">posZ</div>
            <div className="font-mono">{fmt(prop.posZ, 2)}</div>
          </div>
          <div className="rounded border bg-muted/20 px-2 py-1">
            <div className="text-muted-foreground">angle</div>
            <div className="font-mono">{prop.angle}°</div>
          </div>
        </div>

        {/* Container metadata: zone + dimensions + cost */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <Badge variant="outline" className="h-5 font-normal">
            {lang === 'en' ? 'Zone' : '區域'}: {zoneLabel(prop.zoneCode, lang)}
          </Badge>
          {info && (
            <>
              <Badge variant="outline" className="h-5 font-mono font-normal">
                {lang === 'en' ? 'Size' : '尺寸'}: {fmt(info.shelfLength, 2)} × {fmt(info.shelfWidth, 2)} × {fmt(info.shelfHeight, 2)}
              </Badge>
              <Badge variant="outline" className="h-5 font-normal">
                {lang === 'en' ? 'Cost' : '成本'}: ${info.cost}
              </Badge>
              {info.energyCost > 0 && (
                <Badge variant="outline" className="h-5 font-normal">
                  {lang === 'en' ? 'Energy' : '耗電'}: {info.energyCost}W
                </Badge>
              )}
              <Badge variant="outline" className="h-5 font-mono font-normal">
                ID: {prop.containerID}
              </Badge>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatCard label="總單位" value={eff.totalUnits} confidence="confirmed" accent="neutral" />
          <StatCard label="Distinct" value={eff.distinctProducts} confidence="confirmed" accent="neutral" />
          <StatCard label="貨架價值" value={fmtMoney(eff.shelfValue)} confidence="proxy" formula="Σ count × basePrice" accent="good" />
          <StatCard label="Demand Cov" value={fmt(eff.demandCoverage, 5)} confidence="proxy" formula="Σ count × demandProxy" accent="neutral" />
          <StatCard
            label="空格"
            value={eff.emptySlots}
            confidence="proxy"
            accent={eff.emptySlots > 0 ? 'bad' : 'good'}
          />
          <StatCard
            label="負庫存"
            value={eff.negativeAnomalies}
            confidence="proxy"
            accent={eff.negativeAnomalies > 0 ? 'bad' : 'good'}
          />
        </div>

        {eff.duplicatedProducts > 0 && (
          <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-2 text-xs text-fuchsia-700 dark:text-fuchsia-300">
            <span className="font-semibold">偵測到 {eff.duplicatedProducts} 個重複商品</span>{' '}
            — 部分商品同時出現在此貨架與其他貨架
          </div>
        )}

        {/* Inventory list */}
        <div>
          <h5 className="mb-1 text-xs font-semibold text-muted-foreground">庫存清單</h5>
          <div className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin pr-1">
            {inventory.length === 0 ? (
              <div className="rounded border bg-muted/20 p-2 text-center text-xs text-muted-foreground">無庫存</div>
            ) : (
              inventory.map((inv, i) => {
                const p = ENC.products.find((x) => x.id === inv.product)
                const demand = demandCache.get(inv.product) ?? 0
                return (
                  <div
                    key={`${inv.product}-${i}`}
                    className="flex items-center gap-2 rounded border bg-card px-2 py-1 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{productNameFor(inv.product, lang)}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        #{inv.product} · {p?.brand} · demand {fmt(demand, 4)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-mono font-bold ${
                        inv.count < 0
                          ? 'text-rose-600'
                          : inv.count === 0
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                      }`}
                    >
                      {inv.count}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Room assignment */}
        {room && (
          <div>
            <h5 className="mb-1 text-xs font-semibold text-muted-foreground">分配給玩家</h5>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={assignment ? 'outline' : 'default'}
                className="h-7 text-xs"
                onClick={() => onAssign('')}
                disabled={!assignment}
              >
                清除
              </Button>
              {room.members.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={assignment === m.id ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  style={assignment === m.id ? { backgroundColor: m.color, borderColor: m.color } : { borderLeft: `3px solid ${m.color}` }}
                  onClick={() => onAssign(m.id)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
            {assignedMember && (
              <div className="mt-1 text-xs text-muted-foreground">
                目前分配給 <span className="font-medium" style={{ color: assignedMember.color }}>{assignedMember.name}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
