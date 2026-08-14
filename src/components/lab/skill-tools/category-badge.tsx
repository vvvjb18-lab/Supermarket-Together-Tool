// Shared small UI primitives for the 7 skill-tool components.

'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Skill } from '@/lib/types'
import { skillCategoryColor, skillCategoryName } from './types'

/** Pill badge showing the skill's nearest category with a colored dot. */
export function CategoryBadge({
  skill,
  className,
}: {
  skill: Skill
  className?: string
}) {
  const name = skillCategoryName(skill)
  if (!name) return null
  const color = skillCategoryColor(skill)
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] gap-1', className)}
      style={{
        backgroundColor: `${color}20`,
        color,
        borderColor: `${color}50`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </Badge>
  )
}
