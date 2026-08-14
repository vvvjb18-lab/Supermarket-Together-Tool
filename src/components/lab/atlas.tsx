'use client'

// =====================================================================
// Complete Game Atlas (完整圖譜) — Task 12-a
// Visualizes all 18 entity types in encyclopedia.json + their relationships.
// 4 sub-views:
//   1. 資料模型圖譜 — interactive SVG of 18 entity-type nodes + edges
//   2. 商品階層樹  — collapsible ProductGroup → Tier → Product tree
//   3. 顧客-需求-商品 關係網 — customer demand chain explorer
//   4. 製造鏈圖    — manufacturing product flow diagram
// =====================================================================

import { useMemo, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronRight,
  ChevronDown,
  Search,
  Eye,
  Boxes,
  Users,
  Factory,
  Network as NetworkIcon,
  Crown,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLang, groupIdNameFor, productNameFor, tierIdNameFor } from '@/lib/i18n'
import { encyclopedia } from '@/lib/data-loader'
import {
  ENTITY_TYPES,
  ENTITY_CATEGORIES,
  ATLAS_NODES,
  ATLAS_EDGES,
  TOTAL_RELATIONSHIPS,
  getEntityTypeSamples,
  getRelationships,
  productHierarchy,
  customerDemandChain,
  customerDemandStats,
  manufacturingChains,
  atlasNodeById,
  type EntityTypeKey,
  type AtlasNode,
  type HierarchyGroup,
} from '@/lib/atlas-data'

// ---------- local UI strings (繁中 / en) ----------

const STR = {
  title: { zhHant: '遊戲完整圖譜', en: 'Complete Game Atlas' },
  subtitle: (n: number) => ({
    zhHant: `18 個資料實體 · ${n} 條關係連結 · 互動式視覺化`,
    en: `18 data entities · ${n} relationship links · interactive visualization`,
  }),
  tab1: { zhHant: '資料模型圖譜', en: 'Data Model Graph' },
  tab2: { zhHant: '商品階層樹', en: 'Product Hierarchy' },
  tab3: { zhHant: '顧客-需求-商品 關係網', en: 'Customer-Necessity-Product Network' },
  tab4: { zhHant: '製造鏈圖', en: 'Manufacturing Chain' },
  reset: { zhHant: '重置選取', en: 'Reset selection' },
  zoomIn: { zhHant: '放大', en: 'Zoom in' },
  zoomOut: { zhHant: '縮小', en: 'Zoom out' },
  zoomReset: { zhHant: '重置視圖', en: 'Reset view' },
  legend: { zhHant: '圖例', en: 'Legend' },
  itemCount: { zhHant: '資料筆數', en: 'Item count' },
  samples: { zhHant: '範例資料', en: 'Sample items' },
  relationships: { zhHant: '關聯', en: 'Relationships' },
  noRelations: { zhHant: '無資料關聯（獨立實體）', en: 'No data relations (standalone entity)' },
  expandAll: { zhHant: '全部展開', en: 'Expand all' },
  collapseAll: { zhHant: '全部收合', en: 'Collapse all' },
  searchPh: { zhHant: '搜尋群組 / 階層 / 商品…', en: 'Search group / tier / product…' },
  pickCustomer: { zhHant: '請選擇一位顧客類型查看需求鏈', en: 'Pick a customer type to view its demand chain' },
  customerLabel: { zhHant: '顧客類型', en: 'Customer type' },
  topThree: { zhHant: '此顧客重視的需求 Top 3', en: 'Top 3 necessities for this customer' },
  totalProducts: { zhHant: '對應商品總數', en: 'Total products covered' },
  coveredGroups: { zhHant: '涵蓋商品群組', en: 'Covered product groups' },
  mfgProducts: { zhHant: '製造商品', en: 'Manufacturing Products' },
  baseProduct: { zhHant: '基礎商品', en: 'Base product' },
  itemsPerBox: { zhHant: '每箱數量', en: 'Items / box' },
  stackable: { zhHant: '可堆疊', en: 'Stackable' },
  notStackable: { zhHant: '不可堆疊', en: 'Not stackable' },
  viewAllChains: { zhHant: '查看全部製造鏈', en: 'View all manufacturing chains' },
  hideAllChains: { zhHant: '收合全部製造鏈', en: 'Hide all chains' },
  necessityComp: { zhHant: '需求成分', en: 'Necessity component' },
  seasonal: { zhHant: '季節商品', en: 'Seasonal' },
  selectMfg: { zhHant: '點擊任一製造商品卡片查看其生產鏈', en: 'Click a manufacturing card to see its chain' },
  edgeCount: (n: number) => ({ zhHant: `${n} 條連結`, en: `${n} links` }),
  products: { zhHant: '商品', en: 'Products' },
  groups: { zhHant: '群組', en: 'Groups' },
  customers: { zhHant: '顧客', en: 'Customers' },
  skills: { zhHant: '技能', en: 'Skills' },
  achievements: { zhHant: '成就', en: 'Achievements' },
  tiers: { zhHant: '階層', en: 'Tiers' },
}

type Lang = 'zhHant' | 'en' | 'both'
function pick<T>(s: { zhHant: T; en: T }, lang: Lang): T {
  return lang === 'en' ? s.en : s.zhHant
}

const SCROLLBAR_CLS =
  '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent'

// =====================================================================
// Shared header + stats strip
// =====================================================================

function AtlasHeader({ lang }: { lang: Lang }) {
  const stats = [
    { label: pick(STR.products, lang), value: encyclopedia.products.length, color: '#10b981' },
    { label: pick(STR.tiers, lang), value: encyclopedia.tiers.length, color: '#0ea5e9' },
    { label: pick(STR.groups, lang), value: encyclopedia.productGroups.length, color: '#0ea5e9' },
    { label: pick(STR.customers, lang), value: encyclopedia.customerTypes.length, color: '#f59e0b' },
    { label: pick(STR.skills, lang), value: encyclopedia.skills.length, color: '#d946ef' },
    { label: pick(STR.achievements, lang), value: encyclopedia.achievements.length, color: '#d946ef' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-sky-500 text-white shadow-lg">
          <Share2 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick(STR.title, lang)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pick(STR.subtitle(TOTAL_RELATIONSHIPS), lang)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 backdrop-blur"
            style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}
          >
            <div className="text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// VIEW 1 — Data Model Graph
// =====================================================================

function curvedPath(a: AtlasNode, b: AtlasNode): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  // perpendicular offset for the control point — gives a gentle arc
  const offset = Math.min(60, dist * 0.18)
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const cx = mx + (-dy / dist) * offset
  const cy = my + (dx / dist) * offset
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

function edgeThickness(count: number): number {
  // log-scale thickness between 0.6 and 5
  const t = 0.6 + Math.log2(count + 1) * 0.5
  return Math.min(t, 5)
}

function DataModelGraph({ lang }: { lang: Lang }) {
  const [selected, setSelected] = useState<EntityTypeKey | null>(null)
  const [hovered, setHovered] = useState<EntityTypeKey | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ x: number; y: number; px: number; py: number } | null>(null)

  const active = hovered ?? selected
  const relatedEdges = useMemo(() => {
    if (!active) return new Set<number>()
    const set = new Set<number>()
    ATLAS_EDGES.forEach((e, i) => {
      if (e.from === active || e.to === active) set.add(i)
    })
    return set
  }, [active])

  const relatedNodes = useMemo(() => {
    if (!active) return new Set<EntityTypeKey>()
    const set = new Set<EntityTypeKey>([active])
    ATLAS_EDGES.forEach((e) => {
      if (e.from === active) set.add(e.to)
      if (e.to === active) set.add(e.from)
    })
    return set
  }, [active])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      const target = e.target as SVGElement
      // only pan when clicking on empty SVG (not on a node/edge)
      if (target.tagName === 'circle' || target.tagName === 'path' || target.tagName === 'text') return
      setDrag({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y })
      ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
    },
    [pan],
  )
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!drag) return
      setPan({ x: drag.px + (e.clientX - drag.x), y: drag.py + (e.clientY - drag.y) })
    },
    [drag],
  )
  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    setDrag(null)
    ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.4, Math.min(3, z * delta)))
  }, [])

  const zoomBy = (factor: number) => setZoom((z) => Math.max(0.4, Math.min(3, z * factor)))
  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const selectedNode = selected ? atlasNodeById(selected) : null
  const selectedInfo = selected ? ENTITY_TYPES.find((e) => e.key === selected) : null
  const selectedRels = selected ? getRelationships(selected) : []
  const selectedSamples = selected ? getEntityTypeSamples(selected, 5) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <NetworkIcon className="h-4 w-4 text-fuchsia-500" />
            <span className="text-sm font-semibold">{pick(STR.tab1, lang)}</span>
            <Badge variant="secondary" className="text-[10px]">
              {ATLAS_NODES.length} nodes · {ATLAS_EDGES.length} edges
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => zoomBy(1.2)} title={pick(STR.zoomIn, lang)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => zoomBy(1 / 1.2)} title={pick(STR.zoomOut, lang)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={resetView} title={pick(STR.zoomReset, lang)}>
              <Maximize className="h-4 w-4" />
            </Button>
            {selected && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)} title={pick(STR.reset, lang)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="relative">
          <svg
            viewBox="0 0 1200 800"
            width="100%"
            className="block h-[520px] cursor-grab touch-none select-none active:cursor-grabbing md:h-[640px]"
            style={{ background: 'radial-gradient(ellipse at center, hsl(var(--card)) 0%, hsl(var(--background)) 70%)' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <defs>
              {/* radial gradients per category — lighter center → saturated edge */}
              {ENTITY_CATEGORIES.map((c) => (
                <radialGradient key={c.key} id={`grad-${c.key}`} cx="35%" cy="35%" r="75%">
                  <stop offset="0%" stopColor={c.color} stopOpacity={1} />
                  <stop offset="60%" stopColor={c.color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={c.color} stopOpacity={0.5} />
                </radialGradient>
              ))}
              <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35" />
              </filter>
              <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" floodOpacity="0.7" floodColor="#fff" />
              </filter>
            </defs>

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* edges */}
              {ATLAS_EDGES.map((edge, i) => {
                const from = atlasNodeById(edge.from)
                const to = atlasNodeById(edge.to)
                if (!from || !to) return null
                const isRelated = active == null || relatedEdges.has(i)
                const isHovered = hoveredEdge === i
                const d = curvedPath(from, to)
                const thickness = edgeThickness(edge.count)
                return (
                  <g key={`edge-${i}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isHovered ? from.color : 'currentColor'}
                      strokeOpacity={isHovered ? 0.95 : isRelated ? 0.55 : 0.12}
                      strokeWidth={isHovered ? thickness + 1.5 : thickness}
                      strokeDasharray={isRelated ? undefined : '4 4'}
                      className="text-muted-foreground transition-all duration-200"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredEdge(i)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    {isHovered && (
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 8}
                        textAnchor="middle"
                        className="pointer-events-none fill-background stroke-foreground text-[11px] font-semibold"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {pick(STR.edgeCount(edge.count), lang)}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* flowing animation overlay for related edges (when something is active) */}
              {active && (
                <g className="pointer-events-none">
                  {ATLAS_EDGES.map((edge, i) => {
                    if (!relatedEdges.has(i)) return null
                    const from = atlasNodeById(edge.from)
                    const to = atlasNodeById(edge.to)
                    if (!from || !to) return null
                    return (
                      <path
                        key={`flow-${i}`}
                        d={curvedPath(from, to)}
                        fill="none"
                        stroke={from.color}
                        strokeWidth={1.5}
                        strokeOpacity={0.9}
                        strokeDasharray="6 10"
                        className="atlas-edge-flow"
                      />
                    )
                  })}
                </g>
              )}

              {/* nodes */}
              {ATLAS_NODES.map((node) => {
                const isSelected = selected === node.id
                const isHovered = hovered === node.id
                const isRelated = active == null || relatedNodes.has(node.id)
                const dim = active != null && !isRelated
                const scale = isHovered ? 1.18 : 1
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y}) scale(${scale})`}
                    style={{ cursor: 'pointer', transition: 'transform 200ms ease-out, opacity 200ms' }}
                    opacity={dim ? 0.25 : 1}
                    onClick={() => setSelected(isSelected ? null : node.id)}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* selection ring */}
                    {isSelected && (
                      <circle r={node.r + 6} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeOpacity={0.9} />
                    )}
                    {/* hover ring */}
                    {isHovered && !isSelected && (
                      <circle r={node.r + 4} fill="none" stroke={node.color} strokeWidth={1.5} strokeOpacity={0.6} />
                    )}
                    {/* main circle */}
                    <circle
                      r={node.r}
                      fill={`url(#grad-${node.category})`}
                      stroke={node.color}
                      strokeWidth={2}
                      filter="url(#node-shadow)"
                    />
                    {/* inner highlight */}
                    <circle r={node.r * 0.55} cx={-node.r * 0.22} cy={-node.r * 0.22} fill="white" fillOpacity={isHovered ? 0.32 : 0.18} />
                    {/* label */}
                    <text
                      y={node.r + 16}
                      textAnchor="middle"
                      className="pointer-events-none fill-foreground text-[12px] font-semibold"
                    >
                      {node.label}
                    </text>
                    <text
                      y={node.r + 30}
                      textAnchor="middle"
                      className="pointer-events-none fill-muted-foreground text-[10px]"
                    >
                      {(() => {
                        const info = ENTITY_TYPES.find((e) => e.key === node.id)
                        return info?.count ?? 0
                      })()} items
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>

          {/* legend overlay */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border bg-card/80 p-2 backdrop-blur">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pick(STR.legend, lang)}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {ENTITY_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="text-[10px]">{pick({ zhHant: c.labelZh, en: c.labelEn }, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* side panel */}
      <Card className="h-fit p-4">
        {!selectedNode || !selectedInfo ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Eye className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm text-muted-foreground">
              {lang === 'en'
                ? 'Click a node to inspect its data and relationships.'
                : '點擊任一節點查看其資料筆數與關聯。'}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: selectedNode.color }}
                />
                <h3 className="text-base font-bold">{selectedInfo.labelZh}</h3>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{selectedInfo.labelEn}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-card/50 p-2">
                <div className="text-[10px] text-muted-foreground">{pick(STR.itemCount, lang)}</div>
                <div className="text-xl font-bold tabular-nums">{selectedInfo.count}</div>
              </div>
              <div className="rounded-lg border bg-card/50 p-2">
                <div className="text-[10px] text-muted-foreground">{pick(STR.legend, lang)}</div>
                <div className="text-sm font-semibold">
                  {ENTITY_CATEGORIES.find((c) => c.key === selectedInfo.category)?.labelZh}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                {pick(STR.samples, lang)}
              </div>
              <div className={`space-y-1.5 max-h-48 overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
                {selectedSamples.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.name}</div>
                      {s.sub && <div className="truncate text-[10px] text-muted-foreground">{s.sub}</div>}
                    </div>
                    <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">{s.id}</code>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                {pick(STR.relationships, lang)} ({selectedRels.length})
              </div>
              {selectedRels.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 px-2 py-3 text-xs text-muted-foreground">
                  {pick(STR.noRelations, lang)}
                </div>
              ) : (
                <div className={`space-y-1.5 max-h-64 overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
                  {selectedRels.map((r, i) => {
                    const targetInfo = ENTITY_TYPES.find((e) => e.key === r.targetType)
                    return (
                      <button
                        key={`${r.targetType}-${i}`}
                        onClick={() => setSelected(r.targetType)}
                        className="flex w-full items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent"
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${r.direction === 'out' ? 'bg-emerald-500' : 'bg-sky-500'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            {r.direction === 'out' ? (
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ArrowRight className="h-3 w-3 rotate-180 text-muted-foreground" />
                            )}
                            <span className="truncate font-medium">{r.targetLabelZh}</span>
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {r.label} · {targetInfo?.labelEn}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {r.count}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// =====================================================================
// VIEW 2 — Product Hierarchy Tree
// =====================================================================

function ProductHierarchyTree({ lang }: { lang: Lang }) {
  const tree = useMemo<HierarchyGroup[]>(() => productHierarchy(), [])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const expandAll = () => {
    const next = new Set<string>()
    for (const g of tree) {
      next.add(`g-${g.group.id}`)
      for (const t of g.tiers) next.add(`t-${g.group.id}-${t.tier.id}`)
    }
    setExpanded(next)
  }
  const collapseAll = () => setExpanded(new Set())

  const filtered = useMemo(() => {
    if (!query.trim()) return tree
    const q = query.toLowerCase()
    return tree
      .map((g) => {
        const gmatch =
          g.group.name.zhHant.toLowerCase().includes(q) ||
          g.group.name.en.toLowerCase().includes(q) ||
          `g${g.group.id}`.includes(q)
        const tiers = g.tiers
          .map((t) => {
            const tmatch =
              t.tier.name.toLowerCase().includes(q) ||
              t.tier.category.zhHant?.toLowerCase().includes(q) ||
              t.tier.category.en.toLowerCase().includes(q) ||
              `t${t.tier.id}`.includes(q)
            const products = t.products.filter(
              (p) =>
                p.name.zhHant.toLowerCase().includes(q) ||
                p.name.en.toLowerCase().includes(q) ||
                `p${p.id}`.includes(q) ||
                String(p.id).includes(q),
            )
            if (tmatch || products.length > 0) {
              return { ...t, products: tmatch ? t.products : products }
            }
            return null
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
        if (gmatch || tiers.length > 0) {
          return { ...g, tiers: gmatch ? g.tiers : tiers }
        }
        return null
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [tree, query])

  // auto-expand matches while searching
  const effectiveExpanded = useMemo(() => {
    if (!query.trim()) return expanded
    const next = new Set(expanded)
    for (const g of filtered) {
      next.add(`g-${g.group.id}`)
      for (const t of g.tiers) next.add(`t-${g.group.id}-${t.tier.id}`)
    }
    return next
  }, [expanded, filtered, query])

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={pick(STR.searchPh, lang)}
            className="pl-8"
          />
        </div>
        <Button size="sm" variant="outline" onClick={expandAll}>
          <ChevronDown className="h-4 w-4" />
          {pick(STR.expandAll, lang)}
        </Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>
          <ChevronRight className="h-4 w-4" />
          {pick(STR.collapseAll, lang)}
        </Button>
      </div>

      <div className={`max-h-[640px] overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {lang === 'en' ? 'No matches found.' : '找不到符合的項目。'}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((g) => {
              const gid = `g-${g.group.id}`
              const gOpen = effectiveExpanded.has(gid)
              const dot = `rgb(${Math.round(g.group.color.r * 255)},${Math.round(g.group.color.g * 255)},${Math.round(g.group.color.b * 255)})`
              return (
                <div key={gid}>
                  <button
                    onClick={() => toggle(gid)}
                    className="flex w-full items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    {gOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: dot }} />
                    <span className="flex-1 truncate text-sm font-semibold">
                      {groupIdNameFor(g.group.id, lang)}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {g.tiers.length} {pick(STR.tiers, lang)}
                    </Badge>
                    <Badge variant="outline" className="shrink-0">
                      {g.totalProducts} {pick(STR.products, lang)}
                    </Badge>
                  </button>
                  {gOpen && (
                    <div className="ml-3 mt-1 space-y-1 border-l pl-3">
                      {g.tiers.map((t) => {
                        const tid = `t-${g.group.id}-${t.tier.id}`
                        const tOpen = effectiveExpanded.has(tid)
                        return (
                          <div key={tid}>
                            <button
                              onClick={() => toggle(tid)}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-accent"
                            >
                              {tOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <Layers className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                              <span className="flex-1 truncate text-sm">
                                {tierIdNameFor(t.tier.id, lang)}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                ×{t.tier.inflation}
                              </span>
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {t.products.length}
                              </Badge>
                            </button>
                            {tOpen && (
                              <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-3">
                                {t.products.map((p) => {
                                  const isPremium = encyclopedia.premiumProducts.includes(p.id)
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors hover:bg-accent/60"
                                    >
                                      <Package className="h-3 w-3 shrink-0 text-emerald-500" />
                                      <code className="shrink-0 rounded bg-muted px-1 text-[10px]">
                                        #{p.id}
                                      </code>
                                      <span className="flex-1 truncate">{productNameFor(p.id, lang)}</span>
                                      <span className="shrink-0 text-[10px] text-muted-foreground">
                                        ${p.basePricePerUnit.toFixed(2)}
                                      </span>
                                      {isPremium && (
                                        <Badge className="shrink-0 bg-amber-500/20 text-amber-700 text-[10px] dark:text-amber-400">
                                          <Crown className="h-2.5 w-2.5" />
                                          {lang === 'en' ? 'Premium' : '頂級'}
                                        </Badge>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

// =====================================================================
// VIEW 3 — Customer-Necessity-Product Network
// =====================================================================

function CustomerNetwork({ lang }: { lang: Lang }) {
  const [customerIdx, setCustomerIdx] = useState<number | null>(null)

  const chain = useMemo(() => (customerIdx != null ? customerDemandChain(customerIdx) : []), [customerIdx])
  const stats = useMemo(() => (customerIdx != null ? customerDemandStats(customerIdx) : null), [customerIdx])

  // SVG layout: viewBox width 1200, height grows with visible necessities
  const visibleLinks = chain
  const svgHeight = Math.max(380, 80 + visibleLinks.length * 92)

  // customer node centered vertically on the left
  const customerY = svgHeight / 2
  // necessity nodes in a vertical stack, centered
  const necSpacing = 80
  const necStartY = Math.max(60, svgHeight / 2 - ((visibleLinks.length - 1) * necSpacing) / 2)

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_240px]">
      {/* left: customer selector */}
      <Card className="h-fit p-3">
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">{pick(STR.customerLabel, lang)}</span>
        </div>
        <Select value={customerIdx != null ? String(customerIdx) : '__none__'} onValueChange={(v) => setCustomerIdx(v === '__none__' ? null : Number(v))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={pick(STR.pickCustomer, lang)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {encyclopedia.customerTypes.map((c) => (
              <SelectItem key={c.index} value={String(c.index)}>
                <span className="font-mono text-[10px] text-muted-foreground">#{c.index}</span>
                <span className="truncate">{c.topSummary}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={`mt-2 max-h-[420px] space-y-0.5 overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
          {encyclopedia.customerTypes.map((c) => (
            <button
              key={c.index}
              onClick={() => setCustomerIdx(c.index)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                customerIdx === c.index
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-transparent hover:bg-accent'
              }`}
            >
              <code className="shrink-0 rounded bg-muted px-1 text-[10px]">#{c.index}</code>
              <span className="min-w-0 flex-1 truncate">{c.topSummary}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* center: SVG network */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <NetworkIcon className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">{pick(STR.tab3, lang)}</span>
          </div>
          {customerIdx != null && (
            <Badge variant="secondary" className="text-[10px]">
              {visibleLinks.length} necessities · {stats?.totalProducts ?? 0} products
            </Badge>
          )}
        </div>
        {customerIdx == null ? (
          <div className="flex h-[420px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Eye className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="max-w-xs text-sm text-muted-foreground">{pick(STR.pickCustomer, lang)}</div>
          </div>
        ) : (
          <div className={`max-h-[560px] overflow-y-auto ${SCROLLBAR_CLS}`}>
            <svg viewBox={`0 0 1200 ${svgHeight}`} width="100%" className="block">
              <defs>
                <radialGradient id="cust-grad" cx="35%" cy="35%" r="75%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#d97706" />
                </radialGradient>
                <radialGradient id="nec-grad" cx="35%" cy="35%" r="75%">
                  <stop offset="0%" stopColor="#fcd34d" />
                  <stop offset="100%" stopColor="#b45309" />
                </radialGradient>
                <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
                </linearGradient>
              </defs>

              {/* edges: customer → each necessity */}
              {visibleLinks.map((link, i) => {
                const necY = necStartY + i * necSpacing
                const weightNorm = Math.min(1, link.weight / 2)
                const strokeW = 1.2 + weightNorm * 6
                return (
                  <path
                    key={`e-cn-${i}`}
                    d={`M 180 ${customerY} C 320 ${customerY}, 320 ${necY}, 460 ${necY}`}
                    fill="none"
                    stroke="url(#edge-grad)"
                    strokeWidth={strokeW}
                    strokeOpacity={0.55}
                    strokeDasharray="8 6"
                    className="atlas-edge-flow-slow"
                  />
                )
              })}

              {/* edges: each necessity → its product chips */}
              {visibleLinks.map((link, i) => {
                const necY = necStartY + i * necSpacing
                const shown = link.products.slice(0, 6)
                return shown.map((p, j) => {
                  const px = 720 + j * 78
                  const py = necY
                  return (
                    <path
                      key={`e-np-${i}-${j}`}
                      d={`M 540 ${necY} C 620 ${necY}, ${px - 40} ${py}, ${px - 18} ${py}`}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={0.8}
                      strokeOpacity={0.35}
                    />
                  )
                })
              })}

              {/* customer node */}
              <g transform={`translate(100 ${customerY})`}>
                <circle r="56" fill="url(#cust-grad)" stroke="#d97706" strokeWidth={2.5} className="atlas-pulse" />
                <circle r="32" cx="-12" cy="-12" fill="white" fillOpacity={0.2} />
                <text textAnchor="middle" y={-6} className="fill-white text-[11px] font-bold">
                  Customer
                </text>
                <text textAnchor="middle" y={14} className="fill-white text-[18px] font-bold">
                  #{customerIdx}
                </text>
              </g>

              {/* necessity nodes + product chips */}
              {visibleLinks.map((link, i) => {
                const necY = necStartY + i * necSpacing
                const necR = 16 + Math.min(20, link.weight * 14)
                const shown = link.products.slice(0, 6)
                const more = link.products.length - shown.length
                return (
                  <g key={`nec-${i}`}>
                    {/* necessity node */}
                    <g transform={`translate(500 ${necY})`}>
                      <circle r={necR} fill="url(#nec-grad)" stroke="#b45309" strokeWidth={2} className="atlas-pulse-slow" />
                      <circle r={necR * 0.5} cx={-necR * 0.22} cy={-necR * 0.22} fill="white" fillOpacity={0.25} />
                    </g>
                    {/* necessity label */}
                    <text x={500} y={necY + necR + 16} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                      {link.necessity.name.zhHant || link.necessity.name.en}
                    </text>
                    <text x={500} y={necY + necR + 30} textAnchor="middle" className="fill-amber-600 text-[10px] font-bold dark:fill-amber-400">
                      ×{link.weight}
                    </text>

                    {/* product chips */}
                    {shown.map((p, j) => {
                      const px = 720 + j * 78
                      const py = necY
                      const w = 70
                      const h = 36
                      const isPremium = encyclopedia.premiumProducts.includes(p.id)
                      return (
                        <g key={`p-${i}-${j}`} transform={`translate(${px - w / 2} ${py - h / 2})`}>
                          <rect
                            width={w}
                            height={h}
                            rx={8}
                            fill={isPremium ? '#fef3c7' : 'hsl(var(--card))'}
                            stroke={isPremium ? '#f59e0b' : '#10b981'}
                            strokeWidth={1.2}
                            className="atlas-node-hover"
                          />
                          <text x={w / 2} y={14} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                            <tspan>{(productNameFor(p.id, lang).length > 11
                              ? productNameFor(p.id, lang).slice(0, 10) + '…'
                              : productNameFor(p.id, lang))}</tspan>
                          </text>
                          <text x={w / 2} y={26} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                            #{p.id}
                          </text>
                        </g>
                      )
                    })}
                    {more > 0 && (
                      <text
                        x={720 + shown.length * 78}
                        y={necY + 4}
                        className="fill-muted-foreground text-[10px] font-semibold"
                      >
                        +{more} more
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </Card>

      {/* right: stats */}
      <Card className="h-fit p-3">
        <div className="mb-2 text-sm font-semibold">{pick(STR.topThree, lang)}</div>
        {!stats ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {pick(STR.pickCustomer, lang)}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {stats.topThree.map((l, i) => (
                <div key={i} className="rounded-md border bg-card/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-medium">
                      {l.necessity.name.zhHant || l.necessity.name.en}
                    </span>
                    <Badge className="bg-amber-500/20 text-amber-700 text-[10px] dark:text-amber-400">×{l.weight}</Badge>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {l.products.length} {pick(STR.products, lang)}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-card/50 p-2">
              <div className="text-[10px] text-muted-foreground">{pick(STR.totalProducts, lang)}</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {stats.totalProducts}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                {pick(STR.coveredGroups, lang)}
              </div>
              <div className={`space-y-1 max-h-48 overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
                {stats.coveredGroups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{g.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{g.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// =====================================================================
// VIEW 4 — Manufacturing Chain
// =====================================================================

function ManufacturingChainView({ lang }: { lang: Lang }) {
  const chains = useMemo(() => manufacturingChains(), [])
  const [selectedId, setSelectedId] = useState<number | null>(chains[0]?.mfg.id ?? null)
  const [showAll, setShowAll] = useState(false)

  const selected = chains.find((c) => c.mfg.id === selectedId) ?? null

  // full SVG layout: base products on left, manufactured on right
  const ROW_H = 26
  const svgHeight = Math.max(400, chains.length * ROW_H + 60)

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold">{pick(STR.mfgProducts, lang)}</span>
            <Badge variant="secondary" className="text-[10px]">{chains.length}</Badge>
          </div>
          <Button size="sm" variant={showAll ? 'default' : 'outline'} onClick={() => setShowAll((v) => !v)}>
            {showAll ? (
              <>
                <Eye className="h-4 w-4" />
                {pick(STR.hideAllChains, lang)}
              </>
            ) : (
              <>
                <NetworkIcon className="h-4 w-4" />
                {pick(STR.viewAllChains, lang)}
              </>
            )}
          </Button>
        </div>

        <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-[480px] overflow-y-auto pr-1 ${SCROLLBAR_CLS}`}>
          {chains.map((c) => {
            const active = c.mfg.id === selectedId
            return (
              <button
                key={c.mfg.id}
                onClick={() => {
                  setSelectedId(c.mfg.id)
                  setShowAll(false)
                }}
                className={`rounded-xl border bg-card/50 px-3 py-2 text-left backdrop-blur transition-all hover:border-violet-500/60 hover:shadow-md ${
                  active ? 'border-violet-500 ring-2 ring-violet-500/30' : ''
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <code className="rounded bg-muted px-1 text-[10px]">#{c.mfg.id}</code>
                  <span className="truncate text-xs font-semibold">
                    {c.mfg.name.zhHant || c.mfg.name.en}
                  </span>
                </div>
                <div className="mt-1 truncate text-[10px] text-muted-foreground">
                  → {c.baseProduct ? productNameFor(c.baseProduct.id, lang) : `#${c.mfg.linkedProductID}`}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="text-[9px]">
                    <Boxes className="h-2.5 w-2.5" />
                    {c.mfg.itemsPerBox}
                  </Badge>
                  {c.mfg.isStackable && (
                    <Badge className="bg-emerald-500/20 text-emerald-700 text-[9px] dark:text-emerald-400">
                      {pick(STR.stackable, lang)}
                    </Badge>
                  )}
                  {c.isNecessityComponent && (
                    <Badge className="bg-amber-500/20 text-amber-700 text-[9px] dark:text-amber-400">
                      {pick(STR.necessityComp, lang)}
                    </Badge>
                  )}
                  {c.isSeasonal && (
                    <Badge className="bg-sky-500/20 text-sky-700 text-[9px] dark:text-sky-400">
                      {pick(STR.seasonal, lang)}
                    </Badge>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {showAll ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b px-3 py-2 text-sm font-semibold">{pick(STR.viewAllChains, lang)}</div>
          <div className={`overflow-auto ${SCROLLBAR_CLS}`}>
            <svg viewBox={`0 0 1200 ${svgHeight}`} width="100%" className="block min-w-[800px]">
              <defs>
                <linearGradient id="mfg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.7" />
                </linearGradient>
              </defs>
              {/* column headers */}
              <text x={140} y={24} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
                {pick(STR.baseProduct, lang)}
              </text>
              <text x={1060} y={24} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
                {pick(STR.mfgProducts, lang)}
              </text>
              <line x1={140} y1={36} x2={140} y2={svgHeight - 10} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2 4" />
              <line x1={1060} y1={36} x2={1060} y2={svgHeight - 10} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2 4" />

              {chains.map((c, i) => {
                const y = 56 + i * ROW_H
                const baseX = 140
                const mfgX = 1060
                const baseName = c.baseProduct
                  ? (productNameFor(c.baseProduct.id, lang).length > 16
                      ? productNameFor(c.baseProduct.id, lang).slice(0, 15) + '…'
                      : productNameFor(c.baseProduct.id, lang))
                  : `#${c.mfg.linkedProductID}`
                const mfgName = c.mfg.name.zhHant || c.mfg.name.en
                const mfgNameShort = mfgName.length > 16 ? mfgName.slice(0, 15) + '…' : mfgName
                return (
                  <g key={c.mfg.id} className="cursor-pointer" onClick={() => { setSelectedId(c.mfg.id); setShowAll(false) }}>
                    {/* curve */}
                    <path
                      d={`M ${baseX + 70} ${y} C ${(baseX + mfgX) / 2} ${y}, ${(baseX + mfgX) / 2} ${y}, ${mfgX - 70} ${y}`}
                      fill="none"
                      stroke={c.mfg.id === selectedId ? '#8b5cf6' : 'url(#mfg-grad)'}
                      strokeWidth={c.mfg.id === selectedId ? 2.5 : 1}
                      strokeOpacity={c.mfg.id === selectedId ? 1 : 0.5}
                    />
                    {/* base node */}
                    <rect x={baseX - 70} y={y - 11} width={140} height={22} rx={6} fill="hsl(var(--card))" stroke="#10b981" strokeWidth={1} />
                    <text x={baseX} y={y + 4} textAnchor="middle" className="fill-foreground text-[10px]">
                      <tspan>{baseName}</tspan>
                    </text>
                    {/* mfg node */}
                    <rect x={mfgX - 70} y={y - 11} width={140} height={22} rx={6} fill="hsl(var(--card))" stroke="#8b5cf6" strokeWidth={1} />
                    <text x={mfgX} y={y + 4} textAnchor="middle" className="fill-foreground text-[10px]">
                      <tspan>{mfgNameShort}</tspan>
                    </text>
                    {/* arrow head */}
                    <polygon
                      points={`${mfgX - 70},${y - 4} ${mfgX - 70},${y + 4} ${mfgX - 76},${y}`}
                      fill="#8b5cf6"
                    />
                  </g>
                )
              })}
            </svg>
          </div>
        </Card>
      ) : selected ? (
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold">
            {selected.mfg.name.zhHant || selected.mfg.name.en}
            <span className="ml-2 text-xs text-muted-foreground">
              #{selected.mfg.id} · {selected.mfg.name.en}
            </span>
          </div>
          {/* flow diagram */}
          <svg viewBox="0 0 900 240" width="100%" className="block">
            <defs>
              <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
              </marker>
            </defs>

            {/* base product node */}
            <g transform="translate(80 80)">
              <rect width={200} height={80} rx={12} fill="hsl(var(--card))" stroke="#10b981" strokeWidth={2} />
              <text x={100} y={28} textAnchor="middle" className="fill-emerald-600 text-[10px] font-semibold dark:fill-emerald-400">
                {pick(STR.baseProduct, lang)}
              </text>
              <text x={100} y={48} textAnchor="middle" className="fill-foreground text-[12px] font-bold">
                <tspan>
                  {selected.baseProduct
                    ? (productNameFor(selected.baseProduct.id, lang).length > 22
                        ? productNameFor(selected.baseProduct.id, lang).slice(0, 21) + '…'
                        : productNameFor(selected.baseProduct.id, lang))
                    : `#${selected.mfg.linkedProductID}`}
                </tspan>
              </text>
              {selected.baseProduct && (
                <text x={100} y={66} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                  #{selected.baseProduct.id} · ${selected.baseProduct.basePricePerUnit.toFixed(2)}
                </text>
              )}
            </g>

            {/* arrow */}
            <path
              d="M 290 120 C 380 120, 480 120, 570 120"
              fill="none"
              stroke="url(#flow-grad)"
              strokeWidth={3}
              markerEnd="url(#arrow)"
              className="atlas-edge-flow-slow"
            />
            <text x={425} y={108} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {pick(STR.itemsPerBox, lang)}: {selected.mfg.itemsPerBox}
            </text>

            {/* mfg product node */}
            <g transform="translate(580 80)">
              <rect width={240} height={80} rx={12} fill="hsl(var(--card))" stroke="#8b5cf6" strokeWidth={2} />
              <text x={120} y={28} textAnchor="middle" className="fill-violet-600 text-[10px] font-semibold dark:fill-violet-400">
                {pick(STR.mfgProducts, lang)}
              </text>
              <text x={120} y={48} textAnchor="middle" className="fill-foreground text-[12px] font-bold">
                <tspan>
                  {(selected.mfg.name.zhHant || selected.mfg.name.en).length > 26
                    ? (selected.mfg.name.zhHant || selected.mfg.name.en).slice(0, 25) + '…'
                    : selected.mfg.name.zhHant || selected.mfg.name.en}
                </tspan>
              </text>
              <text x={120} y={66} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                #{selected.mfg.id} · size {selected.mfg.size.x}×{selected.mfg.size.y}×{selected.mfg.size.z}
              </text>
            </g>

            {/* secondary connections badges */}
            <g transform="translate(80 200)">
              {selected.isNecessityComponent && (
                <g>
                  <rect width={140} height={26} rx={13} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
                  <text x={70} y={17} textAnchor="middle" className="fill-amber-700 text-[10px] font-semibold dark:fill-amber-400">
                    {pick(STR.necessityComp, lang)}
                  </text>
                </g>
              )}
            </g>
            <g transform="translate(680 200)">
              {selected.isSeasonal && (
                <g>
                  <rect width={140} height={26} rx={13} fill="#dbeafe" stroke="#0ea5e9" strokeWidth={1} />
                  <text x={70} y={17} textAnchor="middle" className="fill-sky-700 text-[10px] font-semibold dark:fill-sky-400">
                    {pick(STR.seasonal, lang)}
                  </text>
                </g>
              )}
              {selected.mfg.isStackable && (
                <g transform="translate(150 0)">
                  <rect width={140} height={26} rx={13} fill="#d1fae5" stroke="#10b981" strokeWidth={1} />
                  <text x={70} y={17} textAnchor="middle" className="fill-emerald-700 text-[10px] font-semibold dark:fill-emerald-400">
                    {pick(STR.stackable, lang)}
                  </text>
                </g>
              )}
            </g>
          </svg>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md border bg-card/50 p-2">
              <div className="text-[10px] text-muted-foreground">{pick(STR.baseProduct, lang)}</div>
              <div className="truncate font-semibold">
                {selected.baseProduct ? productNameFor(selected.baseProduct.id, lang) : '—'}
              </div>
            </div>
            <div className="rounded-md border bg-card/50 p-2">
              <div className="text-[10px] text-muted-foreground">{pick(STR.itemsPerBox, lang)}</div>
              <div className="font-semibold tabular-nums">{selected.mfg.itemsPerBox}</div>
            </div>
            <div className="rounded-md border bg-card/50 p-2">
              <div className="text-[10px] text-muted-foreground">{pick(STR.stackable, lang)}</div>
              <div className="font-semibold">
                {selected.mfg.isStackable ? pick(STR.stackable, lang) : pick(STR.notStackable, lang)}
              </div>
            </div>
            <div className="rounded-md border bg-card/50 p-2">
              <div className="text-[10px] text-muted-foreground">Size</div>
              <div className="font-semibold tabular-nums">
                {selected.mfg.size.x}×{selected.mfg.size.y}×{selected.mfg.size.z}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {pick(STR.selectMfg, lang)}
        </Card>
      )}
    </div>
  )
}

// =====================================================================
// Main Atlas component — Tabs shell
// =====================================================================

export function Atlas() {
  const lang = useLang()
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AtlasHeader lang={lang} />

      <Tabs defaultValue="model" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
          <TabsTrigger value="model" className="gap-1.5">
            <NetworkIcon className="h-4 w-4" />
            <span>{pick(STR.tab1, lang)}</span>
          </TabsTrigger>
          <TabsTrigger value="tree" className="gap-1.5">
            <Layers className="h-4 w-4" />
            <span>{pick(STR.tab2, lang)}</span>
          </TabsTrigger>
          <TabsTrigger value="network" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span>{pick(STR.tab3, lang)}</span>
          </TabsTrigger>
          <TabsTrigger value="mfg" className="gap-1.5">
            <Factory className="h-4 w-4" />
            <span>{pick(STR.tab4, lang)}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="model" className="mt-3">
          <DataModelGraph lang={lang} />
        </TabsContent>
        <TabsContent value="tree" className="mt-3">
          <ProductHierarchyTree lang={lang} />
        </TabsContent>
        <TabsContent value="network" className="mt-3">
          <CustomerNetwork lang={lang} />
        </TabsContent>
        <TabsContent value="mfg" className="mt-3">
          <ManufacturingChainView lang={lang} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-1.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
        <span>
          {lang === 'en'
            ? 'All 18 entity types and their foreign-key relationships, computed live from encyclopedia.json. No save required.'
            : '所有 18 個資料實體及其資料關聯，皆由 encyclopedia.json 即時運算。不需載入存檔。'}
        </span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: ATLAS_CSS }} />
    </div>
  )
}

// All keyframe animations + helper classes for the Atlas SVG views.
// Injected once at the root so all sub-views share them.
const ATLAS_CSS = `
@keyframes atlas-edge-flow { to { stroke-dashoffset: -16; } }
@keyframes atlas-edge-flow-slow { to { stroke-dashoffset: -14; } }
@keyframes atlas-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes atlas-pulse-slow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
.atlas-edge-flow {
  stroke-dasharray: 6 10;
  animation: atlas-edge-flow 1s linear infinite;
}
.atlas-edge-flow-slow {
  stroke-dasharray: 8 6;
  animation: atlas-edge-flow-slow 1.5s linear infinite;
}
.atlas-pulse {
  transform-origin: center;
  transform-box: fill-box;
  animation: atlas-pulse 2s ease-in-out infinite;
}
.atlas-pulse-slow {
  transform-origin: center;
  transform-box: fill-box;
  animation: atlas-pulse-slow 2.5s ease-in-out infinite;
}
.atlas-node-hover {
  transition: filter 200ms;
}
.atlas-node-hover:hover {
  filter: brightness(1.2);
}
`
