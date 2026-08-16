# 數據串聯機會（Data Linkage Opportunities）

> 生成：2026-08-16 ｜ 資料源：`scripts/audit/_out/linkage-audit.json`
> 16 個 join key 由腳本實測覆蓋率得出。重點：**單獨睇價值低、join 後價值高**的組合。

---

## 1. 實測 join key 覆蓋率（16 個）

| # | Join key | 左 → 右 | 對齊 | 覆蓋率 |
|---|---|---|---|---|
| 1 | 商品 id | manufacturingProducts.linkedProductID → products.id | 30/30 | **100%** |
| 2 | 商品 id | necessities.productIds → products.id | 204/204 | **100%** |
| 3 | 商品 id | seasons.productIds → products.id | 95/95 | **100%** |
| 4 | 商品 id | exploits.productIds → products.id | 37/37 | **100%** |
| 5 | 商品 id | premiumProducts → products.id | 7/7 | **100%** |
| 6 | 商品 id | inventoryByProduct.keys → products.id | 111/111 | **100%** |
| 7 | 商品 id | stats.productsSoldList（index）→ products.id | 339/339 | **100%** |
| 8 | tier id | products.tier → tiers.id | 339/339 | **100%** |
| 9 | tier id | tier-inflation.tiers.id → encyclopedia.tiers.id | 55/55 | **100%** |
| 10 | buildable id | containers.containerID → buildables.id | 42/42 | **100%** |
| 11 | 名稱 | containers.buildableName → buildables.name.en | 42/42 | **100%** |
| 12 | 群組 id | products.group → productGroups.id | 339/339 | **100%** |
| 13 | perk 索引 | skills.perk → perk 0-43 | 44/44 | **100%** |
| 14 | perk 效果 | perk_effects_final.perks → perk 0-43 | 44/44 | **100%**（未回流，見下） |
| 15 | 技能 id | skill-graph.node.skill_id → skills.id | 40/44 | **90.9%** ⚠️ |
| 16 | 通脹真值 | tier-inflation → inflation≠1.0 | 17/55 | 17 段真實 |

**唯一唔係 100% 嘅係 #15（技能圖譜）**，根因係兩處數據質量問題（見 §4），唔係「無得 join」。

---

## 2. Top 串聯機會（按「單獨價值低 → join 後價值高」排序）

> 標題：`A × B → 衍生值`，後接「現狀 / 建議」。

### 🔥 1. 製造配方 × 商品成本 × tier 通脹 → **真實製造 ROI**
- **join**：#1（100%）+ #9（100%）
- 現狀：manufacturing.tsx 用 `linkedProductID → marketPrice` 當輸入成本近似，**唔知真實要投入幾多件原料**。30 條 `baseRecipes` 仍在 Python 端。
- 建議：回流 `manufacturing-recipes.json`，ROI 改 `真實輸出價值 / 真實輸入成本`。
- 單獨睇：配方只是字串；join 後：每日利潤最優製造組合。

### 🔥 2. perk 效果 IL 真值 × 技能 × 玩家解鎖 → **最優 FP 投資**
- **join**：#13（100%）+ #14（100%）+ 玩家存檔 `perkIndexToSkill`
- 現狀：NextStepRecommender 已讀真實存檔，但 effect 文字靠 encyclopedia（非 IL 真值），skill 40–44 效果模糊。
- 建議：回流 `perk-effects.json`，推薦器用 44 條真 effect 算每個未解鎖 perk 的 ROI。
- 單獨睇：effect 字串只係描述；join 後：FP 有限時的數學最優解。

### 🔥 3. stats 真實銷量 × tier 通脹 × 季節 → **季節銷售冠軍**
- **join**：#3（100%）+ #7（100%）+ #9（100%）
- 現狀：seasons.tsx 只有靜態 checklist，冇串 37 天真實銷量。
- 建議：每季顯示「你嘅真實銷量 Top 商品」，順手補 `day%111 → season` 函式。
- 單獨睇：銷量 list 係一堆數字；join 後：季節性補貨/囤貨決策。

### 🔥 4. tier 通脹 × 商品 tier × 無保質期 → **通脹套利**
- **join**：#8（100%）+ #9（100%）
- 現狀：exploits.json 有文字，冇互動工具。
- 建議：互動計算器（揀 tier → 買入成本 vs 2.01× 上限賣出 vs 套利 %）。
- 單獨睇：55 個倍率冇意義；join 後：低 tier（0）買入、高 tier（17+）永不膨脹的套利對照。

### 🔥 5. 員工 value/level 兩層 × 收銀公式 → **最優僱用/訓練**
- **join**：員工 `skills.level` × 收銀公式（`itemsPerBatch = level/15`）× 薪水
- 現狀：employees.tsx 有 roster，冇「天賦 vs 速度 vs 薪水」建議。
- 建議：加僱用建議卡（收銀員挑高 cashierValue，速度只睇 level）。
- 單獨睇：員工等級只係數字；join 後：低薪高產的僱用策略。

### 6. 需求矩陣（58 顧客 × 必需品 × 解鎖 × 缺貨率）
- **join**：#2（100%）+ #7（100%）+ 玩家 `unlockedProducts`
- 建議：新視圖，每顧客類型顯示缺貨商品 + 補貨建議。

### 7. 庫存 × tier × 貸款還款 → **破產倒數 / 通脹對沖表**
- **join**：#6（100%）+ #8（100%）+ `loanPaymentPerDay`
- 建議：dashboard 加破產倒數卡；另開「今日囤咩、等咩」對沖表。

---

## 3. 已落實的串聯（上個 commit，供對照）

| 串聯 | 落點 | 狀態 |
|---|---|---|
| tier 通脹 × 商品利潤 × stats 銷量 → 真實毛利 | `computeMarketPrice` + stats-engine | ✅ 已做 |
| 壞天氣 × 技能43 × 線上訂單 → 爆發收入 | online-order-engine.ts | ✅ 已做 |
| 通脹套利 / 折扣 5% / 壞天×43 | exploits.json 3 條 | ✅ 已做 |
| 製造 ROI（linkedProductID 近似） | manufacturing.tsx D5 | ⚠️ 近似，未用真配方 |

---

## 4. 數據質量斷鏈（join 前要修）

| 問題 | 證據 | 修法 |
|---|---|---|
| 技能 id 零填充不一致 | graph 用 `skill07-10`（補零），encyclopedia 用 `skill7-10`（唔補零），4 個 join 失敗 | 統一正規化（`skill7` 或 `skill07` 二選一） |
| 技能圖譜缺 skill40-43 | graph 冇節點對應 skill40/41/42/43 | 補圖譜節點，或確認係 placeholder 並標記 |
| 製造配方未回流 | 30 條 baseRecipes 全在 Python 端 | 回流成 JSON（D1） |
| perk 效果未回流 | 44 條效果只有 perk 43 硬編碼 | 回流成 JSON（D2） |
