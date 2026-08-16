# 缺失工具清單（Missing Tools）

> 生成：2026-08-16 ｜ 資料源：usage-audit + linkage-audit 交叉
> 定義：**「應該有、但網站而家冇」**的工具，按影響力排序。每個都列明「需要邊啲數據 + 驗收標準」。

---

## 總覽

| # | 工具 | 影響 | 優先級 | 需要數據（join key） |
|---|---|---|---|---|
| D1 | 製造 30 條配方回流 | 高 | P0 | manufacturing_arbitrage.py + linkedProductID (#1) |
| D2 | perk 44 效果回流 | 高 | P0 | perk_effects_final.json (#14) |
| D3 | 季節×真實銷量排行 | 高 | P1 | stats + seasons + tier (#3/#7/#9) |
| D4 | 通脹套利計算器（互動） | 中 | P1 | tier-inflation + products.tier (#8/#9) |
| D5 | 員工最優配置 | 中 | P1 | employee value/level + 收銀公式 |
| D6 | 技能圖譜 join bug 修復 | 中（正確性） | P2 | skill-graph ↔ skills (#15) |
| D7 | 今日最優行動 Hero Card | 中 | P2 | 天氣 + 季節 + 訂單 + 庫存 + 貸款 |
| D8 | 需求矩陣 | 低 | P3 | customerTypes + necessities + 缺貨 (#2/#7) |
| D9 | 通脹對沖表 | 低 | P3 | tier-inflation + products.tier |

---

## D1. 製造 30 條配方回流（P0）

- **為何關鍵**：製造頁而家嘅 ROI 係「用 linkedProductID 單商品市價當輸入成本」嘅近似值，**唔知真實要投幾多件原料**。30 條真實配方（baseRecipes + combinableVariations）已經喺 `save-analyzer/manufacturing_arbitrage.py` 解析好，只係冇回流網站。
- **需要數據**：`manufacturing_arbitrage.py`（30 條配方字串 + itemsPerBox）、`encyclopedia.manufacturingProducts`（linkedProductID）、`tier-inflation.json`。
- **驗收標準**：新增 `src/lib/data/manufacturing-recipes.json`；`manufacturing.tsx` ROI 改用真實 `inputProducts[] → outputProduct`，`inputCost` = Σ(原料市價×數量)，不再用單商品近似；typecheck/lint/build 全過。

## D2. perk 44 效果回流（P0）

- **為何關鍵**：`perk_effects_final.json` 係 IL 真值（44 條，含 raw_il 位元組位址），但網站只硬編碼咗 perk 43（`orderingExtraCrashOnBadWeather`）。其餘 43 條效果網站睇唔到，skill 40–44 嘅 effect 描述模糊。
- **需要數據**：`perk_effects_final.json`（`{cost:1000, costNote, perks[44]}`）、`encyclopedia.skills[].perk`。
- **驗收標準**：新增 `src/lib/data/perk-effects.json`；`skill-tools` 效果顯示 + `NextStepRecommender` 改讀真值；補齊 skill 40–44 效果；每條附 `raw_il` 供溯源。

## D3. 季節×真實銷量排行（P1）

- **為何關鍵**：111 天循環 4 季，唔同季節賣唔同貨，但季節頁只有靜態 checklist，冇用 37 天真實銷量。
- **需要數據**：`stats_history.json`（productsSoldList，index=product id）、`encyclopedia.seasons`（productIds）、`tier-inflation.json`。
- **驗收標準**：`seasons.tsx` 每季顯示「你嘅真實銷量 Top N 商品」；實作 `getSeason(day) = clamp(floor((day%111)/28),0,3)`。

## D4. 通脹套利計算器（互動）（P1）

- **為何關鍵**：囤低 tier 貨（無保質期）等通脹推高 2.01× 上限再賣 = 穩定套利。而家只有 exploits.json 一段文字。
- **需要數據**：`tier-inflation.json`（0=1.54 … 17+=1.00）、`encyclopedia.products.tier`。
- **驗收標準**：揀 tier → 顯示「買入成本 vs 2.01× 上限賣出價 vs 套利 %」；高 tier（17+）標示「永不膨脹」。

## D5. 員工最優配置（P1）

- **為何關鍵**：員工兩層模型已挖出——收銀員速度只睇 level（`itemsPerBatch = clamp(level/15,1,10)`）、天賦（value）只影響 EXP 增益；後 3 技高 = 低薪高製造。員工頁而家只有 roster。
- **需要數據**：`SaveSnapshot.employees[].skills.level`、員工薪水、收銀/補貨公式。
- **驗收標準**：`employees.tsx` 加「僱用/訓練建議」卡，讀真實員工 level 排序建議。

## D6. 技能圖譜 join bug 修復（P2）

- **為何關鍵**：`skillgraph↔skill` 只對到 40/44（90.9%），係數據質量 bug，唔係新功能。根因：① graph 用 `skill07-10`（補零）而 encyclopedia 用 `skill7-10`；② graph 缺 skill40-43（最強 4 個 perk）。
- **需要數據**：`skill-graph.json` + `encyclopedia.skills`。
- **驗收標準**：join 覆蓋率 → 100%；skill40-43 喺技能樹正確顯示；補一個 id 正規化 helper 防回歸。

## D7. 今日最優行動 Hero Card（P2）

- **為何關鍵**：天氣 + 季節 + 訂單 + 庫存 + 貸款全部數據已齊，但 dashboard 冇一頁講晒「今日該做咩」。
- **需要數據**：天氣（`CalculateTodaysWeather` 已接）、季節、線上訂單引擎、庫存、`loanPaymentPerDay`。
- **驗收標準**：dashboard 頂部一張卡，輸出「開店 / 衝訂單 / 補貨 X」三選一建議 + 依據公式。

## D8. 需求矩陣（P3）

- **為何關鍵**：58 顧客 profile × 必需品映射 × 解鎖狀態 × 缺貨率，係「邊類客最常缺貨」嘅完整答案，而家散落各頁。
- **驗收標準**：新視圖，每顧客類型顯示缺貨商品 + 補貨建議。

## D9. 通脹對沖表（P3）

- **為何關鍵**：tier 0–16 真實倍率已接，但冇「今日囤咩、等咩」嘅決策表。
- **驗收標準**：一頁表：低 tier 囤貨清單 × 預期套利幅度 × 建議買入時機。
