'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Upload,
  BookOpen,
  TrendingUp,
  FlaskConical,
  Users,
  PackageSearch,
  Tag,
  Map,
  Boxes,
  GitBranch,
  UserCog,
  Factory,
  Calendar,
  Trophy,
  Bug,
  Database,
  UsersRound,
  Search,
  ChevronLeft,
  ChevronRight,
  Store,
  Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore, type ViewId } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { encyclopedia } from '@/lib/data-loader'

interface NavItem {
  id: ViewId
  label: string
  zhLabel: string
  icon: React.ComponentType<{ className?: string }>
  group: string
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', zhLabel: '營運儀表板', icon: LayoutDashboard, group: '營運' },
  { id: 'upload', label: 'Save Upload', zhLabel: '存檔上傳', icon: Upload, group: '營運' },
  { id: 'room', label: 'Multiplayer Room', zhLabel: '多人房間', icon: UsersRound, group: '營運' },
  { id: 'layout', label: 'Store Layout', zhLabel: '店面平面圖', icon: Map, group: '營運' },
  { id: 'restock', label: 'Restock Planner', zhLabel: '補貨規劃', icon: PackageSearch, group: '規劃' },
  { id: 'pricing', label: 'Pricing Lab', zhLabel: '定價實驗', icon: Tag, group: '規劃' },
  { id: 'skills', label: 'Skill ROI', zhLabel: '技能 ROI', icon: GitBranch, group: '規劃' },
  { id: 'employees', label: 'Employee Lab', zhLabel: '員工實驗室', icon: UserCog, group: '規劃' },
  { id: 'manufacturing', label: 'Manufacturing', zhLabel: '製造實驗室', icon: Factory, group: '規劃' },
  { id: 'seasons', label: 'Season Planner', zhLabel: '季節規劃', icon: Calendar, group: '規劃' },
  { id: 'wiki', label: 'Product Wiki', zhLabel: '商品百科', icon: BookOpen, group: '資料' },
  { id: 'profit', label: 'Profit Lab', zhLabel: '利潤實驗室', icon: TrendingUp, group: '資料' },
  { id: 'salt', label: 'Salt Probe', zhLabel: '鹽壟斷探測', icon: FlaskConical, group: '資料' },
  { id: 'simulator', label: 'Customer Sim', zhLabel: '顧客模擬器', icon: Users, group: '資料' },
  { id: 'containers', label: 'Container Lab', zhLabel: '貨架實驗室', icon: Boxes, group: '資料' },
  { id: 'exploits', label: 'Exploits', zhLabel: '數據怪 / 邪修', icon: Bug, group: '資料' },
  { id: 'achievements', label: 'Achievements', zhLabel: '成就', icon: Trophy, group: '資料' },
  { id: 'rawdata', label: 'Raw Data', zhLabel: '原始資料', icon: Database, group: '資料' },
  { id: 'atlas', label: 'Game Atlas', zhLabel: '遊戲圖譜', icon: Share2, group: '資料' },
]

const GROUPS = ['營運', '規劃', '資料']

export function Sidebar() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  // Avoid hydration mismatch: persisted view/collapsed load from localStorage on client only.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])
  const ssrView = mounted ? view : 'dashboard'
  const ssrCollapsed = mounted ? collapsed : false

  const filtered = useMemo(() => {
    if (!query.trim()) return NAV
    const q = query.toLowerCase()
    return NAV.filter((n) => n.label.toLowerCase().includes(q) || n.zhLabel.includes(q))
  }, [query])

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        ssrCollapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Store className="h-4 w-4" />
        </div>
        {!ssrCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight">ST Lab</div>
            <div className="truncate text-[10px] text-muted-foreground">Supermarket Together</div>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={toggle} aria-label="toggle sidebar">
          {ssrCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {!ssrCollapsed && (
        <div className="border-b px-2 py-2">
          <button
            onClick={() => setCommandOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Search className="h-3.5 w-3.5" />
            <span>搜尋 / 跳轉…</span>
            <kbd className="ml-auto rounded border bg-muted px-1 text-[10px]">⌘K</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {GROUPS.map((g) => {
          const items = filtered.filter((n) => n.group === g)
          if (items.length === 0) return null
          return (
            <div key={g} className="mb-3">
              {!ssrCollapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
              )}
              <div className="space-y-0.5">
                {items.map((n) => {
                  const Icon = n.icon
                  const active = ssrView === n.id
                  return (
                    <button
                      key={n.id}
                      onClick={() => setView(n.id)}
                      title={ssrCollapsed ? n.zhLabel : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        ssrCollapsed && 'justify-center',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!ssrCollapsed && <span className="truncate">{n.zhLabel}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {!ssrCollapsed && (
        <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
          <div>{encyclopedia.meta.counts.products} products · {encyclopedia.meta.counts.customerTypes} customers</div>
          <div className="mt-0.5">{encyclopedia.meta.counts.necessities} necessities · {encyclopedia.meta.counts.seasons} seasons</div>
        </div>
      )}
    </aside>
  )
}
