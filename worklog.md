# Supermarket Together Lab — Worklog

## Project: Supermarket Together Lab
A full-feature co-op operations dashboard + wiki for the game Supermarket Together.
Built with Next.js 16 + TypeScript + Tailwind + shadcn/ui + Zustand + socket.io.

## Data sources (provided)
- `/home/z/my-project/upload/game_encyclopedia.md` — human-readable encyclopedia (primary source for tiers, groups, customer full 11-weight arrays, seasons, containers, skills, buildables, achievements, manufacturing, employee config, game tuning, layout)
- `/home/z/my-project/upload/products.tsv` — 339 products with collider/box/price fields
- `/home/z/my-project/upload/necessities.json` — 11 necessity pools with rawIds (preserves duplicate tokens, e.g. Salt "4-4-4-4-4")
- `/home/z/my-project/upload/customers.tsv` — 58 customer types (top-3 summary; full 11-weight array parsed from md)
- `/home/z/my-project/upload/_latest.json` — partial EasySave3 export (malformed JSON, used as demo save reference)

## Rigor policy
Every analytical output is labeled: Confirmed / Proxy / Unverified / Exploit Candidate.
Salt mechanic = "Confirmed special-case mechanic, unproven exploit".

---
Task ID: 0
Agent: orchestrator (main)
Task: Project kickoff — analyze data, plan architecture, bootstrap foundation.

Work Log:
- Inspected all 5 uploaded data files; confirmed structure & counts (339 products, 58 customers, 11 necessities, 55 tiers, 19 groups, 4 seasons, 42 containers, 44 skills, 43 buildables, 51 achievements, 30 manufacturing products, 41 layout props).
- Confirmed Salt mechanic: necessity[9] rawIds="4-4-4-4-4", unique=[4], also in necessity[10] (62-token staple pool), only customer #47 has weight 0.5 for necessity[9].
- Verified _latest.json is malformed (EasySave3 bool serialization bug); will treat as demo save and build a tolerant mock parser + adapter interface.
- Confirmed Next.js 16 project scaffolded, shadcn/ui components present, Prisma+SQLite available, dev server runs on :3000, socket.io NOT yet installed.
- Planned 22-feature build with parallel subagent delegation after foundation is complete.

Stage Summary:
- Architecture decided: single-page app shell with tab/route-based view switching inside src/app/page.tsx (user can only see / route). State via Zustand (encyclopedia store, save-snapshot store, room store). Real-time room sync via socket.io mini-service on :3003 + BroadcastChannel fallback.
- Next: generate clean TS data module from uploads, build calculation engine, app shell, then delegate pages to subagents.

---
Task ID: 5a
Agent: full-stack-developer
Task: Build Wiki + Profit + Salt + Containers pages

Work Log:
- Read worklog.md and all contract files (types.ts, engine.ts, data-loader.ts, store.ts, primitives.tsx, dashboard.tsx) to understand patterns, types, and engine API surface.
- Inspected encyclopedia.json structure (339 products, 11 necessities, 4 seasons, 42 containers, 19 groups, 55 tiers, 7 premium ids, 30 manufacturing products, 41 layout props).
- Confirmed shadcn/ui component availability (card, table, sheet, tabs, select, switch, input, badge, button, tooltip) and that recharts + @tanstack/react-table are installed.
- Built Wiki (`src/components/lab/wiki.tsx`): StatCard row (5), dense filter bar (text + 4 selects + 8 toggle chips), sticky-header sortable table (14 cols, 7 sortable), Sheet right-drawer product detail with 7 sections (identity, pricing, geometry, demand, manufacturing link, snapshot state, role), recommended role classifier with ConfidenceBadge 'proxy'. Selected product synced via UI store (no local open state to avoid setState-in-effect lint error).
- Built Profit (`src/components/lab/profit.tsx`): proxy-disclaimer callout card, 5-card stat row, recharts ScatterChart (X=demandProxy, Y=valueDensity log-scale, bubble size=boxValue, color by group, notable IDs 296/299/287/4 highlighted red with name labels), 9 leaderboard tabs each top-15 (單箱價值 / 價值密度 / 需求 / 加權 / 早期 / 後期 / Premium / 季節 / 陷阱), each row clickable → setSelectedProduct + setView('wiki').
- Built Salt (`src/components/lab/salt.tsx`): mechanic-explanation card with 6 raw-data cards (all 'confirmed'), 3 route StatCards (route9/route10 confirmed, total proxy), 5 salt-product StatCards, comparison table for 16 ids with salt row highlighted, exploit-confidence callout with engine's conclusion string, 3-mode Monte Carlo simulator (normal / salt-heavy / salt-only, n=2000, runAll button), per-mode result view (4 StatCards + Top5 hits + Top5 missing), cross-mode comparison table with salt-hit %.
- Built Containers (`src/components/lab/containers.tsx`): 5-card summary row (total / cheapest / highest cap / best $/u³ / energy-free count), "Best of" section with 5 mini-cards (cheap-energy-free, high-capacity, best-energy-free, high-density, top-3 traps), recharts BarChart of costPerVolume across all 42 containers (emerald = energy-free, amber = has-energy), full sortable 12-column comparison table (8 sortable).
- Verified all 4 export names match `app-shell.tsx` lazy imports (`m.Wiki`, `m.Profit`, `m.Salt`, `m.Containers`).
- Ran `bun run lint` — initially one error in wiki.tsx (react-hooks/set-state-in-effect from a useEffect syncing selectedProductId). Refactored to derive `openId` directly from `selectedProductId` store selector, eliminating the effect entirely. Re-ran lint → clean (0 errors, 0 warnings).

Stage Summary:
- Files created: `src/components/lab/wiki.tsx`, `src/components/lab/profit.tsx`, `src/components/lab/salt.tsx`, `src/components/lab/containers.tsx`.
- Key features: 339-product wiki with Sheet detail + role classifier; Profit scatter + 9 leaderboard tabs; Salt probe with 3-mode Monte Carlo simulator + cross-mode comparison; 42-container comparison table + bar chart + best-of cards. All engine functions reused exclusively (computeBoxValue, computeColliderVolume, computeValueDensity, computeBoxValueDensity, computeDemandProxy, computeWeightedRevenueProxy, computeWeightedBoxProxy, computeSaltProbe, simulateCustomers).
- Every analytical output carries a ConfidenceBadge with formula + sources; raw encyclopedia fields labeled 'confirmed', derived metrics 'proxy', salt conclusion 'exploit'. UI labels in zhHant. Mobile-first responsive throughout. Sticky headers + scrollbar-thin on long lists.
- No files outside the 4 owned files modified. No test files created. Dev server untouched on port 3000.
- Lint: clean.

---
Task ID: 5c
Agent: full-stack-developer
Task: Build Employees + Skills + Manufacturing + Seasons pages

Work Log:
- Read worklog.md + all contract files (types.ts, engine.ts, data-loader.ts, store.ts, primitives.tsx, dashboard.tsx pattern).
- Inspected encyclopedia.json to verify counts: 44 skills, 30 manufacturing, 4 seasons, 8 employeeTasks; parsed config sections (employeeConfig, perkSystem, employeeSpeedFormula, manufacturing, gameTuning).
- Built skills.tsx (476 lines): strategy ToggleGroup (7 strategies) → computeSkillRecommendations → top-15 horizontal BarChart + 44 skill cards (id, name zhHant+en, description, monospace effect with tooltip, category badge, synergy tag chips, roiProxy MiniBar, ConfidenceBadge). Top 5 highlighted. Perk cost 1000 FP confirmed callout. Caution box. Room integration: vote/unvote buttons, voter avatars, team consensus banner.
- Built employees.tsx (665 lines): speed calculator (level 0-5 slider + factor 0-1 slider, live formula breakdown, 3-line LineChart speed-vs-level for factor=0/0.5/1.0); level/XP/speed table 0-5; perk↔level equivalent calculator (1 perk = 4 levels); role assignment grid (7 skill roles + 8 employee tasks with colors, Select for room member assignment); daily staff checklist (room-synced or static); collapsible employeeConfig reference table; caution on caps.
- Built manufacturing.tsx (646 lines): 30-product table with volume+density; production queue planner (add/remove/qty, total time = Σ(qty×30s), throughput proxy with machine count); density ranking leaderboard (top 12) + top-15 BarChart; required input products grid (linkedProductID with tooltip); room manufacturing task assignment (Select); honesty callout; full product table with all fields (sticky header, sortable columns via MiniBar).
- Built seasons.tsx (699 lines): 4 all-seasons overview cards (pool size, avg boxValue, premium count, click to switch); season Tabs selector; season pool table (sortable by demand/boxValue/name/group, all fields incl. isAlsoInOtherSeasons); top-10 pre-season recommendations (demandProxy×boxValue); seasonal-only exclusive list; overlap ScatterChart (demandProxy vs boxValue, color-coded: above-median/exclusive/premium/normal) with median callout; room checklist sync + "add season items" button; static fallback checklist; confirmed-on-pool / proxy-on-demand ConfidenceBadges.
- Fixed TypeScript errors: TaskAssignment uses `playerId` not `assignedTo`; StatCard has no `sources` prop; `productById.get()` cast `as Product`; re-added `productZhName` import.
- Cleaned unused imports (Package, Clock, productName, Crown, linkedId placeholder).
- Verification: `bunx eslint` on 4 files PASS; `bunx tsc --noEmit` on 4 files PASS (0 errors); `bun run lint` full project PASS (exit 0).

Stage Summary:
- Files: src/components/lab/{skills,employees,manufacturing,seasons}.tsx (all 'use client', named exports, 2486 lines total).
- Features: 4 complete operations-dashboard pages with engine integration, recharts visualizations, room sync, ConfidenceBadge rigor (confirmed/proxy/unverified), responsive layouts, Traditional Chinese UI.
- No files outside the 4 owned were modified. No test files written.
- Dev server running on :3000 (Turbopack); components lazy-load via app-shell.tsx on navigation.
- Agent-ctx record: /home/z/my-project/agent-ctx/5c-full-stack-developer.md

---
Task ID: 5b
Agent: full-stack-developer
Task: Build Simulator + Restock + Exploits + RawData pages

Work Log:
- Read worklog.md, types.ts, engine.ts, data-loader.ts, store.ts, primitives.tsx, dashboard.tsx (pattern example) to understand contracts.
- Inspected encyclopedia.json + demo-save.json shapes (products, tiers, customerTypes[58], necessities[11], seasons[4], storeLayout, config keys).
- File 1 (simulator.tsx, 707 lines): Customer Simulator with 58-type explorer (scrollable, mini 11-cell necessity bar grid per row), 11×58 necessity×customer heatmap (CSS grid, emerald alpha by weight, clickable cells), selected-customer top-necessity list with MiniBar, simulation controls (N slider 100-10000, raw/unique Switch, equal/custom spawn textarea with validation fallback, all/from-save/none stocked tabs, Run button), output panel with 4 StatCards (proxy) + Top-20 hits/missed tables + missed-by-group + topOverstockedLowDemand, all ConfidenceBadge 'proxy' with engine formula.
- File 2 (restock.tsx, 670 lines): Restock Planner. Snapshot status bar (load demo if missing), detection panel with 4 expandable StatCards (low stock / negative inventory / unlocked-never-stocked / high-demand-absent) each with top-10 list, strategy ToggleGroup (7 strategies), season Select when seasonal-prep, budget Input, Compute button, totals row (4 StatCards: cost/units/revenue/ROI proxy), sticky-header shopping list table with per-row player Select (room mode), Markdown/JSON export via Blob, "同步到房間" via setRestockPlan + sonner toast. Shows engine formula + note prominently.
- File 3 (exploits.tsx, 335 lines): Featured callout (USB 1TB + Gaming Console + Salt Monopoly headline cards), "為什麼標籤很重要" info card (Confirmed/Proxy/Unverified/Exploit 4-quadrant), Tabs filter (All + 4 categories), expandable candidate cards (Collapsible) with category badge (emerald/amber/fuchsia/zinc), ConfidenceBadge, evidence bullets, monospace formula, recommendation highlighted, risk callout, clickable product chips → setSelectedProduct + setView('wiki').
- File 4 (raw-data.tsx, 357 lines): 14 Tabs (Products/Tiers/Groups/Necessities/Seasons/CustomerTypes/Containers/Skills/Buildables/Achievements/EmployeeTasks/ManufacturingProducts/StoreLayout/Config). Sticky export bar (Markdown via exportMarkdownReport, JSON of current table, TSV with escaping, copy share link as base64 URL hash via navigator.clipboard + toast). Dense table (max-h-[70vh], scrollbar-thin, sticky header), record+column count, ConfidenceBadge 'confirmed'. StoreLayout tab gets summary card (totalProps/units/slots/distinctProducts + top-20 inventory-by-product breakdown).
- Fixed TS errors: cast productById.get() to `Product | undefined` (data-loader Map inferred as Map<{},{}>), reordered buildMarkdown signature (snapshotLabel before optional note), guarded divide-by-zero in simulator hitPct.
- Verified: `bun run lint` exit=0 (clean, including pre-existing wiki.tsx error resolved). `npx tsc --noEmit` clean for all 4 owned files.

Stage Summary:
- Files created/overwritten (all stubs replaced):
  - src/components/lab/simulator.tsx (707 lines)
  - src/components/lab/restock.tsx (670 lines)
  - src/components/lab/exploits.tsx (335 lines)
  - src/components/lab/raw-data.tsx (357 lines)
- Features delivered:
  - Simulator: 58-customer explorer + 11×58 heatmap + Monte Carlo simulation with 4 control knobs + 4 output tables, all proxy-labeled.
  - Restock: 4 detection categories + 7 strategies + knapsack output + 3 export formats + room sync.
  - Exploits: featured 3 monsters + label-education card + filter tabs + expandable candidate cards with product chips.
  - RawData: 14 source tabs + 4 export actions (md/json/tsv/share-link) + StoreLayout summary.
- Rigor: every analytical output carries ConfidenceBadge with engine formula + note; proxy never presented as confirmed.
- UI/UX: Traditional Chinese labels, mobile-first responsive (grid-cols-1 → lg:grid-cols-2/3/4), scrollbar-thin scrollable regions, sticky headers, sonner toasts for actions.
- Issues: dev server appears stopped in sandbox (process not in ps); did not restart per instructions. Lint + tsc pass clean for owned files. No tests written (per policy).

---
Task ID: 5d
Agent: full-stack-developer
Task: Build Pricing + Store Layout + Achievements pages

Work Log:
- Read worklog, types.ts, engine.ts, data-loader.ts, store.ts, primitives.tsx, dashboard.tsx (PATTERN), and existing stub files for pricing/store-layout/achievements.
- Inspected encyclopedia.json data: 51 achievements (globalPercent 0..41.7), 24 achievementStats, 41 storeLayout props (buildableIds 0-3 only), 339 products, 19 groups. Confirmed layout coord range posX -13.26..14.06 / posZ -0.84..11.69, angles {0,90,180,270}.
- Wrote `src/components/lab/pricing.tsx` — Pricing Lab with: honesty callout ('needs-runtime'), product selector (search + dropdown), selected product card (zhHant name + brand + tier + box value + demand proxy), 5 StatCards for price suggestion tiers, BIG 'needs-runtime' callout, player price editor (keyed by product.id to avoid setState-in-effect lint error), room vote panel (per-member approve/reject + tally + "加入實驗" action), bulk pricing top-30 table with "套用 balanced" buttons, experiment tracker (room.pricePlan or local state, editable observed fields).
- Wrote `src/components/lab/store-layout.tsx` — Store Layout Analyzer with: top-down SVG map (viewBox from data bounds, each prop translated + rotated, colored by buildableId, inventory count label), 8 highlight modes (ToggleGroup: none/empty/low/high-value/low-value/duplicated/missing-demand/negative-blink), click-to-select detail card (posX/posZ/angle + 6 StatCards + inventory list with product names + demand + room assignment), layout report (6 summary StatCards + Top 20 products + by-group breakdown + recommended swaps), sortable efficiency leaderboard (6 SortKey columns), room shelf zone assignment (Select + per-prop buttons + colored ring on map), hint card when no room.
- Wrote `src/components/lab/achievements.tsx` — Achievements with: tiny zustand persist store (stl-ach-progress) for local mode, all 51 achievements in dense sortable table (name/globalPercent, asc=rarest first), rarity badge (4 tiers: 極稀有/稀有/普通/常見), Rarest Top 10 card + Easiest Top 10 card (with checkboxes), progress bar (X/51), room mode sync to room.checklist using steamId as id (toggleChecklist + updateRoom fallback), search filter, guide notes for Millionaire/EnigmaCube/HiddenCatPlaza (marked 'unverified'), collapsible stats reference (24 entries via Accordion, 'confirmed').
- Discovered pre-existing typo in `src/lib/data-loader.ts` (`import from '../types'` should be `'./types'`) causing `productById`/`buildableById` to be inferred as `Map<unknown, unknown>`. Did NOT modify that file (out of scope). Worked around it in my files by casting the imported maps to their proper typed form: `const productById = _productById as unknown as Map<number, Product>`. Same pattern applied to buildableById.
- Fixed `set-state-in-effect` lint error in pricing.tsx PlayerPriceEditor by using `key={product?.id}` on the component (remount resets draft state).
- Fixed SortableTh type issue in store-layout.tsx by extracting `type SortKey = 'efficiency' | 'shelfValue' | ...` and using it consistently in both parent state and SortableTh props.
- Bumped SVG label font sizes (0.18→0.28 for inventory count, 0.10→0.13 for prop index) for better legibility on mobile.
- Removed unused imports (DataRow, SectionHeader, Tooltip*, productZhName, X) from pricing.tsx.
- Verified: `bun run lint` → 0 errors in my 3 files. `bunx tsc --noEmit --project tsconfig.json` → 0 errors in my 3 files. Pre-existing errors in data-loader.ts/engine.ts/salt.tsx/skills/ are not mine.
- Wrote agent work record at `/home/z/my-project/agent-ctx/5d-full-stack-developer.md`.

Stage Summary:
- Files: 3 page components written (`pricing.tsx` ~920 lines, `store-layout.tsx` ~870 lines, `achievements.tsx` ~480 lines). All `'use client'` with named exports matching app-shell.tsx lazy imports.
- Features delivered:
  - Pricing: search/select, suggestion tiers, player price editor, room vote, bulk pricing, experiment tracker.
  - Store Layout: SVG map, 8 highlight modes, detail card, layout report, sortable leaderboard, room shelf assignment.
  - Achievements: sortable table, rarity badges, Top-10 cards, progress tracker (local persist + room sync), search, guide notes, collapsible stats reference.
- Honesty: every analytical surface has a ConfidenceBadge. Pricing = 'needs-runtime' (formula not extracted); efficiency = 'proxy'; achievement data = 'confirmed'; guide notes = 'unverified'.
- Issues:
  - Pre-existing `data-loader.ts` typo (`'../types'`) breaks Map typing — worked around with cast at module load. Recommend orchestrator fix this 1-character typo in a foundation pass.
  - Dev server was not running during my work session; verified via lint + tsc instead. Runtime behavior should be fine since Turbopack transpiles without strict typecheck.
  - Salt.tsx (5b agent) and engine.ts/data-loader.ts have pre-existing type errors unrelated to my work.

---
Task ID: FINAL
Agent: orchestrator (main)
Task: Final integration, bug fixes, self-verification, cron setup

Work Log:
- Fixed path bug in data-loader.ts ('../types' → './types') and added explicit generic types to Maps.
- Built Upload page (tolerant JSON/.es3 parser adapter, parse status UI, field documentation, missing-data declaration).
- Built Room page (create/join by code, members, shared snapshot, checklist, task assignment w/ categories, chat, skill voting, plan links, MD/JSON export) + room-sync.ts client hook (socket.io with BroadcastChannel fallback).
- Installed socket.io + socket.io-client; created room-service mini-service on port 3003 (socket.io, path '/', room:create/join/patch/event/cursor/chat, 5-min empty-room cleanup).
- Fixed hydration mismatch in TopBar (next-themes theme toggle) and Sidebar (persisted view/collapsed) via mounted-guard pattern with SSR-safe defaults.
- Added PageErrorBoundary so a single page crash doesn't kill the whole SPA (graceful error UI with retry).
- Fixed 3 TypeScript errors: added `assignedTo?` to TaskAssignment type; salt.tsx `note`→`hint` on StatCard; room-sync.ts null check on buildSocket.
- Added allowedDevOrigins to next.config.ts for preview domain.
- Ran agent-browser self-verification: Dashboard (scores + next-actions render), Wiki (Salt row + all columns), Profit (leaderboard tabs), Salt (full probe with route 9/10/total demand, confidence badges) all confirmed rendering real content.

Stage Summary:
- 18 page components + room-service mini-service + calculation engine + data pipeline all complete.
- `bun run lint` → 0 errors. `bunx tsc --noEmit` → 0 errors (excluding pre-existing skills/ folder).
- Dev server stable on :3000 when kept warm (heartbeat confirms 5/5 HTTP 200). Note: sandbox reaps the idle dev server after ~30s; the 15-min cron reviewer will restart as needed.
- room-service running on :3003.
- Verified pages: Dashboard, Wiki, Profit, Salt render real game data with correct confidence labels (Confirmed/Proxy/Unverified/Exploit).
- Salt Monopoly Probe verified: route9=0.008621, route10=0.006952, total=0.015573, rawTokens preserved (5/5 + 1/62).
- Remaining risk: exhaustive multi-page browser test limited by dev-server idle-reaping in sandbox; error boundary ensures graceful degradation. Cron reviewer will continue QA.

---
Task ID: 6
Agent: orchestrator (main)
Task: 修復存檔上傳 — 真實 EasySave3 .es3 / .json 無法解析的問題

Work Log:
- 使用者上傳真實存檔 `/home/z/my-project/upload/_latest.json` (45 KB, 339 商品定價、41 店面道具、3 員工、18/55 已解鎖 tier)。
- 檢視檔案結構發現 EasySave3 的 4 種內嵌值語法全部損壞：
  - `{"__type" : "bool"false}`     (缺逗號 + 缺 "value" 鍵)
  - `{"__type" : "float"3.26}`     (同上)
  - `{"__type" : "int"-5}`         (同上)
  - `{"__type" : "string""text"}`  (型別結尾引號與值開頭引號共用)
- 舊的 `tolerantParse` 只修復 bool 一種變體且沒有補回 `"value":` 鍵，也不認得 EasySave3 的 PascalCase 欄位名 (`Funds`、`Day`、`ProductPlayerPricing`、`propdata*`、`propinfoproduct*`、`HiredEmployeesData` 等)。所以即使 JSON 修復成功，欄位對應也全部失敗。
- 新建 `src/lib/es3-parser.ts`：
  - `fixES3InlineValues()` — 4 條針對性正規式依序修復 bool/float/int/string 內嵌值（順序很重要：string 必須最後避免吃到其他型別的引號）。
  - `unwrap()` / `unwrapPMArray()` — 遞迴解開 `{ __type, value }` 信封與 PMDataWrapper 陣列。
  - `parsePropData()` — 解析 `"0|1|-1,430456|0|4,553804|89,99998"` → `{ index, buildableId, posX, posZ, angle, rotation }`（歐洲逗號小數 → 點號；角度 snap 到 90°）。
  - `parsePropInventory()` — 解析 `[12,0,2,0,143,3,145,5]` → 4 個 (product, count) 配對。
  - `parseEmployeeString()` — 解析 `"5|83|6|10|7|8|10|8|10|big sb|0|5780|16900|..."` → `{ id, name, task, salary, skills[7] }`（7 個技能等級 + 名稱 + 任務 + XP + 薪資）。
  - `parseES3Save()` — 主函式，對應 30+ 個 PascalCase 欄位到 SaveSnapshot：Funds/Day/FP/FX/Difficulty/Loan/StoreName/SupermarketName/SupermarketColor/LastAwardedLevel/Space/Storage/ProductPlayerPricing/UnlockedProductTiers/TierInflation/AddonsBought/ExtraUpgrades/StoreSpaceUpgrades/StorageSpaceUpgrades/ManufacUnlockedRecipes/ManufacPlayerRecipes/DoorStates/CurrentInvoicesArray/DemolishableValues/PaintableValues/HiredEmployeesData/HiredRerollTimes/HiredHasRerolled/propdata{N}+propinfoproduct{N}/decopropdata{N}/decopaintabledata{N}/decopicturedata{N}。
  - `parseSaveFile()` — 二段式：先試 strict JSON（已是 SaveSnapshot 格式 → 直接用），否則走 ES3 路徑。
- 擴充 `src/lib/types.ts` 的 `SaveSnapshot` 介面，加入 18 個選用 ES3-only 欄位：`franchiseExperience`、`loanAmount`、`loanPaymentPerDay`、`difficulty`、`storeName`、`supermarketName`、`supermarketColor`、`lastAwardedLevel`、`spaceBought`、`storageBought`、`tierInflation`、`manufacUnlockedRecipes`、`manufacPlayerRecipes`、`invoices`、`doorStates`、`addonsBought`、`storeSpaceUpgrades`、`storageSpaceUpgrades`、`decoPropsCount`、`hiredRerollTimes`、`hiredHasRerolled`。全部為 optional 不會破壞既有元件。
- 新增 `src/app/api/sample-save/route.ts` — 從 `/home/z/my-project/upload/_latest.json` 串流原始文字到瀏覽器，提供「載入範本」按鈕一鍵測試。
- 重寫 `src/components/lab/upload.tsx`：
  - 主路徑用 `parseSaveFile`（含 strict-JSON + ES3 兩段）；舊的 regex mock 保留為最後手段。
  - 新增「載入範本 _latest.json」按鈕（fetch `/api/sample-save` → runParse）。
  - 解析結果面板大改：6+6 StatCard（Money/Day/FP/FX/Difficulty/LastLevel + StoreName/Brand/Loan/LoanPerDay/SpaceBought/StorageBought）、12 CountTile（玩家定價 339/339、已解鎖 Tier 18/55、已解鎖商品 119/339、店面道具 41/41、員工 3、發票 3、Tier 通膨 55/55、製造配方 0/30、Addons 0/6、Extra Upg 7/44、Store Space Upg 2/47、裝飾道具 43）、Detected/Unknown 雙欄、ES3 型別分佈徽章、Warnings 區、員工快覽表（5 欄）、店面道具快覽表（7 欄，前 30 列）、3 個導航按鈕。
  - 「已解決」綠色 callout 解釋新舊差異。
  - 12 列 ES3 欄位對照表（全部標「已整合」）。
- 刪除測試腳本 `scripts/test-es3-parser.ts`（遵守「不寫測試碼」原則；測試結果已記錄：33 欄位、Money=5981.51、Day=28、3 員工、41 道具、18/55 tier、339 定價、55 通膨、3 invoice、loan 10200/850）。

Stage Summary:
- 檔案：新增 `src/lib/es3-parser.ts` (~540 行)、`src/app/api/sample-save/route.ts`；改寫 `src/components/lab/upload.tsx` (~470 行)；擴充 `src/lib/types.ts` SaveSnapshot (+18 optional 欄位)。
- 真實存檔上傳完全可用：`bun run lint` 0 errors、`bunx tsc --noEmit` 自己的 4 個檔案 0 errors（pre-existing skills/ 錯誤與本次無關）。
- agent-browser 端對端驗證：
  1. `/upload` → 點「載入範本 _latest.json」→ toast「解析完成：33 個欄位、Day 28、$5982、3 員工 (ok)」。
  2. TopBar 立即顯示 `Day 28 · $5,981.51`。
  3. `/upload` 面板顯示 Money=$5,981.51、Day=28、FP=0、FX=41,776、Difficulty=5、StoreName=兒子進、Brand=XVIDEO、Loan=$10,200、LoanPerDay=$850、339 定價、18/55 tier、41 道具、3 員工（big sb $16,900、small sb $1,560、medium sb $1,016）。
  4. `/layout` 顯示「41 props · 2055 units」（真實存檔的店面地圖）。
  5. `/pricing` 顯示 339 products 與真實玩家定價（$3.26 等）。
- API `/api/sample-save` 200 OK in 652ms，無 console error、無 hydration mismatch。
- 18 個新欄位已可被後續頁面使用（員工薪資、貸款、裝飾道具數、製造配方解鎖狀態等）— 為下一階段功能擴展鋪路。

---
Task ID: 7
Agent: orchestrator (main) — cron reviewer round 1
Task: QA pass + 修復「選擇檔案」按鈕無反應 + 新增 Dashboard 存檔概覽 + Employees 花名冊

Work Log:
- 讀取 worklog.md 了解 Task 0-6 進度；確認 dev server 在 :3000 運行、room-service 在 :3003 運行（用 setsid 啟動避免被 reaped）。
- agent-browser QA：逐頁訪問 17 個頁面，確認 0 console errors、0 runtime errors、所有頁面有實際內容。
- 發現問題：Employees 頁面未顯示從真實存檔解析出的 3 名員工（big sb / small sb / medium sb）；Dashboard 缺少存檔概覽卡片。
- 新增功能 A — Dashboard「存檔概覽」卡片（`src/components/lab/dashboard.tsx`）：
  - `SaveOverviewCard` 元件，13 個動態 tile：店面名稱、品牌（含色票）、難度、Franchise XP、已達等級、貸款、店面擴建、倉庫擴建、雇用員工（含日薪合計）、待處理發票、店面道具（含庫存件數）、裝飾道具、已解鎖 Tier、製造配方。
  - 品牌色票用 inline style 顯示 RGB 色塊；amber accent 標記貸款/發票/未解鎖配方。
  - ConfidenceBadge 'confirmed'，formula='ES3 fields → SaveSnapshot'。
- 新增功能 B — Employees「已雇用員工花名冊」卡片（`src/components/lab/employees.tsx`）：
  - 從 `snapshot.employees` 讀取真實員工資料（ES3 HiredEmployeesData pipe-string 解析結果）。
  - 4 個 summary tile：雇用數、每日薪資總額、平均速度 proxy、最強技能。
  - 每位員工一張卡片：序號、姓名、ES3 id、任務 badge（帶色）、日薪、7 條技能 bar（最強技能 emerald 高亮）、平均/速度 proxy/建議角色 footer。
  - 速度 proxy = `computeEmployeeSpeed(min(5, round(avg/2)), 0)`；技能值 0-10 量級標記為 proxy（未經遊戲原始碼確認語義）。
  - sky 色注意框說明技能值語義。
- **修復 Bug**：「選擇檔案」按鈕點擊無反應 — 根因是 `<label>` 包裹 `<Button>`（shadcn 渲染為 `<button>`），button 的 click 事件會吞掉 label 的開檔案對話框行為。
  - 修復：改用 `useRef<HTMLInputElement>` + `triggerFilePicker = () => fileInputRef.current?.click()`，input 獨立放在 DOM 中（不再包在 label 內），Button 的 `onClick={triggerFilePicker}`。
  - 驗證：agent-browser spy 確認 `input.click()` 被呼叫（spyCalled: true）；agent-browser `upload 'input[type=file]'` 上傳真實 _latest.json → toast「解析完成」、TopBar 顯示 Day 28 · $5,981.51、偵測欄位 33。

Stage Summary:
- 修改檔案：`src/components/lab/dashboard.tsx`（+SaveOverviewCard ~200 行）、`src/components/lab/employees.tsx`（+Hired Employees Roster ~160 行）、`src/components/lab/upload.tsx`（修復 file input click handler）。
- `bun run lint` 0 errors；agent-browser 17 頁 QA 全綠。
- 真實存檔資料現在貫穿 Dashboard（存檔概覽）+ Employees（花名冊）+ Upload（檔案選擇）+ Layout + Pricing 等頁面。
- room-service 已用 setsid 啟動（port 3003 listening），BroadcastChannel fallback 仍可用。
- 已截圖：`download/upload-after-fix.png`、`download/dashboard-save-overview.png`、`download/employees-roster.png`。

---
Task ID: 8-foundation
Agent: orchestrator (main)
Task: 語言選擇 + 遊戲內中文名稱 — 基礎層

Work Log:
- 使用者反映：用中文玩遊戲但網站全是英文名稱，對不上；希望做好語言選擇，所有遊戲資料用遊戲內名稱（即便翻譯有誤）；熱力圖/散佈圖太細太複雜，希望更直觀，可把一個表拆成多個簡單圖表。
- 在 UI store 新增 `lang: 'zhHant' | 'en' | 'both'`（預設 zhHant）+ `setLang` action，持久化於 localStorage (stl-ui)。
- 新建 `src/lib/i18n.ts`（~280 行）：
  - `loc(name, lang)` / `locShort(name, lang)`：核心 LocalizedName 解析器，支援「中文 / English」雙語格式。
  - 14 個實體專用 resolver（純函式，接 lang）：productNameFor / productNameOnly / groupNameFor / groupIdNameFor / tierNameFor / tierIdNameFor / buildableNameFor / buildableIdNameFor / skillNameFor / skillDescFor / necessityNameFor / necessityIdNameFor / seasonNameFor / seasonIdNameFor / employeeTaskNameFor / employeeTaskIdNameFor / manufacturingNameFor / manufacturingIdNameFor。
  - 容器名稱：containerNameFor / containerIdNameFor — 透過 buildableName 反查 Buildable.zhHant（容器本身只有英文 buildableName）。
  - 客戶類型標籤：customerTypeLabel(ct, lang) — 從 11 權重陣列生成「基本食品×1、個人衛生×0.25、藥品×0.15」格式（中/英雙語）。
  - 成就中文名稱：ACH_ZH map（51 項手動翻譯：Millionaire→百萬富翁、Restocker A→補貨員 A 等），achievementNameFor(a, lang)。
  - React hooks：useLang() / useProductName(id) / useProductNameOnly(id) / useT() — 訂閱 store，切換語言時自動重渲染。
  - UI 字串表：t(key, lang) — confidence 標籤、通用 chrome 字串中文化。
  - LANG_LABELS / LANG_FULL_LABELS：語言切換器顯示用。
- 更新 `src/components/shared/primitives.tsx` ConfidenceBadge：改用 useLang() + t() 動態顯示「已確認/推算值/未驗證/漏洞候選/範本/需上傳存檔/需實機驗證」。
- 新建 `src/components/shared/language-switcher.tsx`：DropdownMenu 語言切換器（繁中 / English / 雙語），含勾選標記與說明文字。
- TopBar 加入 LanguageSwitcher（在 theme toggle 旁）。
- `bun run lint` 0 errors。

Stage Summary:
- 基礎層完成：UI store lang 欄位 + i18n.ts 全套 resolver + LanguageSwitcher + localized ConfidenceBadge。
- 所有頁面元件現在可改用 `useLang()` + `productNameFor(id, lang)` 等取代舊的 `productName(id)`（只回傳英文）。
- 下一步：3 個子代理並行重構 18 個頁面 + 簡化 Simulator 熱力圖 / Profit 散佈圖 / Seasons 散佈圖。

---
Task ID: 8-c
Agent: full-stack-developer
Task: 重構 9 個頁面元件改用 i18n 在地化名稱（skills/employees/manufacturing/achievements/raw-data/dashboard/upload/room/exploits）

Work Log:
- 讀 worklog.md 了解 8-foundation 已建好 i18n 基礎層（`useLang()` + 14 個 entity resolver + ACH_ZH 翻譯表 + UI 字串表）。
- 9 個檔案逐一檢視，將所有 `entity.name.zhHant` / `.name.en` / `topSummary` / `buildableName` / `productZhName(id)` 等硬編碼英文名稱改為 `entityXxxFor(id, lang)` / `useLang()` 模式。
- skills.tsx：BarChart data 加 `label` 欄位（避免在 dataKey 內呼叫函式）；SkillCard 加 `lang` prop；consensus 橫幅、tooltip、44 張卡片的 name+description 全部改用 `skillNameFor` / `skillDescFor`。
- employees.tsx：Hired Employees Roster 卡片的 task badge 改用 `employeeTaskIdNameFor(taskId, lang)`；role assignment 7-role grid 的 task 標籤同樣改用 resolver；employeeConfig.skills 來自 JSON 字串保留 zhHant role label（玩家設定參考用）。
- manufacturing.tsx：移除 `productZhName` import；30-product 表、density leaderboard、production queue、required input products grid 全部改用 `manufacturingIdNameFor` + `productNameFor`；BarChart data 加 `label` 欄位；DensityRow 加 `lang` prop。
- achievements.tsx：51-achievement table、Top-10 cards、guide notes、search filter 全部改用 `achievementNameFor(a, lang)`；搜尋同時比對 `a.name`（英文 Steam 名）+ `achievementNameFor(a, 'zhHant')`（中文）+ `steamId`；sort by name 也用 localized 字串 localeCompare；TopCard 加 `lang` prop。
- raw-data.tsx：新增 `localizeCell(tab, column, raw, lang, rowIndex)` helper 處理 14 個分頁的名稱欄位：generic LocalizedName 物件統一處理 + 各 tab 特殊欄位（products.tier/group 顯示「id · 中文名」、customerTypes.topSummary 改用 customerTypeLabel、containers.buildableName 改用 containerIdNameFor、achievements.name 改用 achievementNameFor、manufacturingProducts.linkedProductID 顯示「id · 產品名」、storeLayout.buildableId 顯示「id · buildable 名」）；StoreLayout 摘要 byProduct 改用 `productNameFor`；TSV 匯出改用 localizeCell 產生在地化表格。
- dashboard.tsx：4 個 Top-10 列表（urgentRestocks/wastedSlots/opportunities/missedSales）的 DataRow title 改用 `productNameFor(p.id, lang)`；useMemo deps 加 lang；移除未使用的 `Product` type import。
- upload.tsx：員工快覽表的 Task 欄改顯示「id · employeeTaskIdNameFor」；店面道具快覽表的 buildableId 欄改顯示「id · buildableIdNameFor」。
- room.tsx：技能投票 Tab 的 12 個 skill 卡片名稱改用 `skillNameFor(s, lang)`；Task labels、checklist items 維持玩家自輸入文字（非遊戲實體名稱）。
- exploits.tsx：FeaturedCard 與 CandidateCard 的 product chips 改顯示「#id · productNameFor」；移除原本的 font-mono class 改用一般 text 以容納中文名稱。
- 修正 `Lang` type import 來源：`Lang` 定義在 `@/lib/store` 而非 `@/lib/i18n`（i18n.ts 內部 import 但未 re-export）；4 個檔案（skills/employees/manufacturing/raw-data）改用 `import { ..., type Lang } from '@/lib/store'`。
- 移除 employees.tsx 未使用的 `type Lang` import（lang 變數從 useLang() 推導型別，不需顯式標註）。
- 移除 dashboard.tsx 未使用的 `Product` type import。
- 移除 raw-data.tsx 未使用的 `productById`、`Product` type 與多餘 i18n helper imports（productNameOnly/necessityIdNameFor/seasonIdNameFor/skillNameFor/employeeTaskIdNameFor/manufacturingIdNameFor）。
- `bun run lint` → 0 errors。`bunx tsc --noEmit` → 9 個檔案全部 0 errors（剩餘錯誤皆在其他 agent 的檔案：profit.tsx Lang import、store-layout.tsx productZhName 未匯入，以及 skills/ 外部腳本）。

Stage Summary:
- 修改檔案：9 個頁面元件（skills.tsx, employees.tsx, manufacturing.tsx, achievements.tsx, raw-data.tsx, dashboard.tsx, upload.tsx, room.tsx, exploits.tsx）全部改用 `useLang()` + `entityXxxFor(id, lang)` 模式。
- 所有遊戲實體名稱現在會根據 UI store 的 lang 設定（zhHant / en / both）動態顯示。切換語言時所有頁面即時重渲染。
- 'both' 模式下：技能/產品/製造品/容器/員工任務用 `locShort` 格式（「中文（English）」），成就用 `loc` 格式（「中文 / English」），客戶類型用「、」分隔的多必要品權重。
- 保留：所有玩家自訂名稱（員工姓名、房間名稱、chat、checklist label、task label）、UI chrome 中文標題、confidence badge 標籤（已在 8-foundation 中文化）、guide notes 中文說明、ES3 欄位對照表中文說明。
- 匯出功能：TSV 匯出使用 localizeCell 產生在地化表格（與畫面顯示一致）；JSON/Markdown 匯出保留原始資料結構。
- 已知遺留（非本任務範圍）：profit.tsx 與 store-layout.tsx 有 `Lang`/`productZhName` 型別錯誤，屬 8-a/8-b 子代理的檔案，需由各自 agent 修復。

---
Task ID: 8-a
Agent: full-stack-developer
Task: 重構 5 個 lab 頁面（wiki / profit / pricing / salt / restock）改用 i18n 層的本地化名稱；同時簡化 Profit Lab 的散佈圖（使用者反映太複雜）為「排行榜橫條圖 / 散佈圖」雙檢視。

Work Log:
- 讀取 worklog.md 確認 Task 8-foundation 已建立 i18n 層（`src/lib/i18n.ts`，含 `useLang` hook + 14 個純函式 resolver + `Lang` type 在 `@/lib/store`）。
- 5 個檔案全部加入 `const lang = useLang()` 在元件頂端，並把 `lang` 加入需要計算名稱字串的 `useMemo` deps（profit scatterData/notableLabels、restock buildMarkdown）。
- **wiki.tsx**：
  - 表格名稱欄：`r.p.name.en` + `r.p.name.zhHant` 雙行 → 單行 `productNameFor(r.p.id, lang)`（both 模式自動帶「中文（English）」）。
  - 表格群組欄：`r.p.groupName.zhHant` → `groupIdNameFor(r.p.group ?? 0, lang)`。
  - 篩選下拉：群組 `g.name.zhHant` → `groupIdNameFor(g.id, lang)`；季節 `s.name.zhHant` → `seasonIdNameFor(s.index, lang)`；需求池 `n.name.zhHant` → `necessityIdNameFor(n.index, lang)`。
  - Sheet 詳情：`SheetTitle {p.name.en}` → `productNameFor(p.id, lang)`；`SheetDescription {p.name.zhHant}/{p.name.zhHans}` → 簡化為 `#{id} · brand · Tier`（名稱已在 title）。
  - 詳情 區段：群組列 `p.groupName.zhHant` → `groupIdNameFor`；需求池 badge `ENC.necessities[ni].name.zhHant` → `necessityIdNameFor(ni, lang)`；季節 badge `ENC.seasons[si].name.zhHant` → `seasonIdNameFor(si, lang)`；製造品 `mfg.name.zhHant` → `manufacturingIdNameFor(mfg.id, lang)`。
  - 保留 "名稱 (en/zhHant/zhHans)" 三個原始語言 DetailRow（標籤已標明語言，顯示原始值合理）。
- **profit.tsx**：
  - 移除 Row interface 的 `groupName` 欄位（改在 render 用 `groupIdNameFor` 即時解析，避免 useMemo deps 卡住 lang 切換）。
  - **新增檢視切換 Tabs**：「排行榜」（預設）+「散佈圖（進階）」。
  - **排行榜 tab**：新增 `MetricBarCard` 元件，4 個卡片各顯示 Top-10 商品的 CSS 橫條（rank + name + bar + value），bar 顏色 = group 顏色、可點擊跳到 wiki。4 個指標：單箱價值 / 價值密度 / 需求 / 加權。
  - **散佈圖 tab**：保留原 ScatterChart（X=demandProxy、Y=valueDensity log、泡泡=boxValue），上方加 amber 提示框：「進階：每個點是一個商品，X=需求推算、Y=價值密度（對數）、泡泡大小=單箱價值」。
  - scatterData useMemo 加入 `lang` dep，series.name 改 `groupIdNameFor`，data 點的 name/zhName 改 `productNameFor`/`productNameOnly`。tooltip 簡化為只顯示 `#{id} {name}`（不再重複 zhName 括號）。
  - notableLabels useMemo 加入 `lang` dep，name 改 `productNameFor`。
  - LeaderboardTable 內部 `useLang()`，name 改 `productNameFor`、subtitle 改 `productNameOnly · Tier`、group 改 `groupIdNameFor`。
- **pricing.tsx**：6 個子元件（ProductSelector / SelectedProductCard / PlayerPriceEditor / RoomVotePanel / BulkPricingView / ExperimentTracker）各自 `useLang()`；搜尋下拉項、選擇 badge、selected card 名稱+群組、player price editor 標籤、room vote panel 標題、bulk pricing 表格、experiment tracker 表格全部改用 `productNameFor` + `groupIdNameFor`。搜尋 filter 保留比對 `p.name.en`+`p.name.zhHant`（兩語都比對）。修正一處 React hooks 順序：PlayerPriceEditor 的 `useLang()` 移到 early return 之前。
- **salt.tsx**：`Salt` 元件 + `RunResultView` 子元件各自 `useLang()`。SimRun interface 的 `top5`/`topMissing` 移除 `name` 欄位（改為 render 時用 `productNameFor` 解析，避免 stored state 在 lang 切換後不更新）。比較表 `c.product.name.en` + `c.product.name.zhHant` → 單行 `productNameFor(c.product.id, lang)` + `Tier {tier}`。Salt 機制說明卡片新增「Salt 商品名稱 / tier / brand」RawCard 顯示 `productNameFor(probe.saltProduct.id, lang)` + tier/brand hint。移除未使用的 `computeDemandProxy` import（pre-existing dead import）。
- **restock.tsx**：`Restock` 元件 `useLang()`；`buildMarkdown` 函式新增 `lang: Lang` 參數，採購清單 markdown 表改用 `productNameFor(r.productId, lang)`。偵測面板 `negativeEntries` 移除 `productName` 欄位（render 時用 `productNameFor(x.product, lang)`）。四個 DetectionList 的 `title` 全部改 `productNameFor`；low stock subtitle 用 `groupIdNameFor`；移除多餘的 zhHant 副標。季節 Select 下拉 `s.name.zhHant (s.name.en)` → `seasonIdNameFor(s.index, lang)`。採購清單表格主名稱改 `productNameFor(r.productId, lang)`、副標簡化為 `#{id} · tier`。
- **型別修正**：`Lang` type 不在 `@/lib/i18n` re-export（只在 `@/lib/store`），profit.tsx 與 restock.tsx 改為 `import type { Lang } from '@/lib/store'`。
- `bun run lint` → 0 errors。`bunx tsc --noEmit` → 我的 5 個檔案 0 errors（只剩 skills/ 資料夾 2 個 pre-existing 無關錯誤）。

Stage Summary:
- 5 個 lab 頁面全部完成 i18n 重構：使用者切換語言（繁中 / English / 雙語）時，所有商品名稱、群組名稱、季節名稱、需求池名稱、製造品名稱會即時跟著切換。
- Profit Lab 散佈圖簡化完成：預設顯示 4 張 Top-10 橫條圖（單箱價值/價值密度/需求/加權），用 CSS bar + group 顏色 + 可點擊；散佈圖退到第二個 tab 並加上中文進階說明。
- 所有既有功能保留：room sync / confidence badges / 匯出 markdown+JSON / 模擬模式 / 偵測面板 / 實驗追蹤器全部正常運作，只改變「名稱如何顯示」。
- 修改檔案：`src/components/lab/wiki.tsx`、`profit.tsx`、`pricing.tsx`、`salt.tsx`、`restock.tsx`（5 個，全部在 owned 範圍內）。
- `bun run lint` 0 errors；`bunx tsc --noEmit` 0 errors（owned files）。

---
Task ID: 8-b
Agent: full-stack-developer
Task: 重構 4 個 lab 頁面（simulator / seasons / containers / store-layout）— 全面 i18n 化 + 簡化複雜圖表（11×58 熱力圖、散佈圖）

Work Log:
- 讀取 worklog.md（特別是 Task 8-foundation 的 i18n 層）+ i18n.ts + 4 個目標檔案現況 + types/engine/data-loader 確認資料形狀（CustomerType.necessitiesChances[11]、Season.productIds、Container.buildableName、LayoutProp.inventory）。
- **simulator.tsx**（707 → 870 行）— 完整重寫：
  - 移除舊的 11×58 necessity×customer CSS-grid 熱力圖（使用者抱怨太密集）。
  - 改為 3 個 shadcn Tabs：「顧客最愛」/「需求熱門」/「模擬器」。
  - Tab A「顧客最愛」：左欄 58 張顧客卡（每張顯示 customerTypeLabel + #編號 + comp[] + premium 徽章），右欄顯示選中顧客的 top necessities — 用 CSS horizontal bar（emerald，width=weight/max），每條附「佔此顧客需求 X%」的佔比標籤。
  - Tab B「需求熱門」：左欄 11 個 necessity 卡（顯示 necessityIdNameFor + 顧客數 + 總權重），右欄顯示需要該類別的顧客排行（按 weight desc）— 點擊任一顧客跳到 Tab A 顯示該顧客詳情。
  - Tab C「模擬器」：保留原本 Monte Carlo 控制台（N slider、raw/unique switch、equal/custom spawn、all/from-save/none stocked）+ OutputPanel（4 StatCards + Top-20 hits/missed + 漏單 by group + 過度備貨）。
  - 所有名稱改用 i18n：productNameFor(pid, lang)、groupIdNameFor(group, lang)、necessityIdNameFor(idx, lang)、customerTypeLabel(c, lang)。OutputPanel 內 useLang() 訂閱切換。
  - 頂部加入中文 helper：「選擇一位顧客類型查看他最需要的商品類別，或選擇一個商品類別查看哪些顧客需要它。」
  - 移除 productHitsRows / missedRows / missedByGroup 中的 zhName 雙欄位，統一用單一 name 欄（productNameFor）。
- **seasons.tsx**（699 → 812 行）— 重寫：
  - 加入 view toggle（ToggleGroup）：「排行榜」（預設）/「散佈圖」（進階）。
  - 排行榜 mode：top-15 商品 horizontal bars，依 demandProxy × boxValue 排序，bar 顏色 = exclusive（紫）/ premium（琥珀）/ 一般（emerald），每條附 demand+box 數字 + exclusive/premium 徽章。比原本散佈圖直觀得多。
  - 散佈圖 mode：保留原本 ScatterChart，加入中文 note：「進階：每個點是一個商品，X=需求推算、Y=單箱價值。」
  - 所有 s.name.zhHant || s.name.en → seasonIdNameFor(idx, lang)；r.p.name.zhHant || r.p.name.en → productNameFor(r.p.id, lang)；p.groupName.zhHant → groupIdNameFor(p.group, lang)；otherSeasons 用 seasonIdNameFor。
  - pool / sortedPool / overlap / overview / seasonChecklist 等 useMemo 全部加上 lang 到依賴陣列。
- **containers.tsx**（517 → 545 行）— 完整重寫：
  - 加入 const lang = useLang()。
  - 所有 r.buildableName 顯示 → containerNameFor(r, lang)：5 張 summary cards 的 hint、5 張 BestOf cards 的標題、chart 的 X 軸 name、chart tooltip、比較表的容器名稱欄。
  - 比較表多加一行小字顯示 raw buildableName（英文）方便對照（只在兩者不同時顯示）。
  - chart tooltip 同時顯示 localized name + rawName（若不同）+ containerID + cost/shelfVolume/energy。
  - BestOfCard 加入 lang prop（型別 ReturnType<typeof useLang>），formula/note/confidence 全部保留。
  - 排序邏輯保留 sort by raw buildableName 維持穩定排序。
- **store-layout.tsx**（947 → 1026 行）— 多處 Edit：
  - 移除 productZhName import，加入 useLang + productNameFor + groupIdNameFor + buildableIdNameFor（from @/lib/i18n）。
  - 移除 buildableById/_buildableById/Buildable import（不再需要，所有名稱查詢改走 buildableIdNameFor）。
  - 加入 const lang = useLang()。
  - aggregates.topGroups：p.groupName.zhHant → groupIdNameFor(p.group, lang)（lang 加入 useMemo deps）。
  - swapRecs：productZhName(pid) → productNameFor(pid, lang)（lang 加入 deps）。
  - SVG legend：b?.name.zhHant → buildableIdNameFor(id, lang)。
  - PropDetailCard：加入 lang prop；buildable?.name.zhHant → buildableIdNameFor(prop.buildableId, lang)；inventory 清單的 productZhName(inv.product) → productNameFor(inv.product, lang)。
  - 效率排行榜表格的 Buildable 欄：buildable?.name.zhHant → buildableIdNameFor(prop.buildableId, lang)。
  - **新增「Top 5 問題貨架（快速掃描）」卡片**：topProblematic useMemo 依 (negativeAnomalies×10) + (empty?5:0) + emptySlots + (duplicated×2) + lowDemand 計算問題分數排序，取前 5 名。每列顯示：#排名、貨架 #+buildable 名稱、問題清單（負庫存/空貨架/空格/重複/低需求）→ 建議（檢查存檔/補貨/集中/替換）。點擊可直接跳到該貨架詳情。
  - AlertCircle + ArrowRight 加入 lucide import。
- 驗證：`bun run lint` 0 errors（exit 0）；`bunx tsc --noEmit` 對 4 個 owned 檔案 0 errors（pre-existing skills/ 與其他 agent 的 profit/restock 與本次無關）。

Stage Summary:
- 4 個檔案完成 i18n 化 + 圖表簡化：
  - simulator.tsx：11×58 熱力圖 → 3-tab（顧客最愛 horizontal bars / 需求熱門 ranked bars / 模擬器）— 大幅提升可讀性。
  - seasons.tsx：散佈圖預設 → 排行榜 horizontal bars（保留散佈圖為進階模式）。
  - containers.tsx：所有 buildableName → containerNameFor 中文化（42 個容器名稱現在顯示遊戲內中文名）。
  - store-layout.tsx：所有商品/貨架名稱中文化 + 新增 Top 5 問題貨架快速掃描卡（點擊跳轉）。
- 所有 `useMemo` 計算名稱的 deps 都加上 lang，切換語言時自動重渲染。
- 未修改任何 4 個 owned 檔案以外的檔案。無測試碼。Dev server 在 :3000（system-managed）。
- Agent-ctx 記錄：/home/z/my-project/agent-ctx/8-b-full-stack-developer.md

---
Task ID: 8-integration
Agent: orchestrator (main)
Task: 語言選擇 + 中文名稱 + 圖表簡化 — 整合驗證

Work Log:
- 3 個子代理並行完成 18 個頁面的 i18n 重構 + 圖表簡化：
  - Task 8-a: Wiki / Profit / Pricing / Salt / Restock — Profit 散佈圖改為「排行榜（預設）+ 散佈圖（進階）」雙 tab，排行榜用 Top-10 水平條形圖。
  - Task 8-b: Simulator / Seasons / Containers / Layout — Simulator 11×58 熱力圖完全移除，改為 3 tab（顧客最愛 / 需求熱門 / 模擬器）；Seasons 散佈圖改為「排行榜（預設）+ 散佈圖（進階）」。
  - Task 8-c: Skills / Employees / Manufacturing / Achievements / RawData / Dashboard / Upload / Room / Exploits — 全部改用 localized 名稱。
- 整合 lint：`bun run lint` 0 errors（全專案）。
- 整合 tsc：`bunx tsc --noEmit` src/ 0 errors（僅 skills/ 外部目錄有 pre-existing 無關錯誤）。
- agent-browser 端對端驗證（在同一 bash session 啟動 dev server + keepalive 避免被 sandbox reap）：
  1. **語言切換器**：TopBar 右側出現「繁中」按鈕 → 點擊展開下拉（繁體中文 / English / 雙語顯示）→ 選 English → Salt 頁商品名從「可樂包 Tier 8」變「Cola Pack Tier 8」、ConfidenceBadge 從「已確認」變「CONFIRMED」→ 選回繁體中文 → 名稱恢復「可樂包」「切片麵包」。✓
  2. **Wiki 頁**：表格顯示「通心粉 / Panzati / 基本產品s / $1.35 / 30 / $40.5」— 商品中文名、群組中文名全部正確。✓
  3. **Profit Lab**：預設顯示「排行榜」tab（選中），內含「單箱價值 Top 10」水平條形圖；「散佈圖（進階）」為第二 tab（預設隱藏）。✓ 使用者抱怨的複雜散佈圖已改為直觀排行榜。
  4. **顧客模擬器**：11×58 熱力圖完全消失，改為 3 tab：「顧客最愛」（預設選中）/「需求熱門」/「模擬器」。✓ 使用者抱怨的密集熱力圖已拆成簡單的單一視圖。
- dev server + keepalive 以 setsid 啟動（跨 bash session 存活），port 3000。

Stage Summary:
- 使用者 3 項需求全部完成：
  1. **語言選擇**：TopBar 語言切換器（繁中/EN/雙語），持久化於 localStorage，所有頁面即時切換。
  2. **遊戲內中文名稱**：339 商品、44 技能、42 容器、51 成就、58 客戶類型、19 群組、11 必需品、4 季節、8 員工任務、30 製造品 — 全部用遊戲內中文名稱（products/skills/buildables 用資料庫的 zhHant；containers 透過 buildableName 反查；customerTypes 從權重陣列生成中文標籤；achievements 手動翻譯 51 項）。
  3. **圖表簡化**：Simulator 熱力圖 → 3 tab 簡單視圖；Profit/Seasons 散佈圖 → 排行榜條形圖（預設）+ 散佈圖（進階，摺疊）。一句話原則：把一個複雜圖表拆成多個簡單圖表。
- ConfidenceBadge 也中文化：已確認 / 推算值 / 未驗證 / 漏洞候選 / 範本 / 需上傳存檔 / 需實機驗證。
- `bun run lint` 0 errors、src/ tsc 0 errors、agent-browser 4 頁 QA 全綠。

---
Task ID: 9
Agent: orchestrator (main) — cron reviewer round 2
Task: 適配新版存檔 JSON 格式 + 使用面向玩家的 Steam 成就名稱

Work Log:
- 使用者上傳新版存檔 `upload/save.json`（145KB，pre-extracted 結構化格式，extractor v1.0），並提供 51 個真實 Steam 成就名稱+描述+全球百分比，要求：①適配新版存檔格式（以後採用此格式）②成就用面向玩家的 Steam 名稱而非變數名。

- **分析新版 save.json 結構**：top-level 含 11 個 section：
  - `decoded`（211 個原始 ES3 欄位，已是合法 JSON with `__type`+`value`）
  - `kpis`（15 個預先展開的 KPI 純量/陣列）
  - `store_layout`（`{totalProps, props[]}`，props 已含 buildableId/posX/posZ/angle/containerInfo）
  - `inventory`（`{totalItems, propInventory:{idx:[{productID,count}]}, byProduct:{pid:cnt}}`）
  - `pricing`（`{arrayLength:339, prices[]}`）
  - `tier_unlocks`（`{arrayLength:55, unlockedIndices[]}`）
  - `skill_unlocks`（`{arrayLength:44, unlockedIndices[], perkIndexToSkill[]}`）
  - `manufacturing`（`{unlockedRecipes[bool], playerRecipes[]}`）
  - `employee_data`（`{hired[pipe-string], todays[]}`）
  - `decorations`（`{prop[], picture[], paintable[]}`）
  - `_meta`（extractor 版本/來源/時間戳）
  - 比舊版 `_latest.json`（45KB 畸形 ES3 文字需 regex 修復）乾淨得多。

- **更新 types.ts**：
  - `Achievement` 介面新增 `description?`, `zhHant?`, `zhHantDesc?`, `collective?`, `layout?: 'classic'|'plaza'`。
  - `SaveSnapshot` 新增 `layout?: number`（0=經典, 1=廣場）、`skillUnlocks?: number[]`、`perkIndexToSkill?: number[]`。

- **更新 encyclopedia.json**：用 Python 腳本將 51 個成就全部替換為真實 Steam 名稱+描述+中譯+集體標記+佈局標記：
  - 舊：`{steamId:"1_RestockerA", name:"Restocker A", globalPercent:41.7}`
  - 新：`{steamId:"ach_basic_restocker", name:"Basic Restocker", globalPercent:41.7, description:"Placed a total of 1000 products in shelves", zhHant:"基礎補貨員", zhHantDesc:"在貨架上總計放置 1000 個商品 [集體]", collective:true}`
  - 51 項全部含中英文名稱+中英文描述+集體/佈局標記（22 個集體成就、7 個經典佈局、4 個廣場佈局）。

- **更新 i18n.ts**：
  - 移除舊的 `ACH_ZH` 硬編碼對照表（51 行），改用資料內建的 `a.zhHant` / `a.zhHantDesc` 欄位。
  - 新增 `achievementDescFor(a, lang)` 函式，支援中/英/雙語描述。

- **新增 `parseExtractedSave()`**（es3-parser.ts +~350 行）：
  - 專門解析新版結構化格式：從 `kpis` 讀純量+陣列、從 `decoded` 讀 kpis 未含的欄位（LoanAmount/LoanPaymentPerDay/HiredRerollTimes/SupermarketColor/DoorStates/Invoices/TierInflation/ManufacRecipes）、從 `pricing.prices` 讀 339 定價、從 `tier_unlocks.unlockedIndices` 讀已解鎖 tier、從 `skill_unlocks` 讀技能解鎖+perk 映射、從 `employee_data.hired` 讀員工 pipe-string、從 `store_layout.props` + `inventory.propInventory` 讀店面地圖+庫存、從 `decorations` 讀裝飾道具數。
  - 新增 helpers：`numOrUndef`, `boolArr`, `numArrFromWrapper`, `boolArrFromWrapper`, `strArrFromWrapper`。
  - `parseSaveFile()` 改為三段式偵測：①新版結構化（`decoded`+`kpis`+`store_layout`）→ `parseExtractedSave` ②乾淨 snapshot → 直接用 ③原始 ES3 文字 → regex 修復路徑。

- **更新 `/api/sample-save`**：優先伺服 `save.json`（新版），回退到 `_latest.json`（舊版），回應帶 `X-Save-Source` header 標示來源。

- **更新 upload.tsx**：
  - 「載入範本」按鈕標籤改為 `save.json`；`handleLoadSample` 從 `X-Save-Source` header 動態決定檔名。
  - 解析結果面板新增第 3 行 CountTile（6 格）：技能解鎖 / Storage Space Upg / 門狀態 / Perk→Skill 映射 / 店面佈局（經典/廣場文字）/ 總庫存件數。
  - `CountTile` 的 `value` 型別放寬為 `number | string`（店面佈局顯示「經典」/「廣場」）。

- **更新 achievements.tsx**：
  - 表格新增「解鎖條件」欄（顯示 `achievementDescFor`）+「標記」欄（集體/經典/廣場 badge）；移除獨立的 Steam ID 欄（改為名稱下方小字）。
  - `GUIDES` 陣列的 steamId 全部更新為新 slug（`ach_millionaire_s_holiday`, `ach_what_is_this`, `ach_might_need_two_ladders_or_more`, `ach_might_need_two_ladders`, `ach_how_is_this_still_standing_a`, `ach_superfood`），新增廣場佈局/經典佈局攻略。
  - import `achievementDescFor`。

Stage Summary:
- **新版存檔完全適配**：`upload/save.json`（extractor v1.0 結構化格式）可正確解析，extracted: Day 32, $2,505.60, StoreName=兒子進, Brand=TWITTER, Loan=$6,800, 3 員工, 57 店面道具, 339 定價, 22/55 tier 解鎖, 10/44 技能解鎖, 45 裝飾道具, 經典佈局。33 個偵測欄位。
- **成就名稱全面更新**：51 個成就用真實 Steam 面向玩家名稱（Basic Restocker / Millionaire's Holiday / What is this? 等），不再是變數名（Restocker A / Millionaire / EnigmaCube）。每個成就含中英文雙語名稱+描述+集體/佈局標記。語言切換器即時切換。
- `bun run lint` 0 errors；`bunx tsc --noEmit` src/ 0 errors。
- agent-browser 端對端驗證：
  1. `/api/sample-save` → 200, 145976 bytes, X-Save-Source=upload/save.json (extracted v1.0) ✓
  2. 上傳頁「載入範本 save.json」→ toast「解析完成：33 個欄位、Day 32、$2506、3 員工 (ok)」✓
  3. TopBar 顯示「Save Day 32」✓
  4. 解析面板顯示 MONEY/FRANCHISE PTS/FRANCHISE XP/兒子進/TWITTER/LOAN/技能解鎖/店面佈局/總庫存件數 ✓
  5. 成就頁顯示「基礎補貨員 / 基礎收銀員 / 略有斬獲」+ 解鎖條件欄 + 集體/經典/廣場標記 ✓
  6. 切換 English → 「Basic Restocker / Basic Cashier / Some Success / Millionaire's Holiday」+ English descriptions ✓
  7. 原始資料頁 Achievements tab 顯示 `ach_basic_restocker` + 「Placed a total of 1000 products in shelves」✓
  8. 7 個關鍵頁面 QA 全綠（0 console errors）：營運儀表板 / 商品百科 / 利潤實驗室 / 店面平面圖 / 定價實驗 / 成就 / 員工實驗室。
- dev server + keepalive 以 setsid 啟動，port 3000。

未解決問題/風險：
- 舊版 `_latest.json` 的 regex 修復路徑仍保留（向後相容），但未來使用者應全部改用新版 `save.json` 格式。
- 成就進度追蹤（local persist + room sync）的 checklist id 用 steamId，已從舊版 `0_Millionaire` 遷移到新版 `ach_millionaire_s_holiday` — 舊 localStorage 已標記的成就會失效（需重新勾選），這是預期行為。
- 下一階段可考慮：①利用 skillUnlocks + perkIndexToSkill 在技能頁顯示「已解鎖」標記 ②利用 layout 欄位在店面平面圖自動標示經典/廣場 ③利用 inventory.propInventory 的 productName 欄位做名稱校驗。

---
Task ID: 10
Agent: orchestrator (main) — cron reviewer round 3
Task: 技能樹完整圖譜 + 44 技能 TSV 表格 + 停用 socket.io 多人同步 + 後端服務推薦

Work Log:
- 使用者上傳 3 個檔案：`skill_tree_graph_v2.json`（99 節點 93 連線，從 Unity UI 層級提取）、`skill_graph.json`（舊版）、`perks_table.tsv`（44 perk 完整表）。要求：①用這些檔案做策略工具（完整圖譜 + 44 技能表格）②停用現在的 socket.io 多人同步 ③推薦免費後端同步服務（房間密碼認證 + host 上載存檔）。

- **分析資料**：`skill_tree_graph_v2.json` 是最完整版本：
  - 99 節點（44 perk + 55 category）、93 連線（category-category 53、category-perk 22、perk-category 18）。
  - `_meta.note`：「no perk prereqs — all cost 1000 FP, lines are visual organization only」。
  - 44 perk 中：5 個 placeholder（Employee I-V，各 +1 最大員工）、39 個實技能。
  - 每個 perk 有 name_en/name_zhHant/skill_id/desc_en/x/y/is_placeholder。
  - perk_to_category 映射每個 perk 到最近的產品分類節點。

- **複製資料到專案**：`skill_tree_graph_v2.json` → `src/lib/data/skill-graph.json`；`perks_table.tsv` → `src/lib/data/perks.tsv`。

- **新增型別**（types.ts）：`SkillGraphNode`、`SkillGraphEdge`、`PerkToCategoryEntry`、`SkillTreeGraph`。

- **新增載入器**（data-loader.ts）：`export const skillGraph = skillGraphJson as unknown as SkillTreeGraph`。

- **新建 `src/components/lab/skill-tree.tsx`**（~560 行）：
  - `SkillTreeView`：互動式 SVG 技能樹圖譜。
    - 99 節點按 x/y 定位、93 連線、perk 用圓圈（佔位=琥珀、實技能=翠綠）、category 用方塊。
    - 已解鎖 perk（從 save 的 skillUnlocks 陣列）顯示外圈光環 + emerald 高亮。
    - 拖曳平移 + 滾輪縮放 + 放大/縮小/重設按鈕。
    - 切換：連線 / 分類節點 / 只看已解鎖。
    - hover tooltip 顯示名稱+skill_id+效果；點擊展開詳情面板（node id/perk#/skill_id/座標/成本/效果/encyclopedia effect/最近分類）。
    - 圖例（右下角）+ 設計重點 callout（說明無前置、1000 FP、連線純視覺）。
  - `PerksTableView`：44 技能完整總表（TSV）。
    - 搜尋（名稱/skill_id/描述）+ 篩選（全部/實技能/員工佔位）+ 排序（#/名稱/分類/類型）。
    - 8 欄：# / 名稱（中英雙語）/ skill_id / 效果 / 最近分類 / 類型（佔位/實技能 badge）/ 狀態（已解鎖 badge）/ 座標。
    - 底部 4 個 summary tile：總 perk 數 / 實技能 / 員工佔位 / 總成本（44,000 FP）。

- **整合到 skills.tsx**：改用 Tabs 三分頁：「技能樹圖譜」（預設，SkillTreeView）/「44 技能總表」（PerksTableView）/「推薦策略」（原有 ROI 推薦）。Tab 帶圖示（Network/TableIcon/Lightbulb）。

- **停用 socket.io 多人同步**：
  - 殺掉 room-service mini-service（port 3003）。
  - `src/lib/room-sync.ts` 重寫：`buildSocket()` 回傳 `null`（socket.io 停用），保留 BroadcastChannel（同瀏覽器分頁同步）作為本地 fallback。
  - `useRoomSync()` 改為本地模式：createRoom 生成代碼+本地房間、joinByCode 顯示「後端整合中」toast、leaveRoom/broadcastPatch/syncSnapshot 只走 BroadcastChannel。
  - 新增 `mode: 'local' | 'backend'` 狀態。
  - 移除 socket.io-client import（不再需要）。
  - room.tsx 更新：SectionHeader 改為「後端同步服務整合中」、狀態卡片改為 sky 色「本地模式（後端整合中）」banner 說明遷移計畫 + 連結到推薦文件。

- **撰寫後端推薦文件** `BACKEND_SYNC_RECOMMENDATION.md`（~200 行）：
  - **首選 Supabase**：免費 500MB Postgres + Realtime + RLS；完整 schema（rooms/saves/members/events 表 + RLS policies）；註冊步驟；前端接入範例程式碼（createRoom/uploadSave/joinRoom/subscribeSave）；密碼處理（前端 bcrypt 或後端 pgcrypto）。
  - **備選**：Firebase Firestore（Google 生態）、JSONBin.io（最簡單無即時）、PocketBase（自架）。
  - **選型建議表** + **遷移路徑**（socket.io → Supabase 的 5 步）+ **下一步**（使用者註冊 Supabase → 給我 keys → 我接前端）。

Stage Summary:
- **策略工具完成**：技能樹完整圖譜（99 節點 93 連線互動式 SVG）+ 44 技能 TSV 總表（8 欄可搜尋排序篩選），整合到 skills.tsx 三分頁。已解鎖狀態從真實存檔的 skillUnlocks 陣列貫穿圖譜（外圈光環）+ 表格（badge）。
- **多人同步已停用**：socket.io room-service 殺掉、buildSocket 回傳 null、room-sync 改本地模式、room.tsx 顯示遷移 banner。BroadcastChannel 仍可用（同瀏覽器分頁同步）。
- **後端推薦文件完成**：Supabase 為首選，含完整 schema + 註冊步驟 + 前端範例 + 遷移路徑。等使用者註冊並提供 keys 即可接入。
- `bun run lint` 0 errors；`bunx tsc --noEmit` src/ 0 errors。
- agent-browser 端對端驗證：
  1. 技能頁預設顯示「技能樹圖譜」tab（選中），含 99 節點/93 連線/39 實技能/5 佔位 badge + 設計重點 callout（無前置、1000 FP）✓
  2. 切到「44 技能總表」tab → 顯示 Employee I/免費早晨咖啡 + SodaDrinksII 分類 + 佔位/實技能 badge + 搜尋篩選 ✓
  3. 切到「推薦策略」tab → 顯示營運策略 + 員工自動化/結帳速度/客流提升 ✓
  4. 載入存檔後 → 圖譜顯示「/44 已解鎖」badge + 「只看已解鎖」按鈕；表格顯示個別技能「已解鎖」badge（免費早晨咖啡/skill1）✓
  5. 多人房間頁顯示「本地模式（後端整合中）」sky banner + Supabase 遷移說明 ✓
  6. 截圖：`download/skill-tree-graph.png`（103KB）。
- dev server + keepalive 以 setsid 啟動，port 3000。

未解決問題/風險：
- 後端同步待使用者註冊 Supabase 並提供 Project URL + anon key（文件已附 schema + 步驟）。
- socket.io-client 套件仍安裝但未使用（可後續移除 `bun remove socket.io socket.io-client` + 刪 `mini-services/room-service/`）。
- 下一階段可考慮：①利用 skillGraph 的 perk_to_category 在圖譜上標示產品分類群組 ②技能 ROI 推薦結合已解鎖狀態標記「已擁有」③製造配方頁用 manufacUnlockedRecipes 顯示解鎖狀態。

---
Task ID: 11-foundation
Agent: orchestrator (main)
Task: Foundation for Supabase backend + skill tools — install deps, create schema, env template.

Work Log:
- Inspected current project state: skill-graph.json (99 nodes, 93 edges, VISUAL-only — no prereqs, all skills cost 1000 FP), save.json skill_unlocks (10/44 unlocked, perkIndexToSkill mapping, ExtraUpgrades 44-bool array, FranchiseExperience=55385, FranchisePoints=0).
- Confirmed room-sync.ts is in LOCAL mode (socket.io disabled Task 10), BroadcastChannel fallback active. room.tsx uses useRoomSync() with createRoom/joinRoom/leaveRoom/transport.
- Installed @supabase/supabase-js@2.112.3 + bcryptjs@3.0.3 + @types/bcryptjs.
- Created supabase/schema.sql: rooms/saves/members/events tables + RLS (public policies, password gate via app) + verify_room_password RPC (pgcrypto bcrypt) + realtime publication for saves/members/events.
- Updated .env.example with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (empty by default → Room runs in LOCAL fallback mode until keys added).
- Verified lint clean, tsc clean (src/ 0 errors; only skills/ gitignored dir has unrelated errors).

Stage Summary:
- Foundation ready for parallel subagents:
  - Task 11-a: Supabase backend-sync.ts + rewrite room-sync.ts + room.tsx (password auth, host upload, member realtime subscribe, local-mode graceful fallback).
  - Task 11-b: 7 skill strategy tools (rewrite skills.tsx as Skill Lab with 7 tabs + new skill-engine.ts + i18n resolvers).
- Key design decisions:
  - Skills have NO prerequisites (visual graph only) → Build Planner adapts to "build shopping list + FP budget" instead of prereq paths.
  - Supabase client reads from NEXT_PUBLIC_* env vars; if absent, room-sync falls back to BroadcastChannel local mode (app stays fully functional).
  - Password hashing: bcryptjs in browser (host hashes on create, member hashes+verifies on join via RPC).

---
Task ID: 11-a
Agent: full-stack-developer (Supabase backend)
Task: Implement Supabase backend sync, replacing the local-only room — room password auth (bcrypt), host-only save upload, member realtime view, with graceful local fallback when env vars absent.

Work Log:
- Read worklog.md (Tasks 1–11-foundation), existing room-sync.ts (LOCAL mode, socket.io disabled Task 10), room.tsx (HostPanel/JoinPanel/RoomWorkspace layout with checklist/tasks/chat/plans/skills tabs), store.ts (useRoomStore/useSaveStore/useUIStore), types.ts (Room/RoomMember/SaveSnapshot), supabase/schema.sql (rooms/saves/members/events + verify_room_password pgcrypto RPC + realtime publication).
- Created `src/lib/backend-config.ts` — exports supabaseUrl, supabaseAnonKey, isSupabaseConfigured (URL must start https://, anon key length > 20).
- Created `src/lib/backend-sync.ts` (~370 lines):
  - Lazy singleton `getSupabase()` returning SupabaseClient | null (only instantiated if isSupabaseConfigured).
  - hashPassword/verifyPassword using bcryptjs sync variants.
  - Row types: RoomRow, SaveRow, MemberRow, EventRow.
  - Functions (all async, throw Error with 繁中 messages): createRoom (6-char code from alphabet without I/O/0/1, retry on PK conflict, upsert host into members, insert 'join' event), joinRoom (verify_room_password RPC → fetch room → upsert member with role host/member → insert 'join' event), uploadSave (upsert saves + 'save-updated' event), fetchSave, fetchSaveRow (with uploadedAt/uploadedBy), fetchMembers, fetchEvents, heartbeat, leaveRoom ('leave' event + delete member row).
  - Realtime subscribe* fns (subscribeSave, subscribeMembers, subscribeEvents) each return unsubscribe () => void; channels scoped by `room_code=eq.{code}`.
- Rewrote `src/lib/room-sync.ts` `useRoomSync()` hook with dual-mode API matching orchestrator spec:
  - Exports `{ mode, transport, connected, ready, createRoom(name,playerName,password), joinRoom(code,playerName,password), leaveRoom, uploadSave, lastError, clearError }`.
  - mode = isSupabaseConfigured ? 'backend' : 'local' (module-level const → no hydration mismatch).
  - mounted state guards transport value (returns 'offline' until mounted to avoid SSR mismatch).
  - Backend mode: setupBackendSubscriptions(code) wires 3 realtime channels + 20s heartbeat. subscribeSave → useSaveStore.setSnapshot + useRoomStore.setSnapshot. subscribeMembers → refetch + updateRoom({members}). subscribeEvents → dedupe + updateRoom({events}). clearSubs() on leaveRoom + unmount.
  - Local mode: BroadcastChannel('stl-room') for state/member-left/snapshot messages. createRoom stores bcrypt-hashed password in localStorage `stl-room-creds` keyed by code; joinRoom verifies via bcryptjs compareSync if entry exists, otherwise simulates (cross-browser impossible locally). uploadSave broadcasts snapshot message to other tabs.
  - lastError captured from thrown Errors; clearError resets.
- Rewrote `src/components/lab/room.tsx` (~620 lines) with new flow:
  - ModeBanner: green "Supabase 已連線 · 跨裝置同步啟用" for backend; amber "本地模式 — 尚未設定 Supabase. 請在 .env 加入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY" for local.
  - RoomLobby: side-by-side Create (Host) + Join (Member) cards (md:grid-cols-2, stacked mobile). Create has 房間名稱/你的名字/房間密碼 (PasswordInput with Eye/EyeOff toggle). On success → big dashed-border emerald code display text-3xl font-mono tracking-[0.3em] + copy button. Join has auto-uppercase 6-char code input + password. Renders sync.lastError in red AlertCircle box.
  - RoomWorkspace: header with room name + code badge + RoleBadge (Host=Crown amber, Member=User muted) + transport badge + copy/leave buttons. Left 2/3: HostUploadCard (Host) with "上傳目前存檔到房間" button (disabled if !saveSnapshot, Loader2 spinner while uploading) + last upload time; OR MemberWaitCard (Member) showing emerald check if snapshot exists, amber spinner "等待 Host 上傳存檔" otherwise. Members CANNOT upload. SnapshotPreviewCard with 4 tiles (Day/Money/偵測欄位數/來源). Right 1/3: MembersCard grid (avatar circle with initials in member color, role tooltip badge, last-seen relative time), ActivityCard max-h-64 overflow-y-auto with custom webkit-scrollbar styling, ActivityRow per event (join=emerald User, leave=rose LogOut, save-updated=primary Upload).
  - All text Traditional Chinese. Lucide icons throughout. Responsive. p-4 card padding, gap-4 spacing. Removed old checklist/tasks/chat/plans/skills tabs (room is now admin-facing per spec; those were Task 10 legacy).
- Fixed lint: removed unused eslint-disable directive (added mode/setConnected/updateRoom/removeMember to deps).
- Fixed tsc: `Card` is not exported from lucide-react — renamed to `LayoutGrid` icon.

Stage Summary:
- Files created: src/lib/backend-config.ts, src/lib/backend-sync.ts.
- Files rewritten: src/lib/room-sync.ts, src/components/lab/room.tsx.
- Files NOT touched (per orchestrator): store.ts, types.ts, i18n.ts, supabase/schema.sql, skill-*.tsx, shared/*.
- Quality: `bun run lint` 0 errors / 0 warnings; `bunx tsc --noEmit` src/ 0 errors (only skills/ gitignored dir has pre-existing unrelated errors). No hydration mismatch.
- App works in LOCAL mode right now (no env vars set): create/join/upload all functional via BroadcastChannel + localStorage password creds. When NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are added to .env, the Room feature seamlessly switches to Supabase backend mode with cross-device realtime sync (saves/members/events), bcrypt password auth (host hashes client-side; join verifies via verify_room_password RPC using pgcrypto server-side bcrypt), and host-only save upload with member realtime view.

---
Task ID: 11-b
Agent: full-stack-developer (skill tools)
Task: Build 7 skill strategy tools as a unified "Skill Lab" — rewrite skills.tsx as a 4-tab shell hosting the 7 new tools + reused graph/table + ported ROI tab; create skill-engine.ts + i18n SKILL_TOOL strings; all without touching store.ts/types.ts/engine.ts.

Work Log:
- Read worklog (esp. Task 10 + 11-foundation + 11-a), types.ts, existing skills.tsx + skill-tree.tsx (SkillTreeView + PerksTableView exports), engine.ts (computeSkillRecommendations synergyTags), es3-parser.ts (parseSaveFile takes string text + fileName, auto-routes extracted/clean/ES3), i18n.ts (loc/locShort/skillNameFor/skillDescFor/useLang/useT pattern), primitives.tsx (ConfidenceBadge/MiniBar/SectionHeader/fmt/fmtMoney/StatCard), shared/app-shell.tsx (Skills lazy-loaded via view === 'skills'). Confirmed demo save has no skillUnlocks; real save.json has [0,6,7,8,9,10,11,17,22,26].
- Confirmed 44 skills in encyclopedia: 39 with effect text (extraEmployeeSpeedFactor += 0.2, maxEmployees += 1, allowedSimultaneousSales += 2, electricFactor = 0.8, recycle, etc.) + 5 placeholder (skill40-44 perk=null "no matching perk in IL"). Confirmed skillGraph 99 nodes/93 edges + perk_to_category map (29 unique category names).
- **Created `src/lib/skill-tools-store.ts`** (~95 lines): tiny dedicated Zustand store (persist to localStorage 'stl-skill-tools') for inter-tool state sharing — buildPlan: string[] (skill ids), simSelection: number[] (perk indices), lastApplySource: string | null. API: addToBuild/addManyToBuild/removeFromBuild/setBuildPlan/clearBuild + toggleSim/setSimSelection/clearSim. Lets NextStepRecommender "套用全部" feed BuildPlanner, and FP-sim share state, WITHOUT editing the orchestrator-owned store.ts.
- **Created `src/lib/skill-engine.ts`** (~600 lines) — pure functions:
  - FP_COST_PER_SKILL = 1000 + TOTAL_SKILLS = 44
  - getUnlockedSkillIndices(snapshot) / getUnlockedSet(snapshot) / isSkillUnlocked(skill, snapshot)
  - getSkillCategory(perkIndex) / getSkillCategoryForSkill(skill) — wraps skillGraph.perk_to_category
  - groupSkillsByCategory(skills) → Map<string, Skill[]>
  - categoryColor(name) — deterministic HSL hash for badge colors
  - parseEffectForMetric(effect) → ParsedEffect[] — 21 regex patterns: extraemployeespeedfactor/maxemployees/extracustomersperk/allowedsimultaneoussales/productcheckoutwait-/employeeitemplacewait-/selfcheckoutextraproductsfromperk/minselfcheckoutwait-/maxselfcheckoutwait-/boxrecyclefactor/closestrecycleperk/employeerecycleboxes/electricfactor/autopayinvoices/rerollsperday/extracheckoutmoney/softwareupgradeperk/orderingextracrashonbadweather/convertbystanderstriggerobj/clockobj+clockcontrolslateobj/auxiliarsetuipallets. Returns metric+delta+raw, with "未提取" fallback for unknown effects.
  - estimateSkillImpact(skill, snapshot?) — wraps parseEffectForMetric, returns SkillImpact[] with confidence (confirmed for numeric deltas, proxy for 'enabled'/'未提取', unverified for no-effect)
  - categorizeSkill(skill) — mirrors engine.ts logic but standalone (category + tags[] like 'speed','headcount','throughput','sales-cap','recycling','finance','ordering')
  - recommendNextSkills(snapshot, mode: 'employee'|'customer'|'checkout'|'recycling', count) — TOP N excluding unlocked, weighted by MODE_WEIGHTS tag multipliers (employee: speed×3+headcount×2.4+automation×1.5; checkout: throughput×3+sales-cap×1.5; customer: sales-cap×2.5+customer-volume×2; recycling: recycling×3). Reason text generated in 繁中 referencing current save context (employee count, unlocked speed skills, etc.).
  - computeStoreProfile(snapshot) → StoreProfile {archetype, icon (lucide name), description, metrics} — heuristics: layout===1 → '廣場佈局', employees>=4 && props>=30 → '大型店鋪 · 重員工', employees<=2 → '小型店鋪 · 精簡人力', day>=30 → '中後期 · 規模擴張', else '標準店鋪 · 均衡發展'. Empty state if no save.
  - computeStrategyRadar(snapshot) → 5 axes (員工效率/客流/結帳/回收/財務) with score=unlocked/total×100 (predicate-based filter on effect regex)
  - tailoredRecommendations(snapshot, profile, count) — picks 3-5 skills matching the archetype's allowed tags, prefers locked skills first
  - presetSkillIds(preset: 'employee'|'checkout'|'customer'|'recycle') — regex filter for BuildPlanner quick presets
  - computeFpSpent(snapshot) = unlockedCount × 1000
  - computeFpNeededForPlan(planSkillIds, snapshot) = max(0, needBuy×1000 - franchisePoints)
- **Appended to `src/lib/i18n.ts`** (~165 new lines, append-only — did NOT touch existing exports): added SKILL_TOOL_STRINGS map (60+ keys) for all 7 tools' chrome labels (zhHant + en) + skillToolLabel(key, lang) resolver + useSkillToolLabel() hook. Keys cover Lab header/subtitle/4 main tab labels/7 sub-tab labels/FP strip/Tool1-7 strings/shared (category/effect/fpCost/rank/perk).
- **Created `src/components/lab/skill-tools/types.ts`** (~45 lines): SkillRow interface, skillCategoryName/skillCategoryColor helpers, SCROLLBAR_CLASSES / SCROLLBAR_CLASSES_SM constants (max-h-[480px] overflow-y-auto + webkit-scrollbar styling per spec).
- **Created `src/components/lab/skill-tools/category-badge.tsx`** (~30 lines): shared CategoryBadge component — pill with colored dot derived from categoryColor(name).
- **Created Tool 1: `UnlockedOverview.tsx`** (~430 lines):
  - Big progress header: "已解鎖 X / 44 技能" with gradient emerald progress bar (h-3 rounded-full).
  - 4 FP stats: 已賺 FP (franchiseExperience), 可用 FP (franchisePoints), 已花 FP (max(0, earned-available)), 技能花費 (unlockedCount×1000).
  - View toggle (ToggleGroup): 列表 / 按類別.
  - 列表 view: 2-col grid — 已解鎖 (emerald left border + Check icon) | 未解鎖 (Lock icon + muted). Each row: perk badge, name (skillNameFor), description (skillDescFor), CategoryBadge, effect mono code with Tooltip for full text. SCROLLBAR_CLASSES on each list.
  - 按類別 view: groups all skills by perk_to_category category_name, shows headers with unlocked/total counts, sorted by unlocked-count desc then name.
  - Empty state if no save: Upload icon + "載入範本存檔" button calling useSaveStore.loadDemo().
- **Created Tool 2: `BuildPlanner.tsx`** (~430 lines):
  - LEFT: searchable skill picker (Input + filter by name/id/effect), 4 preset buttons (員工效率流/收銀流/客流流/回收流 using presetSkillIds), scrollable checkbox list of all 44 skills. Selected rows get ring-2 ring-primary.
  - RIGHT: 我的 Build 清單 — running totals (總技能數/總 FP 成本/已解鎖/還需購買), 距離完成 progress bar (alreadyUnlocked/total), 尚需 FP card (amber, computeFpNeededForPlan), scrollable list of plan skills with remove buttons + CategoryBadge + Tooltip on effect.
  - Build 走線 visualization: pills for each category in plan with count + Tooltip listing skills.
  - Persisted via useSkillToolsStore (localStorage 'stl-skill-tools').
  - ConfidenceBadge "1000 FP per skill (no prereqs)" footer.
- **Created Tool 3: `NextStepRecommender.tsx`** (~270 lines):
  - 4-mode ToggleGroup (員工效率/客流/收銀收益/回收收益) with lucide icons.
  - Current metrics row: 目前員工 / 已解鎖速度技能 / 已解鎖收銀技能 / 已解鎖回收技能.
  - TOP 3 recommendation cards (excluding unlocked) — each: rank #1/2/3 with Trophy icon (gold/silver/bronze), score, skill name + CategoryBadge + perk#, 為什麼推薦 box (amber bg, generated reason referencing save context), effect mono code, description.
  - "套用全部到 Build" button → addManyToBuild via useSkillToolsStore + toast.success.
  - Empty state if no recs (all unlocked in this mode).
- **Created Tool 4: `BenefitComparator.tsx`** (~330 lines):
  - Two shadcn Select dropdowns (Skill A / Skill B) listing all 44 skills with localized names + perk#.
  - Side-by-side comparison cards: name, CategoryBadge, FP cost badge, description, effect mono code, 收益推估 list (estimateSkillImpact → metric + value + ConfidenceBadge).
  - VS divider in middle (rounded-full border-dashed): ArrowLeftRight icon + 互補 (emerald, when metrics don't overlap) OR 較強 (amber, with winner indicated) badge.
  - Comparison rationale card with explanation text.
  - compareImpacts logic: parses numeric values via regex, finds common metrics, returns 'complementary'/'stronger'/'unknown' + note in 繁中.
- **Created Tool 5: `FpInvestmentSimulator.tsx`** (~340 lines):
  - Two Inputs: 目前 FP (default from save franchisePoints, placeholder shows save value) + 每日 FP 收入 (default 2000, with hint "依難度/客流估計，可自行調整").
  - 模擬購買 area: 44 toggleable chips (rounded-full px-2.5 py-1), unlocked=emerald bg + Check + disabled, selected=primary bg + ring, locked=border. Running totals: 已選 N 技能 / 總成本 FP / 剩餘 FP.
  - Two prediction cards: 如果現在全部購買 (總成本 44000, 已花, short-by or surplus); 完成全部需 N 天 (ceil(deficit/dailyFp)).
  - Recharts BarChart FP allocation: 已花 (emerald) / 儲備 (amber) / 剩餘 (muted).
  - 重設模擬 button.
  - State via useSkillToolsStore.simSelection (persisted).
- **Created Tool 6: `SaveDiffAnalyzer.tsx`** (~540 lines):
  - Two drag-drop zones (存檔 A 舊 / 存檔 B 新), accept .json/.es3, parse via parseSaveFile(text, fileName) — handles extracted/clean/ES3 formats automatically.
  - Each zone shows: parse error (AlertCircle rose) | loaded (CheckCircle2 + filename + Day/Money/Employees/skill-count badges) | empty (Upload icon + drop hint).
  - KPI 變化 grid (6 cards): 技能數量/FP/Day/Money/Employees/Store Props — each shows A→B with delta (+/-/0) color-coded (emerald up / rose down / muted same).
  - 新解鎖技能 card: emerald left border, list of skills unlocked in B but not A (name + CategoryBadge + FP cost + effect), with TimelineVisual — vertical line with Day A node at top, newly-unlocked skills as emerald nodes along, Day B node at bottom (+N days).
  - Hint card if only one save loaded. Empty state if neither.
  - 重新比較 button clears both.
- **Created Tool 7: `StrategyPanel.tsx`** (~270 lines):
  - Reads snapshot.employees.length, storeLayout.length, layout, day, money, difficulty.
  - Profile card (gradient bg, primary accent): icon (mapped from StoreProfile.icon string to lucide component via PROFILE_ICONS table), archetype name, description, metrics grid (employees/props/day/money/difficulty/layout).
  - Tailored recommendations card: 5 recs from tailoredRecommendations(profile) — each with rank badge (emerald Check if unlocked, amber Lightbulb if not), name, FP cost / unlocked badge, CategoryBadge, reason (繁中, references actual numbers from save), effect mono code.
  - 策略雷達圖: recharts RadarChart 5 axes (員工效率/客流/結帳/回收/財務) with emerald fill opacity 0.4, domain 0-100. Below: axis breakdown grid showing unlocked/total + score.
  - Empty state if no save.
- **Rewrote `src/components/lab/skills.tsx`** (~605 lines):
  - Header "技能策略實驗室" + subtitle "44 個 Franchise Perk · 統一 1000 FP · 無前置 · 7 大策略工具".
  - FP status strip (always visible, Card with flex-wrap): Unlock icon + 已解鎖 X/44 badge + FpChip 已賺/可用/技能花費 + (no-save: "載入範本存檔" button) / (has-save: "存檔：Day X" indicator).
  - Two-level Tabs:
    - Level 1: 「策略工具」(default, Wrench icon) | 「技能樹圖譜」(Network, reuses <SkillTreeView />) | 「44 技能總表」(TableIcon, reuses <PerksTableView />) | 「ROI 排序」(Lightbulb, ported from old skills.tsx).
    - Level 2 (inside 策略工具): horizontal scrollable TabsList with 7 sub-tabs (Unlock/Lightbulb/Wrench/etc icons + 繁中 labels). Each TabsContent renders the corresponding tool component.
  - ROI tab ported from old skills.tsx: STRATEGIES ToggleGroup (7 strategies), perk-cost callout (emerald, "1000 FP 已確認"), caution box (amber, ROI proxy note), Top-15 horizontal BarChart (recharts) with category colors + legend, 44 SkillCards grid (rank badge, name, effect Tooltip, category + synergyTags badges, ROI MiniBar). **Removed** all room/voting UI (useRoomStore, voteSkill/unvoteSkill, consensus banner, vote buttons, voters avatar stack) — those belong to room.tsx now.
  - All chrome labels via useSkillToolLabel() so EN/繁中/雙語 all work.
- **Lint fixes**:
  - React 19 rule `react-hooks/set-state-in-effect` triggers on `useEffect(() => setMounted(true), [])` — added `// eslint-disable-next-line react-hooks/set-state-in-effect` comment (same pattern as existing topbar.tsx/sidebar.tsx) in 5 files (skills.tsx + 4 tool components using mounted state for hydration-safe snapshot reads).
  - Removed unused imports (getSkillCategoryForSkill in BuildPlanner/UnlockedOverview, fmtMoney in UnlockedOverview, skillDescFor in StrategyPanel, isSkillUnlocked in StrategyPanel, Lock in SaveDiffAnalyzer) — no `void X` hacks.
  - Fixed tsc error: FpInvestmentSimulator `toggleChip(s.perk)` → `s.perk != null && toggleChip(s.perk)` (perk can be null for skill40-44).
  - Fixed tsc error: UnlockedOverview SkillRowCard param type `skill: Skill` — added `import type { Skill } from '@/lib/types'`.
- Verified: `bun run lint` → exit 0 (0 errors). `bunx tsc --noEmit` → 0 src/ errors (only skills/ gitignored dir has 2 pre-existing unrelated errors).

Stage Summary:
- 7 skill strategy tools + Skill Lab shell completed. Files created:
  - `src/lib/skill-engine.ts` (pure analytics, ~600 lines, 20+ exported functions)
  - `src/lib/skill-tools-store.ts` (Zustand persist, ~95 lines)
  - `src/components/lab/skill-tools/types.ts` (shared helpers + SCROLLBAR_CLASSES)
  - `src/components/lab/skill-tools/category-badge.tsx` (shared CategoryBadge)
  - `src/components/lab/skill-tools/UnlockedOverview.tsx` (Tool 1)
  - `src/components/lab/skill-tools/BuildPlanner.tsx` (Tool 2)
  - `src/components/lab/skill-tools/NextStepRecommender.tsx` (Tool 3)
  - `src/components/lab/skill-tools/BenefitComparator.tsx` (Tool 4)
  - `src/components/lab/skill-tools/FpInvestmentSimulator.tsx` (Tool 5)
  - `src/components/lab/skill-tools/SaveDiffAnalyzer.tsx` (Tool 6)
  - `src/components/lab/skill-tools/StrategyPanel.tsx` (Tool 7)
- Files modified:
  - `src/components/lab/skills.tsx` (rewritten as Skill Lab shell — 4 main tabs + 7 sub-tabs, removed old room/voting UI, ported ROI tab)
  - `src/lib/i18n.ts` (append-only — added SKILL_TOOL_STRINGS map + skillToolLabel/useSkillToolLabel resolvers, 165 new lines, NO existing exports touched)
- Files NOT touched (per orchestrator spec): store.ts, types.ts, engine.ts, es3-parser.ts, room.tsx, room-sync.ts, backend-sync.ts, backend-config.ts, shared/*, skill-tree.tsx (SkillTreeView/PerksTableView reused as-is).
- All 7 tools render graceful empty states when no save is loaded (Upload icon + "載入範本存檔" button calling useSaveStore.loadDemo), and fully populate when a real save with skillUnlocks is loaded.
- Tricky parsing logic: 21 regex patterns in parseEffectForMetric — handles `field += X` (additive numeric), `field -= X` (subtractive numeric, e.g. checkout wait -0.15 → "-15%"), `field = N` (assignment, e.g. boxRecycleFactor = 4 → "×4", electricFactor = 0.8 → "-20%"), `enable X` (boolean enable, e.g. clockOBJ+clockControlSlateOBJ → 時間加速 enabled), multi-statement effects separated by `;` (skill28 Recycling container has 10 sub-effects, all parsed). Confidence: confirmed for numeric deltas (direct from IL effect string), proxy for 'enabled'/'未提取', unverified for no-effect.
- Store profile heuristics: layout===1 → 廣場佈局; employees>=4 && props>=30 → 大型店鋪 · 重員工; employees<=2 → 小型店鋪 · 精簡人力; day>=30 → 中後期 · 規模擴張; else 標準店鋪 · 均衡發展. Each archetype picks an allowed-tags subset (e.g. 廣場/大型 → speed+headcount+throughput+sales-cap; 小型 → speed+throughput+automation; 中後期 → headcount+recycling+finance) for tailoredRecommendations.
- Build Planner persistence: buildPlan + simSelection stored in localStorage 'stl-skill-tools' via useSkillToolsStore. Refresh keeps the plan. NextStepRecommender "套用全部" feeds BuildPlanner through the shared store.
- SaveDiffAnalyzer uses parseSaveFile(text, fileName) which auto-routes between extracted v1.0 / clean-snapshot / raw ES3 formats — accepts both .json and .es3, handles parse errors gracefully with per-zone error display.
- `bun run lint` 0 errors / `bunx tsc --noEmit` src/ 0 errors. Dev server is system-managed on :3000 (don't restart).

---
Task ID: 11-qa
Agent: orchestrator (main)
Task: End-to-end QA verification of Supabase Room + 7 Skill Tools, then commit.

Work Log:
- Ran `bun run lint` → 0 errors, 0 warnings.
- Ran `bunx tsc --noEmit` → src/ 0 errors (only gitignored skills/ dir has pre-existing unrelated errors).
- Restarted dev server (had crashed due to EADDRINUSE from stale instance) via setsid background; confirmed HTTP 200 on /.
- agent-browser QA on Room page (本地模式 since no Supabase env vars):
  - Lobby renders: amber 本地模式 banner + Host card (房間名稱/Host 名/密碼) + Member card (房間代碼/Member 名/密碼). All 6 inputs present.
  - Created room "測試房間" as Host Alice with password → room code O799PP generated, host badge shown, upload button active.
  - Clicked "上傳目前存檔到房間" → "上次上傳：剛剛" + snapshot preview (Day 32, detected fields) rendered. Upload flow works in local mode.
  - Member roster shows Alice (你) with Host role.
- agent-browser QA on Skills page (loaded real save.json → Day 32, 10/44 unlocked, 55,385 FP):
  - Skill Lab shell: header + FP status strip (10/44, 55,385 FP, 0 available) + 2-level tabs (策略工具/圖譜/總表/ROI + 7 tool sub-tabs).
  - Tested all 7 tool tabs: 已解鎖總覽 (10/44, 22.7%, unlocked list), Build 規劃 (presets + picker), 下一步推薦 (recommendations), 收益對比 (A/B comparison), FP 模擬 (allocation), 存檔差異 (drag-drop zones), 策略面板 (profile + radar).
  - Tested 圖譜/總表/ROI tabs — SkillTreeView + PerksTableView + ROI chart all render.
  - Installed console.error capture → navigated all 10 tabs → 0 console errors.
- Screenshots saved: qa-room-lobby.png, qa-room-workspace.png, qa-skills-unlocked-overview.png, qa-skills-strategy-panel.png.

Stage Summary:
- Both Task 11-a (Supabase room sync) and Task 11-b (7 skill tools) are COMPLETE and QA-verified.
- Room works in LOCAL mode now (BroadcastChannel + bcrypt localStorage); will auto-switch to Supabase backend when NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
- 7 skill tools all functional with real save data (10/44 unlocked, FP math correct).
- Ready to commit & push to GitHub.

---
Task ID: 12-foundation
Agent: orchestrator (main) — cron webDevReview round
Task: QA sweep + TSV export utility + prepare for Complete Game Atlas.

Work Log:
- agent-browser QA: navigated all 17 main pages + 7 skill tool sub-tabs with console.error capture. Found 1 bug: manufacturing page crashed with "A <Select.Item /> must have a value prop that is not an empty string" (Radix Select forbids empty string values).
- Fixed manufacturing.tsx: changed `<SelectItem value="">— 未指派 —</SelectItem>` to `value="__none__"` with onValueChange mapping `__none__` → `''`. Re-verified: 0 errors across all 17 pages.
- Created `src/lib/export-utils.ts`: `toTsv()` / `toCsv()` / `downloadTextFile()` (BOM-prefixed for Excel CJK compat) / `downloadTsv()` / `downloadCsv()`.
- Added "下載 TSV" export button to 3 data-heavy tables:
  - PerksTableView (skill-tree.tsx): exports 44 perks with perk_index/skill_id/name_en/name_zhHant/is_placeholder/desc/effect/il/nearest_category/category_distance/x/y/unlocked (14 columns).
  - Products Wiki (wiki.tsx): exports filtered products with id/name_en/name_zhHant/tier/group/price/boxValue/valueDensity/demandProxy/role/isPremium/seasons/necessities/manufacturingLink/inventory (15 columns).
  - Achievements (achievements.tsx): exports 51 achievements with index/steamId/name_en/name_zhHant/description_en/description_zhHant/globalPercent/collective/layout (9 columns).
- Verified lint 0 errors, tsc src/ 0 errors after TSV additions.

Stage Summary:
- Manufacturing crash FIXED. TSV export utility + 3 export buttons DONE.
- Next: launch Task 12-a subagent for Complete Game Atlas (new 'atlas' view — interactive relationship graph of all 18 entity types in encyclopedia.json).
- Pending: 完整圖譜 (Complete Game Atlas) is the last big item from the user's original request.

---
Task ID: 12-a
Agent: full-stack-developer (Game Atlas)
Task: Build a "Complete Game Atlas" (完整圖譜) — a new page visualizing all 18 game entity types and their relationships via 4 interactive sub-views.

Work Log:
- Read worklog (Tasks 1–12-foundation) for full context. Confirmed project state: Next.js 16 + TS 5, encyclopedia.json has 18 entity sections, existing i18n resolvers (productNameFor/groupIdNameFor/tierIdNameFor/useLang), store.ts ViewId union, sidebar NAV array, app-shell lazy pattern.
- Inspected encyclopedia.json structure for all 18 entity types: products(339)/tiers(55)/productGroups(19)/necessities(11)/seasons(4)/customerTypes(58)/containers(42)/skills(44)/buildables(43)/manufacturingBuildables(4)/manufacturingProducts(30)/premiumProducts(7)/achievements(51)/achievementStats(24)/employeeTasks(8)/config(9 keys)/storeLayout(41)/layoutMeta(2 fields). Confirmed premiumProducts=[173,175,186,287,296,297,299] and customerTypes[].premiumIndexes is empty across all 58 types (structural edge exists, count=0).
- **Created `src/lib/atlas-data.ts`** (~610 lines, pure functions, no React):
  - `ENTITY_CATEGORIES` (6: product/classification/demand/store/player/system) with hex colors (emerald/sky/amber/violet/fuchsia/zinc).
  - `ENTITY_TYPES` (18 entries): { key, labelZh, labelEn, count, category, color } computed from encyclopedia.
  - `ATLAS_NODES` (18): fixed SVG positions in 1200×800 viewBox — 3 concentric rings (center=config+layoutMeta, inner=5 category hubs, outer=11 leaves). Radius = `24 + log2(count+1)*4` capped at 48.
  - `ATLAS_EDGES` (14): computed relationship edges with counts — productGroups↔tiers (55), tiers↔products (339), productGroups↔products (339 via product.group), manufacturingProducts→products (30, linkedProductID), premiumProducts→products (7), necessities→products (214 pairs), seasons→products (95 pairs), customerTypes→necessities (385 weight>0 pairs), customerTypes→premiumProducts (0, structural), buildables→storeLayout (41), containers→buildables (42 via buildableName match), skills→config (perkSystem), employeeTasks→config (employeeConfig), achievements→achievementStats (24).
  - `TOTAL_RELATIONSHIPS` = sum of all edge counts.
  - `getEntityTypeSamples(key, count=5)`: returns {id, name, sub?} per type — handles all 18 types specially (products→name+brand, premiumProducts→resolved names, config→key+subkey-count, layoutMeta→field values, etc.).
  - `getRelationships(key)`: returns {direction, targetType, targetLabelZh, count, label}[] for in/out edges.
  - `productHierarchy()`: returns 19 ProductGroup nodes each with tiers[] (filtered by tier.group) and products[] (filtered by product.tier).
  - `customerDemandChain(customerIndex)`: returns necessities with weight>0 sorted desc, each with resolved Product[] from productIds.
  - `customerDemandStats(customerIndex)`: topThree + deduplicated totalProducts + coveredGroups (sorted by product count).
  - `manufacturingChains()`: 30 entries with {mfg, baseProduct, isNecessityComponent, isSeasonal} — pre-indexes necessity/season product sets for O(1) membership check.
- **Edited `src/lib/store.ts`** (1 line): added `'atlas'` to ViewId union type after `'room'`.
- **Edited `src/components/shared/sidebar.tsx`** (2 edits): added `Share2` to lucide-react imports + added NAV entry `{ id: 'atlas', label: 'Game Atlas', zhLabel: '遊戲圖譜', icon: Share2, group: '資料' }` after rawdata.
- **Edited `src/components/shared/app-shell.tsx`** (2 edits): added `const Atlas = lazy(...)` import + `{view === 'atlas' && <Atlas />}` render branch.
- **Created `src/components/lab/atlas.tsx`** (~1410 lines, 'use client'):
  - Local STR map (繁中/en) for all UI strings (~40 keys).
  - `pick(s, lang)` helper + SCROLLBAR_CLS constant.
  - `AtlasHeader`: gradient fuchsia→violet→sky icon box + title/subtitle + 6-stat strip (339 products · 55 tiers · 19 groups · 58 customers · 44 skills · 51 achievements) with colored left borders.
  - **View 1 `DataModelGraph`**: interactive SVG (viewBox 1200×800) with:
    - Radial gradient defs per category (6 gradients, lighter center → saturated edge) + drop-shadow filter.
    - 14 curved bezier edges (perpendicular-offset control point) with log-scale thickness (0.6–5px). Hover edge → tooltip with count + thicker stroke. Related edges (when a node is active) get flowing dash animation.
    - 18 nodes with radial gradient fill, 2px stroke, inner highlight circle for 3D effect. Hover → scale 1.18 + opacity dim on non-related. Click → selection ring + side panel.
    - Zoom/pan: mousewheel zoom (0.4–3x), pointer-drag pan on empty SVG area. Zoom in/out/reset buttons.
    - Side panel (w-80): entity name + category color dot, count + category badges, 5 sample items (scrollable), relationships list (clickable → navigates to target type, in=sky dot / out=emerald dot, count badge).
    - Legend overlay (bottom-left): 6 category colors.
  - **View 2 `ProductHierarchyTree`**: collapsible tree (ProductGroup → Tier → Product). 19 group rows with color dot (from group.color RGB), tier count + product count badges. Expand to show tiers (filtered by tier.group), expand tier to show products (id + name + basePrice + premium Crown badge). Search filters across all 3 levels (auto-expands matches). 全部展開/全部收合 buttons. max-h-[640px] scrollable with custom scrollbar. Indentation + chevron icons (ChevronRight→ChevronDown).
  - **View 3 `CustomerNetwork`**: 3-column SVG layout. Left panel: customer selector (Select dropdown + scrollable list of 58 types with index + topSummary). Center: SVG with customer node (large amber, pulsing), necessity nodes (sized by weight, pulsing), product chips (up to 6 per necessity + "+N more"). Curved edges customer→necessity (thickness=weight) and necessity→product (thin). Dynamic viewBox height based on visible necessities. Right panel: Top 3 necessities + total products + covered groups list. Empty state hint when no customer selected.
  - **View 4 `ManufacturingChainView`**: grid of 30 clickable cards (name + linked base + itemsPerBox + stackable/necessity/seasonal badges). Click → detail flow SVG (base product node → arrow → mfg product node, with secondary connection badges below). "查看全部製造鏈" toggle → full SVG with all 30 base→manufactured curved arrows (left column = base products sorted, right column = manufactured, violet→emerald gradient strokes, clickable rows).
  - All animations (atlas-edge-flow, atlas-pulse, atlas-pulse-slow, atlas-node-hover) injected once via `<style dangerouslySetInnerHTML>` at root (consolidated from 3 separate styled-jsx blocks — switched to dangerouslySetInnerHTML for portability since no other component in the codebase uses styled-jsx).
  - Responsive: grids stack on mobile (lg: breakpoints), SVGs use viewBox + width=100% for scaling.
- **Quality verification**:
  - Fixed tsc error: removed local `TreeNode` interface (had `products: Product` instead of `Product[]`) — replaced with direct `HierarchyGroup[]` type from atlas-data.
  - Removed unused imports: `Tooltip/TooltipTrigger/TooltipContent` (not used in final SVG-based design — hover tooltips rendered as SVG text overlays instead) + `EntityCategory` type.
  - `bun run lint` → 0 errors / 0 warnings.
  - `bunx tsc --noEmit` → 0 src/ errors (only skills/ gitignored dir has 2 pre-existing unrelated errors).
  - Dev server compiles cleanly (✓ Compiled in 401ms, GET / 200).
  - Sanity-tested all atlas-data.ts pure functions via bunx tsx: 18 ENTITY_TYPES ✓, 18 ATLAS_NODES ✓, 14 ATLAS_EDGES with correct counts ✓, getEntityTypeSamples returns proper items per type ✓, getRelationships("products") shows 6 in-edges ✓, productHierarchy returns 19 groups ✓, customerDemandChain(0) returns 7 visible necessities sorted by weight ✓, manufacturingChains returns 30 entries ✓.

Stage Summary:
- **Files created**: `src/lib/atlas-data.ts` (610 lines, pure functions), `src/components/lab/atlas.tsx` (1410 lines, 4 sub-views).
- **Files edited (minimal)**: `src/lib/store.ts` (+1 line: 'atlas' to ViewId), `src/components/shared/sidebar.tsx` (+2 lines: Share2 import + NAV entry), `src/components/shared/app-shell.tsx` (+2 lines: lazy import + render branch).
- **Files NOT touched** (per spec): i18n.ts, types.ts, engine.ts, es3-parser.ts, skill-engine.ts, backend-sync.ts, room-sync.ts, backend-config.ts, skills.tsx, skill-tree.tsx, skill-tools/*, room.tsx, manufacturing.tsx, wiki.tsx, achievements.tsx, shared/* (except sidebar+app-shell).
- **4 views delivered**:
  1. 資料模型圖譜 (default) — 18 entity nodes + 14 relationship edges, zoom/pan, click-to-inspect side panel, hover highlighting, flowing edge animations, legend.
  2. 商品階層樹 — collapsible ProductGroup(19)→Tier(55)→Product(339) tree with search + expand/collapse all.
  3. 顧客-需求-商品 關係網 — pick 1 of 58 customer types → see demand chain (customer→necessities→products) with weight-sized nodes + product chips + stats panel.
  4. 製造鏈圖 — 30 manufacturing cards + detail flow diagram + "view all chains" full SVG.
- **Atlas renders with zero save dependency** — pure encyclopedia data. No hydration mismatches (no Date.now/random/window measurements; zoom/pan uses pointer offsets only). All SVG interactions use CSS transitions (no JS animation loops) except the keyframe-based pulse/flow animations which are CSS-only.
- `bun run lint` 0 errors; `bunx tsc --noEmit` src/ 0 errors. Dev server running on :3000 (system-managed, not restarted).
- Tricky logic notes:
  - `customerTypes → premiumProducts` edge has count=0 because no customer types in the data have premiumIndexes populated — the edge is structural (shows the relationship exists in the data model) but renders at minimum thickness. Accurate to the data.
  - Edge thickness uses `0.6 + log2(count+1)*0.5` capped at 5 — handles the wide range (0 to 339) gracefully.
  - Node radius uses `24 + log2(count+1)*4` capped at 48 — products(339) and customerTypes(58) get max radius; config(9) and layoutMeta(2) stay small.
  - Curved edges use quadratic bezier with perpendicular offset = `min(60, dist*0.18)` — gentle arcs that don't overlap nodes.
  - `customerDemandStats.totalProducts` deduplicates via Set (a product can satisfy multiple necessities).
  - `manufacturingChains` pre-indexes necessity + season product membership into Sets for O(1) lookup across all 30 chains.

---
Task ID: 12-qa
Agent: orchestrator (main) — cron webDevReview QA round
Task: End-to-end QA of Complete Game Atlas + TSV export, then commit.

Work Log:
- Verified lint 0 errors, tsc src/ 0 errors after Task 12-a + 12-b.
- agent-browser QA on Atlas page (new '遊戲圖譜' view):
  - Data Model Graph (View 1): SVG with viewBox=0 0 1200 800 renders correctly. 18 entity-type nodes in 3-ring layout, 14 relationship edges. Header shows "18 個資料實體 · 1573 條關係連結". Stats strip: 339 商品 · 55 階層 · 19 群組 · 58 顧客 · 44 技能 · 51 成就.
  - Product Hierarchy Tree (View 2): 19 product groups expandable — 基本產品s(7 tier/51商品), 乳製品(2/11), 汽水(3/21), 冷凍食品(2/13), 衛生(3/16), 清潔產品(2/14), 糖果和零食(7/42), 肉(1/7), 果醬(2/12) etc. 全部展開/全部收合 buttons work.
  - Customer-Necessity-Product Network (View 3): 58 customer types listed with demand weights — #0 Staple Groceries×1, Hygiene×0.25, Pharmacy×0.15; #1 Gardening×1.5, Drinks×1, Electronics×0.5 etc.
  - Manufacturing Chain (View 4): 30 manufacturing products with base→mfg flow — #0 基礎麵包→通心粉(20/需求成分), #1 全麥麵包→通心粉 etc. 查看全部製造鏈 toggle present.
  - Tab switching: Radix Tabs uses pointerdown events — agent-browser's .click() doesn't trigger them, but keyboard Enter/ArrowRight navigation works perfectly (real mouse clicks work fine for human users).
- TSV export verification:
  - Skills PerksTableView: clicked "下載 TSV" → download triggered, filename `skills-perks-2026-08-14.tsv`, blob URL created. ✓
  - Products Wiki: "下載 TSV" button found. ✓
  - Achievements: "下載 TSV" button found. ✓
- Full 19-page error sweep (all sidebar pages including Atlas): 0 console errors.

Stage Summary:
- Task 12-a (Complete Game Atlas) + Task 12-b (TSV export) both COMPLETE and QA-verified.
- All 19 pages: 0 errors. Lint 0, tsc src/ 0.
- User's original request items now complete: ✅ 7 strategy tools, ✅ Supabase backend (code ready), ✅ Complete Game Atlas (4 views), ✅ 44 skills TSV export, ✅ products TSV, ✅ achievements TSV.
- Ready to commit & push to GitHub.

---
Task ID: 1
Agent: general-purpose (sub)
Task: Fix SelectItem empty value bug — Radix Select <Select.Item/> must not receive empty string as value.

Work Log:
- Identified root cause in manufacturing.tsx: `addPick` state initialized as `useState<string>('')` (line 64), passed to `<Select value={addPick}>` (line 217). Radix treats empty string as invalid controlled value; placeholder requires `undefined`.
- Identified secondary risk: `<SelectItem value={m.id}>` where `m.id` could be empty string from room members array (line 382).
- Searched all `src/components/lab/` and `src/components/shared/` files for SelectItem and Select usage patterns.
- Found same pattern in 3 additional files: employees.tsx, store-layout.tsx, restock.tsx.

Changes Made:
1. **manufacturing.tsx**:
   - Line 64: `useState<string>('')` → `useState<string | undefined>(undefined)` for `addPick`.
   - Line 381: Added `.filter((m) => m.id)` before `.map()` on members array to guard against empty-string member ids in SelectItem.

2. **store-layout.tsx**:
   - Line 120: `useState<string>('')` → `useState<string | undefined>(undefined)` for `assignPlayerId`.
   - Line 797: Added `.filter((m) => m.id)` before `.map()` on `room.members`.

3. **employees.tsx**:
   - Line 686: `value={assigned ?? ''}` → `value={assigned || undefined}` — converts empty string to undefined so Select shows placeholder instead of invalid empty value.
   - Line 693: Added `.filter((m) => m.id)` before `.map()` on `members`.

4. **restock.tsx**:
   - Line 607: Added `.filter((m) => m.id)` before `.map()` on `room.members`.

Result: `bun run lint` passes clean with zero errors. The Radix console warning about empty string values should no longer appear.

---
Task ID: 4
Agent: skills-data-table-builder
Task: Build comprehensive 44 Skills Data Table

Work Log:
- Read worklog.md, skills.tsx, skill-engine.ts, skill-tools/types.ts to understand existing codebase patterns.
- Read i18n.ts, data-loader.ts, store.ts to understand data access and localization patterns.
- Read existing PerksTableView in skill-tree.tsx to understand the current table implementation.
- Created `src/components/lab/skill-tools/SkillsDataTable.tsx` with full-featured data table:
  - 8 columns: #, expand chevron, Name (localized), Skill ID, Category (colored badge), Effect (parsed), FP Cost, Status (unlocked/locked)
  - Full-text search across name, ID, effect text, and category
  - Multi-select category filter pills with counts
  - Click column headers to sort asc/desc (with sort indicator icons)
  - Export button to download filtered data as TSV
  - Click row to expand with detail panel showing raw effect string, parsed effects grid (metric, delta, raw), IL reference, perk index, and confidence badge
  - Zebra striping, sticky header, responsive horizontal scroll, max-h-600px scroll container
  - Uses shadcn/ui Table, Input, Button, Badge components and lucide-react icons
- Added 18 i18n keys under `skilllab.dt.*` prefix to `src/lib/i18n.ts` (both en and zhHant).
- Integrated SkillsDataTable into `src/components/lab/skills.tsx`:
  - Replaced PerksTableView import with SkillsDataTable import
  - Replaced PerksTableView usage in the "table" tab with SkillsDataTable
- Fixed ESLint react-hooks/static-components error by extracting SortIndicator as a standalone component outside render.
- Ran `bun run lint` — passes clean with zero errors.

Stage Summary:
- SkillsDataTable component fully functional at `src/components/lab/skill-tools/SkillsDataTable.tsx`
- 44 skills displayed with search, category filter, column sort, TSV export, and row expand/collapse
- i18n keys added (18 keys under skilllab.dt.*)
- Integrated as replacement for PerksTableView in the "44 技能總表" tab
- Lint passes clean, dev server compiles successfully

---
Task ID: SUPABASE-CONNECT
Agent: orchestrator (main)
Task: 用戶反映「已在 GitHub env 連接 Supabase 但網站沒看到效果」— 診斷並修復。

Work Log:
- 讀取 dev.log 發現 dev server 未在運行；檢查 .env 只有 DATABASE_URL，無 Supabase 變數。
- 確認根因：GitHub repo Settings 的環境變數只對 GitHub Actions 生效，本地 Next.js dev server 只讀本地 .env / .env.local 檔案，完全不會去 GitHub 拉環境變數。
- 建立 /home/z/my-project/.env.local（已被 .gitignore 擋住，不會推上 GitHub），填入用戶提供的 Supabase URL + anon key。
- 重啟 dev server，確認 log 顯示 "Environments: .env.local, .env"。
- 用 curl 測試 Supabase 後端連通性：
  - REST API base → HTTP 401（正常，無 Authorization header）
  - rooms / saves / members / events 四表 → 全部 HTTP 200（表存在、欄位正確）
  - verify_room_password RPC（正確參數 p_code/p_password）→ 回傳 false（非存在房間，正確行為）
- 確認 Supabase schema.sql 已完整部署，後端完全可用。
- 發現 dev server 在 sandbox 中會在 bash tool call 之間被清理；改用 setsid + exec daemon 模式 + 單次 call 內完成所有驗證。
- 用 agent-browser 開啟 http://127.0.0.1:81/（gateway → port 3000），點擊「多人房間」導航。
- 驗證 Room 頁面顯示綠色 banner：「Supabase 已連線 · 跨裝置同步啟用」+「CONNECTED」狀態 + 完整 Host/Member 表單。

Stage Summary:
- 根因：GitHub env ≠ 本地 dev server env。已修復：在 .env.local 填入 Supabase 變數。
- Supabase 後端（4 表 + RPC + RLS）已確認完全正常運作。
- Room 頁面已從「本地模式」橘色 banner 切換為「Supabase 已連線」綠色 banner。
- 跨裝置同步（建立/加入房間、存檔上傳、成員即時更新）現已可用。
- 注意事項：dev server 在此 sandbox 中需用 setsid daemon 模式啟動；每次新的 bash call 可能需重啟。

---
Task ID: VERCEL-SUPABASE-FIX
Agent: orchestrator (main)
Task: 用戶部署到 Vercel (https://supermarket-together-tool.vercel.app/) 後，即使設了 Supabase env vars，Room 頁面仍顯示「本地模式」。診斷並修復。

Work Log:
- 從 Vercel 部署的網站抓取所有 JS chunks（13 個初始 + 34 個 lazy-loaded），concat 成 3.5MB bundle 搜尋。
- 發現關鍵問題：deployed bundle 中 room+supabase chunk (4a989e681d73d8f8.js) 包含 supabase 程式碼（91 次 'supabase' 出現），但：
  - `vxypyrhrgehkkkwelguz` (project ref): **0 次**（應該要被 inline）
  - anon key: **0 次**（應該要被 inline）
  - 程式碼是 `v.default.env.NEXT_PUBLIC_SUPABASE_URL?.trim()||""` — 透過 module 47167 (process polyfill) 讀 env
  - process polyfill chunk (c31.js) 的 `o.env={}` — 空物件！
- 根因確認：Next.js 16 Turbopack **不會 inline** 透過 shared module 間接讀取的 `NEXT_PUBLIC_*` env vars。backend-config.ts 是 shared module（無 'use client'），export module-level constants `supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''`。Turbopack 把這個保留為 runtime process.env 存取，而 browser 的 process.env polyfill 是 {}，所以部署後永遠是空字串 → isSupabaseConfigured=false → 本地模式。
- 本地 dev 會動是因為 dev mode 的 process polyfill 有讀到 .env.local；production build 不會。

Fix:
- `src/lib/backend-config.ts`:
  - 加 `'use client'` 標記
  - 改 export getter functions: `getSupabaseUrl()`, `getSupabaseAnonKey()`, `getIsSupabaseConfigured()`
  - env 存取移到 function body 內（call-time evaluation），Turbopack 會在 client bundle 正確 inline
- `src/lib/backend-sync.ts`: import 改用 getters，`getSupabase()` 改 call-time 讀 env
- `src/lib/room-sync.ts`: import 改用 `getIsSupabaseConfigured`，mode 在 render 時 re-evaluate

驗證：
- `bun run lint` → 0 errors
- `bunx tsc --noEmit` → 0 errors in changed files（pre-existing errors 在 skills/ 和 SkillsDataTable 不相關）
- `bun run build` → 成功（19.3s compiled）
- 檢查 built chunk (05e643ce19fce2eb.js, 287KB):
  - `vxypyrhrgehkkkwelguz`: 1 次 ✅
  - anon key 完整 inlined ✅
  - minified code: `function v(){return"https://vxypyrhrgehkkkwelguz.supabase.co".trim()||""}` ✅
  - `getSupabaseUrl` / `getIsSupabaseConfigured` function names 已被 inline 消除（0 次）= build-time evaluated ✅

Stage Summary:
- 根因：Turbopack 不 inline shared module 的 NEXT_PUBLIC env（與 webpack 行為不同）
- 修復：env 存取移到 'use client' module 的 getter functions 內
- 本地 production build 已確認 env vars 正確 inline 進 client bundle
- commit ed1e112 已建立，待 push 到 GitHub → Vercel auto-redeploy → Room 頁面會顯示綠色 banner
- 用戶下一步：push commit 到 GitHub（需新 PAT，舊的已暴露建議 revoke）

---
Task ID: LAYOUT-REWRITE
Agent: full-stack-developer
Task: Rewrite store-layout.tsx with two-layer SVG map (level0 structure + save activity)

Work Log:
- Read worklog.md (project context: Supermarket Together Lab — Next.js 16 + TS + Tailwind + shadcn/ui), level0-types.ts (300 structure objects in 8 categories), and current store-layout.tsx (1027 lines — leaderboard, prop detail card, highlight modes, efficiency stats).
- Verified level0-geometry.json data shape: 30 floor tiles on a 5×6 grid, 37 outerWall segments, 42 pillars, 143 beams, 12 lights, 3 vents, 30 ceiling tiles, 3 wallTop strips. Store bounds: X[-15,15], Z[-3,48].
- Verified save.json's DoorStates structure: `decoded.DoorStates.value.array` is `[{__type:'int', value:N}, ...]` with 4 entries. The es3-parser already extracts this into `snapshot.doorStates: number[]`. The provided upload/save.json has values [2, 0, 1, 1] = [auto, closed, open, open].

Changes Made:

1. **src/lib/i18n.ts** (+72 lines, append-only):
   - Added `LAYOUT_STRINGS` constant with 27 keys under `layout.*` prefix:
     - `layout.layer.{structure,activity,ceiling,doors}` — layer toggle labels
     - `layout.layers.label`, `layout.zoom.{label,in,out,reset,level}` — toolbar chrome
     - `layout.hint.pan`, `layout.entrance`, `layout.back` — map orientation hints
     - `layout.legend{,.structure,.activity,.ceiling,.doors}` — legend headings
     - `layout.struct.{floor,outerWall,wallTop,pillar}` — structure element labels
     - `layout.ceil.{ceiling,beam,light,vent}` — ceiling element labels
     - `layout.door.{label,states,closed,open,auto,unknown,noSave}` — door state labels
   - Exported `layoutLabel(key, lang)` resolver and `useLayoutLabel()` hook.

2. **src/components/lab/store-layout.tsx** (1027 → 1689 lines):
   - Added imports: `useRef` from react, `layoutLabel` from i18n, `level0Geometry`/`storeBounds`/`structureByCategory`/`DOOR_POSITIONS`/`doorStateFromInt`/`StructureObject`/`DoorState` from level0-types, `ZoomIn`/`ZoomOut`/`Maximize`/`DoorOpen` from lucide-react.
   - Added `DOOR_COLORS` map (closed→#ef4444, open→#22c55e, auto→#3b82f6, unknown→#9ca3af).
   - Added `DEFAULT_LAYERS` ({structure:true, activity:true, ceiling:false, doors:true}) and `LayerState` type.
   - Added `VIEW_PAD=2` constant for viewBox padding.
   - Replaced `bounds` useMemo to prefer `storeBounds` (full Unity scene) over shelf-derived bounds, with fallback.
   - Added `doorStates` useMemo: reads `snapshot.doorStates` first, falls back to raw extraction from `snapshot.decoded.DoorStates.value.array` via typed cast.
   - Added `structureGroups` useMemo pre-computing per-category arrays from `structureByCategory`.
   - Added `layers` state + `ToggleGroup type="multiple"` for layer visibility (4 buttons).
   - Added zoom/pan state: `scale` (0.4–8), `pan` ({x,y}), `isDragging`, `dragRef`, `svgRef`.
   - Implemented `clientToSvg()` using `svg.getScreenCTM().inverse()` + `createSVGPoint()` for cursor→world coord conversion (handles viewBox + Y-flip).
   - Implemented `handleWheel()` for cursor-anchored zoom (solves newPan = cursor - actualFactor*(cursor - pan)).
   - Implemented pointer drag handlers with 0.15-unit movement threshold before activating drag (so simple clicks on shelves still fire their onClick — setPointerCapture only called when actual drag begins).
   - Rewrote SVG section with new structure:
     - `<defs>`: grid pattern + radial gradient `lightGlow` for ceiling lights.
     - Background grid `<rect>` (full viewport, not flipped).
     - Zoom/pan wrapper `<g transform="translate(pan) scale(scale)">`.
     - **Y-flip wrapper** `<g transform="matrix(1 0 0 -1 0 minZ+maxZ)">` so entrance (Z=-3) appears at the BOTTOM of the map.
     - **Structure layer** (new `StructureLayerView` component): full-floor muted rect, 30 floor tiles (5×8 rects with slate-200/slate-800 dark mode), 4 perimeter walls as thick strokes (front wall has 4 door gaps at X=-9/-3/3/9), 37 outerWall markers, 3 wallTop highlights, 42 pillars (0.6×0.6 slate-500 squares).
     - **Ceiling layer** (opacity 0.4, pointerEvents none): 30 ceiling tiles (translucent slate-300), 143 beams (3×0.16 slate-600 rects), 12 lights (radialGradient halo + amber center), 3 vents (0.7×0.7 blue squares).
     - **Activity layer** (existing shelves): rotated rect with `-prop.angle` (negated to compensate for Y-flip), keep existing click-to-select + assigned-player ring + highlight modes. Text labels extracted OUTSIDE the flip wrapper to keep glyphs upright.
     - **Door layer**: 4 doors at DOOR_POSITIONS, each with swing arc path + horizontal leaf rect + center indicator dot, colored by `doorStateFromInt(doorStates[i])`.
     - **Text layer** (outside flip wrapper): shelf count labels + prop index, door labels ("門 1".."門 4") + state text (關閉/開啟/自動/未知), entrance "入口 ↓" and back "店面後方" orientation labels.
   - Enhanced legend: 4 sections (shelves/structure/doors/ceiling) with colored swatches and labels; door legend shows raw save values `[2, 0, 1, 1]` or "未載入存檔" fallback; ceiling legend only shown when ceiling layer is toggled on.
   - Added zoom controls (ZoomOut/ZoomIn/Reset buttons + percentage display).
   - Added `StructureLayerView` component (156 lines) at bottom of file.

Quality Verification:
- `bun run lint` → 0 errors (initial ref-during-render error fixed by adding `isDragging` state instead of reading `dragRef.current` in render).
- `bunx tsc --noEmit` → 0 errors in store-layout.tsx and i18n.ts (only pre-existing errors in skills/ folder and SkillsDataTable.tsx).
- agent-browser end-to-end test on http://localhost:3000/ → store-layout page renders cleanly:
  - "店面平面圖分析" heading + bounds display "範圍 X[-15, 15] · Z[-3, 48]" ✓
  - Layer toggle group with 4 buttons (結構層/活動層/天花板層/大門) — clicking 天花板層 reveals ceiling legend (天花板板/橫樑/燈具/通風口) ✓
  - Zoom controls work (100% → 120% after clicking 放大) ✓
  - 41 SVG shelf groups render with click handlers — clicking opens detail card (posX/posZ/angle/總單位/庫存清單) ✓
  - 4 doors render with "門 1".."門 4" labels + "未知" state (no save loaded) ✓
  - "入口 ↓" orientation label at bottom ✓
  - Legend shows all 4 sections with correct colors ✓
  - Language switch EN: all labels translate (Structure/Activity/Ceiling/Doors/Zoom/Reset/Entrance/Closed/Open/Auto/Unknown) ✓
  - 0 console errors after all interactions ✓

Stage Summary:
- Store Layout page enhanced from a single-layer SVG (shelves only) to a full two-layer map combining level0 static structure (300 Unity scene objects) + save.json dynamic activity (shelves + door states).
- New toggleable layers: Structure (default on), Activity (default on), Ceiling (default off, opacity 0.4 overlay), Doors (default on).
- New zoom/pan: cursor-anchored wheel zoom (0.4×–8×), pointer drag pan with 0.15-unit click-vs-drag threshold (preserves shelf click-to-select).
- Y-flip wrapper puts entrance at bottom of map (intuitive UX); text labels rendered outside flip wrapper to stay upright.
- Door states read from `snapshot.doorStates` (populated by es3-parser from `decoded.DoorStates.value.array`); 4 doors colored red/green/blue/gray for closed/open/auto/unknown.
- 27 new i18n keys under `layout.*` prefix (both en + zhHant); language switcher tested and verified.
- All existing functionality preserved: leaderboard table, prop detail card, highlight modes (8), efficiency stats, room shelf assignment, Top 5 problematic shelves, recommended swaps.
- `bun run lint` 0 errors; `bunx tsc --noEmit` 0 new errors in changed files; agent-browser end-to-end QA green (0 console errors, all toggles + zoom + click + language switch verified).

---
Task ID: LEVEL0-EXTRACT
Agent: orchestrator (main)
Task: 依照用戶提供的 level0 靜態結構規格，從 Unity level0 場景檔提取結構幾何，整合到店面平面圖。

Work Log:
- 安裝 UnityPy 1.25.3 (pip install --break-system-packages UnityPy)
- 撰寫 /home/z/my-project/scripts/extract-level0.py：
  - 載入 upload/level0 (2.5MB Unity binary scene, 5734 objects, 1185 GameObjects)
  - 走訪每個 GameObject 的 m_Transform，沿 m_Father 鏈累加 m_LocalPosition 計算世界座標
  - 跳過 RectTransform (UI 物件，696 個)
  - 用 (名稱 regex + Y 高度) 分類為 8 種結構類別 + 2 層 (ground/ceiling)
  - strip Unity 自動加的 "(N)" 後綴
- 產出 /home/z/my-project/src/data/level0-geometry.json (300 個結構物件)
- 驗證分類計數完全符合用戶規格：
  - floor: 30 (25 UModeler_Floor + 5 UModeler_Floor2) ✅
  - outerWall: 37 (19 OuterLargeWall + 17 SmallOuterWall + 1 CrossWall) ✅
  - wallTop: 3 ✅
  - pillar: 42 (16 Tee + 2 Corner + 24 BeamCross) ✅
  - ceiling: 30 (25 Ceiling + 5 Ceiling2) ✅
  - beam: 143 (101 Beam + 24 BeamCross + 16 BeamTee + 2 BeamLeft) ✅
  - light: 12 (6 Point Light + 6 Neon) ✅
  - vent: 3 ✅
- bounding box: X[-15, 15], Z[-3, 48]
- 建立 /home/z/my-project/src/lib/level0-types.ts：
  - StructureObject / StructureCategory / StructureLayer types
  - level0Geometry / storeBounds / structureByCategory exports
  - DOOR_POSITIONS (4 門位置: X=-9/-3/3/9, Z=-3)
  - doorStateFromInt() (0=closed, 1=open, 2=auto)

Stage Summary:
- level0 靜態結構完全提取，300 物件分 8 類，計數 100% 符合規格
- Python 腳本可重複執行 (python3 scripts/extract-level0.py)
- TypeScript types + loader 已就緒供前端使用
- commit 待建立

---
Task ID: LAYOUT-REWRITE
Agent: full-stack-developer (sub)
Task: 重寫 store-layout.tsx，加入兩層 SVG 地圖 (level0 結構層 + save 活動層 + 天花板層 + 大門層)

Work Log:
- 讀取 worklog.md、level0-types.ts、現有 store-layout.tsx (1026 行)
- 擴充 src/lib/i18n.ts：新增 27 個 layout.* i18n keys (en + zhHant)
- 重寫 src/components/lab/store-layout.tsx (1027 → 1689 行)：
  - Y 軸翻轉 wrapper (matrix(1 0 0 -1 0 minZ+maxZ)) 讓入口 (Z=-3) 在底部
  - 結構層：地板矩形 + 30 floor tiles + 4 面周界牆 (前牆有 4 門缺口) + 37 outerWall + 3 wallTop + 42 pillars
  - 天花板層 (可切換, opacity 0.4)：30 ceiling + 143 beams + 12 lights (radial-gradient glow) + 3 vents
  - 活動層：保留現有貨架渲染 (rotation 取負補償翻轉)
  - 大門層：4 門 at DOOR_POSITIONS，swing arc + leaf rect + 狀態色 (red=closed, green=open, blue=auto, gray=unknown)
  - 文字層在翻轉 wrapper 外，保持字元直立
  - 工具列：4 圖層 toggle (ToggleGroup multiple) + 縮放控制 (ZoomOut/In/Reset + 百分比)
  - 滑鼠滾輪縮放 (0.4×–8×) + 拖拽平移 (0.15-unit click-vs-drag threshold 保留貨架點擊)
  - 4 段圖例 (貨架/結構/大門/天花板) 含大門 save 值顯示
  - 大門狀態從 snapshot.doorStates 讀取，fallback 到 decoded.DoorStates.value.array
- 驗證：
  - bun run lint → 0 errors
  - bunx tsc --noEmit → 0 new errors in changed files (僅 pre-existing skills/ 錯誤)
  - agent-browser QA：頁面正常渲染、所有 toggle 可用、縮放可用、貨架點擊→詳情卡片、語言切換、0 console errors

Stage Summary:
- 兩層 SVG 地圖完成：結構層 (牆地柱) + 活動層 (貨架) + 天花板層 (可切換) + 大門層 (狀態色)
- 範圍顯示 X[-15, 15] · Z[-3, 48] 與 level0 bounding box 一致
- 4 個大門標籤 (門 1-4) 正確顯示
- demo save 載入後貨架資料正確渲染
- 保留所有原有功能 (leaderboard、detail card、highlight modes、智慧建議)

---
Task ID: LEVEL0-QA
Agent: orchestrator (main)
Task: 獨立驗證 level0 整合 + 兩層地圖的完整性

Work Log:
- bun run lint → 0 errors ✅
- bunx tsc --noEmit → 僅 pre-existing SkillsDataTable 錯誤，changed files 0 errors ✅
- agent-browser 開啟 http://127.0.0.1:81/ → 點「店面平面圖」→ 頁面正常渲染
- 驗證頁面元素：
  - 標題「店面平面圖分析」✅
  - 範圍「X[-15, 15] · Z[-3, 48]」✅ (與 level0 bbox 一致)
  - 4 個圖層 toggle：結構層/活動層/天花板層/大門 ✅
  - 縮放控制：縮小/放大/重設 + 百分比顯示 ✅
  - 8 個高亮模式 radio ✅
  - SVG 地圖含多個可點擊貨架 group ✅
- 互動測試：
  - 天花板層 toggle ON/OFF ✅
  - 大門 toggle ON/OFF ✅
  - 縮放放大/重設 ✅
  - 點擊貨架 → 詳情卡片 (貨架 #0, 放置模式, 總庫存單位, 庫存清單) ✅
  - 4 個大門標籤 (門 1-4) 顯示 ✅
  - 圖例含貨架/結構/大門/天花板段落 ✅
- console errors → [] (0 個) ✅
- dev.log → 無 ⨯ 或 error: 行 ✅
- 載入 Demo Save → 來源切換為 "save (demo:derived-from-storeLayout)" ✅

Stage Summary:
- 兩層地圖 + level0 結構整合完全驗證通過
- 0 lint errors, 0 console errors, 0 runtime errors
- 所有互動 (圖層切換、縮放、貨架點擊、demo 載入) 正常
- 用戶可在 Preview Panel 點「店面平面圖」查看結果

---
Task ID: PROPDAT-FIX
Agent: orchestrator (main)
Task: 修復活動層貨架冰箱商品架等全部識別錯誤的問題（用戶反映「位置全部正確了，但是活動層那些貨架冰箱商品架等等等等全部識別錯誤」）

Work Log:
- 根因分析：Python extractor v1.0 解析 propdata 時把 parts[0]（zoneCode）誤讀為 buildableId。由於主店 zone=0 佔多數，44/57 個 prop 的 buildableId 都變成 0（Placement Mode），而非真實的 containerID（1=Product Shelf, 2=Basic Fridge, 3=Double Fridge…）。
- 驗證：upload/save.json 的 decoded.propdata0 = "0|1|-1,430456|0|4,553804|89,99998" → zone=0, containerID=1 (Product Shelf)，但 store_layout.props[0].buildableId=0（錯誤）。
- 正確格式（依用戶規格）：`zoneCode|containerID|posX|rotation|posZ|angle`，parts[0]=zoneCode, parts[1]=containerID。

修改的檔案：

1. **src/lib/types.ts** — LayoutProp 新增 `containerID: number` + `zoneCode: number` 欄位（containerID === buildableId，兩者同步；zoneCode 來自 parts[0]）。

2. **src/lib/data-loader.ts**：
   - 新增 `containerByID` Map（42 個容器，以 containerID 為 key）
   - 新增 `containerInfoFor(containerID)` 查詢函式
   - 新增 `ContainerClassKey` 型別（8 類：shelf/fridge/freezer/produce/pegboard/storage/checkout/decoration）
   - 新增 `CONTAINER_CLASS_META`（每類的 labelZh/labelEn/color）
   - 新增 `containerClassKeyFor(containerID)` 將 containerClass 數字（0/1/2/3/4/69/99）轉為 class key
   - 新增 `normalizeLayoutProps()` 執行時期補欄位（確保舊資料的 containerID/zoneCode 存在）

3. **src/lib/es3-parser.ts**：
   - `parsePropData()`：修正讀取 parts[0]=zoneCode, parts[1]=containerID（之前 parts[1] 是對的但沒有 zoneCode）；回傳 {buildableId, containerID, zoneCode, posX, posZ, rotation, angle}
   - `parseExtractedSave()`：改為從 `decoded.propdata{N}` 重新解析（source of truth），不再信任預處理的 `store_layout.props[].buildableId`；fallback 才用預處理值

4. **scripts/fix-layout-props.ts**（新檔）：
   - 一次性修補腳本：從 upload/save.json 的 decoded.propdata 重新推導正確 containerID
   - 用最近鄰匹配（tolerance=0.6 世界單位）將 encyclopedia.json + demo-save.json 的 storeLayout props 修補為正確 containerID + zoneCode
   - 結果：41/41 props 全部匹配，10 種容器類型（之前只有 4 種且大多錯誤）

5. **src/lib/data/encyclopedia.json** + **src/lib/data/demo-save.json**：
   - 修補前 buildableId 分佈：{0:28, 1:8, 2:1, 3:4}（28 個錯誤為 Placement Mode）
   - 修補後 containerID 分佈：{1:19, 2:1, 3:3, 4:1, 5:5, 7:1, 10:3, 12:4, 14:3, 19:1}（10 種正確類型）

6. **src/components/lab/store-layout.tsx**（主要渲染修改）：
   - 移除 `BUILDABLE_PALETTE`（舊的 4 色按 buildableId 對應），改用 `propColor(containerID)` 透過 `containerClassKeyFor` → `CONTAINER_CLASS_META` 取得 class-based 顏色（8 色）
   - 新增 `propFootprint(containerID)`：從 containerInfo 取真實 shelfLength/shelfWidth
   - 新增 `propDrawSize(containerID, angle)`：90°/270° 時長寬互換（補償旋轉）
   - 活動層 rect 改用真實尺寸（Product Shelf = 1.82×0.44，之前固定 0.6×0.4）
   - 冰箱/冷凍櫃（class 1/2）加上白色玻璃門指示條紋
   - 文字層 #index 標籤位置改用真實尺寸
   - 圖例改顯示 8 種容器類別（貨架/冰箱/冷凍櫃/農產品/釘板架/置物架/結帳台/裝飾物）+ 顏色色塊
   - PropDetailCard：標題改為「物件 #N」+ class badge；新增區域(Zone)/尺寸(Size)/成本(Cost)/耗電(Energy)/ID badges；未對應 ID 顯示「裝飾物 #ID (unmapped id)」
   - 排行榜表頭 "Buildable" → "容器/Container"
   - 排行榜 + Top 5 問題貨架改用 `propLabel()` + `propColor()`
   - 新增 `propLabel()`：用 container.buildableName 或 buildable 的在地化名稱；未對應 ID 顯示「裝飾物 #ID」
   - 新增 `zoneLabel()`：zoneCode → 主店/倉儲/結帳/自助結帳

7. **src/components/shared/app-shell.tsx**：
   - `Layout`（store-layout）改為 eager import（非 lazy）— 避免在 4GB 記憶體環境 on-demand chunk compilation 時 OOM
   - `VIEW_COMPONENTS` 型別放寬為 `React.ComponentType | React.LazyExoticComponent`

驗證：
- `bun run lint` → 0 errors ✅
- `bunx tsc --noEmit` → 0 errors in changed files ✅
- 測試腳本（/tmp/verify-fix.ts）：re-parsed save.json 顯示 11 種容器類型（30×Product Shelf, 1×Basic Fridge, 4×Double Fridge, 2×Freezer, 5×Storage Shelf, 1×Checkout Left, 3×Storage Shelf Unlabeled, 4×Self-checkout, 4×Product Shelf Half, 2×Pegboard Shelf, 1×Corner Shelf Big）+ 4 種 zone（44 主店, 8 倉儲, 1 結帳, 4 自助結帳）✅
- SSR HTML 驗證（curl）：
  - 8 種容器類別標籤全部出現（貨架44, 置物架11, 冰箱6, 釘板架1, 農產品1, 裝飾物1, 結帳台1, 冷凍櫃1）✅
  - 8 種 class 顏色全部出現（#10b981×48, #71717a×18, #a855f7×12, #0ea5e9×9, #94a3b8×5, #06b6d4×3, #f59e0b×2, #84cc16×1）✅
  - 真實貨架尺寸 height="1.82" 出現 17 次（Product Shelf length，90°/270° 旋轉）✅
  - 冰箱門指示條紋 fill-opacity="0.45" 出現 5 次（1 Basic Fridge + 3 Double Fridge + 1 Freezer）✅
  - Zone 標籤出現（自助結帳×4, 結帳×2）✅
- agent-browser QA（部分，伺服器因 4GB OOM 不穩定）：
  - 頁面載入「店面平面圖分析」標題 ✅
  - 4 圖層 toggle（結構層/活動層/天花板層/大門）✅
  - 縮放控制（縮小/放大/重設）✅
  - 8 高亮模式 radio ✅
  - 排行榜顯示「物件 #28 · 置物架」「物件 #32 · 置物架」等正確容器名稱 ✅
  - 0 console errors, 0 page errors ✅

Stage Summary:
- 根因：propdata 解析把 parts[0]（zoneCode）誤讀為 buildableId，導致 44/57 個 prop 被識別為「Placement Mode」
- 修復策略雙管齊下：(1) parser 層從 decoded.propdata 重新解析（確保未來上傳的存檔正確）；(2) 一次性修補腳本修正已打包的 encyclopedia.json + demo-save.json 靜態資料
- 渲染層全面升級：class-based 8 色系統、真實貨架尺寸（shelfLength×shelfWidth）、90° 旋轉長寬互換、冰箱門指示條紋、區域標籤、裝飾物 ID 處理
- 從 4 種錯誤類型（28 個 Placement Mode）→ 10 種正確容器類型（Product Shelf, Basic Fridge, Double Fridge, Freezer, Storage Shelf, Checkout, Self-checkout, Product Shelf Half, Pegboard Shelf, Corner Shelf Big）

---
Task ID: CRON-REVIEW-1
Agent: orchestrator (main)
Task: 定期 QA + 自主開發 — 驗證 propdata 修復 + 新增容器類型分佈 + 區域分佈 + 佈局類型偵測

Work Log:
- 讀取 worklog.md 了解專案狀態：已完成所有主要功能（18 頁、i18n、Supabase、兩層地圖、propdata 修復等），待處理：socket.io 清理、技能解鎖狀態、佈局類型偵測、製造解鎖顯示
-.lint + tsc 驗證 → 0 errors ✅
- SSR 驗證 store-layout 頁面 → 所有 8 種容器類別、顏色、真實尺寸確認正確 ✅
- agent-browser 部分 QA：頁面載入「店面平面圖分析」、圖層 toggle、縮放控制、8 高亮模式、排行榜顯示正確容器名稱（「物件 #28 · 置物架」「雙冰箱」等）、0 console errors ✅
- 清理 socket.io：移除 `socket.io` + `socket.io-client` packages、刪除 `mini-services/room-service/` ✅

新增功能（store-layout.tsx）：

1. **容器類型分佈** (Container Type Distribution)：
   - 新增「容器類型分佈」區段，按 class 分組統計每種容器的：數量、佔比(%)、庫存單位、貨架價值
   - 以對應的 class 顏色色塊標示，按數量降序排列
   - 例如：貨架 46.3% 19× 120u $240、置物架 26.8% 11× 0u $0...

2. **區域分佈** (Zone Distribution)：
   - 新增「區域分佈」區段，按 zoneCode 分組統計每個區域的：數量、佔比(%)、庫存單位
   - 4 種區域各有對應顏色（主店=emerald, 倉儲=amber, 結帳=purple, 自助結帳=cyan）

3. **佈局類型偵測** (Layout Type Detection)：
   - 從 `snapshot.layout` 讀取：0=經典(Classic), 1=廣場(Plaza)
   - 在 SectionHeader 右側顯示佈局類型 Badge（secondary variant）
   - 描述列新增 `N container types` 統計

4. **Header 增強**：
   - description 加入 `uniqueClasses container types` 計數
   - right 改為 flex row：佈局類型 Badge + props Badge

所有修改：
- bun run lint → 0 errors ✅
- bunx tsc --noEmit → 0 errors in changed files ✅

Stage Summary:
- socket.io 完全清除（package + mini-services）
- store-layout 新增 3 個分析區段（容器類型分佈 + 區域分佈 + 佈局類型偵測）
- 所有容器類型正確識別，渲染驗證通過
- 開發環境 4GB RAM OOM 仍為已知風險（store-layout 已 eager import 緩解）
