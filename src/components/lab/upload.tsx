'use client'

import { useState, useCallback } from 'react'
import { useSaveStore, useUIStore } from '@/lib/store'
import { demoSave, encyclopedia as ENC } from '@/lib/data-loader'
import { ConfidenceBadge, StatCard, SectionHeader, fmt, fmtMoney } from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload as UploadIcon, FileJson, FileUp, CheckCircle2, AlertTriangle, XCircle, Database, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { SaveSnapshot, Confidence } from '@/lib/types'

// The real .es3 parser requires EasySave3 decryption (Decryptor.cs / decoder.exe).
// We provide an adapter interface so a real parser can be plugged in later.
// For now: a tolerant mock parser that accepts JSON or partial JSON and extracts
// whatever it can recognize, plus a demo loader.

interface ParseResult {
  snapshot: SaveSnapshot
  detected: string[]
  unknown: string[]
  confidence: Confidence
  status: 'ok' | 'demo' | 'partial' | 'failed' | 'empty'
}

function tolerantParse(text: string, fileName: string): ParseResult {
  const detected: string[] = []
  const unknown: string[] = []
  let money = 0
  let fp = 0
  let day = 1
  const pricing: Record<number, number> = {}
  const inv: Record<number, number> = {}

  // Try strict JSON first
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    // tolerant: fix common EasySave3 bool serialization "bool"false → "bool",false
    const fixed = text.replace(/"bool"(\s*)(true|false)/g, '"bool",$1$2').replace(/"bool"(\s*)(true|false)/g, '"bool",$1$2')
    try {
      data = JSON.parse(fixed)
    } catch {
      // last resort: extract numbers via regex heuristics
      const moneyMatch = text.match(/"?(money|currentMoney)"?\s*[:=]\s*([0-9.]+)/i)
      if (moneyMatch) {
        money = Number(moneyMatch[2])
        detected.push('money (regex)')
      }
      data = null
    }
  }

  if (data && typeof data === 'object') {
    // walk known field names
    if ('money' in data || 'currentMoney' in data) {
      money = Number(data.money ?? data.currentMoney ?? 0)
      detected.push('money')
    }
    if ('franchisePoints' in data || 'fp' in data) {
      fp = Number(data.franchisePoints ?? data.fp ?? 0)
      detected.push('franchisePoints')
    }
    if ('day' in data || 'currentDay' in data) {
      day = Number(data.day ?? data.currentDay ?? 1)
      detected.push('day')
    }
    if ('productPlayerPricing' in data && Array.isArray(data.productPlayerPricing)) {
      data.productPlayerPricing.forEach((entry: any, i: number) => {
        if (entry && typeof entry === 'object' && 'id' in entry && 'price' in entry) {
          pricing[Number(entry.id)] = Number(entry.price)
        } else if (typeof entry === 'number') {
          pricing[i] = entry
        }
      })
      if (Object.keys(pricing).length > 0) detected.push('productPlayerPricing')
    }
    if ('inventoryByProduct' in data && typeof data.inventoryByProduct === 'object') {
      Object.entries(data.inventoryByProduct).forEach(([k, v]) => {
        inv[Number(k)] = Number(v)
      })
      if (Object.keys(inv).length > 0) detected.push('inventoryByProduct')
    }
    if ('storeLayout' in data && Array.isArray(data.storeLayout)) {
      detected.push('storeLayout')
    }
    if ('unlockedProducts' in data) detected.push('unlockedProducts')
    if ('unlockedProductTiers' in data) detected.push('unlockedProductTiers')
    if ('employees' in data) detected.push('employees')
    if ('perks' in data) detected.push('perks')
    if ('roomId' in data) detected.push('roomId')
    if ('weather' in data) detected.push('weather')
    // collect unknown top-level keys
    const known = new Set([
      'money', 'currentMoney', 'franchisePoints', 'fp', 'day', 'currentDay',
      'productPlayerPricing', 'inventoryByProduct', 'storeLayout', 'unlockedProducts',
      'unlockedProductTiers', 'employees', 'perks', 'extraUpgrades', 'roomId',
      'playerSlots', 'weather', 'temperature', 'storageInventory', 'source',
      'parseStatus', 'confidence', 'detectedFields', 'unknownFields', 'parsedAt',
    ])
    Object.keys(data).forEach((k) => {
      if (!known.has(k)) unknown.push(k)
    })
  }

  const hasAny = detected.length > 0
  const snapshot: SaveSnapshot = {
    source: `upload:${fileName}`,
    parseStatus: hasAny ? (detected.length >= 3 ? 'ok' : 'partial') : 'failed',
    confidence: hasAny ? (detected.length >= 5 ? 'confirmed' : 'proxy') : 'unverified',
    detectedFields: detected,
    unknownFields: unknown,
    money,
    franchisePoints: fp,
    day,
    unlockedProductTiers: data?.unlockedProductTiers ?? Array.from(new Set(ENC.products.map((p) => p.tier))).sort((a, b) => a - b),
    unlockedProducts: data?.unlockedProducts ?? ENC.products.map((p) => p.id),
    productPlayerPricing: pricing,
    perks: data?.perks ?? [],
    extraUpgrades: data?.extraUpgrades ?? [],
    employees: data?.employees ?? [],
    storeLayout: data?.storeLayout ?? ENC.storeLayout,
    inventoryByProduct: inv,
    storageInventory: data?.storageInventory ?? {},
    weather: data?.weather ?? 'unknown',
    temperature: data?.temperature ?? [],
    roomId: data?.roomId ?? null,
    playerSlots: data?.playerSlots ?? 0,
    parsedAt: new Date().toISOString(),
  }

  return {
    snapshot,
    detected,
    unknown,
    confidence: snapshot.confidence,
    status: snapshot.parseStatus,
  }
}

const FIELD_DOCS: { field: string; desc: string; status: 'ready' | 'adapter' | 'needs-real' }[] = [
  { field: 'money / day / FP', desc: '玩家金錢、天數、Franchise Points', status: 'adapter' },
  { field: 'productPlayerPricing', desc: '玩家自訂價格陣列', status: 'adapter' },
  { field: 'unlockedProductTiers', desc: '已解鎖 tier 列表', status: 'adapter' },
  { field: 'unlockedProducts', desc: '已解鎖商品列表', status: 'adapter' },
  { field: 'perks / extraUpgrades', desc: '技能樹 + 升級', status: 'adapter' },
  { field: 'employees (levels/XP)', desc: '員工等級與經驗', status: 'adapter' },
  { field: 'storeLayout (props)', desc: '店面道具 + 貨架座標', status: 'adapter' },
  { field: 'shelf inventory', desc: '貨架庫存 product:count', status: 'adapter' },
  { field: 'storage inventory', desc: '倉庫庫存', status: 'adapter' },
  { field: 'roomId / playerSlots', desc: '多人房間 ID 與玩家數', status: 'needs-real' },
  { field: 'weather / temperature', desc: '當前天氣與 32 小時溫度', status: 'needs-real' },
  { field: 'order states', desc: '訂單狀態', status: 'needs-real' },
]

export function Upload() {
  const setSnapshot = useSaveStore((s) => s.setSnapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const clear = useSaveStore((s) => s.clear)
  const snapshot = useSaveStore((s) => s.snapshot)
  const setView = useUIStore((s) => s.setView)

  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      try {
        const text = await file.text()
        const result = tolerantParse(text, file.name)
        setParseResult(result)
        if (result.status === 'failed') {
          toast.error('無法解析此檔案。顯示偵測結果，但未載入。')
        } else {
          setSnapshot(result.snapshot)
          toast.success(`解析完成：${result.detected.length} 個欄位偵測到 (${result.status})`)
        }
      } catch (e: any) {
        toast.error('解析失敗: ' + (e?.message ?? 'unknown'))
        setParseResult({
          snapshot: {} as SaveSnapshot,
          detected: [],
          unknown: [],
          confidence: 'unverified',
          status: 'failed',
        })
      } finally {
        setParsing(false)
      }
    },
    [setSnapshot],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4">
      <SectionHeader
        title="存檔上傳與本地解析"
        description="上傳 EasySave3 .es3 存檔或 JSON 快照。解析器為 local-first adapter 設計，真實 .es3 解密尚未整合。"
        confidence="needs-runtime"
        note="真實 .es3 解密需整合 Decryptor.cs / decoder.exe。目前 adapter 接受 JSON / 部分 JSON。"
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
            <div className="mt-1 text-xs text-muted-foreground">支援 .es3 (tolerant) / .json / 部分 JSON。所有解析在瀏覽器本地完成，不上傳伺服器。</div>
          </div>
          <div className="flex gap-2">
            <label>
              <input
                type="file"
                accept=".es3,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <Button disabled={parsing} className="cursor-pointer">
                <UploadIcon className="mr-1.5 h-4 w-4" /> {parsing ? '解析中…' : '選擇檔案'}
              </Button>
            </label>
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
      {parseResult && (
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
              </span>
              <ConfidenceBadge confidence={parseResult.confidence} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="偵測欄位" value={parseResult.detected.length} confidence="confirmed" />
              <StatCard label="未知欄位" value={parseResult.unknown.length} confidence="unverified" />
              <StatCard label="Money" value={parseResult.snapshot.money > 0 ? fmtMoney(parseResult.snapshot.money) : '—'} confidence="proxy" />
              <StatCard label="Day / FP" value={`${parseResult.snapshot.day} / ${parseResult.snapshot.franchisePoints}`} confidence="proxy" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">已偵測欄位 ({parseResult.detected.length})</div>
                <ScrollArea className="h-32 rounded-md border p-2">
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
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">未知欄位 ({parseResult.unknown.length})</div>
                <ScrollArea className="h-32 rounded-md border p-2">
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
            {parseResult.status !== 'failed' && (
              <Button onClick={() => setView('dashboard')}>
                前往 Dashboard <FileJson className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adapter field documentation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> 解析器 Adapter 欄位對照
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
            Adapter 設計：上層 UI 與計算引擎只依賴 <code className="rounded bg-muted px-1">SaveSnapshot</code> 介面。
            真實 .es3 解密器（Decryptor.cs / decoder.exe）整合後，只需替換 <code className="rounded bg-muted px-1">tolerantParse</code> 函式即可。
            缺少 <code className="rounded bg-muted px-1">decoder.exe</code> 與 sample .es3，故 room/weather/order 欄位標記為「需真實 .es3」。
          </p>
        </CardContent>
      </Card>

      {/* Missing data request */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> 缺失資料聲明
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>以下功能需補充真實檔案才能完整運作，目前以 proxy/mock 呈現：</p>
          <div className="space-y-1.5 text-xs">
            <div>
              <span className="font-semibold">真實存檔 upload / dashboard 個人化：</span>需 <code className="rounded bg-muted px-1">save-analyzer/_latest.json</code>（已提供，但 JSON 格式損壞）、<code className="rounded bg-muted px-1">parse_store_layout.py</code>、<code className="rounded bg-muted px-1">Decryptor.cs</code>。缺少 <code className="rounded bg-muted px-1">decoder.exe</code> 與 sample .es3。
            </div>
            <div>
              <span className="font-semibold">精確定價模型：</span>需 <code className="rounded bg-muted px-1">ar2_PricingMachine.json</code>、<code className="rounded bg-muted px-1">ilconst.json</code>。顧客價格接受公式未提取，Pricing Lab 僅提供啟發式 markup。
            </div>
            <div>
              <span className="font-semibold">偷竊/防盜模擬：</span>需 <code className="rounded bg-muted px-1">ar2_AntiTheftBehaviour.json</code> 等。目前僅做機制百科。
            </div>
          </div>
          <p className="text-muted-foreground">在收到檔案前，已完成不依賴該資料的部分：百科、利潤、鹽探測、顧客模擬、補貨、貨架、技能、員工、製造、季節、成就、房間同步。</p>
        </CardContent>
      </Card>
    </div>
  )
}
