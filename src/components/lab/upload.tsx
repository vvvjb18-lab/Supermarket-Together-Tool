'use client'

import { useState, useCallback } from 'react'
import { useSaveStore, useUIStore } from '@/lib/store'
import { demoSave, encyclopedia as ENC } from '@/lib/data-loader'
import { parseSaveFile, type ES3ParseResult } from '@/lib/es3-parser'
import { ConfidenceBadge, StatCard, SectionHeader, fmt, fmtMoney } from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Upload as UploadIcon,
  FileJson,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Sparkles,
  FlaskConical,
  Coins,
  Calendar,
  Users,
  Boxes,
  Tag,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SaveSnapshot, Confidence } from '@/lib/types'

// Pre-existing tolerant mock kept as a last-resort fallback when neither
// strict JSON nor ES3 parsing succeed. The new ES3 parser is the primary
// path; this only kicks in for totally unstructured text.
function regexFallback(text: string, fileName: string): ES3ParseResult {
  const detected: string[] = []
  let money = 0
  let fp = 0
  let day = 1

  const moneyMatch = text.match(/"?Funds"?\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/i)
  if (moneyMatch) {
    money = Number(moneyMatch[1])
    detected.push('Funds (regex)')
  }
  const fpMatch = text.match(/"?FranchisePoints"?\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/i)
  if (fpMatch) {
    fp = Number(fpMatch[1])
    detected.push('FranchisePoints (regex)')
  }
  const dayMatch = text.match(/"?Day"?\s*:\s*\{[^}]*"value"\s*:\s*([0-9]+)/i)
  if (dayMatch) {
    day = Number(dayMatch[1])
    detected.push('Day (regex)')
  }

  const snapshot: SaveSnapshot = {
    source: `upload:${fileName}`,
    parseStatus: detected.length > 0 ? 'partial' : 'failed',
    confidence: detected.length > 0 ? 'proxy' : 'unverified',
    detectedFields: detected,
    unknownFields: [],
    money,
    franchisePoints: fp,
    day,
    unlockedProductTiers: Array.from(new Set(ENC.products.map((p) => p.tier))).sort((a, b) => a - b),
    unlockedProducts: ENC.products.map((p) => p.id),
    productPlayerPricing: {},
    perks: [],
    extraUpgrades: [],
    employees: [],
    storeLayout: ENC.storeLayout,
    inventoryByProduct: {},
    storageInventory: {},
    weather: 'unknown',
    temperature: [],
    roomId: null,
    playerSlots: 0,
    parsedAt: new Date().toISOString(),
  }

  return {
    snapshot,
    detected,
    unknown: [],
    confidence: snapshot.confidence,
    status: snapshot.parseStatus,
    typeTally: {},
    warnings: ['ES3 + strict-JSON parse failed; used last-resort regex heuristics. Only scalar fields may be recovered.'],
    fieldCount: detected.length,
    bytesIn: text.length,
    bytesOut: text.length,
  }
}

const FIELD_DOCS: { field: string; desc: string; status: 'ready' | 'adapter' | 'needs-real' }[] = [
  { field: 'Funds / Day / FP / FX', desc: '玩家金錢、天數、Franchise Points、Franchise XP', status: 'ready' },
  { field: 'ProductPlayerPricing', desc: '339 商品玩家自訂價格陣列', status: 'ready' },
  { field: 'UnlockedProductTiers', desc: '已解鎖 tier (bool 陣列)', status: 'ready' },
  { field: 'TierInflation', desc: '每 tier 通膨倍率 (float 陣列)', status: 'ready' },
  { field: 'propdata{N} + propinfoproduct{N}', desc: '41 個店面道具 + 貨架庫存', status: 'ready' },
  { field: 'HiredEmployeesData', desc: '員工 pipe-string 陣列 (slot/model/skills/name/task/xp)', status: 'ready' },
  { field: 'LoanAmount / LoanPaymentPerDay', desc: '貸款本金 / 每日還款', status: 'ready' },
  { field: 'ManufacUnlockedRecipes', desc: '30 個製造配方解鎖狀態', status: 'ready' },
  { field: 'AddonsBought / ExtraUpgrades / SpaceUpgrades', desc: '附加購買 + 升級旗標', status: 'ready' },
  { field: 'CurrentInvoicesArray', desc: '當前供應商發票 (pipe-string)', status: 'ready' },
  { field: 'DoorStates / PaintableValues', desc: '門狀態 + 可噴漆物件', status: 'ready' },
  { field: 'decopropdata / decopaintable / decopicture', desc: '裝飾道具 + 噴漆 + 圖片 (計數)', status: 'ready' },
  { field: 'roomId / playerSlots', desc: '多人房間同步資訊', status: 'needs-real' },
  { field: 'weather / temperature', desc: '當前天氣與 32 小時溫度', status: 'needs-real' },
]

export function Upload() {
  const setSnapshot = useSaveStore((s) => s.setSnapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const clear = useSaveStore((s) => s.clear)
  const snapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)

  const [parseResult, setParseResult] = useState<ES3ParseResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const runParse = useCallback(
    (text: string, fileName: string) => {
      let result = parseSaveFile(text, fileName)
      // If both strict-JSON and ES3 paths failed, try regex fallback.
      if (result.status === 'failed') {
        const fb = regexFallback(text, fileName)
        if (fb.detected.length > result.detected.length) result = fb
      }
      setParseResult(result)
      if (result.status === 'failed') {
        toast.error('無法解析此檔案。顯示偵測結果，但未載入。')
      } else {
        setSnapshot(result.snapshot)
        const extras = result.snapshot.employees.length
          ? `、${result.snapshot.employees.length} 員工`
          : ''
        toast.success(
          `解析完成：${result.detected.length} 個欄位、Day ${result.snapshot.day}、$${result.snapshot.money.toFixed(0)}${extras} (${result.status})`,
        )
      }
    },
    [setSnapshot],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      try {
        const text = await file.text()
        runParse(text, file.name)
      } catch (e: any) {
        toast.error('解析失敗: ' + (e?.message ?? 'unknown'))
        setParseResult({
          snapshot: {} as SaveSnapshot,
          detected: [],
          unknown: [],
          confidence: 'unverified',
          status: 'failed',
          typeTally: {},
          warnings: [e?.message ?? 'unknown'],
          fieldCount: 0,
          bytesIn: 0,
          bytesOut: 0,
        })
      } finally {
        setParsing(false)
      }
    },
    [runParse],
  )

  const handleLoadSample = useCallback(async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/sample-save')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.message ?? `取樣本失敗 (${res.status})`)
        return
      }
      const text = await res.text()
      runParse(text, '_latest.json')
    } catch (e: any) {
      toast.error('取樣本失敗: ' + (e?.message ?? 'unknown'))
    } finally {
      setLoadingSample(false)
    }
  }, [runParse])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const s = parseResult?.snapshot
  const typeEntries = parseResult ? Object.entries(parseResult.typeTally).sort((a, b) => b[1] - a[1]) : []

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4">
      <SectionHeader
        title="存檔上傳與本地解析"
        description="支援真實 EasySave3 (.es3 / .json) 存檔。解析器會修復 ES3 內嵌值語法、解開 __type/value 信封、並將 PascalCase 欄位對應到 SaveSnapshot。所有解析在瀏覽器本地完成。"
        confidence="confirmed"
        note="ES3 parser 已整合 — 支援 Funds/Day/FP/Pricing/Tiers/Layout/Employees/Loan/Invoices/Upgrades 等 30+ 欄位。"
      />

      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted'}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">拖曳 .es3 / .json 檔案到此，或選擇檔案</div>
            <div className="mt-1 text-xs text-muted-foreground">
              支援真實 EasySave3 存檔（含內嵌 bool/float/int/string 語法）、乾淨 JSON 快照、部分 JSON。
              所有解析在瀏覽器本地完成，不上傳伺服器。
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <label>
              <input
                type="file"
                accept=".es3,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
              <Button disabled={parsing} className="cursor-pointer">
                {parsing ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 解析中…
                  </>
                ) : (
                  <>
                    <UploadIcon className="mr-1.5 h-4 w-4" /> 選擇檔案
                  </>
                )}
              </Button>
            </label>
            <Button variant="outline" onClick={handleLoadSample} disabled={loadingSample || parsing}>
              {loadingSample ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> 載入中…
                </>
              ) : (
                <>
                  <FlaskConical className="mr-1.5 h-4 w-4" /> 載入範本 _latest.json
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => { loadDemo(); setView('dashboard') }}>
              <Sparkles className="mr-1.5 h-4 w-4" /> 載入 Demo 存檔
            </Button>
            {snapshot && (
              <Button variant="ghost" onClick={() => { clear(); setParseResult(null) }}>
                <XCircle className="mr-1.5 h-4 w-4" /> 清除
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parse status */}
      {parseResult && s && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                {parseResult.status === 'ok' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : parseResult.status === 'partial' ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-500" />
                )}
                解析狀態: {parseResult.status.toUpperCase()}
                <Badge variant="outline" className="ml-1 text-[10px]">
                  {parseResult.fieldCount} 欄位
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {(parseResult.bytesIn / 1024).toFixed(1)} KB → {(parseResult.bytesOut / 1024).toFixed(1)} KB
                </Badge>
              </span>
              <ConfidenceBadge confidence={parseResult.confidence} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Key scalars */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <StatCard label="Money" value={s.money > 0 ? fmtMoney(s.money) : '—'} confidence="confirmed" />
              <StatCard label="Day" value={String(s.day)} confidence="confirmed" />
              <StatCard label="Franchise Pts" value={String(s.franchisePoints)} confidence="confirmed" />
              <StatCard label="Franchise XP" value={s.franchiseExperience ? fmt(s.franchiseExperience) : '—'} confidence="confirmed" />
              <StatCard label="Difficulty" value={s.difficulty ? String(s.difficulty) : '—'} confidence="confirmed" />
              <StatCard label="Last Level" value={s.lastAwardedLevel ? String(s.lastAwardedLevel) : '—'} confidence="confirmed" />
            </div>
            {/* Store + loan info */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <StatCard label="Store Name" value={s.storeName ?? '—'} confidence="confirmed" />
              <StatCard label="Brand" value={s.supermarketName ?? '—'} confidence="confirmed" />
              <StatCard label="Loan" value={s.loanAmount ? fmtMoney(s.loanAmount) : '—'} confidence="confirmed" />
              <StatCard label="Loan / Day" value={s.loanPaymentPerDay ? fmtMoney(s.loanPaymentPerDay) : '—'} confidence="confirmed" />
              <StatCard label="Space Bought" value={String(s.spaceBought ?? 0)} confidence="confirmed" />
              <StatCard label="Storage Bought" value={String(s.storageBought ?? 0)} confidence="confirmed" />
            </div>
            {/* Counts grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <CountTile icon={<Tag className="h-3.5 w-3.5" />} label="玩家定價" value={Object.keys(s.productPlayerPricing).length} total={339} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="已解鎖 Tier" value={s.unlockedProductTiers.length} total={55} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="已解鎖商品" value={s.unlockedProducts.length} total={339} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="店面道具" value={s.storeLayout.length} total={41} />
              <CountTile icon={<Users className="h-3.5 w-3.5" />} label="員工" value={s.employees.length} />
              <CountTile icon={<Coins className="h-3.5 w-3.5" />} label="發票" value={s.invoices?.length ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <CountTile icon={<Calendar className="h-3.5 w-3.5" />} label="Tier 通膨" value={s.tierInflation?.length ?? 0} total={55} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="製造配方解鎖" value={s.manufacUnlockedRecipes?.filter(Boolean).length ?? 0} total={30} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="Addons 購買" value={s.addonsBought?.filter(Boolean).length ?? 0} total={s.addonsBought?.length ?? 6} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="Extra Upgrades" value={(s.extraUpgrades ?? []).filter((x) => x.endsWith(':1')).length} total={s.extraUpgrades?.length ?? 44} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="Store Space Upg" value={s.storeSpaceUpgrades?.filter(Boolean).length ?? 0} total={s.storeSpaceUpgrades?.length ?? 47} />
              <CountTile icon={<Boxes className="h-3.5 w-3.5" />} label="裝飾道具" value={s.decoPropsCount ?? 0} />
            </div>

            {/* Detected + unknown */}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  已偵測欄位 ({parseResult.detected.length})
                </div>
                <ScrollArea className="h-40 rounded-md border p-2">
                  {parseResult.detected.length === 0 ? (
                    <div className="text-xs text-muted-foreground">無</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {parseResult.detected.map((f) => (
                        <Badge key={f} variant="outline" className="gap-1 text-[10px] text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  未知欄位 ({parseResult.unknown.length})
                </div>
                <ScrollArea className="h-40 rounded-md border p-2">
                  {parseResult.unknown.length === 0 ? (
                    <div className="text-xs text-muted-foreground">無</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {parseResult.unknown.map((f) => (
                        <Badge key={f} variant="outline" className="gap-1 text-[10px] text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* ES3 type tally */}
            {typeEntries.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  ES3 型別分佈 ({typeEntries.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {typeEntries.map(([t, n]) => (
                    <Badge key={t} variant="secondary" className="gap-1 font-mono text-[10px]">
                      <span className="text-foreground">{t}</span>
                      <span className="text-muted-foreground">×{n}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> 解析警告 ({parseResult.warnings.length})
                </div>
                <ul className="space-y-0.5 text-xs text-amber-700/90">
                  {parseResult.warnings.map((w, i) => (
                    <li key={i} className="font-mono">{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Employees quick-look */}
            {s.employees.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  員工快覽 ({s.employees.length})
                </div>
                <ScrollArea className="h-32 rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Task</th>
                        <th className="px-2 py-1 text-right">Salary</th>
                        <th className="px-2 py-1 text-left">Skills (lvl)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.employees.map((e, i) => (
                        <tr key={e.id} className="border-t">
                          <td className="px-2 py-1 font-mono">{i}</td>
                          <td className="px-2 py-1 font-medium">{e.name}</td>
                          <td className="px-2 py-1 font-mono">{e.task}</td>
                          <td className="px-2 py-1 text-right font-mono">{fmtMoney(e.salary)}</td>
                          <td className="px-2 py-1 font-mono text-muted-foreground">
                            {Object.values(e.skills).map((sk) => sk.level).join('/')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            {/* Store layout quick-look */}
            {s.storeLayout.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  店面道具快覽 ({s.storeLayout.length})
                </div>
                <ScrollArea className="h-32 rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">idx</th>
                        <th className="px-2 py-1 text-left">buildableId</th>
                        <th className="px-2 py-1 text-right">posX</th>
                        <th className="px-2 py-1 text-right">posZ</th>
                        <th className="px-2 py-1 text-right">angle</th>
                        <th className="px-2 py-1 text-right">slots</th>
                        <th className="px-2 py-1 text-right">units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.storeLayout.slice(0, 30).map((p) => (
                        <tr key={p.index} className="border-t">
                          <td className="px-2 py-1 font-mono">{p.index}</td>
                          <td className="px-2 py-1 font-mono">{p.buildableId}</td>
                          <td className="px-2 py-1 text-right font-mono">{p.posX.toFixed(3)}</td>
                          <td className="px-2 py-1 text-right font-mono">{p.posZ.toFixed(3)}</td>
                          <td className="px-2 py-1 text-right font-mono">{p.angle}°</td>
                          <td className="px-2 py-1 text-right font-mono">{p.inventory.length}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {p.inventory.reduce((a, b) => a + b.count, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            {parseResult.status !== 'failed' && (
              <div className="flex gap-2">
                <Button onClick={() => setView('dashboard')}>
                  <FileJson className="mr-1.5 h-4 w-4" /> 前往 Dashboard
                </Button>
                <Button variant="outline" onClick={() => setView('layout')}>
                  <Boxes className="mr-1.5 h-4 w-4" /> 查看店面地圖
                </Button>
                <Button variant="outline" onClick={() => setView('employees')}>
                  <Users className="mr-1.5 h-4 w-4" /> 查看員工
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adapter field documentation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> ES3 欄位對應表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="dense w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left">欄位</th>
                  <th className="text-left">說明</th>
                  <th className="text-left">狀態</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_DOCS.map((f) => (
                  <tr key={f.field} className="border-t">
                    <td className="font-mono text-xs">{f.field}</td>
                    <td className="text-xs">{f.desc}</td>
                    <td>
                      {f.status === 'ready' && <Badge variant="outline" className="text-[10px] text-emerald-600">已整合</Badge>}
                      {f.status === 'adapter' && <Badge variant="outline" className="text-[10px] text-amber-600">Adapter 就緒</Badge>}
                      {f.status === 'needs-real' && <Badge variant="outline" className="text-[10px] text-rose-600">需真實 .es3</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            ES3 解析流程：<code className="rounded bg-muted px-1">fixES3InlineValues</code>{' '}
            → <code className="rounded bg-muted px-1">JSON.parse</code>{' '}
            → <code className="rounded bg-muted px-1">unwrap __type/value 信封</code>{' '}
            → <code className="rounded bg-muted px-1">PascalCase → SaveSnapshot 對應</code>。
            所有衍伸頁面（Dashboard、Wiki、Layout、Employees、Pricing、Restock…）現在可以直接讀取真實存檔資料。
          </p>
        </CardContent>
      </Card>

      {/* Mechanic notes */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 已解決：真實 .es3 存檔上傳
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            原本 <code className="rounded bg-muted px-1">tolerantParse</code> 只修復了
            <code className="rounded bg-muted px-1">{'"bool"true'}</code> 一種變體，且未補回
            <code className="rounded bg-muted px-1">"value":</code> 鍵，也不認得 EasySave3 的
            PascalCase 欄位名（<code className="rounded bg-muted px-1">Funds</code>、
            <code className="rounded bg-muted px-1">ProductPlayerPricing</code>、
            <code className="rounded bg-muted px-1">propdata*</code> 等）。
          </p>
          <p>
            新的 <code className="rounded bg-muted px-1">src/lib/es3-parser.ts</code> 修復了 4 種內嵌值
            （bool / float / int / string）、遞迴解開
            <code className="rounded bg-muted px-1">__type/value</code> 信封、處理 PMDataWrapper 陣列、
            並將 30+ 個 PascalCase 欄位對應到 <code className="rounded bg-muted px-1">SaveSnapshot</code>{' '}
            （含 18 個新增的選用欄位如 <code className="rounded bg-muted px-1">loanAmount</code>、
            <code className="rounded bg-muted px-1">franchiseExperience</code>、
            <code className="rounded bg-muted px-1">tierInflation</code> 等）。
          </p>
          <p className="text-muted-foreground">
            點擊上方「載入範本 _latest.json」即可立即看到 Money=$5981.51、Day=28、3 名員工、41 個店面道具等真實資料。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function CountTile({
  icon,
  label,
  value,
  total,
}: {
  icon: React.ReactNode
  label: string
  value: number
  total?: number
}) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold">
        {value}
        {total != null && <span className="ml-1 text-[10px] text-muted-foreground">/ {total}</span>}
      </div>
    </div>
  )
}
