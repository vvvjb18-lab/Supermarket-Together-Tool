# 功能優化規劃（Feature Optimization Plan）

> 生成：2026-08-16 ｜ 資料源：usage-audit（115 個 src 檔）× linkage-audit
> 目標：把「數據浪費」同「功能缺口」對齊，排出可執行的優化順序 + 驗收標準。

---

## 1. 現狀：功能 × 數據覆蓋

| 功能頁 | 用咗咩數據 | 缺口（嚴重度） | 對應工具 |
|---|---|---|---|
| dashboard | encyclopedia 全套 + save snapshot | 冇天氣/季節建議、冇破產倒數 | D7 |
| profit | 商品利潤（basePrice + 通脹） | 已修（上 commit 接真實通脹） | — |
| pricing | 定價表 + demand proxy | 未用 stats 真實銷量校正 | D3 |
| restock | 補貨優先（demand proxy） | 未串真實 7 天銷量 | D3 |
| salt | 58 顧客需求 | 冇必需品×解鎖×缺貨交叉 | D8 |
| simulator | NPC 行為流 + 客流公式 | 未串 tier×訂單經濟 | — |
| stats | 37 天真實 P&L | 已修（接 tier inflation + best/worst day） | — |
| manufacturing | 30 配方 + queue + ROI proxy | **配方 ROI 用單商品近似** | D1 |
| skills / skill-tools | 44 技能 + 圖譜 | **effect 非 IL 真值**、NextStep 已讀存檔 | D2 |
| skill-tree | 技能圖譜 | **join 只對到 40/44**、缺 skill40-43 | D6 |
| seasons | 季節商品可用性 | 冇真實銷量排行 | D3 |
| exploits | 12 條手工策展 | 已加 3 條（通脹套利/壞天/折扣） | D4（互動化） |
| employees | 員工 roster | 冇僱用/訓練建議 | D5 |
| online-orders（新） | 訂單經濟 + 天氣 + 技能43 | 已做 | — |

---

## 2. 功能缺口（應開發但冇）

| 缺口 | 影響 | 優化項 |
|---|---|---|
| 製造頁 ROI 用單商品近似 | 玩家睇到嘅 ROI 唔準，可能揀錯配方 | D1 |
| 技能效果冇 IL 真值 | skill 40–44 描述模糊，推薦器效果唔準 | D2 |
| 季節頁冇真實銷量 | 季節性補貨全靠估 | D3 |
| 通脹套利只有文字 | 冇得算具體套利幅度 | D4 |
| 員工頁冇建議 | 僱錯人、練錯技 | D5 |
| 技能樹 join 錯位 | 最強 4 個 perk（40-43）可能顯示錯/缺 | D6 |
| dashboard 冇今日行動 | 開站要逐頁搵 | D7 |
| 需求矩陣散落 | 缺貨診斷唔完整 | D8 |
| 通脹對沖冇表 | 囤貨決策冇依據 | D9 |

---

## 3. 優化順序（建議）

```
Phase 0（數據回流，地基）—— D1 + D2
   ↓ 補齊製造配方 + perk 效果，讓其他工具食真數據
Phase 1（高價值串聯）—— D3 + D4 + D5
   ↓ 季節銷量 + 通脹套利 + 員工配置
Phase 2（正確性 + 導覽）—— D6 + D7
   ↓ 修技能圖譜 join bug + dashboard Hero Card
Phase 3（深度）—— D8 + D9
```

理由：D1/D2 係「數據浪費」的直接修復，且 D3/D4/D5 都依賴佢哋回流後嘅真值（例如 D3 季節銷量排行要用 tier 通脹算真實毛利、D5 員工建議要用 perk 5/6 速度加成嘅真 effect）。

---

## 4. 每項驗收標準（統整）

| 項目 | 驗收標準（可勾選） |
|---|---|
| D1 | `manufacturing-recipes.json` 存在；ROI 用真實 input→output；`inputCost` 唔再係單商品近似；tsc/lint/build 過 |
| D2 | `perk-effects.json` 存在；skill-tools effect 讀真值；skill 40–44 效果補齊；附 raw_il 溯源 |
| D3 | `seasons.tsx` 每季顯示真實銷量 Top N；實作 `getSeason(day)` |
| D4 | 通脹套利互動計算器（揀 tier → 買入/賣出/套利 %） |
| D5 | `employees.tsx` 加僱用/訓練建議卡，讀真實 level |
| D6 | `skillgraph↔skill` 覆蓋率 100%；skill40-43 正確顯示；加 id 正規化 helper |
| D7 | dashboard 頂部 Hero Card：開店/衝訂單/補貨 X 建議 + 公式 |
| D8 | 需求矩陣視圖：每顧客類型缺貨商品 + 補貨建議 |
| D9 | 通脹對沖表：低 tier 囤貨清單 × 套利幅度 × 買入時機 |

---

## 5. 執行紀律（勾選後才動工）

1. `git checkout -b feat/<項目>`（唔直接 push main）。
2. 純函式（engine/parser）補單元測試；數據回流補「欄位一致」測試。
3. `npx tsc --noEmit` → `npm run lint` → test → `npm run build` 全過。
4. push + 開 PR（target `main`），PR 附「數據來源 + join key + 驗收標準勾選」。

---

## 6. 建議的下一批（本輪交付建議）

> 若要一次做完但範圍可控，建議本輪 = **P0（D1+D2）+ P1 的 D3**：
> - D1/D2 係純數據回流（加 2 個 JSON + 改 2 個消費端），風險低、回報最高。
> - D3 係第一個真正「串聯」工具，展示「真實銷量 × tier × 季節」的價值。
> - 其餘 D4–D9 排下一輪，避免一次改太多 UI。

**等你確認後先開分支執行。**
