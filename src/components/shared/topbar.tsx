'use client'

import { useEffect, useState } from 'react'
import { useUIStore, useSaveStore, useRoomStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { NAV, getNavItem } from './sidebar'
import { LanguageSwitcher } from './language-switcher'
import { Database, Menu, Moon, Search, Sun, Upload, Wifi, WifiOff } from 'lucide-react'
import { useTheme } from 'next-themes'

export function TopBar() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen)
  const commandOpen = useUIStore((s) => s.commandOpen)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const room = useRoomStore((s) => s.room)
  const connected = useRoomStore((s) => s.connected)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const current = getNavItem(view)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  const ssrSnapshot = mounted ? snapshot : null
  const ssrRoom = mounted ? room : null
  const CurrentIcon = current.icon

  return (
    <>
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => setMobileNavOpen(true)} aria-label="開啟功能選單">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <CurrentIcon className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{current.zhLabel}</div>
            <div className="hidden truncate text-[10px] text-muted-foreground sm:block">{current.description}</div>
          </div>
        </div>

        <button
          onClick={() => setView('upload')}
          className="ml-1 hidden min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-accent sm:flex"
          aria-label={ssrSnapshot ? '更換目前存檔' : '載入存檔'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${ssrSnapshot ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
          {ssrSnapshot ? (ssrSnapshot.parseStatus === 'demo' ? 'Demo' : `Day ${ssrSnapshot.day}`) : '未載入存檔'}
          <Upload className="h-3 w-3 text-muted-foreground" />
        </button>

        {ssrRoom && (
          <button onClick={() => setView('room')} className="hidden min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-accent lg:flex">
            {connected ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
            {ssrRoom.code} · {ssrRoom.members.length} 人
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setCommandOpen(true)} aria-label="搜尋功能">
            <Search className="h-4 w-4" />
          </Button>
          {!ssrSnapshot && (
            <Button variant="outline" size="sm" className="hidden h-8 text-xs lg:inline-flex" onClick={() => { loadDemo(); setView('dashboard') }}>
              <Database className="mr-1.5 h-3.5 w-3.5" /> 試用 Demo
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
            suppressHydrationWarning
          >
            {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <LanguageSwitcher />
        </div>
      </header>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="搜尋功能" description="輸入功能名稱或你想完成的工作">
        <CommandInput placeholder="例如：補貨、定價、顧客、原始資料…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>找不到功能，試試「補貨」、「定價」或「存檔」。</CommandEmpty>
          {(['開始', '經營工具', '研究工具'] as const).map((group) => (
            <CommandGroup key={group} heading={group}>
              {NAV.filter((item) => item.group === group).map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.zhLabel} ${item.label} ${item.description} ${item.keywords ?? ''}`}
                  onSelect={() => {
                    setView(item.id)
                    setCommandOpen(false)
                  }}
                  className="items-start"
                >
                  <item.icon className="mr-2 mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-medium">{item.zhLabel}</span>
                    <span className="block text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
