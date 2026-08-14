'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { encyclopedia as ENC, demoSave, productById } from '@/lib/data-loader'
import { exportMarkdownReport } from '@/lib/engine'
import { useSaveStore } from '@/lib/store'
import type { Product } from '@/lib/types'
import {
  ConfidenceBadge,
} from '@/components/shared/primitives'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  Database,
  FileText,
  FileJson,
  FileSpreadsheet,
  Link as LinkIcon,
  Boxes,
  Layers,
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

type TabId =
  | 'products'
  | 'tiers'
  | 'groups'
  | 'necessities'
  | 'seasons'
  | 'customerTypes'
  | 'containers'
  | 'skills'
  | 'buildables'
  | 'achievements'
  | 'employeeTasks'
  | 'manufacturingProducts'
  | 'storeLayout'
  | 'config'

interface TabDef {
  id: TabId
  label: string
  count: number
  records: Record<string, unknown>[]
}

// ============================================================
// Helpers
// ============================================================

function toCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function collectColumns(records: Record<string, unknown>[]): string[] {
  const set = new Set<string>()
  for (const r of records) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) set.add(k)
    }
  }
  return Array.from(set)
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeTsv(v: string): string {
  if (v.includes('\t') || v.includes('\n') || v.includes('"')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function buildTsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return ''
  const cols = collectColumns(records)
  const lines: string[] = [cols.join('\t')]
  for (const r of records) {
    lines.push(cols.map((c) => escapeTsv(toCell(r[c]))).join('\t'))
  }
  return lines.join('\n')
}

function buildJsonFromRecords(records: Record<string, unknown>[]): string {
  return JSON.stringify(records, null, 2)
}

function encodeShareLink(snapshotJson: string): string {
  // unicode-safe base64
  const b64 = btoa(unescape(encodeURIComponent(snapshotJson)))
  const base = window.location.origin + window.location.pathname
  return `${base}#share=${b64}`
}

// ============================================================
// Main
// ============================================================

export function RawData() {
  const snapshot = useSaveStore((s) => s.snapshot)
  const [tab, setTab] = useState<TabId>('products')

  const tabs: TabDef[] = useMemo(
    () => [
      { id: 'products', label: 'Products', count: ENC.products.length, records: ENC.products as unknown as Record<string, unknown>[] },
      { id: 'tiers', label: 'Tiers', count: ENC.tiers.length, records: ENC.tiers as unknown as Record<string, unknown>[] },
      { id: 'groups', label: 'Groups', count: ENC.productGroups.length, records: ENC.productGroups as unknown as Record<string, unknown>[] },
      { id: 'necessities', label: 'Necessities', count: ENC.necessities.length, records: ENC.necessities as unknown as Record<string, unknown>[] },
      { id: 'seasons', label: 'Seasons', count: ENC.seasons.length, records: ENC.seasons as unknown as Record<string, unknown>[] },
      { id: 'customerTypes', label: 'CustomerTypes', count: ENC.customerTypes.length, records: ENC.customerTypes as unknown as Record<string, unknown>[] },
      { id: 'containers', label: 'Containers', count: ENC.containers.length, records: ENC.containers as unknown as Record<string, unknown>[] },
      { id: 'skills', label: 'Skills', count: ENC.skills.length, records: ENC.skills as unknown as Record<string, unknown>[] },
      { id: 'buildables', label: 'Buildables', count: ENC.buildables.length, records: ENC.buildables as unknown as Record<string, unknown>[] },
      { id: 'achievements', label: 'Achievements', count: ENC.achievements.length, records: ENC.achievements as unknown as Record<string, unknown>[] },
      { id: 'employeeTasks', label: 'EmployeeTasks', count: ENC.employeeTasks.length, records: ENC.employeeTasks as unknown as Record<string, unknown>[] },
      { id: 'manufacturingProducts', label: 'Manufacturing', count: ENC.manufacturingProducts.length, records: ENC.manufacturingProducts as unknown as Record<string, unknown>[] },
      { id: 'storeLayout', label: 'StoreLayout', count: ENC.storeLayout.length, records: ENC.storeLayout as unknown as Record<string, unknown>[] },
      { id: 'config', label: 'Config', count: Object.keys(ENC.config).length, records: Object.entries(ENC.config).map(([k, v]) => ({ key: k, value: v })) },
    ],
    [],
  )

  const activeTab = tabs.find((t) => t.id === tab)!
  const records = activeTab.records
  const columns = useMemo(() => collectColumns(records), [records])

  // Export handlers
  const handleExportMarkdown = () => {
    const md = exportMarkdownReport(snapshot)
    downloadBlob(`stl-report-${Date.now()}.md`, md, 'text/markdown')
    toast.success('已下載 Markdown 完整報告')
  }

  const handleExportJson = () => {
    downloadBlob(`${tab}-${Date.now()}.json`, buildJsonFromRecords(records), 'application/json')
    toast.success(`已下載 ${tab}.json (${records.length} 筆)`)
  }

  const handleExportTsv = () => {
    downloadBlob(`${tab}-${Date.now()}.tsv`, buildTsv(records), 'text/tab-separated-values')
    toast.success(`已下載 ${tab}.tsv (${records.length} 筆)`)
  }

  const handleCopyShare = async () => {
    const snap = snapshot ?? demoSave
    try {
      const link = encodeShareLink(JSON.stringify(snap))
      await navigator.clipboard.writeText(link)
      toast.success(`已複製分享連結（${snap.source}）`, { description: link.slice(0, 80) + '...' })
    } catch (e) {
      toast.error('複製失敗：' + (e as Error).message)
    }
  }

  // StoreLayout summary
  const layoutSummary = useMemo(() => {
    if (tab !== 'storeLayout') return null
    const inv: Record<number, number> = {}
    let totalUnits = 0
    let totalSlots = 0
    for (const prop of ENC.storeLayout) {
      for (const e of prop.inventory) {
        totalSlots++
        if (e.count > 0) {
          totalUnits += e.count
          inv[e.product] = (inv[e.product] ?? 0) + e.count
        }
      }
    }
    const byProduct = Object.entries(inv)
      .map(([pid, c]) => {
        const p = productById.get(Number(pid)) as Product | undefined
        return {
          pid: Number(pid),
          count: c,
          name: p?.name.en ?? `#${pid}`,
          zhName: p?.name.zhHant ?? '',
        }
      })
      .sort((a, b) => b.count - a.count)
    return { totalProps: ENC.storeLayout.length, totalUnits, totalSlots, byProduct }
  }, [tab])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">原始資料瀏覽器</h1>
          <p className="text-sm text-muted-foreground">
            直接展示百科原始資料。可下載為 Markdown / JSON / TSV 或產生分享連結。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge
            confidence="confirmed"
            formula="encyclopedia.json (generated from uploads)"
            note="所有欄位來自 products.tsv / customers.tsv / necessities.json / game_encyclopedia.md"
          />
        </div>
      </div>

      {/* Sticky export bar */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <Database className="mr-1 h-3 w-3" /> {activeTab.label}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{activeTab.count} 筆</Badge>
          <Badge variant="outline" className="text-[10px]">{columns.length} 欄</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> 匯出 Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson}>
              <FileJson className="mr-1.5 h-3.5 w-3.5" /> 匯出 JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportTsv}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> 匯出 CSV/TSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyShare}>
              <LinkIcon className="mr-1.5 h-3.5 w-3.5" /> 複製分享連結
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex h-auto flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="text-[11px]">
              {t.label} ({t.count})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* StoreLayout summary */}
      {layoutSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" /> StoreLayout 摘要
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Props</div>
                <div className="text-xl font-bold tabular-nums">{layoutSummary.totalProps}</div>
              </div>
              <div className="rounded-md border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">總庫存單位</div>
                <div className="text-xl font-bold tabular-nums">{layoutSummary.totalUnits.toLocaleString()}</div>
              </div>
              <div className="rounded-md border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">總格數</div>
                <div className="text-xl font-bold tabular-nums">{layoutSummary.totalSlots.toLocaleString()}</div>
              </div>
              <div className="rounded-md border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">商品種類</div>
                <div className="text-xl font-bold tabular-nums">{layoutSummary.byProduct.length}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3 w-3" /> 庫存 by Product (Top 20)
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-3 lg:grid-cols-4">
                {layoutSummary.byProduct.slice(0, 20).map((x) => (
                  <div key={x.pid} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                    <span className="truncate" title={`${x.name} / ${x.zhName}`}>
                      <span className="font-mono text-muted-foreground">#{x.pid}</span>{' '}
                      {x.name}
                    </span>
                    <span className="ml-1 shrink-0 font-mono tabular-nums">{x.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-left">
                  <th className="w-8 p-2 text-[10px] uppercase text-muted-foreground">#</th>
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap p-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/40">
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{i}</td>
                    {columns.map((c) => {
                      const raw = r[c]
                      const isObj = raw != null && typeof raw === 'object'
                      return (
                        <td
                          key={c}
                          className={cn(
                            'max-w-[280px] p-2 align-top',
                            isObj ? 'font-mono text-[10px]' : 'whitespace-nowrap',
                          )}
                        >
                          {isObj ? (
                            <pre className="overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all text-[10px]">
                              {toCell(raw)}
                            </pre>
                          ) : (
                            <span className="truncate" title={toCell(raw)}>
                              {toCell(raw)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
