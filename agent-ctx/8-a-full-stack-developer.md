# Task 8-a — full-stack-developer

## Task
重構 5 個 lab 頁面（wiki / profit / pricing / salt / restock）改用 i18n 層的本地化名稱；同時簡化 Profit Lab 的散佈圖為「排行榜橫條圖 / 散佈圖」雙檢視。

## Contracts Read
- `src/lib/i18n.ts` — `useLang()` hook + 14 個純函式 resolver（`productNameFor` / `productNameOnly` / `groupIdNameFor` / `seasonIdNameFor` / `necessityIdNameFor` / `manufacturingIdNameFor` 等）。
- `src/lib/store.ts` — `Lang` type（`'zhHant' | 'en' | 'both'`），UI store 的 `lang` 欄位。
- 5 個既有 lab 元件結構（wiki 864 行 / profit 590 行 / pricing 912 行 / salt 589 行 / restock 692 行）。

## Implementation Notes
- 5 個檔案全部加入 `const lang = useLang()` 在元件頂端，子元件也各自 `useLang()`。
- `useMemo` 內若有計算名稱字串，`lang` 加入 deps（profit scatterData/notableLabels、restock buildMarkdown）。
- **profit.tsx 簡化**：新增 Tabs（「排行榜」預設 +「散佈圖」進階）；排行榜 tab 用新的 `MetricBarCard` 元件顯示 4 張 Top-10 CSS 橫條圖（單箱價值/價值密度/需求/加權），bar 顏色 = group 顏色、可點擊跳到 wiki；散佈圖保留原圖但加 amber 中文進階說明。
- **salt.tsx**：SimRun interface 的 `top5`/`topMissing` 移除 `name` 欄位（避免 stored state 在 lang 切換後不更新），render 時用 `productNameFor` 即時解析。
- **restock.tsx**：`buildMarkdown` 函式新增 `lang: Lang` 參數；`negativeEntries` 移除 `productName` 欄位。
- **型別修正**：`Lang` 不在 `@/lib/i18n` re-export，profit.tsx 與 restock.tsx 改為 `import type { Lang } from '@/lib/store'`。
- 修正 pricing.tsx 的 React hooks 順序：`PlayerPriceEditor` 的 `useLang()` 移到 early return 之前（避免 conditional hook call）。
- 移除 salt.tsx 未使用的 `computeDemandProxy` import（pre-existing dead import）。

## Files Modified
- `src/components/lab/wiki.tsx`
- `src/components/lab/profit.tsx`
- `src/components/lab/pricing.tsx`
- `src/components/lab/salt.tsx`
- `src/components/lab/restock.tsx`

## Verification
- `bun run lint` → 0 errors
- `bunx tsc --noEmit` → 0 errors in owned files（只剩 skills/ 2 個 pre-existing 無關錯誤）
- 完整工作紀錄已 append 到 `/home/z/my-project/worklog.md`（Task ID: 8-a 段落）。
