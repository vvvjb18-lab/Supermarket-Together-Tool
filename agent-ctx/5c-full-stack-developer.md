# Task 5c — full-stack-developer

## Task
Build 4 page components for "Supermarket Together Lab":
- `src/components/lab/skills.tsx` (Skills — ROI planner + room voting)
- `src/components/lab/employees.tsx` (Employees — speed/XP calc + role panel)
- `src/components/lab/manufacturing.tsx` (Manufacturing — 30 products + queue planner)
- `src/components/lab/seasons.tsx` (Seasons — 4 pools + overlap analysis)

## Contracts Read
- `src/lib/types.ts` — Skill, ManufacturingProduct, Season, EmployeeTask, Encyclopedia, TaskAssignment (uses `playerId` not `assignedTo`), Room (skillVotes, checklist, tasks)
- `src/lib/engine.ts` — `computeSkillRecommendations(strategy)` returns `CalcResult<SkillROI[]>`; `computeEmployeeSpeed(level, factor)`; `computeXpToNextLevel(level)`; `computeDemandProxy`; `computeBoxValue`. SkillROI has {skill, category, roiProxy, synergyTags, confidence, note}.
- `src/lib/data-loader.ts` — `encyclopedia` (44 skills, 30 manufacturing, 4 seasons, 8 tasks), `productById`, `productZhName`
- `src/lib/store.ts` — `useRoomStore` with `voteSkill`, `unvoteSkill`, `toggleChecklist`, `addChecklist`, `assignTask`
- `src/components/shared/primitives.tsx` — `ConfidenceBadge`, `StatCard` (NO `sources` prop — only label/value/unit/confidence/formula/hint/accent), `SectionHeader`, `MiniBar`, `fmt`, `fmtMoney`
- `src/components/lab/dashboard.tsx` — PATTERN reference

## Key Data Facts Used
- 44 skills, all 1000 FP (perkSystem.cost=1000), no prereqs. Each: id, name{en,zhHans,zhHant}, description, effect (IL string), il, perk.
- Employee speed: `2.5 * (1 + 0.05*level + factor)`, level cap 5, factor cap 1.
- XP to next level: `1000 + 100*level`.
- Employee config: initialSalary 5000, 7 skills, initialSkillValues [1000×7].
- 8 employee tasks with colors (NoTask/Cashier/Restocker/Storage/Security/Technician/Packaging/Manufacturing).
- 30 manufacturing products with size (x,y,z), itemsPerBox, linkedProductID. Base time 30s. No fixed recipe table.
- 4 seasons: Spring(23), Summer(37), Autumn/Halloween(20), Winter(15).

## Implementation Notes
- All 4 files are `'use client'` with named exports matching what `app-shell.tsx` lazy-imports.
- Every analytical output gets a `ConfidenceBadge` with formula + sources where applicable.
- Engine functions used directly (no reimplementation).
- Traditional Chinese (zhHant) UI throughout.
- Recharts used for: skill ROI horizontal bar (top 15), employee speed LineChart (3 factor lines), manufacturing density bar (top 15), seasons demand-vs-boxValue ScatterChart.
- Room integration: skills (voteSkill/unvoteSkill + consensus banner), employees (role assignment Select + checklist sync), manufacturing (assignTask for manufacturing task), seasons (checklist sync + add season items button).
- Responsive grids (1/2/3/4 columns at sm/md/lg/xl breakpoints).
- Sticky header tables with `max-h-[600px] overflow-y-auto`.

## Files Modified (mine only)
- `src/components/lab/skills.tsx` (476 lines) — overwritten stub
- `src/components/lab/employees.tsx` (665 lines) — overwritten stub
- `src/components/lab/manufacturing.tsx` (646 lines) — overwritten stub
- `src/components/lab/seasons.tsx` (699 lines) — overwritten stub

## Verification
- `bunx eslint` on all 4 files: PASS (no errors)
- `bunx tsc --noEmit` on all 4 files: PASS (no errors)
- `bun run lint` (full project): PASS (exit 0)
- Dev server running on :3000 (Turbopack) — components lazy-load on navigation

## Issues / Gotchas
1. `StatCard` does NOT accept `sources` prop (only `ConfidenceBadge` does). Removed from one manufacturing StatCard.
2. `TaskAssignment` type uses `playerId`, NOT `assignedTo`. Fixed in manufacturing room task assignment.
3. `productById.get()` infers value type as `{}` due to Map constructor tuple inference. Cast `as Product | undefined` after `.get()`.
4. `productZhName` import was removed during cleanup but still referenced in manufacturing table — re-added to import.
5. `computeSkillRecommendations` already returns sorted by roiProxy desc — used directly.
