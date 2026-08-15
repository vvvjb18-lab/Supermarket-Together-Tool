'use client'

import { useEffect, useState } from 'react'
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Store,
  Share2,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore, type ViewId } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { encyclopedia } from '@/lib/data-loader'

export interface NavItem {
  id: ViewId
  label: string
  zhLabel: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  group: '開始' | '經營工具' | '研究工具'
  keywords?: string
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', zhLabel: '營運總覽', description: '先看風險與下一步', icon: LayoutDashboard, group: '開始', keywords: '首頁 建議' },
  { id: 'upload', label: 'Save Upload', zhLabel: '載入存檔', description: '匯入並檢查遊戲資料', icon: Upload, group: '開始', keywords: 'es3 json demo' },
  { id: 'room', label: 'Multiplayer Room', zhLabel: '多人協作', description: '同步存檔與分工', icon: UsersRound, group: '開始', keywords: 'supabase realtime 房間' },
  { id: 'stats', label: 'Stats', zhLabel: '營運分析', description: '真實銷量與盈利歷史', icon: BarChart3, group: '經營工具', keywords: '統計 歷史 銷量 盈利 成長 每日' },
  { id: 'restock', label: 'Restock Planner', zhLabel: '補貨規劃', description: '決定現在該買什麼', icon: PackageSearch, group: '經營工具', keywords: '庫存 採購 缺貨' },
  { id: 'pricing', label: 'Pricing Lab', zhLabel: '定價建議', description: '找安全價與高收益價', icon: Tag, group: '經營工具', keywords: '售價 投訴 市價' },
  { id: 'layout', label: 'Store Layout', zhLabel: '店面平面圖', description: '檢查貨架與空間', icon: Map, group: '經營工具', keywords: '地圖 擺位' },
  { id: 'skills', label: 'Skill ROI', zhLabel: '技能規劃', description: '比較技能回報', icon: GitBranch, group: '經營工具', keywords: 'perk fp roi' },
  { id: 'employees', label: 'Employee Lab', zhLabel: '員工規劃', description: '檢查員工配置', icon: UserCog, group: '經營工具', keywords: '薪資 技能' },
  { id: 'manufacturing', label: 'Manufacturing', zhLabel: '製造規劃', description: '配方與產能分析', icon: Factory, group: '經營工具', keywords: '生產 配方' },
  { id: 'seasons', label: 'Season Planner', zhLabel: '季節規劃', description: '準備當季商品', icon: Calendar, group: '經營工具', keywords: '春夏秋冬' },
  { id: 'wiki', label: 'Product Wiki', zhLabel: '商品百科', description: '搜尋 339 種商品', icon: BookOpen, group: '研究工具', keywords: '產品 資料庫' },
  { id: 'profit', label: 'Profit Lab', zhLabel: '利潤分析', description: '比較商品收益', icon: TrendingUp, group: '研究工具', keywords: 'profit roi' },
  { id: 'simulator', label: 'Customer Sim', zhLabel: '顧客模擬器', description: '模擬需求與漏單', icon: Users, group: '研究工具', keywords: 'npc 行為 需求' },
  { id: 'containers', label: 'Container Lab', zhLabel: '貨架資料', description: '研究容器容量', icon: Boxes, group: '研究工具', keywords: 'container shelf' },
  { id: 'salt', label: 'Salt Probe', zhLabel: '鹽需求探測', description: '驗證單品需求機制', icon: FlaskConical, group: '研究工具', keywords: '壟斷 necessity' },
  { id: 'exploits', label: 'Exploits', zhLabel: '特殊機制', description: '查看異常高價值策略', icon: Bug, group: '研究工具', keywords: '數據怪 邪修' },
  { id: 'achievements', label: 'Achievements', zhLabel: '成就追蹤', description: '檢查成就條件', icon: Trophy, group: '研究工具', keywords: 'achievement' },
  { id: 'atlas', label: 'Game Atlas', zhLabel: '遊戲圖譜', description: '瀏覽資料關聯', icon: Share2, group: '研究工具', keywords: 'graph atlas' },
  { id: 'rawdata', label: 'Raw Data', zhLabel: '原始資料', description: '檢查未加工欄位', icon: Database, group: '研究工具', keywords: 'json raw debug' },
]

const MAIN_GROUPS = ['開始', '經營工具'] as const

export function getNavItem(view: ViewId) {
  return NAV.find((item) => item.id === view) ?? NAV[0]
}

function NavButton({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate: (id: ViewId) => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={() => onNavigate(item.id)}
      title={collapsed ? `${item.zhLabel}：${item.description}` : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.zhLabel}</span>
          <span className={cn('block truncate text-[10px]', active ? 'text-sidebar-primary-foreground/70' : 'text-muted-foreground')}>
            {item.description}
          </span>
        </span>
      )}
    </button>
  )
}

function NavContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate: (id: ViewId) => void }) {
  const view = useUIStore((s) => s.view)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const [researchOpen, setResearchOpen] = useState(false)
  const activeResearchView = NAV.some((item) => item.group === '研究工具' && item.id === view)
  const showResearch = researchOpen || activeResearchView

  return (
    <>
      {!collapsed && (
        <div className="border-b px-2 py-2">
          <button
            onClick={() => setCommandOpen(true)}
            className="flex min-h-9 w-full items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span>搜尋功能…</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {MAIN_GROUPS.map((group) => (
          <div key={group} className="mb-3">
            {!collapsed && <div className="px-2 pb-1 pt-1 text-[10px] font-semibold text-muted-foreground">{group}</div>}
            <div className="space-y-0.5">
              {NAV.filter((item) => item.group === group).map((item) => (
                <NavButton key={item.id} item={item} active={view === item.id} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        <Collapsible open={showResearch || collapsed} onOpenChange={setResearchOpen}>
          {!collapsed && (
            <CollapsibleTrigger className="mb-1 flex min-h-8 w-full items-center rounded-md px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
              研究工具
              <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', showResearch && 'rotate-180')} />
            </CollapsibleTrigger>
          )}
          <CollapsibleContent className="space-y-0.5">
            {NAV.filter((item) => item.group === '研究工具').map((item) => (
              <NavButton key={item.id} item={item} active={view === item.id} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </nav>
    </>
  )
}

export function Sidebar() {
  const setView = useUIStore((s) => s.setView)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])
  const isCollapsed = mounted ? collapsed : false

  return (
    <aside className={cn('hidden h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex', isCollapsed ? 'w-16' : 'w-64')}>
      <div className="flex min-h-14 items-center gap-2 border-b px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Store className="h-4 w-4" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight">ST Lab</div>
            <div className="truncate text-[10px] text-muted-foreground">經營助手</div>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggle} aria-label={isCollapsed ? '展開側欄' : '收合側欄'}>
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <NavContent collapsed={isCollapsed} onNavigate={setView} />

      {!isCollapsed && (
        <div className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {encyclopedia.meta.counts.products} 商品 · {encyclopedia.meta.counts.customerTypes} 顧客 · {encyclopedia.meta.counts.necessities} 需求類別
        </div>
      )}
    </aside>
  )
}

export function MobileNavigation() {
  const open = useUIStore((s) => s.mobileNavOpen)
  const setOpen = useUIStore((s) => s.setMobileNavOpen)
  const setView = useUIStore((s) => s.setView)

  const handleNavigate = (view: ViewId) => {
    setView(view)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[88vw] max-w-80 gap-0 p-0">
        <SheetHeader className="border-b pr-12 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Store className="h-4 w-4" /> Supermarket Together Lab
          </SheetTitle>
          <SheetDescription>先載入存檔，再從營運總覽開始。</SheetDescription>
        </SheetHeader>
        <NavContent onNavigate={handleNavigate} />
      </SheetContent>
    </Sheet>
  )
}
