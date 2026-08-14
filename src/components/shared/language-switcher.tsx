'use client'

import { useUIStore, type Lang } from '@/lib/store'
import { LANG_LABELS, LANG_FULL_LABELS } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Languages } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'

const ORDER: Lang[] = ['zhHant', 'en', 'both']

export function LanguageSwitcher() {
  const lang = useUIStore((s) => s.lang)
  const setLang = useUIStore((s) => s.setLang)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" aria-label="switch language">
          <Languages className="h-3.5 w-3.5" />
          <span className="font-semibold">{LANG_LABELS[lang]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">顯示語言 / Display Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ORDER.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => setLang(l)}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span>{LANG_FULL_LABELS[l]}</span>
            {lang === l && <Check className="h-3.5 w-3.5 text-emerald-500" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className={cn('px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground')}>
          遊戲資料名稱將依此切換。<br />
          雙語模式：中文 / English。
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
