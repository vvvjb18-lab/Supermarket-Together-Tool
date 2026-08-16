# Supermarket Together Tool — 數據資產審計報告

> 目的：盤點 `save-analyzer/` 挖出來的每一分數據，對照網站 22 個 tab 到底用咗幾多、邊啲可以串聯、邊啲關鍵工具應該開發但一直冇。
> 生成日期：2026-08-16

---

## 1. 數據資產清單（save-analyzer 挖出來的）

| 檔案 / 來源 | 內容 | 網站有冇用 | 備註 |
|---|---|---|---|
| `decoded.TierInflation`（IL 提取） | 55 層真實通脹倍率（tier 0=1.54 … 17+=1.00） | ✅ **剛接入** `tier-inflation.json` | 之前 encyclopedia 全係 placeholder 1.0，定價/利潤全部錯 |
| `perk_effects_final.json` | 44 技能真實效果（switch index 對照） | ⚠️ 部分 | skill-tools 有用，但 NextStepRecommender 之前唔讀玩家狀態 |
| `skill_tree_graph_v2.json` | 技能樹拓撲（parent/child 關係） | ✅ 已用 | skill-tree.tsx |
| `stats_history.json` / `.csv` | 37 天真實每日銷售/收入/成本（1184 key） | ⚠️ 只用喺 stats.tsx | profit/restock 冇串聯 |
| `manufacturing_arbitrage.py` | 製造套利（輸入成本 vs 產出價值） | ⚠️ **剛加** ROI | 之前 recipe 得 queue planning，冇 ROI |
| `necessity_map.txt` / `map_necessities.py` | 11 必需品 + 7 高級品映射 | ⚠️ 部分 | salt.tsx 用咗 profile，但冇同 stats 交叉 |
| `store_layout.json` | 57 prop 店面布局（Classic/Plaza） | ✅ 已用 | store-layout.tsx |
| `buildables.json` | 43 可建物 | ✅ 已用 | store-layout / containers |
| `steam_achievements.json` | 51 成就（EN + 繁中） | ✅ 已用 | achievements.tsx |
| `game_encyclopedia.json` | 339 商品 / 55 tier / 19 group / 42 container | ✅ 已用 | wiki.tsx |
| `perk_effects_v2.json` | 技能效果 v2 | ⚠️ 部分 | 同 perk_effects_final |
| 天氣/季節 IL 常數（`GameData.CalculateTodaysWeather`） | 111 天循環、4 季、6 類天氣、V9>=4 壞天 | ⚠️ **剛接入** | online-order-engine.ts |
| 線上訂單經濟（`NPC_Manager` state 31） | 每件 = basePrice × tierInflation × 3.25~3.5 × (壞天×技能43 ? 3) | ⚠️ **剛接入** | online-order-engine.ts |
| 折扣衝動曲線（`ExtraProductsOnSaleToAdd`） | chance = curve(basePrice)/100 + 0.01×(折扣/5) | ⚠️ 部分 | exploits.json 有 5% 建議 |
| 員工兩層模型（value/level） | 僱用值=天賦，等級=速度 | ⚠️ 部分 | employees.tsx 有 roster，但冇 FP 優化 |

**結論**：最值錢嘅兩個資產——「真實通脹倍率」同「線上訂單經濟」——一直冇用，係最大浪費。今次已補上。

---

## 2. 網站功能 × 數據覆蓋

| 功能 tab | 用咗咩數據 | 應該仲要用咩 | 缺口嚴重度 |
|---|---|---|---|
| **dashboard** | KPI（day/cash/淨值/聲譽） | 今日天氣 + 季節 + 建議行動 | H |
| **profit** | 商品利潤（`basePrice` 靜態） | 真實 tier inflation（1.13~1.59×）→ 真實毛利 | **H（已修）** |
| **pricing** | 339 商品定價表 + demand proxy | 真實 stats 銷量校正定價 | H |
| **restock** | 補貨優先級（demand proxy） | stats_history 真實 7 天銷量 | **H（已修）** |
| **salt** | 58 顧客類型需求 | 必需品映射 × 解鎖狀態 | M |
| **simulator** | NPC 行為流 + 客流公式 | tier inflation × 訂單經濟 | M |
| **stats** | 37 天真實 P&L | tier inflation 真實毛利 | **H（已修）** |
| **manufacturing** | 30 配方 + queue | 配方 ROI（輸入 vs 產出） | **H（已修）** |
| **skills / skill-tools** | 44 技能 + 樹 | FP 投資優化（讀玩家當前 perk） | **M（已修 NextStep）** |
| **seasons** | 季節商品可用性 | 季節 × 真實銷量排行 | M |
| **exploits** | 12 條 hand-curated | 通脹套利 / 壞天×技能43 / 折扣5% | **M（已加 3 條）** |
| **online-orders（新）** | 線上訂單經濟 + 天氣 + 技能43 | — | **已補** |

---

## 3. 跨數據串聯（Top 10，已排序）

1. **Tier Inflation × 商品利潤 × stats 真實銷量** → 「真實毛利排行」
   - 之前 profit.tsx 用靜態 basePrice，忽略 1.13~1.59× 通脹，全部利潤低估。
   - **已修**：profit + stats 都用 `computeMarketPrice` + 真實通脹。

2. **壞天氣 × 技能 43 × 線上訂單經濟** → 「今日訂單爆發收入」
   - 壞天 V9>=4 時，技能 43 = +3~5 訂單 + ×3 價格 = 9.75~10.5× 市價。
   - **已修**：新增 online-orders tab，完整模擬。

3. **通脹套利** → 「低 tier 囤貨，等通脹推高 2.01× 上限賣出」
   - tier 0（1.54×）買入，賣出上限 2.01×1.54=3.10× base；高 tier 17+ 永不膨脹。
   - **已加**到 exploits.json。

4. **季節 × stats 真實銷量** → 「季節銷售冠軍」
   - 111 天循環 4 季，每個季節有唔同暢銷品，但 site 冇同真實銷量交叉。

5. **必需品映射 × 解鎖狀態 × stats 缺貨率** → 「需求矩陣」
   - 58 顧客 profile（必需品/高級品/隨機）× 玩家解鎖商品 × 真實缺貨統計。

6. **製造配方 × 原料成本 × 產出通脹價** → 「製造 ROI」
   - **已修**：manufacturing.tsx 加 ROI 排行。

7. **折扣衝動曲線 × 當前定價 × tier** → 「最優特價」
   - 只開 5% 特價 = 最低毛利犧牲 + 最高衝動機率，平價貨 curve 高。
   - **已加**到 exploits.json。

8. **技能樹 × tier 解鎖條件 × 當前解鎖** → 「下一個最優 perk」
   - FP 優先：43（壞天訂單）> 34（自動繳單）> 9/10（客流）> 35-37（特價位）> 5/6（員工速度）。
   - **已修**：NextStepRecommender 讀真實狀態。

9. **員工 value/level 兩層 × 收銀公式** → 「最優員工配置」
   - 收銀員挑高 cashierValue（天賦），速度只睇 level；後 3 技高 = 低薪高製造。

10. **stats 成長曲線 × 貸款還款 × 通脹** → 「真實 P&L 趨勢」
    - 已串聯主存檔 loanPaymentPerDay，但通脹校正剛補上。

---

## 4. 缺失關鍵工具（按影響力排序）

| # | 工具 | 點解關鍵 | 需要數據 | 狀態 |
|---|---|---|---|---|
| 1 | **線上訂單 × 壞天氣 × 技能43 策略** | 全 game 最強盈利引擎（3.25~10.5× 市價） | 訂單經濟 + 天氣 + perk 43 | ✅ **已做** |
| 2 | **通脹套利計算器** | 無保質期，囤低 tier 貨等通脹 = 穩定套利 | tierInflation + 商品 tier | ⚠️ 只加咗 exploits 文字，冇互動工具 |
| 3 | **今日最優行動（Hero Card）** | 開店 / 衝訂單 / 補貨 X，一頁講晒 | 天氣 + 季節 + 訂單 + 庫存 | ⚠️ 部分（online-orders 有 recommendation） |
| 4 | **FP 投資優先級** | 44 技能，FP 有限，揀錯好傷 | perk_effects + 玩家當前 perk | ⚠️ NextStep 已改，但可更深入 |
| 5 | **真實 P&L by 商品** | 用真實銷量校正補貨/利潤排序 | stats_history + tierInflation | ✅ **已做**（stats.tsx） |
| 6 | **季節銷售冠軍** | 唔同季節賣唔同貨 | 季節 × stats 銷量 | ❌ 未做 |
| 7 | **員工最優配置** | 收銀員天賦 vs 速度 vs 薪水 | 員工兩層模型 | ⚠️ 部分 |
| 8 | **通脹對沖表** | 今日囤咩、等咩 | tierInflation + 商品 | ⚠️ 部分（online-orders 有 tier 表） |

---

## 5. 利用不足的功能

- **profit.tsx** — 之前用靜態 basePrice，忽略通脹（已修）
- **pricing.tsx** — 用 demand proxy，冇用 stats 真實銷量校正
- **restock.tsx** — 之前用 proxy 排序，冇用 stats 真實 7 天銷量
- **salt.tsx** — 顧客 profile 有，但冇同必需品映射 + 解鎖狀態交叉
- **simulator.tsx** — 有 NPC 行為流，但冇 tier inflation × 訂單經濟
- **seasons.tsx** — 季節可用性有，但冇真實銷量排行
- **skill-tools/NextStepRecommender** — 之前 4 個固定模式，唔讀玩家狀態（已修）

---

## 6. 建議實施順序

### 快速取勝（≤ 2 小時）
- [x] 線上訂單 tab + 真實通脹值（**已完成，commit d09313d**）
- [x] NextStepRecommender 讀真實狀態（**已完成**）
- [x] stats 用真實通脹 + best/worst day（**已完成**）
- [x] manufacturing ROI（**已完成**）
- [x] exploits 加 3 條（**已完成**）

### 中等（半日）
- [ ] **季節銷售冠軍**：season × stats 真實銷量交叉排行
- [ ] **通脹套利互動工具**：唔係純文字，做個計算器（揀 tier → 顯示買入成本 vs 2.01× 上限賣出 vs 套利幅度）
- [ ] **pricing.tsx 串 stats**：用真實銷量校正 demand proxy
- [ ] **今日最優行動 Hero Card** 上 dashboard

### 較大（1 日以上）
- [ ] **FP 投資優先級深度版**：讀當前 perk，用 perk_effects 算每個未解鎖 perk 嘅 ROI
- [ ] **員工最優配置**：value/level 兩層 × 薪水，做僱用/訓練建議
- [ ] **需求矩陣**：58 顧客 profile × 必需品 × 解鎖狀態 × 缺貨率
- [ ] **完整遊戲圖譜**（roadmap 已有）

---

## 附：本次 commit 摘要

`d09313d feat(orders): 線上訂單×壞天氣×技能43 策略工具 + 多項數據深化`

- `online-orders.tsx`（460 行）+ `online-order-engine.ts`（359 行）：完整訂單經濟引擎 + UI
- `tier-inflation.json`：55 層真實通脹值（0-16 真實，17+ 1.0）
- `NextStepRecommender.tsx`：改為讀真實存檔狀態
- `stats-engine.ts`：用真實 tier inflation 算 fair×/fairMargin + best/worst day KPI
- `manufacturing.tsx`：加配方 ROI 排行
- `exploits.json`：加通脹套利 / 壞天×技能43 / 折扣 5% 三條
