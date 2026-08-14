# Task 8-b — Lab Pages i18n + Chart Simplification

## Owned Files
- `src/components/lab/simulator.tsx` (707 → 870 lines)
- `src/components/lab/seasons.tsx` (699 → 812 lines)
- `src/components/lab/containers.tsx` (517 → 545 lines)
- `src/components/lab/store-layout.tsx` (947 → 1026 lines)

## Key Changes

### simulator.tsx — 11×58 heatmap → 3-tab layout
- Removed dense CSS-grid heatmap (user complaint: too complex)
- New 3-tab structure via shadcn Tabs:
  - **顧客最愛** (Customer view): left = 58 customer cards (customerTypeLabel + index), right = top necessities of selected customer as horizontal bars (emerald, width=weight/max) with "佔此顧客需求 X%" share label
  - **需求熱門** (Necessity view): left = 11 necessity cards (with custCount + totalWeight), right = ranked customers wanting the selected necessity (click → switches to Tab A)
  - **模擬器** (Simulator): Monte Carlo controls + OutputPanel (4 StatCards + Top-20 hits/missed + missedByGroup + topOverstockedLowDemand)
- Top helper text: "選擇一位顧客類型查看他最需要的商品類別，或選擇一個商品類別查看哪些顧客需要它。"
- All names via `productNameFor(pid, lang)`, `groupIdNameFor(group, lang)`, `necessityIdNameFor(idx, lang)`, `customerTypeLabel(c, lang)`
- Removed dual `name`/`zhName` columns in output rows — single localized `name`

### seasons.tsx — scatter → toggle (排行榜 default / 散佈圖 advanced)
- ToggleGroup with "排行榜" (default) / "散佈圖" (advanced)
- 排行榜 mode: top-15 products as horizontal bars (sorted by demandProxy × boxValue), color = exclusive (violet) / premium (amber) / normal (emerald)
- 散佈圖 mode: keeps existing ScatterChart with Chinese note "進階：每個點是一個商品，X=需求推算、Y=單箱價值。"
- All `s.name.zhHant || s.name.en` → `seasonIdNameFor(idx, lang)`
- All `r.p.name.zhHant || r.p.name.en` → `productNameFor(r.p.id, lang)`
- All `p.groupName.zhHant` → `groupIdNameFor(p.group, lang)`
- `lang` added to useMemo deps (pool / sortedPool / overlap / overview / seasonChecklist)

### containers.tsx — localize buildableName everywhere
- Added `const lang = useLang()`
- Replaced `r.buildableName` (English) → `containerNameFor(r, lang)` in:
  - 5 summary cards (hint field)
  - 5 BestOfCard titles
  - BarChart X-axis labels + tooltip
  - Comparison table cell
- Comparison table shows raw English name as secondary subtitle when different from localized name
- Sort logic preserved (sort by raw buildableName for stable ordering)
- BestOfCard takes `lang` prop typed as `ReturnType<typeof useLang>`

### store-layout.tsx — localize + new "Top 5 problematic shelves" card
- Removed `productZhName`, `buildableById`, `_buildableById`, `Buildable` imports
- Added `useLang, productNameFor, groupIdNameFor, buildableIdNameFor` from `@/lib/i18n`
- `const lang = useLang()` at top
- `aggregates.topGroups`: `p.groupName.zhHant` → `groupIdNameFor(p.group, lang)` (lang in deps)
- `swapRecs`: `productZhName(pid)` → `productNameFor(pid, lang)` (lang in deps)
- SVG legend: `b?.name.zhHant` → `buildableIdNameFor(id, lang)`
- Leaderboard Buildable column: `buildable?.name.zhHant` → `buildableIdNameFor(prop.buildableId, lang)`
- `PropDetailCard`: takes `lang` prop, uses `buildableIdNameFor` + `productNameFor`
- **NEW**: "Top 5 問題貨架（快速掃描）" card between layout report and leaderboard:
  - `topProblematic` useMemo scores props by `(negativeAnomalies×10) + (empty?5:0) + emptySlots + (duplicated×2) + lowDemand`
  - Each row: rank #, 貨架 #+buildable name, issues list (負庫存/空貨架/空格/重複/低需求) → recommendation (檢查存檔/補貨/集中/替換)
  - Click → `setSelectedIdx(e.propIndex)` (jumps to detail card)

## Verification
- `bun run lint` → 0 errors (exit 0)
- `bunx tsc --noEmit` → 0 errors in 4 owned files (pre-existing skills/ errors unrelated)
- No files outside owned 4 modified
- No test files written
- Dev server untouched on :3000

## Patterns used
- `const lang = useLang()` at top of every component
- `lang` added to `useMemo` deps for any memo computing localized names
- For child components: pass `lang` as prop typed `ReturnType<typeof useLang>` (avoids needing `Lang` re-exported from i18n)
- Horizontal bars: simple CSS divs with `style={{ width: \`${pct}%\` }}` — no recharts needed for the simplified views
- ToggleGroup (shadcn) for the seasons view toggle
