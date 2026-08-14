// Shared types and small helpers for the 7 skill-tool components.
//
// Each tool component imports from here to keep the API consistent and avoid
// duplicating tiny utility code.

'use client'

import type { Skill } from '@/lib/types'
import {
  getSkillCategoryForSkill,
  categoryColor,
} from '@/lib/skill-engine'

/** Empty-state card shown when no save is loaded. */
export interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

/** Sortable / filterable skill row entry (used by tools that list skills). */
export interface SkillRow {
  skill: Skill
  perk: number | null
  unlocked: boolean
  category: string | null
}

/** Convenience: get the category name for a skill, or null. */
export function skillCategoryName(skill: Skill): string | null {
  return getSkillCategoryForSkill(skill)?.name ?? null
}

/** Convenience: get a stable HSL color for a skill's category. */
export function skillCategoryColor(skill: Skill): string {
  const name = skillCategoryName(skill)
  return name ? categoryColor(name) : '#71717a'
}

/** Standard scrollbar utility classes for long lists. */
export const SCROLLBAR_CLASSES =
  'max-h-[480px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent'

/** Smaller variant for tighter panels. */
export const SCROLLBAR_CLASSES_SM =
  'max-h-80 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent'
