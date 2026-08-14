'use client'

import { useMemo, useState, useCallback } from 'react'
import { useSaveStore, useUIStore } from '@/lib/store'
import { encyclopedia as ENC } from '@/lib/data-loader'
import {
  useLang,
  productNameFor,
  productNameOnly,
  groupIdNameFor,
  seasonIdNameFor,
  necessityIdNameFor,
  manufacturingIdNameFor,
} from '@/lib/i18n'
import {
  computeBoxValue,
  computeColliderVolume,
  computeValueDensity,
  computeBoxValueDensity,
  computeDemandProxy,
  computeWeightedBoxProxy,
} from '@/lib/engine'
import {
  ConfidenceBadge,
  StatCard,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Crown,
  Layers,
  Sparkles,
  Search,
  X,
} from 'lucide-react'
import type { Product, Confidence } from '@/lib/types'

// ---------- ProductRole ----------
type ProductRole =
  | 'premium'
  | 'seasonal'
  | 'high-value'
  | 'high-density'
  | 'staple'
  | 'trap'
  | 'unknown'

const ROLE_LABEL: Record<ProductRole, string> = {
  premium: 'Premium',
  seasonal: '季節',
  'high-value': '高單箱價值',
  'high-density': '高密度',
  staple: '民生主力',
  trap: '低價值陷阱',
  unknown: '一般',
}

const ROLE_STYLE: Record<ProductRole, string> = {
  premium: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  seasonal: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  'high-value': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'high-density': 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  staple: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  trap: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  unknown: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
}

// ---------- Precomputed per-product data ----------
interface ProductRow {
  p: Product
  boxValue: number
  colliderVolume: number
  valueDensity: number
  boxValueDensity: number
  demandProxy: number
  weightedValue: number
  role: ProductRole
  isPremium: boolean
  isStackable: boolean
  seasons: number[] // indices of seasons containing this product
  necessities: number[] // indices of necessities containing this product (via rawTokens)
  manufacturingLink: number | null // manufacturingProducts index, or null
  inventory: number // current inventory from snapshot, 0 if not loaded
  shelfProps: number[] // layout prop indices containing this product
}

// ---------- Helpers ----------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// ---------- Sort key ----------
type SortKey =
  | 'id'
  | 'basePrice'
  | 'boxValue'
  | 'colliderVolume'
  | 'valueDensity'
  | 'demandProxy'
  | 'weightedValue'
  | 'boxValueDensity'

type SortDir = 'asc' | 'desc'

// ---------- Component ----------
export function Wiki() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)
  const selectedProductId = useUIStore((s) => s.selectedProductId)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const lang = useLang()

  // ---------- Precompute rows + percentiles ----------
  const { rows, stats, pct } = useMemo(() => {
    const inv = snapshot?.inventoryByProduct ?? {}
    const layout = snapshot?.storeLayout ?? ENC.storeLayout
    const propMap = new Map<number, number[]>() // productId -> propIndices
    for (const prop of layout) {
      for (const inv2 of prop.inventory) {
        if (inv2.product < 0) continue
        const arr = propMap.get(inv2.product) ?? []
        if (!arr.includes(prop.index)) arr.push(prop.index)
        propMap.set(inv2.product, arr)
      }
    }

    const raw: ProductRow[] = ENC.products.map((p) => {
      const boxValue = computeBoxValue(p).value
      const colliderVolume = computeColliderVolume(p).value
      const valueDensity = computeValueDensity(p).value
      const boxValueDensity = computeBoxValueDensity(p).value
      const demand = computeDemandProxy(p.id, ENC.necessities, ENC.customerTypes).value
      const weighted = computeWeightedBoxProxy(p, demand).value
      const seasons: number[] = []
      for (const s of ENC.seasons) {
        if (s.productIds.includes(p.id)) seasons.push(s.index)
      }
      const necessities: number[] = []
      for (const n of ENC.necessities) {
        if (n.rawTokens.includes(p.id)) necessities.push(n.index)
      }
      const mfgIdx = ENC.manufacturingProducts.findIndex((m) => m.linkedProductID === p.id)
      return {
        p,
        boxValue,
        colliderVolume,
        valueDensity,
        boxValueDensity,
        demandProxy: demand,
        weightedValue: weighted,
        role: 'unknown' as ProductRole,
        isPremium: ENC.premiumProducts.includes(p.id),
        isStackable: p.isStackable,
        seasons,
        necessities,
        manufacturingLink: mfgIdx >= 0 ? mfgIdx : null,
        inventory: (inv[p.id] as number) ?? 0,
        shelfProps: propMap.get(p.id) ?? [],
      }
    })

    // percentiles for role classification
    const boxValues = raw.map((r) => r.boxValue).sort((a, b) => a - b)
    const densities = raw.map((r) => r.valueDensity).sort((a, b) => a - b)
    const demands = raw.map((r) => r.demandProxy).sort((a, b) => a - b)
    const p = {
      boxP75: percentile(boxValues, 0.75),
      densP75: percentile(densities, 0.75),
      densP25: percentile(densities, 0.25),
      demP25: percentile(demands, 0.25),
      demMedian: percentile(demands, 0.5),
    }

    for (const r of raw) {
      let role: ProductRole = 'unknown'
      if (r.isPremium) role = 'premium'
      else if (r.seasons.length > 0) role = 'seasonal'
      else if (r.boxValue > p.boxP75) role = 'high-value'
      else if (r.valueDensity > p.densP75) role = 'high-density'
      else if (r.p.tier <= 5 && r.demandProxy > p.demMedian) role = 'staple'
      else if (r.valueDensity < p.densP25 && r.demandProxy < p.demP25) role = 'trap'
      r.role = role
    }

    const stats = {
      total: raw.length,
      premium: raw.filter((r) => r.isPremium).length,
      seasonal: raw.filter((r) => r.seasons.length > 0).length,
      stackable: raw.filter((r) => r.isStackable).length,
      avgBoxValue: raw.reduce((s, r) => s + r.boxValue, 0) / raw.length,
    }

    return { rows: raw, stats, pct: p }
  }, [snapshot])

  // ---------- Filter state ----------
  const [text, setText] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [tier, setTier] = useState<string>('all')
  const [season, setSeason] = useState<string>('all')
  const [necessity, setNecessity] = useState<string>('all')
  const [premiumOnly, setPremiumOnly] = useState(false)
  const [stackableOnly, setStackableOnly] = useState(false)
  const [unlockedOnly, setUnlockedOnly] = useState(false)
  const [stockedOnly, setStockedOnly] = useState(false)
  const [missingHighDemand, setMissingHighDemand] = useState(false)
  const [highBoxValue, setHighBoxValue] = useState(false)
  const [highDensity, setHighDensity] = useState(false)
  const [lowValueTrap, setLowValueTrap] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Use selectedProductId from store as the open id directly — keeps state in sync
  // across pages (Dashboard "view in wiki" buttons etc.)
  const openId = selectedProductId

  const unlockedSet = useMemo(
    () => new Set(snapshot?.unlockedProducts ?? ENC.products.map((p) => p.id)),
    [snapshot],
  )
  const stockedSet = useMemo(() => {
    const s = new Set<number>()
    const inv = snapshot?.inventoryByProduct ?? {}
    for (const [id, c] of Object.entries(inv)) {
      if ((c as number) > 0) s.add(Number(id))
    }
    return s
  }, [snapshot])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    const demandThreshold = pct.demMedian // "high demand" filter threshold
    const out = rows.filter((r) => {
      if (q) {
        const hay = `${r.p.id} ${r.p.name.en} ${r.p.name.zhHant} ${r.p.name.zhHans} ${r.p.brand}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (group !== 'all' && String(r.p.group) !== group) return false
      if (tier !== 'all' && String(r.p.tier) !== tier) return false
      if (season !== 'all' && !r.seasons.includes(Number(season))) return false
      if (necessity !== 'all' && !r.necessities.includes(Number(necessity))) return false
      if (premiumOnly && !r.isPremium) return false
      if (stackableOnly && !r.isStackable) return false
      if (unlockedOnly && !unlockedSet.has(r.p.id)) return false
      if (stockedOnly && !stockedSet.has(r.p.id)) return false
      if (missingHighDemand && (stockedSet.has(r.p.id) || r.demandProxy <= demandThreshold)) return false
      if (highBoxValue && r.boxValue <= pct.boxP75) return false
      if (highDensity && r.valueDensity <= pct.densP75) return false
      if (lowValueTrap && !(r.valueDensity < pct.densP25 && r.demandProxy < pct.demP25)) return false
      return true
    })

    const sortVal = (r: ProductRow): number => {
      switch (sortKey) {
        case 'id': return r.p.id
        case 'basePrice': return r.p.basePricePerUnit
        case 'boxValue': return r.boxValue
        case 'colliderVolume': return r.colliderVolume
        case 'valueDensity': return r.valueDensity
        case 'demandProxy': return r.demandProxy
        case 'weightedValue': return r.weightedValue
        case 'boxValueDensity': return r.boxValueDensity
      }
    }
    out.sort((a, b) => {
      const av = sortVal(a)
      const bv = sortVal(b)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return out
  }, [
    rows, text, group, tier, season, necessity,
    premiumOnly, stackableOnly, unlockedOnly, stockedOnly,
    missingHighDemand, highBoxValue, highDensity, lowValueTrap,
    sortKey, sortDir, unlockedSet, stockedSet, pct,
  ])

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((cur) => {
      if (cur === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return cur
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const openRow = openId != null ? rows.find((r) => r.p.id === openId) ?? null : null

  const resetFilters = () => {
    setText('')
    setGroup('all')
    setTier('all')
    setSeason('all')
    setNecessity('all')
    setPremiumOnly(false)
    setStackableOnly(false)
    setUnlockedOnly(false)
    setStockedOnly(false)
    setMissingHighDemand(false)
    setHighBoxValue(false)
    setHighDensity(false)
    setLowValueTrap(false)
  }

  const anyFilterActive =
    text !== '' ||
    group !== 'all' ||
    tier !== 'all' ||
    season !== 'all' ||
    necessity !== 'all' ||
    premiumOnly ||
    stackableOnly ||
    unlockedOnly ||
    stockedOnly ||
    missingHighDemand ||
    highBoxValue ||
    highDensity ||
    lowValueTrap

  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">商品百科</h1>
        <p className="text-sm text-muted-foreground">
          全 {stats.total} 項商品 · 來源：encyclopedia.json (products.tsv + NPC_Manager reflection)
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="總商品數" value={stats.total} confidence="confirmed" formula="encyclopedia.products.length" />
        <StatCard label="Premium 商品" value={stats.premium} confidence="confirmed" formula="premiumProducts.length" accent="good" hint="encyclopedia.premiumProducts" />
        <StatCard label="季節性商品" value={stats.seasonal} confidence="confirmed" formula="Σ seasons[i].productIds ∩ products" accent="neutral" />
        <StatCard label="可堆疊" value={stats.stackable} confidence="confirmed" formula="products.isStackable=true" accent="neutral" />
        <StatCard
          label="平均單箱價值"
          value={fmtMoney(stats.avgBoxValue)}
          confidence="confirmed"
          formula="avg(boxValue) where boxValue=basePrice×maxItemsPerBox"
          accent="good"
        />
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" /> 篩選與排序
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">顯示 {filtered.length} / {rows.length}</Badge>
              {anyFilterActive && (
                <Button size="sm" variant="ghost" onClick={resetFilters} className="h-7 px-2 text-xs">
                  <X className="mr-1 h-3 w-3" /> 清除
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="搜尋 ID / 名稱 / 品牌…"
              className="h-8 w-56 text-sm"
            />
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger size="sm" className="h-8 w-44 text-xs"><SelectValue placeholder="商品群組" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有群組</SelectItem>
                {ENC.productGroups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{groupIdNameFor(g.id, lang)} ({g.id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger size="sm" className="h-8 w-40 text-xs"><SelectValue placeholder="Tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有 Tier</SelectItem>
                {ENC.tiers.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>Tier {t.id} · {t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger size="sm" className="h-8 w-40 text-xs"><SelectValue placeholder="季節" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有季節</SelectItem>
                {ENC.seasons.map((s) => (
                  <SelectItem key={s.index} value={String(s.index)}>{seasonIdNameFor(s.index, lang)} ({s.productIds.length})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={necessity} onValueChange={setNecessity}>
              <SelectTrigger size="sm" className="h-8 w-52 text-xs"><SelectValue placeholder="需求池" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有需求池</SelectItem>
                {ENC.necessities.map((n) => (
                  <SelectItem key={n.index} value={String(n.index)}>[{n.index}] {necessityIdNameFor(n.index, lang)} ({n.rawTokens.length})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ToggleChip label="Premium" icon={<Crown className="h-3 w-3" />} checked={premiumOnly} onChange={setPremiumOnly} />
            <ToggleChip label="可堆疊" icon={<Layers className="h-3 w-3" />} checked={stackableOnly} onChange={setStackableOnly} />
            <ToggleChip label="已解鎖" checked={unlockedOnly} onChange={setUnlockedOnly} />
            <ToggleChip label="現貨中" checked={stockedOnly} onChange={setStockedOnly} />
            <ToggleChip label="高需求未鋪" checked={missingHighDemand} onChange={setMissingHighDemand} />
            <ToggleChip label="高單箱價值 (P75)" checked={highBoxValue} onChange={setHighBoxValue} />
            <ToggleChip label="高密度 (P75)" checked={highDensity} onChange={setHighDensity} />
            <ToggleChip label="低價值陷阱 (P25)" checked={lowValueTrap} onChange={setLowValueTrap} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHead label="ID" k="id" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <TableHead className="min-w-[180px]">名稱</TableHead>
                  <TableHead className="min-w-[120px]">品牌</TableHead>
                  <TableHead>群組</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Tier</TableHead>
                  <SortHead label="basePrice" k="basePrice" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">maxItems</TableHead>
                  <SortHead label="boxValue" k="boxValue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="colliderVol" k="colliderVolume" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="$ / unit³" k="valueDensity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="demandProxy" k="demandProxy" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="weightedValue" k="weightedValue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <SortHead label="shelfSlotEff" k="boxValueDensity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                  <TableHead>角色</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.p.id}
                    onClick={() => setSelectedProduct(r.p.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.p.id}</TableCell>
                    <TableCell>
                      <span className="font-medium leading-tight">{productNameFor(r.p.id, lang)}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.p.brand}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            background: r.p.group != null
                              ? `rgb(${Math.round(ENC.productGroups[r.p.group].color.r * 255)},${Math.round(ENC.productGroups[r.p.group].color.g * 255)},${Math.round(ENC.productGroups[r.p.group].color.b * 255)})`
                              : '#888',
                          }}
                        />
                        {groupIdNameFor(r.p.group ?? 0, lang)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{r.p.tier}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.p.basePricePerUnit)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.p.maxItemsPerBox}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(r.boxValue)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(r.colliderVolume, 5)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(r.valueDensity, 2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(r.demandProxy, 5)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(r.weightedValue, 3)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmt(r.boxValueDensity, 2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${ROLE_STYLE[r.role]}`}>
                        {ROLE_LABEL[r.role]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                      無符合條件的商品。調整篩選器後重試。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedProduct(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {openRow && <ProductDetail row={openRow} pct={pct} onGoToProfit={() => setView('profit')} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------- Sortable header ----------
function SortHead({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  numeric,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
  numeric?: boolean
}) {
  const active = sortKey === k
  return (
    <TableHead className={numeric ? 'text-right' : ''}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

// ---------- Filter toggle chip ----------
function ToggleChip({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string
  icon?: React.ReactNode
  checked: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <Label className="flex cursor-pointer select-none items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-xs">
      <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7 data-[state=checked]:bg-primary" />
      {icon}
      <span>{label}</span>
    </Label>
  )
}

// ---------- Product detail sheet ----------
function ProductDetail({
  row,
  pct,
  onGoToProfit,
}: {
  row: ProductRow
  pct: { boxP75: number; densP75: number; densP25: number; demP25: number; demMedian: number }
  onGoToProfit: () => void
}) {
  const { p } = row
  const lang = useLang()
  const conf: Confidence = 'confirmed'
  const proxyConf: Confidence = 'proxy'
  const mfg = row.manufacturingLink != null ? ENC.manufacturingProducts[row.manufacturingLink] : null

  const roleFormula =
    row.role === 'premium' ? 'in premiumProducts list'
    : row.role === 'seasonal' ? `in season pool(s) [${row.seasons.join(', ')}]`
    : row.role === 'high-value' ? `boxValue ${fmt(row.boxValue)} > P75 ${fmt(pct.boxP75)}`
    : row.role === 'high-density' ? `valueDensity ${fmt(row.valueDensity)} > P75 ${fmt(pct.densP75)}`
    : row.role === 'staple' ? `tier ${p.tier}<=5 ∧ demandProxy ${fmt(row.demandProxy, 5)} > median ${fmt(pct.demMedian, 5)}`
    : row.role === 'trap' ? `valueDensity ${fmt(row.valueDensity)} < P25 ${fmt(pct.densP25)} ∧ demandProxy ${fmt(row.demandProxy, 5)} < P25 ${fmt(pct.demP25, 5)}`
    : 'falls through all role rules'

  return (
    <div>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${ROLE_STYLE[row.role]}`}>
            {ROLE_LABEL[row.role]}
          </Badge>
          {row.isPremium && <Badge variant="outline" className="text-[10px] border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"><Crown className="mr-1 h-3 w-3" />Premium</Badge>}
          {row.seasons.length > 0 && <Badge variant="outline" className="text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"><Sparkles className="mr-1 h-3 w-3" />季節</Badge>}
          {row.isStackable && <Badge variant="outline" className="text-[10px]"><Layers className="mr-1 h-3 w-3" />可堆疊</Badge>}
        </div>
        <SheetTitle className="text-xl">{productNameFor(p.id, lang)}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">#{p.id}</span>
          <span className="text-muted-foreground">· {p.brand}</span>
          <span className="text-muted-foreground">· Tier {p.tier}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-6">
        {/* Identity */}
        <DetailSection title="身份與分類">
          <DetailRow label="ID" value={<code className="font-mono text-xs">{p.id}</code>} conf={conf} formula="products[].id" />
          <DetailRow label="名稱 (en)" value={p.name.en} conf={conf} formula="products[].name.en" />
          <DetailRow label="名稱 (zhHant)" value={p.name.zhHant} conf={conf} formula="products[].name.zhHant" />
          <DetailRow label="名稱 (zhHans)" value={p.name.zhHans} conf={conf} formula="products[].name.zhHans" />
          <DetailRow label="品牌" value={p.brand} conf={conf} formula="products[].brand" />
          <DetailRow label="Tier" value={`Tier ${p.tier} · ${p.tierName}`} conf={conf} formula="products[].tier / tierName" />
          <DetailRow label="Tier 分類" value={p.category.zhHant} conf={conf} formula="products[].category" />
          <DetailRow label="商品群組" value={groupIdNameFor(p.group ?? 0, lang)} conf={conf} formula="products[].groupName" />
        </DetailSection>

        {/* Pricing */}
        <DetailSection title="價格與箱裝">
          <DetailRow label="basePricePerUnit" value={fmtMoney(p.basePricePerUnit)} conf={conf} formula="products[].basePricePerUnit" />
          <DetailRow label="playerPrice" value={fmtMoney(p.playerPrice)} conf={conf} formula="products[].playerPrice" />
          <DetailRow label="maxItemsPerBox" value={p.maxItemsPerBox} conf={conf} formula="products[].maxItemsPerBox" />
          <DetailRow
            label="boxValue"
            value={<span className="font-mono">{fmtMoney(row.boxValue)}</span>}
            conf={conf}
            formula="boxValue = basePricePerUnit × maxItemsPerBox"
          />
          <DetailRow
            label="valueDensity"
            value={<span className="font-mono">{fmt(row.valueDensity, 3)} $/u³</span>}
            conf={conf}
            formula="valueDensity = basePricePerUnit / colliderVolume"
          />
          <DetailRow
            label="boxValueDensity (shelf slot eff.)"
            value={<span className="font-mono">{fmt(row.boxValueDensity, 3)}</span>}
            conf={conf}
            formula="boxValueDensity = boxValue / colliderVolume"
          />
        </DetailSection>

        {/* Geometry */}
        <DetailSection title="幾何與貨櫃">
          <DetailRow label="containerClass" value={p.containerClass} conf={conf} formula="products[].containerClass" />
          <DetailRow label="boxClass" value={p.boxClass} conf={conf} formula="products[].boxClass" />
          <DetailRow label="isStackable" value={p.isStackable ? 'true' : 'false'} conf={conf} />
          <DetailRow
            label="colliderSize"
            value={<code className="font-mono text-xs">{p.colliderSize.x}, {p.colliderSize.y}, {p.colliderSize.z}</code>}
            conf={conf}
          />
          <DetailRow
            label="colliderCenter"
            value={<code className="font-mono text-xs">{p.colliderCenter.x}, {p.colliderCenter.y}, {p.colliderCenter.z}</code>}
            conf={conf}
          />
          <DetailRow
            label="trueColliderSize"
            value={p.trueColliderSize ? <code className="font-mono text-xs">{p.trueColliderSize.x}, {p.trueColliderSize.y}, {p.trueColliderSize.z}</code> : 'null'}
            conf={conf}
          />
          <DetailRow
            label="colliderVolume"
            value={<span className="font-mono">{fmt(row.colliderVolume, 6)} u³</span>}
            conf={conf}
            formula="colliderSize.x × y × z"
          />
        </DetailSection>

        {/* Demand */}
        <DetailSection title="需求與權重">
          <DetailRow
            label="demandProxy"
            value={<span className="font-mono">{fmt(row.demandProxy, 6)}</span>}
            conf={proxyConf}
            formula="Σcust Σnec (custWeight × necChance × tokenHits/rawPoolSize) / ΣcustWeight"
            note="Assumes equal spawn + uniform pick within pool"
          />
          <DetailRow
            label="weightedBoxProxy"
            value={<span className="font-mono">{fmt(row.weightedValue, 4)}</span>}
            conf={proxyConf}
            formula="demandProxy × boxValue"
          />
          <DetailRow
            label="necessity 池成員"
            value={
              row.necessities.length === 0
                ? <span className="text-xs text-muted-foreground">無</span>
                : (
                  <div className="flex flex-wrap gap-1">
                    {row.necessities.map((ni) => (
                      <Badge key={ni} variant="outline" className="text-[10px]">
                        [{ni}] {necessityIdNameFor(ni, lang)}
                      </Badge>
                    ))}
                  </div>
                )
            }
            conf={conf}
            formula="necessity.rawTokens.includes(id)"
          />
          <DetailRow
            label="季節池成員"
            value={
              row.seasons.length === 0
                ? <span className="text-xs text-muted-foreground">非季節商品</span>
                : (
                  <div className="flex flex-wrap gap-1">
                    {row.seasons.map((si) => (
                      <Badge key={si} variant="outline" className="text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                        {seasonIdNameFor(si, lang)}
                      </Badge>
                    ))}
                  </div>
                )
            }
            conf={conf}
            formula="seasons[i].productIds.includes(id)"
          />
          <DetailRow
            label="Premium 會員"
            value={row.isPremium ? '是' : '否'}
            conf={conf}
            formula="premiumProducts.includes(id)"
          />
        </DetailSection>

        {/* Manufacturing link */}
        {mfg && (
          <DetailSection title="製造連結">
            <DetailRow label="manufacturing id" value={<code className="font-mono text-xs">{mfg.id}</code>} conf={conf} />
            <DetailRow label="製造品名稱" value={manufacturingIdNameFor(mfg.id, lang)} conf={conf} />
            <DetailRow label="itemsPerBox" value={mfg.itemsPerBox} conf={conf} />
            <DetailRow label="isStackable (製造)" value={mfg.isStackable ? 'true' : 'false'} conf={conf} />
            <DetailRow
              label="製造品 size"
              value={<code className="font-mono text-xs">{mfg.size.x}, {mfg.size.y}, {mfg.size.z}</code>}
              conf={conf}
            />
          </DetailSection>
        )}

        {/* Snapshot state */}
        <DetailSection title="存檔狀態">
          <DetailRow
            label="目前庫存"
            value={row.inventory > 0 ? <span className="font-mono">{row.inventory} units</span> : <span className="text-xs text-muted-foreground">未鋪貨 / 無存檔</span>}
            conf={snapshotConf(row.inventory)}
            formula="snapshot.inventoryByProduct[id]"
          />
          <DetailRow
            label="貨架出現位置"
            value={
              row.shelfProps.length === 0
                ? <span className="text-xs text-muted-foreground">未在貨架上</span>
                : (
                  <div className="flex flex-wrap gap-1">
                    {row.shelfProps.map((pi) => (
                      <Badge key={pi} variant="outline" className="text-[10px]">prop #{pi}</Badge>
                    ))}
                  </div>
                )
            }
            conf={snapshotConf(row.shelfProps.length)}
            formula="snapshot.storeLayout[].inventory[].product === id"
          />
        </DetailSection>

        {/* Recommended role */}
        <DetailSection title="推薦角色分類">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-xs ${ROLE_STYLE[row.role]}`}>{ROLE_LABEL[row.role]}</Badge>
            <ConfidenceBadge confidence="proxy" formula={roleFormula} note="基於百分位與群集成員，純導出，非遊戲邏輯" />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{roleFormula}</p>
        </DetailSection>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="default" onClick={onGoToProfit}>
            <Boxes className="mr-1.5 h-4 w-4" /> 前往 Profit Lab
          </Button>
        </div>
      </div>
    </div>
  )
}

function snapshotConf(v: number): Confidence {
  return v > 0 ? 'confirmed' : 'needs-save'
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  conf,
  formula,
  note,
}: {
  label: string
  value: React.ReactNode
  conf: Confidence
  formula?: string
  note?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-card/50 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          <ConfidenceBadge confidence={conf} formula={formula} note={note} />
        </div>
        <div className="mt-0.5 text-sm">{value}</div>
      </div>
    </div>
  )
}
