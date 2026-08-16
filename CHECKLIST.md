# 數據價值審計 — 總清單（CHECKLIST）

> 生成日期：2026-08-16
> 審計對象：`supermarket-tool-temp`（網站，Next.js 16，22+ 功能頁）× `save-analyzer`（遊戲數據挖掘工作區）
> 方法：**腳本驅動**（4 支審計腳本），不直接讀大型原始檔
> 狀態：**待確認** — 以下所有「建議工具」尚未動工，等你勾選才執行

---

## 0. 審計方法（已交付的腳本）

| 腳本 | 路徑 | 用途 | 產出 |
|---|---|---|---|
| `data-inventory.ts` | `scripts/audit/data-inventory.ts` | 列出所有數據檔案並分類 | `scripts/audit/_out/inventory.json` |
| `data-profile.ts` | `scripts/audit/data-profile.ts` | 分析欄位/schema/樣本 | `scripts/audit/_out/profile.json` |
| `data-usage-audit.ts` | `scripts/audit/data-usage-audit.ts` | 檢查代碼引用哪些數據（找「浪費」） | `scripts/audit/_out/usage-audit.json` |
| `data-linkage-audit.ts` | `scripts/audit/data-linkage-audit.ts` | 找跨表 join key（找「串聯機會」） | `scripts/audit/_out/linkage-audit.json` |

執行方式（從 repo root）：

```powershell
node scripts/audit/data-inventory.ts
node scripts/audit/data-profile.ts
node scripts/audit/data-usage-audit.ts
node scripts/audit/data-linkage-audit.ts
```

---

## 1. 審計結論（一頁摘要）

| 指標 | 數字 |
|---|---|
| 掃描總檔案 | **371**（save-analyzer 362 / 網站打包 6 / public 3） |
| 資料資產 | **88**（網站打包 7 + 挖掘產物 38 + IL 中間 43） |
| 網站主數據 `encyclopedia.json` | 19 個欄位、339 商品 / 55 tier / 58 顧客 / 44 技能 / 51 成就 / 30 製造 |
| 偵測到 join key | **16 個**，其中 15 個 100% 對齊，1 個（技能圖譜）90.9% |
| 未利用（raw 檔） | **12 個**（5 個真浪費、7 個已遷移/被取代） |
| 真實數據斷鏈 | **2 處**：① 30 條製造配方未回流；② `perk_effects_final` 44 perk 只有 perk 43 被硬編碼 |

**一句話結論**：最值錢的三塊數據 —— ① 真實 tier 通脹（已接入）、② 線上訂單×壞天氣×技能43（已接入）、③ **30 條製造配方 + 44 條 perk 效果 IL 真值**（**仍未回流**）—— 前兩塊上一個 commit 已補，第三塊是本次最大的數據浪費，也是回報最高的串聯機會。

---

## 2. 七大要素總表

| # | 要素 | 落點文檔 | 摘要 |
|---|---|---|---|
| 1 | 數據資產 | `docs/data-asset-map.md` | 7 網站打包 + 38 挖掘產物全表 |
| 2 | 未利用數據 | `docs/data-asset-map.md` §3 | 12 個 raw 檔未引用，5 個真浪費 |
| 3 | 串聯機會 | `docs/data-linkage-opportunities.md` | 16 個 join key + Top 10 串聯 |
| 4 | 功能缺口 | `docs/feature-optimization-plan.md` §2 | 7 個頁面用 proxy，未串真實數據 |
| 5 | 建議工具 | `docs/missing-tools.md` | 8 個缺失工具（含 2 個數據回流） |
| 6 | 優先級 | 本文 §3 | P0–P3 分級 |
| 7 | 驗收標準 | 各文件「驗收標準」欄 | 每個工具 1 條可勾選標準 |

---

## 3. 優先級（P0–P3）

### P0 — 數據回流（修復浪費，其他工具的地基）

| 項目 | 理由 | 驗收標準 |
|---|---|---|
| **D1. 製造 30 條配方回流** | `manufacturing_arbitrage.py` 的 baseRecipes + combinableVariations 全在 Python 端，網站 ROI 只能用 `linkedProductID` 近似（代碼註解自承）。這是「數據浪費 #1」。 | 新增 `src/lib/data/manufacturing-recipes.json`（30 條真實配方），`manufacturing.tsx` ROI 改讀真實 input→output，`inputCost` 不再用單商品近似 |
| **D2. perk 44 效果回流** | `perk_effects_final.json` 是 IL 真值（44 perk × effect + raw_il），網站只硬編碼了 perk 43。其他 43 條效果網站看不到。 | 新增 `src/lib/data/perk-effects.json`，`skill-tools`/`skill-engine` 的 effect 顯示改讀真值，補齊 skill 40–44 效果 |

### P1 — 高價值串聯工具

| 項目 | 理由 | 驗收標準 |
|---|---|---|
| **D3. 季節×真實銷量排行** | 111 天循環 4 季，網站季節頁只有靜態 checklist，未串 37 天真實銷量（join 100% 可做）。 | `seasons.tsx` 每季顯示「你的真實銷量 Top 商品」 |
| **D4. 通脹套利計算器（互動）** | 現在只在 exploits.json 有文字，冇互動工具。囤低 tier 貨等通脹 = 穩定套利。 | 選 tier → 顯示買入成本 vs 2.01× 上限賣出 vs 套利 % |
| **D5. 員工最優配置** | value/level 兩層模型已挖出（收銀員挑高 value、速度睇 level），員工頁只有 roster，冇 FP/薪水建議。 | `employees.tsx` 加「僱用/訓練建議」卡，讀員工 skill level |

### P2 — 中等優化

| 項目 | 理由 | 驗收標準 |
|---|---|---|
| **D6. 技能圖譜 join bug 修復** | `skillgraph↔skill` 只對到 40/44（90.9%）：graph 用 `skill07-10`（補零）而 encyclopedia 用 `skill7-10`，且 graph 缺 skill40-43。技能樹視覺化可能錯位/缺最強 4 個 perk。 | join 覆蓋率 → 100%，skill40-43 在技能樹正確顯示 |
| **D7. 今日最優行動 Hero Card** | 天氣 + 季節 + 訂單 + 庫存 + 貸款已齊，dashboard 冇一頁講晒「今日該做咩」。 | dashboard 頂部一張卡：開店 / 衝訂單 / 補貨 X 建議 |

### P3 — 深度 / 後續

| 項目 | 理由 | 驗收標準 |
|---|---|---|
| **D8. 需求矩陣（58 顧客 × 必需品 × 解鎖 × 缺貨）** | 顧客 profile 已挖，necessities 已 join，但冇缺貨率交叉。 | 新視圖：每顧客類型顯示缺貨商品與補貨建議 |
| **D9. 通脹對沖表** | tier 0–16 真實倍率已接，但冇「今日囤咩、等咩」的決策表。 | 一頁表：低 tier 囤貨清單 × 預期套利幅度 |

---

## 4. 執行紀律（勾選後）

1. **開分支**：`git checkout -b feat/<項目>`，不直接 push `main`。
2. **補測試**：純函式邏輯（引擎/解析器）補單元測試；UI 補「資料回流後欄位一致」測試。
3. **驗證**：`npx tsc --noEmit` → `npm run lint` → 測試 → `npm run build` 全過。
4. **交付**：push 後開 PR（target `main`），PR 描述附「數據來源 + join key + 驗收標準勾選」。

---

## 5. 待確認（請勾選）

- [ ] P0 是否先做？（D1 製造配方 + D2 perk 效果回流）
- [ ] P1 是否併入本輪？（D3–D5）
- [ ] D6 技能圖譜 join bug 是否當 bug 修？（不屬於「新功能」，但影響技能樹正確性）
- [ ] 其餘 P2/P3 是否排到下一輪？

> 我唔會喺你確認前改任何產品代碼。腳本 + 5 份文檔已寫好，直接睇下面 4 份 docs。
