# 數據資產地圖（Data Asset Map）

> 生成：2026-08-16 ｜ 資料源：`scripts/audit/_out/inventory.json` + `profile.json`
> 這份文檔盤點「每一分數據喺邊、內容係咩、有冇被網站用」。原始檔內容一律由腳本讀取統計，唔會喺呢度貼 raw 檔。

---

## 1. 網站打包數據（src/lib/data + public，共 7 個）

> 呢啲係網站**真正 import** 入去用的數據。全部有代碼引用（`usage-audit` 顯示 0 個未用）。

| 檔案 | 大小 | 內容 | 被引用處（引用檔數） |
|---|---|---|---|
| `encyclopedia.json` | 476 KB | **主數據**：19 欄位（見 §2） | 39 個檔（353 次） |
| `demo-stats.json`（public） | 59.6 KB | 37 天每日統計樣本（stats.tsx「載入內建樣本」） | stats.tsx |
| `skill-graph.json` | 58.8 KB | 技能圖譜 99 節點 / 93 邊 / adjacency / perk_to_category | 4 個檔（36 次） |
| `demo-save.json` | 29.2 KB | 示範存檔（day/money/員工/庫存/佈局） | 7 個檔 |
| `exploits.json` | 10.1 KB | 12 條手工策展 exploit | 8 個檔 |
| `perks.tsv` | 4.4 KB | 44 perk 表格 | skill-tree.tsx |
| `tier-inflation.json` | 4.0 KB | 55 tier 真實通脹倍率（0–16 真實，17+ 1.0） | 3 個檔 |
| `level0-geometry.json`（src/data） | 58 KB | 店面 level0 幾何（atlas/佈局圖） | store-layout.tsx |

---

## 2. encyclopedia.json — 19 欄位 schema（主數據全景）

| 欄位 | 數量 | 內容 | 用途狀態 |
|---|---|---|---|
| `products` | **339** | 商品（id/名稱/brand/basePrice/tier/group/容器類別/碰撞體） | ✅ 全站核心 |
| `tiers` | **55** | tier 分層（含 inflation 倍率） | ✅ 已接真實通脹 |
| `productGroups` | 19 | 商品群組 | ✅ |
| `necessities` | 11 | 必需品 profile（productIds 映射） | ✅ |
| `seasons` | 4 | 季節商品（productIds） | ✅（但未串銷量，見串聯機會） |
| `customerTypes` | 58 | 顧客類型（compensatedChances/necessitiesChances/premiumIndexes） | ✅ |
| `containers` | 42 | 容器（class/尺寸/成本/耗電） | ✅ |
| `skills` | 44 | 技能（id/name/effect/perk 索引） | ✅（effect 非 IL 真值，見缺口） |
| `buildables` | 43 | 可建物 | ✅ |
| `manufacturingBuildables` | 4 | 製造用可建物 | ⚠️ 僅 atlas/types 引用 |
| `achievements` | 51 | 成就（EN + 繁中 + 全服% + 集體標記） | ✅ |
| `achievementStats` | 51 | 成就統計 | ⚠️ 低度使用 |
| `employeeTasks` | 8 | 員工任務類型 | ⚠️ 低度使用 |
| `manufacturingProducts` | 30 | 製造產品（linkedProductID/itemsPerBox/size） | ⚠️ 只有密度 + ROI proxy |
| `premiumProducts` | 7 | 高級品 id 清單 | ✅ |
| `config` | — | 遊戲調參（gameTuning 等） | ⚠️ 低度使用 |
| `storeLayout` | 41 | 店面佈局 prop | ✅ |
| `layoutMeta` | — | 佈局統計 | ⚠️ 低度使用 |
| `meta` | — | 資料來源 meta | ⚠️ 低度使用 |

---

## 3. 挖掘產物（save-analyzer，38 個 curated-data）— 使用狀態

> 分類標準：**「已遷移」**=內容已進 encyclopedia/skill-graph 等打包檔；**「部分回流」**=只有少數值被硬編碼；**「真浪費」**=零 trace、冇遷移、冇後續。

| 檔案 | 內容 | 狀態 |
|---|---|---|
| `stats_history.json` / `.csv` | 37 天真實每日 P&L + 商品銷量（1184 key） | ✅ 已用（stats.tsx + demo-stats.json 源） |
| `perk_effects_final.json` | **44 perk 效果 IL 真值**（`{cost, costNote, perks[44]}`，每條含 perkIndex/effect/raw_il） | ⚠️ **部分回流**：只有 perk 43 硬編碼進 online-order-engine |
| `enc_split/products.tsv` / `necessities.json` / `skills.tsv` / `customers.tsv` / `containers.tsv` / `perks_table.tsv` / `skill_edges.tsv` | 最終拆分資料（生成 encyclopedia 的原料） | ✅ 已遷移進 encyclopedia |
| `game_encyclopedia.json`（raw + enc_split） | encyclopedia 生成前身 | ✅ 已遷移（raw 檔被取代） |
| `store_layout.json` / `enc_split/store_layout.json` | 店面佈局 | ✅ 已遷移（encyclopedia.storeLayout） |
| `buildables.json` | 可建物字典 | ✅ 已遷移（encyclopedia.buildables） |
| `steam_achievements.json` | 成就 | ✅ 已遷移（encyclopedia.achievements） |
| `skill_tree_*.json`（graph/graph_v2/edges_rematch/lines/gos/gos2/hierarchy） | 技能圖譜多版本 | ✅ 已遷移（skill-graph.json） |
| `game-schema.json` | 動態 schema | ❌ **真浪費**（未遷移、未引用） |
| `structure.json` / `structure_segments.json` | 結構分段 | ❌ **真浪費**（store-layout 自己讀 propdata） |
| `taxonomy_level0.json` | 分類層級（113 KB） | ❌ **真浪費** |
| `perks_in_perks_go.json` | 早期 perk IL 嘗試（48 KB） | ❌ **真浪費**（過時，被 perk_effects_final 取代） |
| `perk_effects.json` / `perk_effects_v2.json` | 舊版 perk 萃取 | ❌ **真浪費**（被 final 取代） |
| `ilconst.json` / `discover_static.json` / `fields2.json` / `ar_*.json` / `ar2_*.json`（43 個 IL dump） | IL 反組譯中間產物 | 🟡 探索性，非資料產品（可留作溯源） |
| `snapshots/*/save.json`（3 個） | 存檔快照 | 🟡 測試/回歸用 |
| `manufacturing_arbitrage.py` | **30 條製造配方 baseRecipes + combinableVariations** | ❌ **真浪費（最大）**：配方全在 Python 端，網站 ROI 只能用 linkedProductID 近似 |

---

## 4. 真浪費 vs 可補救

### 真浪費（建議保留溯源、唔急於清）
1. `game-schema.json`、`structure_segments.json`、`taxonomy_level0.json`、`perks_in_perks_go.json`、`perk_effects.json`、`perk_effects_v2.json`、`ilconst.json`、`discover_static.json`。

### 可補救（高價值，應回流網站）
1. **`manufacturing_arbitrage.py` 30 條配方** — 見 `docs/missing-tools.md` §D1。
2. **`perk_effects_final.json` 44 perk 效果** — 見 §D2。

---

## 5. 數據質量發現（join 前就要知）

| 問題 | 證據 | 影響 |
|---|---|---|
| 技能 id 零填充不一致 | encyclopedia.skills 用 `skill01-05`（補零）但 `skill7-10` 唔補零；skill-graph 用 `skill07-10`（補零） | `skillgraph↔skill` 只對到 40/44 |
| 技能圖譜缺 skill40-43 | skill-graph 冇節點對應 skill40/41/42/43（最強 perk 43 壞天氣訂單、42 轉路人） | 技能樹視覺化缺最強 4 個 perk |
| 製造配方未回流 | manufacturing.tsx 註解自承「IL 真實 30 條 baseRecipes 仍在 save-analyzer，未回流」 | ROI 用單商品近似，非真實投入成本 |
| `totalProductsAcquiredThisDay` 遊戲 bug | IL 二次 loop 重複加總 productsSold，恆等於 totalProductsSoldThisDay | 入貨量不可用（已在 stats-engine 標記） |
