'use client'

import { useEffect, useState } from 'react'
import { useUIStore, useSaveStore, useRoomStore } from '@/lib/store'
import { demoSave } from '@/lib/data-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { NAV } from './sidebar'
import { Database, Github, Moon, Sun, Wifi, WifiOff } from 'lucide-react'
import { useTheme } from 'next-themes'

export function TopBar() {
  const setView = useUIStore((s) => s.setView)
  const commandOpen = useUIStore((s) => s.commandOpen)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const snapshot = useSaveStore((s) => s.snapshot)
  const loadDemo = useSaveStore((s) => s.loadDemo)
  const clear = useSaveStore((s) => s.clear)
  const room = useRoomStore((s) => s.room)
  const connected = useRoomStore((s) => s.connected)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
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

  // Use a stable "no save" state during SSR and first client render to avoid hydration mismatch
  // (zustand persist loads from localStorage only on client). After mount, show real state.
  const ssrSnapshot = mounted ? snapshot : null
  const ssrRoom = mounted ? room : null

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" />
          <span>Supermarket Together Lab</span>
        </div>

        <div className="ml-2 flex items-center gap-1.5">
          {ssrSnapshot ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {ssrSnapshot.parseStatus === 'demo' ? 'Demo Save' : `Save Day ${ssrSnapshot.day}`}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
              No Save
            </Badge>
          )}
          {ssrRoom && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              {connected ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
              Room {ssrRoom.code} · {ssrRoom.members.length}
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {ssrSnapshot ? (
            <>
              {ssrSnapshot.money > 0 && (
                <span className="hidden text-xs text-muted-foreground sm:inline">Day {ssrSnapshot.day} · ${ssrSnapshot.money.toLocaleString()}</span>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('upload')}>
                換存檔
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clear}>
                清除
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={loadDemo}>
                載入 Demo
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('upload')}>
                上傳存檔
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="toggle theme"
            suppressHydrationWarning
          >
            {mounted ? (theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <Moon className="h-4 w-4" />}
          </Button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden text-muted-foreground hover:text-foreground sm:block"
            aria-label="source"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </header>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="搜尋頁面、商品、功能…" />
        <CommandList>
          <CommandEmpty>沒有結果</CommandEmpty>
          <CommandGroup heading="頁面">
            {NAV.map((n) => (
              <CommandItem
                key={n.id}
                onSelect={() => {
                  setView(n.id)
                  setCommandOpen(false)
                }}
              >
                <n.icon className="mr-2 h-4 w-4" />
                {n.zhLabel} — {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="快速動作">
            <CommandItem
              onSelect={() => {
                loadDemo()
                setView('dashboard')
                setCommandOpen(false)
              }}
            >
              <Database className="mr-2 h-4 w-4" /> 載入 Demo 存檔並前往 Dashboard
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
