'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { skillGraph } from '@/lib/data-loader'
import { encyclopedia as ENC } from '@/lib/data-loader'
import { useSaveStore } from '@/lib/store'
import { useLang } from '@/lib/i18n'
import type { SkillGraphNode } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge, fmt } from '@/components/shared/primitives'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  CircleDot,
  Square,
  Lock,
  Unlock,
  Search,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadTsv } from '@/lib/export-utils'

// ============================================================
// SkillTreeView — interactive SVG graph of the in-game skill tree
// ============================================================
//
// Data source: skill-graph.json (extracted from Unity UI hierarchy).
// 99 nodes (44 perks + 55 category nodes), 93 edges (visual lines).
// IMPORTANT (from _meta.note): no perk prerequisites — all cost 1000 FP,
// lines are visual organization only (the UI connection structure).

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
}

function computeBounds(nodes: SkillGraphNode[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  const pad = 40
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

export function SkillTreeView() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const [showCategories, setShowCategories] = useState(true)
  const [showEdges, setShowEdges] = useState(true)
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const bounds = useMemo(() => computeBounds(skillGraph.nodes), [])
  const nodeById = useMemo(() => {
    const m = new Map<string, SkillGraphNode>()
    for (const n of skillGraph.nodes) m.set(n.id, n)
    return m
  }, [])

  // Unlocked perk indices from save (skillUnlocks = indices into the 44-perk array)
  const unlockedSet = useMemo(() => {
    const s = new Set<number>()
    if (snapshot?.skillUnlocks) {
      for (const idx of snapshot.skillUnlocks) s.add(idx)
    }
    return s
  }, [snapshot])

  // encyclopedia skill lookup by id (for extra fields)
  const encSkillById = useMemo(() => {
    const m = new Map<string, typeof ENC.skills[number]>()
    for (const s of ENC.skills) m.set(s.id, s)
    return m
  }, [])

  const filteredNodes = useMemo(() => {
    if (!showUnlockedOnly) return skillGraph.nodes
    return skillGraph.nodes.filter((n) => {
      if (n.type !== 'perk') return showCategories
      return unlockedSet.has(n.index)
    })
  }, [showUnlockedOnly, unlockedSet, showCategories])

  const visibleEdges = useMemo(() => {
    if (!showEdges) return []
    const visibleIds = new Set(filteredNodes.map((n) => n.id))
    return skillGraph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
  }, [showEdges, filteredNodes])

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const selectedEncSkill = selectedNode?.skill_id ? encSkillById.get(selectedNode.skill_id) ?? null : null

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(4, z * delta)))
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy })
  }, [])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const realPerkCount = skillGraph.nodes.filter((n) => n.type === 'perk' && !n.is_placeholder).length
  const placeholderCount = skillGraph.nodes.filter((n) => n.type === 'perk' && n.is_placeholder).length
  const unlockedCount = unlockedSet.size

  // helper: localized name for a node
  const nodeName = (n: SkillGraphNode): string => {
    if (lang === 'en') return n.name_en || n.raw_name || n.id
    const zh = n.name_zhHant
    if (lang === 'zhHant') return zh || n.name_en || n.id
    // both
    if (zh && n.name_en && zh !== n.name_en) return `${zh} / ${n.name_en}`
    return zh || n.name_en || n.id
  }

  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-emerald-500" />
            技能樹完整圖譜
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {skillGraph.nodes.length} 節點
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {skillGraph.edges.length} 連線
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {realPerkCount} 實技能
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {placeholderCount} 佔位（員工）
            </Badge>
            {unlockedCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
                <Unlock className="mr-1 h-2.5 w-2.5" />{unlockedCount}/44 已解鎖
              </Badge>
            )}
            <ConfidenceBadge
              confidence="confirmed"
              formula="skill-graph.json (Unity UI hierarchy)"
              note={skillGraph._meta.note}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>
            <ZoomIn className="mr-1 h-3 w-3" />放大
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setZoom((z) => Math.max(0.3, z * 0.83))}>
            <ZoomOut className="mr-1 h-3 w-3" />縮小
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={reset}>
            <Maximize2 className="mr-1 h-3 w-3" />重設
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant={showEdges ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowEdges((v) => !v)}
          >
            {showEdges ? <Eye className="mr-1 h-3 w-3" /> : <EyeOff className="mr-1 h-3 w-3" />}
            連線
          </Button>
          <Button
            variant={showCategories ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCategories((v) => !v)}
          >
            <Square className="mr-1 h-3 w-3" />
            分類節點
          </Button>
          {unlockedCount > 0 && (
            <Button
              variant={showUnlockedOnly ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowUnlockedOnly((v) => !v)}
            >
              <Unlock className="mr-1 h-3 w-3" />
              只看已解鎖
            </Button>
          )}
          <div className="ml-auto text-[10px] text-muted-foreground">
            拖曳平移 · 滾輪縮放 · 縮放 {fmt(zoom, 2)}×
          </div>
        </div>

        {/* SVG canvas */}
        <div
          className="relative h-[520px] w-full cursor-grab overflow-hidden rounded-md border bg-background active:cursor-grabbing"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <svg
            viewBox={viewBox}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center' }}
          >
            {/* Edges */}
            <g stroke="currentColor" className="text-muted-foreground/30">
              {visibleEdges.map((e) => {
                const a = nodeById.get(e.from)
                const b = nodeById.get(e.to)
                if (!a || !b) return null
                return (
                  <line
                    key={e.line}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    strokeWidth={0.8}
                  />
                )
              })}
            </g>

            {/* Category nodes */}
            {showCategories && filteredNodes.filter((n) => n.type === 'category').map((n) => (
              <g key={n.id} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); setSelectedId(n.id) }}>
                <rect
                  x={n.x - 5}
                  y={n.y - 5}
                  width={10}
                  height={10}
                  rx={1.5}
                  className="fill-zinc-400/50 stroke-zinc-500/60"
                  strokeWidth={0.5}
                />
                <text
                  x={n.x}
                  y={n.y + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 5, fontWeight: 400 }}
                >
                  {n.name_en.replace(/_/g, ' ')}
                </text>
              </g>
            ))}

            {/* Perk nodes */}
            {filteredNodes.filter((n) => n.type === 'perk').map((n) => {
              const isUnlocked = unlockedSet.has(n.index)
              const isSelected = selectedId === n.id
              const r = n.is_placeholder ? 7 : 8
              const fill = n.is_placeholder
                ? (isUnlocked ? '#f59e0b' : '#fbbf24')
                : (isUnlocked ? '#10b981' : '#34d399')
              const stroke = isSelected ? '#0ea5e9' : isUnlocked ? fill : 'rgba(0,0,0,0.2)'
              return (
                <Tooltip key={n.id}>
                  <TooltipTrigger asChild>
                    <g
                      className="cursor-pointer"
                      onClick={(ev) => { ev.stopPropagation(); setSelectedId(n.id) }}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r * (isSelected ? 1.3 : 1)}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSelected ? 2 : 0.8}
                        opacity={isUnlocked ? 1 : 0.55}
                      />
                      {isUnlocked && (
                        <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke={fill} strokeWidth={0.6} opacity={0.4} />
                      )}
                      <text
                        x={n.x}
                        y={n.y + r + 8}
                        textAnchor="middle"
                        className="fill-foreground"
                        style={{ fontSize: 5.5, fontWeight: 600 }}
                      >
                        {n.is_placeholder ? `員工${n.index + 1}` : (lang === 'en' ? n.name_en : (n.name_zhHant || n.name_en))}
                      </text>
                    </g>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{nodeName(n)}</span>
                        {n.is_placeholder && <Badge variant="outline" className="text-[9px] bg-amber-500/10">佔位</Badge>}
                        {isUnlocked && <Badge variant="outline" className="text-[9px] bg-emerald-500/10">已解鎖</Badge>}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {n.id} · perk#{n.index} · {n.skill_id}
                      </div>
                      {n.desc_en && <div className="italic">{n.desc_en}</div>}
                      <div className="text-[10px] text-muted-foreground">點擊查看詳情</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </svg>

          {/* Legend */}
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 rounded-md border bg-card/90 p-2 text-[10px] backdrop-blur">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>實技能（39）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span>員工佔位（5，+1 員工）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-emerald-500/30" />
              <span>已解鎖（外圈光環）</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-zinc-400/60" />
              <span>分類節點（產品 tier）</span>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
          <div className="font-semibold text-sky-700 dark:text-sky-300 mb-1">設計重點</div>
          <p className="text-muted-foreground leading-relaxed">
            {skillGraph._meta.note} — 每個技能獨立可用 1000 FP 購買，連線僅為 UI 視覺組織（非前置條件）。
            5 個佔位 perk（Employee I-V）各 +1 最大員工數；其餘 39 個為實際技能。
          </p>
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {selectedNode.type === 'perk' ? 'Perk' : 'Category'}
              </Badge>
              <span className="text-base font-semibold">{nodeName(selectedNode)}</span>
              {selectedNode.is_placeholder && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  佔位 perk
                </Badge>
              )}
              {selectedNode.type === 'perk' && unlockedSet.has(selectedNode.index) && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <Unlock className="mr-1 h-2.5 w-2.5" />已解鎖
                </Badge>
              )}
              {selectedNode.type === 'perk' && !unlockedSet.has(selectedNode.index) && (
                <Badge variant="outline" className="text-[10px] bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                  <Lock className="mr-1 h-2.5 w-2.5" />未解鎖
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div><span className="text-muted-foreground">node id：</span><span className="font-mono">{selectedNode.id}</span></div>
              <div><span className="text-muted-foreground">perk #：</span><span className="font-mono">{selectedNode.index}</span></div>
              {selectedNode.skill_id && <div><span className="text-muted-foreground">skill id：</span><span className="font-mono">{selectedNode.skill_id}</span></div>}
              <div><span className="text-muted-foreground">座標：</span><span className="font-mono">({selectedNode.x.toFixed(1)}, {selectedNode.y.toFixed(1)})</span></div>
              <div><span className="text-muted-foreground">成本：</span><span className="font-mono">1000 FP</span></div>
            </div>
            {selectedNode.desc_en && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">效果：</span>
                <span className="italic">{selectedNode.desc_en}</span>
              </div>
            )}
            {selectedEncSkill && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">encyclopedia：</span>
                <span className="font-mono">{selectedEncSkill.effect || '—'}</span>
                {selectedEncSkill.perk != null && <span className="ml-2 text-muted-foreground">perk={selectedEncSkill.perk}</span>}
              </div>
            )}
            {selectedNode.type === 'perk' && skillGraph.perk_to_category[selectedNode.id] && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">最近分類：</span>
                <span className="font-mono">{skillGraph.perk_to_category[selectedNode.id].category_name}</span>
                <span className="ml-2 text-muted-foreground">（距離 {skillGraph.perk_to_category[selectedNode.id].distance.toFixed(1)}）</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// PerksTableView — 44-perk TSV table with all columns
// ============================================================

type SortKey = 'index' | 'name' | 'category' | 'placeholder'

export function PerksTableView() {
  const lang = useLang()
  const snapshot = useSaveStore((s) => s.snapshot)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterPlaceholder, setFilterPlaceholder] = useState<'all' | 'real' | 'placeholder'>('all')

  const unlockedSet = useMemo(() => {
    const s = new Set<number>()
    if (snapshot?.skillUnlocks) {
      for (const idx of snapshot.skillUnlocks) s.add(idx)
    }
    return s
  }, [snapshot])

  const encSkillByPerk = useMemo(() => {
    const m = new Map<number, typeof ENC.skills[number]>()
    for (const s of ENC.skills) {
      if (s.perk != null) m.set(s.perk, s)
    }
    return m
  }, [])

  const rows = useMemo(() => {
    const perks = skillGraph.nodes.filter((n) => n.type === 'perk')
    let list = perks
    if (filterPlaceholder === 'real') list = list.filter((n) => !n.is_placeholder)
    else if (filterPlaceholder === 'placeholder') list = list.filter((n) => n.is_placeholder)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((n) =>
        n.name_en.toLowerCase().includes(q) ||
        (n.name_zhHant ?? '').toLowerCase().includes(q) ||
        (n.skill_id ?? '').toLowerCase().includes(q) ||
        (n.desc_en ?? '').toLowerCase().includes(q) ||
        String(n.index).includes(q)
      )
    }
    const sorted = [...list].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortKey === 'index') { av = a.index; bv = b.index }
      else if (sortKey === 'name') { av = (a.name_zhHant || a.name_en).toLowerCase(); bv = (b.name_zhHant || b.name_en).toLowerCase() }
      else if (sortKey === 'category') {
        av = skillGraph.perk_to_category[a.id]?.category_name ?? ''
        bv = skillGraph.perk_to_category[b.id]?.category_name ?? ''
      }
      else { av = a.is_placeholder ? 1 : 0; bv = b.is_placeholder ? 1 : 0 }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [query, sortKey, sortDir, filterPlaceholder])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const nameFor = (n: SkillGraphNode): string => {
    if (lang === 'en') return n.name_en || '—'
    if (lang === 'zhHant') return n.name_zhHant || n.name_en || '—'
    if (n.name_zhHant && n.name_en && n.name_zhHant !== n.name_en) return `${n.name_zhHant} / ${n.name_en}`
    return n.name_zhHant || n.name_en || '—'
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-500" />
            44 技能完整總表
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{rows.length} / 44</Badge>
            {unlockedSet.size > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <Unlock className="mr-1 h-2.5 w-2.5" />{unlockedSet.size} 已解鎖
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                const tsvRows = rows.map((n) => {
                  const enc = encSkillByPerk.get(n.index)
                  const cat = skillGraph.perk_to_category[n.id]
                  return {
                    perk_index: n.index,
                    skill_id: n.skill_id || '',
                    name_en: n.name_en || '',
                    name_zhHant: n.name_zhHant || '',
                    is_placeholder: n.is_placeholder ? 'true' : 'false',
                    desc_en: (n.desc_en || enc?.effect || '').replace(/\n/g, ' '),
                    effect: enc?.effect || '',
                    il: enc?.il || '',
                    nearest_category: cat?.category_name ?? '',
                    category_distance: cat?.distance ?? '',
                    x: n.x,
                    y: n.y,
                    unlocked: unlockedSet.has(n.index) ? 'true' : 'false',
                  }
                })
                downloadTsv(tsvRows, `skills-perks-${new Date().toISOString().slice(0, 10)}.tsv`)
              }}
            >
              <Download className="h-3 w-3" />
              下載 TSV
            </Button>
            <ConfidenceBadge
              confidence="confirmed"
              formula="perks.tsv + skill-graph.json"
              note="perk_index 0-43 對應存檔 skill_unlocks 陣列索引"
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full rounded-md border bg-background pl-7 pr-3 text-xs"
              placeholder="搜尋名稱 / skill_id / 描述…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'real', 'placeholder'] as const).map((f) => (
              <Button
                key={f}
                variant={filterPlaceholder === f ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilterPlaceholder(f)}
              >
                {f === 'all' ? '全部' : f === 'real' ? '實技能' : '員工佔位'}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[560px] overflow-auto scrollbar-thin rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-12 cursor-pointer text-right" onClick={() => toggleSort('index')}>
                  # {sortKey === 'index' && (sortDir === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="min-w-[160px] cursor-pointer" onClick={() => toggleSort('name')}>
                  名稱 {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="text-xs">skill_id</TableHead>
                <TableHead className="min-w-[200px]">效果 / 描述</TableHead>
                <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort('category')}>
                  最近分類 {sortKey === 'category' && (sortDir === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort('placeholder')}>
                  類型 {sortKey === 'placeholder' && (sortDir === 'asc' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="text-center">狀態</TableHead>
                <TableHead className="text-right">座標</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => {
                const enc = encSkillByPerk.get(n.index)
                const isUnlocked = unlockedSet.has(n.index)
                const cat = skillGraph.perk_to_category[n.id]
                return (
                  <TableRow key={n.id} data-state={isUnlocked ? 'selected' : undefined}>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{n.index}</TableCell>
                    <TableCell>
                      <div className="font-medium text-xs">{nameFor(n)}</div>
                      {n.name_en && n.name_zhHant && n.name_en !== n.name_zhHant && lang !== 'en' && (
                        <div className="text-[10px] text-muted-foreground">{n.name_en}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{n.skill_id || '—'}</TableCell>
                    <TableCell>
                      <span className="text-xs leading-relaxed text-muted-foreground whitespace-normal">
                        {n.desc_en || enc?.effect || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {cat?.category_name ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {n.is_placeholder ? (
                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                          佔位
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                          實技能
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isUnlocked ? (
                        <Badge variant="outline" className="text-[9px] bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30">
                          <Unlock className="mr-1 h-2.5 w-2.5" />已解鎖
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                      ({n.x.toFixed(0)}, {n.y.toFixed(0)})
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer summary */}
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">總 perk 數</div>
            <div className="font-mono text-lg font-bold">44</div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">實技能</div>
            <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {skillGraph.nodes.filter((n) => n.type === 'perk' && !n.is_placeholder).length}
            </div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">員工佔位</div>
            <div className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
              {skillGraph.nodes.filter((n) => n.type === 'perk' && n.is_placeholder).length}
            </div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] text-muted-foreground">總成本（全解鎖）</div>
            <div className="font-mono text-lg font-bold">44,000 FP</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
