# Task 5d — full-stack-developer

## Task
Build 3 page components for "Supermarket Together Lab":
- `src/components/lab/pricing.tsx` — Pricing Lab (search + suggestions + player price editor + room vote + experiment tracker + bulk pricing)
- `src/components/lab/store-layout.tsx` — Store Layout Analyzer (top-down SVG map + highlight modes + efficiency leaderboard + room shelf assignment)
- `src/components/lab/achievements.tsx` — Achievements (51 entries + rarity badges + progress tracker + room checklist sync + guide notes + stats reference)

## Contracts Read
- `src/lib/types.ts` — Product, LayoutProp, Achievement, Encyclopedia, SaveSnapshot, PriceExperiment, Confidence, Room (pricePlan, shelfAssignments, checklist, members)
- `src/lib/engine.ts` — `computePriceSuggestion(product)` returns CalcResult<PriceSuggestion> with base/conservative/balanced/aggressive/markupBalanced + 'needs-runtime' confidence. `computeShelfEfficiency(layout)` returns CalcResult<PropEfficiency[]> (propIndex, buildableId, totalUnits, distinctProducts, shelfValue, demandCoverage, emptySlots, negativeAnomalies, duplicatedProducts, efficiency). `computeBoxValue`, `computeColliderVolume`, `computeValueDensity`, `computeDemandProxy`.
- `src/lib/data-loader.ts` — `encyclopedia` (51 achievements, 24 achievementStats, 43 buildables, 41 storeLayout props, 339 products, 19 groups), `productById`, `buildableById`, `productZhName`.
- `src/lib/store.ts` — `useSaveStore` (snapshot, updatePricing, loadDemo); `useUIStore` (selectedProductId, setSelectedProduct); `useRoomStore` (room, addPriceExperiment, assignShelf, toggleChecklist, updateRoom, members).
- `src/components/shared/primitives.tsx` — `ConfidenceBadge`, `StatCard` (label/value/unit/confidence/formula/hint/accent — NO `sources` or `note` props on StatCard), `SectionHeader`, `MiniBar`, `ScoreRing`, `DataRow`, `fmt`, `fmtMoney`.
- `src/components/lab/dashboard.tsx` — PATTERN reference.
- shadcn/ui components used: Card, Button, Input, Badge, Table, ToggleGroup, Select, Checkbox, Progress, Accordion, Popover, Tooltip.

## Key Data Facts Used
- 51 achievements (steamId + name + globalPercent). globalPercent ranges 0..41.7.
- Rarity tiers: < 1% = 極稀有 (rose), < 5% = 稀有 (amber), < 15% = 普通 (sky), else 常見 (zinc).
- 24 achievementStats (index → description) — index 23 missing (jumps from 22 to 24).
- 41 storeLayout props: buildableIds used = {0: 28, 1: 8, 2: 1, 3: 4} (Placement Mode / Product Shelf / Basic Fridge / Double Fridge).
- Layout coord range: posX -13.26..14.06, posZ -0.84..11.69; angles ∈ {0, 90, 180, 270}.
- Total inventory units across layout: 2055 (per layoutMeta).
- Price suggestion formula: conservative=base×1.0, balanced=base×1.15, aggressive=base×1.40 (heuristic, NOT extracted from IL — 'needs-runtime').

## Implementation Notes
- All 3 files are `'use client'` with named exports matching `app-shell.tsx` lazy imports (`Pricing`, `StoreLayout`, `Achievements`).
- Every analytical surface carries a ConfidenceBadge with formula + note. Pricing suggestions always flagged 'needs-runtime'; efficiency metrics 'proxy'; achievement data 'confirmed'; guide notes 'unverified'.
- Engine functions used directly (no reimplementation of game logic).
- Honesty callout at top of Pricing Lab: "顧客價格接受公式未從 IL 提取。所有建議為啟發式 markup，必須在遊戲內實測。"

## Type System Workaround
- `data-loader.ts` has a pre-existing bug: `import type { Encyclopedia, SaveSnapshot } from '../types'` (should be `'./types'`). This causes `productById` and `buildableById` Maps to be inferred as `Map<unknown, unknown>`, breaking downstream code that accesses `.name`, `.id`, etc.
- I did NOT modify data-loader.ts (out of scope). Instead, in `pricing.tsx` and `store-layout.tsx`, I cast the imported maps to their proper typed form at module load:
  ```ts
  const productById = _productById as unknown as Map<number, Product>
  const buildableById = _buildableById as unknown as Map<number, Buildable>
  ```
- This pattern is similar to (but cleaner than) the inline `as Product` casts used by the 5c agent in `seasons.tsx`.

## Pricing Lab (`pricing.tsx`)
- Product selector: Input with debounced query → filtered dropdown (top 24 matches by name/brand/ID).
- Selected product card: name (zhHant/en), id, brand, tier, group, category, maxItemsPerBox, base price, box value (with formula), demand proxy (with MiniBar).
- Price suggestion panel: 5 StatCards (Base / Conservative / Balanced / Aggressive / Markup%) + big 'needs-runtime' callout.
- Player price editor: Input bound to `snapshot.productPlayerPricing[productId]` via `updatePricing`. Disabled when no snapshot. Keyed by `product.id` to reset draft state on product change (avoids `set-state-in-effect` lint error).
- Room vote panel (if room): per-member approve/reject buttons, vote tally, "加入實驗追蹤器" action when approves > rejects.
- Bulk pricing view: top 30 products by boxValue. Columns: product, base, box value, player price, markup%, balanced, "套用 balanced" button.
- Experiment tracker: table of PriceExperiments (room.pricePlan if room, else local state). Editable observedSales/observedComplaints/conclusion via Inputs. "新增實驗" button adds row for selected product.

## Store Layout Analyzer (`store-layout.tsx`)
- Top-down SVG map with viewBox computed from actual data range (posX/posZ bounds + 1-unit padding).
- Each prop: `<g transform="translate(posX,posZ) rotate(angle)">` containing `<rect>` (0.6×0.4 units), inventory count label, and prop index. Color by buildableId (4-color palette).
- 8 highlight modes via ToggleGroup: none, empty, low (<5 units), high-value (top 25% by shelfValue), low-value (bottom 25%), duplicated (>0 dup products), missing-demand (max demand < 0.002), negative (with animate-pulse blink).
- Click prop → detail card with posX/posZ/angle, 6 StatCards (units/distinct/value/demand/empty/negative), inventory list (with product names + demand), room assignment buttons (if room).
- Layout report: 6 summary StatCards + Top 20 products by inventory + by-group breakdown + recommended shelf swaps (heuristic: empty slots, low-demand stock, duplicated products).
- Efficiency leaderboard: sortable table (6 SortKey columns) with all 41 props. Clicking row selects prop on map.
- Room mode: shelf zone assignment via Select + per-prop assign buttons. Assigned props get colored ring on map. Hint card when no room.
- ConfidenceBadge: 'confirmed' on layout data (from save), 'demo' on demo layout, 'proxy' on efficiency metrics.

## Achievements (`achievements.tsx`)
- All 51 achievements in a sortable dense table (sort by name or globalPercent, asc/desc).
- Rarity badge inline (4 tiers).
- Rarest Top 10 + Easiest Top 10 cards (with per-row checkboxes).
- Manual progress tracker: tiny zustand persist store (`stl-ach-progress`) when no room. Progress bar shows X/51.
- Room mode: syncs to `room.checklist` using `steamId` as id. Toggle: if item missing, add via `updateRoom`; if exists, use `toggleChecklist`.
- Search filter by name or steamId.
- Notable achievement guides (Millionaire, Enigma Cube, HiddenCatPlaza) with zhHant names + tip lists. Marked 'unverified'.
- Collapsible stats reference (24 entries via Accordion). ConfidenceBadge 'confirmed'.
- Mode banner showing local vs room mode, with reset button for local mode.

## Verification
- `bun run lint` → 0 errors in my 3 files.
- `bunx tsc --noEmit --project tsconfig.json` → 0 errors in my 3 files (after the Map cast workaround).
- Pre-existing type errors in `data-loader.ts`, `engine.ts`, `salt.tsx`, `skills/stock-analysis-skill/` are NOT mine.

## Files Modified
- `/home/z/my-project/src/components/lab/pricing.tsx` (overwrote stub — ~920 lines)
- `/home/z/my-project/src/components/lab/store-layout.tsx` (overwrote stub — ~870 lines)
- `/home/z/my-project/src/components/lab/achievements.tsx` (overwrote stub — ~480 lines)

No other files modified. No test files written.
