'use client'

import { useMemo, useState } from 'react'
import { useSaveStore, useUIStore, useRoomStore } from '@/lib/store'
import { encyclopedia as ENC, productById as _productById } from '@/lib/data-loader'
import {
  computePriceSuggestion,
  computeBoxValue,
  computeDemandProxy,
} from '@/lib/engine'
import {
  ConfidenceBadge,
  StatCard,
  MiniBar,
  fmt,
  fmtMoney,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  Search,
  Check,
  Plus,
  FlaskConical,
  ThumbsUp,
  ThumbsDown,
  Wand2,
  Info,
} from 'lucide-react'
import type { Product, PriceExperiment } from '@/lib/types'

// Cast the imported map to its proper typed form (data-loader uses a Map
// whose tuple type is widened during JSON→typed cast; we restore it here).
const productById = _productById as unknown as Map<number, Product>

// ============================================================
// Pricing Lab
// ------------------------------------------------------------
// Honesty-first: customer price-acceptance formula is NOT extracted
// from IL. All suggestions are heuristic markup tiers. Every
// analytical surface gets a ConfidenceBadge so the player never
// mistakes heuristic for confirmed.
// ============================================================

export function Pricing() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const updatePricing = useSaveStore((s) => s.updatePricing)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const selectedProductId = useUIStore((s) => s.selectedProductId)
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct)
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const selfName = useRoomStore((s) => s.selfName)
  const addPriceExperiment = useRoomStore((s) => s.addPriceExperiment)

  // Effective selected product: fall back to first product if none chosen.
  const effectiveId = selectedProductId ?? ENC.products[0]?.id ?? null
  const product = effectiveId != null ? productById.get(effectiveId) ?? null : null

  const suggestion = useMemo(
    () => (product ? computePriceSuggestion(product) : null),
    [product],
  )
  const boxValue = useMemo(() => (product ? computeBoxValue(product) : null), [product])

  const playerPrice = useMemo(() => {
    if (!product) return 0
    const pricing = snapshot?.productPlayerPricing ?? {}
    return (pricing[product.id] as number | undefined) ?? product.playerPrice
  }, [product, snapshot])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      {/* Honesty callout */}
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">顧客價格接受公式未從 IL 提取</span>
              <ConfidenceBadge
                confidence="needs-runtime"
                formula={suggestion?.formula}
                note={suggestion?.value.note}
                className="text-sm"
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              所有建議為啟發式 markup（conservative ×1.0 / balanced ×1.15 / aggressive ×1.40），必須在遊戲內實測。
              使用下方的「實驗追蹤器」記錄觀察結果以收斂到最佳價格。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Product selector */}
      <ProductSelector
        selectedId={effectiveId}
        onSelect={(id) => setSelectedProduct(id)}
      />

      {/* Selected product + suggestion grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Selected product card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>選擇商品</span>
              {snapshot ? (
                <ConfidenceBadge confidence="confirmed" formula="snapshot.productPlayerPricing[productId]" />
              ) : (
                <ConfidenceBadge confidence="demo" note="顯示百科靜態資料 + Demo" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {product ? (
              <SelectedProductCard
                product={product}
                boxValue={boxValue?.value ?? 0}
                boxValueFormula={boxValue?.formula}
              />
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">尚未選擇商品</div>
            )}
          </CardContent>
        </Card>

        {/* Price suggestions */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>價格建議（啟發式 markup）</span>
              <ConfidenceBadge
                confidence="needs-runtime"
                formula={suggestion?.formula}
                note={suggestion?.value.note}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {product && suggestion ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard
                    label="Base (原價)"
                    value={fmtMoney(suggestion.value.base)}
                    confidence="confirmed"
                    formula="product.basePricePerUnit"
                    accent="neutral"
                  />
                  <StatCard
                    label="Conservative ×1.0"
                    value={fmtMoney(suggestion.value.conservative)}
                    confidence="needs-runtime"
                    formula="base × 1.0"
                    hint="不漲價，最大客群接受"
                    accent="good"
                  />
                  <StatCard
                    label="Balanced ×1.15"
                    value={fmtMoney(suggestion.value.balanced)}
                    confidence="needs-runtime"
                    formula="base × 1.15"
                    hint="推薦起點：15% markup"
                    accent="warn"
                  />
                  <StatCard
                    label="Aggressive ×1.40"
                    value={fmtMoney(suggestion.value.aggressive)}
                    confidence="needs-runtime"
                    formula="base × 1.40"
                    hint="高風險，客訴可能上升"
                    accent="bad"
                  />
                  <StatCard
                    label="Markup %"
                    value={fmt(suggestion.value.markupBalanced * 100, 0)}
                    unit="%"
                    confidence="needs-runtime"
                    formula="markupBalanced = 0.15"
                    hint="balanced 建議的 markup"
                    accent="neutral"
                  />
                </div>
                {/* BIG callout badge */}
                <div className="flex items-start gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">
                      Needs Runtime Validation
                    </span>
                    {' '}
                    — Exact customer price-acceptance formula not extracted; heuristic markup tiers. Validate in-game.
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">無建議</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Player price editor — keyed by product.id so draft state resets
          on product change (avoids setState-in-effect) */}
      <PlayerPriceEditor
        key={product?.id ?? 'none'}
        product={product}
        playerPrice={playerPrice}
        base={product?.basePricePerUnit ?? 0}
        balanced={suggestion?.value.balanced ?? 0}
        hasSnapshot={!!snapshot}
        onApply={updatePricing}
        onLoadDemo={loadDemo}
      />

      {/* Room vote panel */}
      {room && product && suggestion && (
        <RoomVotePanel
          product={product}
          balancedPrice={suggestion.value.balanced}
          oldPrice={playerPrice}
          members={room.members}
          selfId={selfId}
          onProposeExperiment={(exp) => addPriceExperiment(exp)}
        />
      )}

      {/* Bulk pricing view */}
      <BulkPricingView
        snapshotPricing={snapshot?.productPlayerPricing ?? {}}
        hasSnapshot={!!snapshot}
        onApplyBalanced={(productId, balanced) => updatePricing(productId, balanced)}
      />

      {/* Experiment tracker */}
      <ExperimentTracker
        roomPricePlan={room?.pricePlan ?? null}
        selfName={selfName}
        selfId={selfId}
        selectedProduct={product}
        balancedPrice={suggestion?.value.balanced ?? 0}
        oldPrice={playerPrice}
        onUpsert={(exp) => addPriceExperiment(exp)}
      />
    </div>
  )
}

// ============================================================
// Product selector — search input + filtered dropdown
// ============================================================
function ProductSelector({
  selectedId,
  onSelect,
}: {
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? ENC.products.filter(
          (p) =>
            p.name.en.toLowerCase().includes(q) ||
            p.name.zhHant.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            String(p.id) === q,
        )
      : ENC.products
    return list.slice(0, 24)
  }, [query])

  const selected = selectedId != null ? productById.get(selectedId) : null

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm font-medium shrink-0">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span>商品搜尋</span>
          </div>
          <div className="relative flex-1">
            <Input
              value={query}
              placeholder="搜尋商品名稱 / brand / ID…"
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              className="h-9"
            />
            {open && filtered.length > 0 && (
              <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md scrollbar-thin">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(p.id)
                      setQuery('')
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b last:border-b-0 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name.zhHant} <span className="text-muted-foreground">/ {p.name.en}</span></div>
                      <div className="truncate text-xs text-muted-foreground">#{p.id} · {p.brand} · {p.groupName.zhHant}</div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">${fmt(p.basePricePerUnit, 2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Check className="h-3 w-3 text-emerald-500" />
              {selected.name.zhHant} #{selected.id}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Selected product card
// ============================================================
function SelectedProductCard({
  product,
  boxValue,
  boxValueFormula,
}: {
  product: Product
  boxValue: number
  boxValueFormula?: string
}) {
  const demand = useMemo(
    () => computeDemandProxy(product.id, ENC.necessities, ENC.customerTypes).value,
    [product.id],
  )
  const isPremium = ENC.premiumProducts.includes(product.id)
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{product.name.zhHant}</div>
          <div className="truncate text-xs text-muted-foreground">{product.name.en}</div>
        </div>
        {isPremium && (
          <Badge variant="outline" className="shrink-0 text-fuchsia-600">Premium</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Field label="ID" value={`#${product.id}`} mono />
        <Field label="Brand" value={product.brand} />
        <Field label="Tier" value={product.tierName} />
        <Field label="Group" value={product.groupName.zhHant} />
        <Field label="Category" value={product.category.zhHant} />
        <Field label="Max / Box" value={String(product.maxItemsPerBox)} mono />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <StatCard
          label="Base Price"
          value={fmtMoney(product.basePricePerUnit)}
          confidence="confirmed"
          formula="product.basePricePerUnit"
          accent="neutral"
        />
        <StatCard
          label="Box Value"
          value={fmtMoney(boxValue)}
          confidence="confirmed"
          formula={boxValueFormula}
          hint={`${product.maxItemsPerBox} units/box`}
          accent="good"
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Demand Proxy</span>
          <ConfidenceBadge confidence="proxy" formula="Σ cust × nec × tokenHits/pool" />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{fmt(demand, 5)}</span>
          <div className="flex-1">
            <MiniBar value={demand} max={0.05} color="bg-sky-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`truncate font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ============================================================
// Player price editor
// ============================================================
function PlayerPriceEditor({
  product,
  playerPrice,
  base,
  balanced,
  hasSnapshot,
  onApply,
  onLoadDemo,
}: {
  product: Product | null
  playerPrice: number
  base: number
  balanced: number
  hasSnapshot: boolean
  onApply: (productId: number, price: number) => void
  onLoadDemo: () => void
}) {
  const [draft, setDraft] = useState<string>(String(playerPrice))

  if (!product) return null

  const markup = base > 0 ? (playerPrice - base) / base : 0
  const draftNum = Number(draft)
  const draftValid = Number.isFinite(draftNum) && draftNum >= 0
  const draftMarkup = base > 0 && draftValid ? (draftNum - base) / base : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>目前玩家定價</span>
          <ConfidenceBadge
            confidence={hasSnapshot ? 'confirmed' : 'demo'}
            formula="snapshot.productPlayerPricing[productId]"
            note={hasSnapshot ? undefined : '尚未上傳存檔，顯示商品預設 playerPrice'}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {product.name.zhHant} #{product.id} — 單價
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!hasSnapshot}
              className="h-9 font-mono"
            />
            {!hasSnapshot && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                未上傳存檔 — 編輯已停用。點擊「載入 Demo」可試用。
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!hasSnapshot || !draftValid || draftNum === playerPrice}
              onClick={() => onApply(product.id, draftNum)}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> 套用
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasSnapshot}
              onClick={() => onApply(product.id, balanced)}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" /> 套用 Balanced (${fmt(balanced, 2)})
            </Button>
            {!hasSnapshot && (
              <Button size="sm" variant="secondary" onClick={onLoadDemo}>
                載入 Demo
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Base" value={fmtMoney(base)} confidence="confirmed" accent="neutral" />
          <StatCard
            label="目前 Player"
            value={fmtMoney(playerPrice)}
            confidence={hasSnapshot ? 'confirmed' : 'demo'}
            accent="neutral"
          />
          <StatCard
            label="Markup %"
            value={fmt(markup * 100, 1)}
            unit="%"
            confidence={hasSnapshot ? 'confirmed' : 'demo'}
            formula="(playerPrice − base) / base"
            accent={markup > 0.3 ? 'bad' : markup > 0.05 ? 'warn' : 'good'}
          />
          {draftValid && draftNum !== playerPrice && (
            <StatCard
              label="草稿 Markup"
              value={fmt(draftMarkup * 100, 1)}
              unit="%"
              confidence="unverified"
              formula="(draft − base) / base"
              accent={draftMarkup > 0.3 ? 'bad' : draftMarkup > 0.05 ? 'warn' : 'good'}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Room vote panel
// ============================================================
function RoomVotePanel({
  product,
  balancedPrice,
  oldPrice,
  members,
  selfId,
  onProposeExperiment,
}: {
  product: Product
  balancedPrice: number
  oldPrice: number
  members: { id: string; name: string; color: string; role: string }[]
  selfId: string
  onProposeExperiment: (e: PriceExperiment) => void
}) {
  // votes: memberId -> 'approve' | 'reject' | null (local-only tally)
  const [votes, setVotes] = useState<Record<string, 'approve' | 'reject'>>({})

  const approveCount = Object.values(votes).filter((v) => v === 'approve').length
  const rejectCount = Object.values(votes).filter((v) => v === 'reject').length
  const totalVotes = approveCount + rejectCount

  const setVote = (mid: string, v: 'approve' | 'reject') => {
    setVotes((s) => ({ ...s, [mid]: s[mid] === v ? (undefined as any) : v }))
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>房間投票 — Balanced 建議</span>
          <ConfidenceBadge confidence="unverified" note="本地投票統計，未透過 socket 同步" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">{product.name.zhHant}</span>{' '}
              <span className="text-muted-foreground">#{product.id}</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-muted-foreground">舊價: ${fmt(oldPrice, 2)}</span>
              <span className="text-amber-600 dark:text-amber-400">→</span>
              <span className="font-semibold">${fmt(balancedPrice, 2)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const v = votes[m.id]
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
                style={{ borderLeft: `3px solid ${m.color}` }}
              >
                <span className="text-xs font-medium">{m.name}{m.id === selfId ? ' (你)' : ''}</span>
                <Button
                  size="sm"
                  variant={v === 'approve' ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setVote(m.id, 'approve')}
                >
                  <ThumbsUp className="mr-1 h-3 w-3" /> 贊成
                </Button>
                <Button
                  size="sm"
                  variant={v === 'reject' ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setVote(m.id, 'reject')}
                >
                  <ThumbsDown className="mr-1 h-3 w-3" /> 反對
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 rounded-md border p-2 text-sm">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <ThumbsUp className="mr-1 h-3 w-3" /> {approveCount} 贊成
          </Badge>
          <Badge variant="outline" className="border-rose-500/30 text-rose-700 dark:text-rose-300">
            <ThumbsDown className="mr-1 h-3 w-3" /> {rejectCount} 反對
          </Badge>
          <span className="text-xs text-muted-foreground">{totalVotes}/{members.length} 已投票</span>
          {approveCount > rejectCount && totalVotes > 0 && (
            <Button
              size="sm"
              variant="default"
              className="ml-auto"
              onClick={() =>
                onProposeExperiment({
                  id: `exp-${product.id}-${Date.now()}`,
                  productId: product.id,
                  oldPrice,
                  newPrice: balancedPrice,
                  observedSales: '',
                  observedComplaints: '',
                  conclusion: '房間投票通過 — 待實測',
                  updatedAt: Date.now(),
                  updatedBy: selfId,
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> 加入實驗追蹤器
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Bulk pricing view — top 30 by boxValue
// ============================================================
function BulkPricingView({
  snapshotPricing,
  hasSnapshot,
  onApplyBalanced,
}: {
  snapshotPricing: Record<number, number>
  hasSnapshot: boolean
  onApplyBalanced: (productId: number, balanced: number) => void
}) {
  const rows = useMemo(() => {
    return ENC.products
      .map((p) => {
        const box = computeBoxValue(p).value
        const playerPrice = (snapshotPricing[p.id] as number | undefined) ?? p.playerPrice
        const markup = p.basePricePerUnit > 0 ? (playerPrice - p.basePricePerUnit) / p.basePricePerUnit : 0
        const balanced = p.basePricePerUnit * 1.15
        return { p, box, playerPrice, markup, balanced }
      })
      .sort((a, b) => b.box - a.box)
      .slice(0, 30)
  }, [snapshotPricing])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>批量定價檢視 — Top 30 by Box Value</span>
          <ConfidenceBadge
            confidence={hasSnapshot ? 'confirmed' : 'demo'}
            formula="boxValue = basePrice × maxItemsPerBox"
            note="balanced = base × 1.15 (needs-runtime)"
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="min-w-[180px]">商品</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Box Value</TableHead>
                <TableHead className="text-right">Player Price</TableHead>
                <TableHead className="text-right">Markup %</TableHead>
                <TableHead className="text-right">Balanced</TableHead>
                <TableHead className="text-right">動作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.p.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="truncate font-medium">{r.p.name.zhHant}</span>
                      <span className="text-xs text-muted-foreground">#{r.p.id} · {r.p.brand}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">${fmt(r.p.basePricePerUnit, 2)}</TableCell>
                  <TableCell className="text-right font-mono">${fmt(r.box, 0)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {hasSnapshot ? `$${fmt(r.playerPrice, 2)}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${r.markup > 0.3 ? 'text-rose-600' : r.markup > 0.05 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {hasSnapshot ? `${fmt(r.markup * 100, 1)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">${fmt(r.balanced, 2)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={!hasSnapshot}
                      onClick={() => onApplyBalanced(r.p.id, r.balanced)}
                    >
                      <Wand2 className="mr-1 h-3 w-3" /> 套用 balanced
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Experiment tracker
// ============================================================
function ExperimentTracker({
  roomPricePlan,
  selfName,
  selfId,
  selectedProduct,
  balancedPrice,
  oldPrice,
  onUpsert,
}: {
  roomPricePlan: PriceExperiment[] | null
  selfName: string
  selfId: string
  selectedProduct: Product | null
  balancedPrice: number
  oldPrice: number
  onUpsert: (e: PriceExperiment) => void
}) {
  // Local-only experiments (used when no room).
  const [localExps, setLocalExps] = useState<PriceExperiment[]>([])
  const experiments = roomPricePlan ?? localExps

  const addExperiment = () => {
    if (!selectedProduct) return
    const exp: PriceExperiment = {
      id: `exp-${selectedProduct.id}-${Date.now()}`,
      productId: selectedProduct.id,
      oldPrice,
      newPrice: balancedPrice,
      observedSales: '',
      observedComplaints: '',
      conclusion: '',
      updatedAt: Date.now(),
      updatedBy: selfName || selfId,
    }
    if (roomPricePlan) {
      onUpsert(exp)
    } else {
      setLocalExps((s) => [...s.filter((x) => x.id !== exp.id), exp])
    }
  }

  const updateField = (id: string, patch: Partial<PriceExperiment>) => {
    const next = experiments.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e))
    const target = next.find((e) => e.id === id)
    if (!target) return
    if (roomPricePlan) {
      onUpsert(target)
    } else {
      setLocalExps(next)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-fuchsia-500" />
            價格實驗追蹤器
          </CardTitle>
          <div className="flex items-center gap-2">
            <ConfidenceBadge
              confidence="unverified"
              note="手動玩家觀察結果，非自動擷取"
            />
            <Badge variant="outline" className="text-xs">
              {roomPricePlan ? `房間模式 · ${experiments.length}` : `本地模式 · ${experiments.length}`}
            </Badge>
            <Button size="sm" onClick={addExperiment} disabled={!selectedProduct}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 新增實驗
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {experiments.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            尚無實驗。選擇商品後點「新增實驗」開始追蹤你的價格嘗試與觀察結果。
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="min-w-[160px]">商品</TableHead>
                  <TableHead className="text-right">舊價</TableHead>
                  <TableHead className="text-right">新價</TableHead>
                  <TableHead className="min-w-[120px]">觀察銷量</TableHead>
                  <TableHead className="min-w-[120px]">客訴</TableHead>
                  <TableHead className="min-w-[160px]">結論</TableHead>
                  <TableHead className="text-right">更新時間</TableHead>
                  <TableHead>更新者</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experiments.map((e) => {
                  const p = productById.get(e.productId)
                  const delta = e.oldPrice > 0 ? ((e.newPrice - e.oldPrice) / e.oldPrice) * 100 : 0
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="truncate font-medium">{p?.name.zhHant ?? `#${e.productId}`}</span>
                          <span className="text-xs text-muted-foreground">#{e.productId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">${fmt(e.oldPrice, 2)}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${fmt(e.newPrice, 2)}
                        <div className={`text-[10px] ${delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {delta > 0 ? '+' : ''}{fmt(delta, 1)}%
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={e.observedSales}
                          placeholder="例: 12 units/day"
                          onChange={(ev) => updateField(e.id, { observedSales: ev.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={e.observedComplaints}
                          placeholder="例: 3 客訴"
                          onChange={(ev) => updateField(e.id, { observedComplaints: ev.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={e.conclusion}
                          placeholder="例: 銷量持平，客訴上升 — 退回原價"
                          onChange={(ev) => updateField(e.id, { conclusion: ev.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.updatedAt).toLocaleString(undefined, { hour12: false })}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{e.updatedBy}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            實驗結果為手動輸入的玩家觀察。建議流程：套用新價 → 在遊戲內觀察 1 天 → 記錄銷量/客訴 → 寫下結論。
            若有房間，實驗會同步到 <code className="font-mono">room.pricePlan</code>，供隊友查看。
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
