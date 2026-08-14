# Task 5b — full-stack-developer work record

## Scope
Build 4 page components for Supermarket Together Lab:
1. `src/components/lab/simulator.tsx` — Customer Simulator (Monte Carlo)
2. `src/components/lab/restock.tsx` — Restock Planner (knapsack)
3. `src/components/lab/exploits.tsx` — Mechanic Exploits / Data Monsters
4. `src/components/lab/raw-data.tsx` — Raw Data Viewer + Export

## Contracts read
- `src/lib/types.ts` (Product, CustomerType, Necessity, SaveSnapshot, RestockItem, Confidence, etc.)
- `src/lib/engine.ts` (simulateCustomers, computeRestockPlan, classifyExploitCandidates, exportMarkdownReport, computeDemandProxy)
- `src/lib/data-loader.ts` (encyclopedia, demoSave, productById — note: productById Map inferred as Map<{},{}>, requires `as Product | undefined` cast at call sites)
- `src/lib/store.ts` (useSaveStore, useUIStore, useRoomStore)
- `src/components/shared/primitives.tsx` (ConfidenceBadge, StatCard, DataRow, MiniBar, ScoreRing, SectionHeader, fmt, fmtMoney)

## Implementation notes
- All 4 files start with `'use client'` and export the named function.
- Every analytical output carries ConfidenceBadge (mostly 'proxy' for derived, 'confirmed' for raw encyclopedia).
- Exports use Blob + URL.createObjectURL + temp `<a>` click.
- Share link uses unicode-safe base64 (`btoa(unescape(encodeURIComponent(json)))`) into URL hash.
- Restock room sync converts `RestockRecommendation` → `RestockItem` (adds id, drops productName/priority).
- Simulator heatmap: 11 rows (necessities) × 58 cols (customer types), cells colored by `rgba(16,185,129, weight)` alpha.
- Tabs are used for filters (exploits category, rawdata sources, simulator spawn/stocked modes).

## Verification
- `bun run lint` exit=0 (clean across whole repo).
- `npx tsc --noEmit` clean for all 4 owned files.
- No tests written (per policy).
- Dev server in sandbox was idle/stopped; did not restart per instructions.

## Files
- src/components/lab/simulator.tsx — 707 lines
- src/components/lab/restock.tsx — 670 lines
- src/components/lab/exploits.tsx — 335 lines
- src/components/lab/raw-data.tsx — 357 lines

## Patterns established (useful for sibling agents)
- For `productById.get(id)` always cast: `productById.get(id) as Product | undefined`.
- Use `useUIStore`'s `setSelectedProduct(id) + setView('wiki')` for product chip navigation.
- Use `useRoomStore`'s `setRestockPlan(items)` + sonner `toast` for room sync.
- Sticky export bar pattern: `-mx-4 px-4 py-2 backdrop-blur bg-background/95 sticky top-0 z-20`.
- Dense table pattern: `max-h-[70vh] overflow-auto scrollbar-thin` + `thead sticky top-0 z-10 bg-background`.
