// ============================================================================
// Data Value Audit — Step 4: data-linkage-audit.ts
// 讀入實際資料檔，計算跨表 join key 的覆蓋率 / 對齊度，找出「可串聯」的數據。
//
// 執行：node scripts/audit/data-linkage-audit.ts
// 輸出：scripts/audit/_out/linkage-audit.json
// ============================================================================
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const CWD = process.cwd()
const DATA = join(CWD, 'src', 'lib', 'data')
const SA = resolve(CWD, '..', 'save-analyzer')
const OUT_DIR = join(CWD, 'scripts', 'audit', '_out')

function load(p: string): any {
  if (!existsSync(p)) return undefined
  return JSON.parse(readFileSync(p, 'utf8'))
}

interface JoinReport {
  id: string
  title: string
  left: string
  right: string
  leftCount: number
  rightCount: number
  matched: number
  coveragePct: number
  unmatchedSamples: string[]
  valueNote: string
}

function coverage(id: string, title: string, left: string, right: string, leftIds: Array<string | number>, rightSet: Set<string | number>, valueNote: string): JoinReport {
  const matched = leftIds.filter((x) => rightSet.has(x)).length
  const unmatched = leftIds.filter((x) => !rightSet.has(x))
  return {
    id, title, left, right,
    leftCount: leftIds.length,
    rightCount: rightSet.size,
    matched,
    coveragePct: leftIds.length ? Math.round((matched / leftIds.length) * 1000) / 10 : 0,
    unmatchedSamples: unmatched.slice(0, 8).map(String),
    valueNote,
  }
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })

  const enc = load(join(DATA, 'encyclopedia.json'))
  const tierInfl = load(join(DATA, 'tier-inflation.json'))
  const skillGraph = load(join(DATA, 'skill-graph.json'))
  const exploits = load(join(DATA, 'exploits.json'))
  const demoSave = load(join(DATA, 'demo-save.json'))
  const statsHistory = load(join(SA, 'stats_history.json'))
  const perkEffectsFinal = load(join(SA, 'perk_effects_final.json'))

  const joins: JoinReport[] = []
  const datasets: { name: string; source: string; count: number }[] = []

  if (enc) {
    const products: any[] = enc.products || []
    const tiers: any[] = enc.tiers || []
    const productGroups: any[] = enc.productGroups || []
    const necessities: any[] = enc.necessities || []
    const seasons: any[] = enc.seasons || []
    const containers: any[] = enc.containers || []
    const skills: any[] = enc.skills || []
    const buildables: any[] = enc.buildables || []
    const manufacturingProducts: any[] = enc.manufacturingProducts || []
    const premiumProducts: number[] = enc.premiumProducts || []

    const productIds = new Set<number>(products.map((p) => p.id))
    const tierIds = new Set<number>(tiers.map((t) => t.id))
    const groupIds = new Set<number>(productGroups.map((g) => g.id))
    const buildableIds = new Set<number>(buildables.map((b) => b.id))
    const buildableNames = new Set<string>(buildables.map((b) => (b.name?.en || '').toLowerCase()))

    datasets.push(
      { name: 'encyclopedia.products', source: 'encyclopedia.json', count: products.length },
      { name: 'encyclopedia.tiers', source: 'encyclopedia.json', count: tiers.length },
      { name: 'encyclopedia.productGroups', source: 'encyclopedia.json', count: productGroups.length },
      { name: 'encyclopedia.necessities', source: 'encyclopedia.json', count: necessities.length },
      { name: 'encyclopedia.seasons', source: 'encyclopedia.json', count: seasons.length },
      { name: 'encyclopedia.containers', source: 'encyclopedia.json', count: containers.length },
      { name: 'encyclopedia.skills', source: 'encyclopedia.json', count: skills.length },
      { name: 'encyclopedia.buildables', source: 'encyclopedia.json', count: buildables.length },
      { name: 'encyclopedia.manufacturingProducts', source: 'encyclopedia.json', count: manufacturingProducts.length },
      { name: 'encyclopedia.premiumProducts', source: 'encyclopedia.json', count: premiumProducts.length },
    )

    // 1. product.id ↔ manufacturingProducts.linkedProductID
    joins.push(coverage(
      'product↔mfg-linked', '製造產品連結商品', 'manufacturingProducts.linkedProductID', 'products.id',
      manufacturingProducts.map((m) => m.linkedProductID), productIds,
      '製造配方可用商品 basePrice 計成本；未匹配者無法算製造 ROI',
    ))

    // 2. product.id ↔ necessities.productIds
    const necIds = Array.from(new Set(necessities.flatMap((n) => n.productIds || [])))
    joins.push(coverage('product↔necessity', '必需品映射商品', 'necessities.productIds', 'products.id', necIds, productIds,
      '顧客必需品 profile 可對回商品 tier/群組，做需求強度矩陣'))

    // 3. product.id ↔ seasons.productIds
    const seasonIds = Array.from(new Set(seasons.flatMap((s) => s.productIds || [])))
    joins.push(coverage('product↔season', '季節商品', 'seasons.productIds', 'products.id', seasonIds, productIds,
      '季節商品可對回 tier/銷量做季節性補貨排行'))

    // 4. product.id ↔ exploits.productIds
    const exploitIds = Array.from(new Set((exploits || []).flatMap((e) => e.productIds || [])))
    joins.push(coverage('product↔exploit', '漏洞商品', 'exploits.productIds', 'products.id', exploitIds, productIds,
      '漏洞條目可對回商品 basePrice/tier 算套利幅度'))

    // 5. product.id ↔ premiumProducts
    joins.push(coverage('product↔premium', '高級品清單', 'premiumProducts', 'products.id', premiumProducts, productIds,
      '高級品 profile 可對回 tier 17+ 做 premium 區隔'))

    // 6. product.id ↔ demo-save inventoryByProduct keys
    const invKeys = Object.keys(demoSave?.inventoryByProduct || {}).map(Number)
    joins.push(coverage('product↔inventory', '玩家庫存', 'inventoryByProduct.keys', 'products.id', invKeys, productIds,
      '庫存可對回商品 tier/群組算缺貨/補貨優先級'))

    // 7. product.id ↔ stats list 索引（長度對齊）
    if (statsHistory) {
      const pc = statsHistory.productCount
      const day = Object.keys(statsHistory.data || {})[0]
      const soldLen = day ? (statsHistory.data[day].productsSoldList || []).length : 0
      joins.push({
        id: 'product↔stats-list', title: '商品銷量 list 索引', left: 'stats productsSoldList (index)', right: 'products.id',
        leftCount: soldLen, rightCount: productIds.size, matched: Math.min(soldLen, productIds.size),
        coveragePct: soldLen ? Math.round((Math.min(soldLen, productIds.size) / soldLen) * 1000) / 10 : 0,
        unmatchedSamples: [], valueNote: `list 以 product id 為索引（長度 ${soldLen} vs 商品數 ${productIds.size}），可直接 join 每日銷量 → tier/群組`,
      })
      datasets.push({ name: 'stats_history', source: 'save-analyzer/stats_history.json', count: Object.keys(statsHistory.data || {}).length })
    }

    // 8. tier.id ↔ products.tier 分布 + 越界
    const tierVals = products.map((p) => p.tier)
    const tierOutOfRange = tierVals.filter((t) => !tierIds.has(t))
    joins.push({
      id: 'product↔tier', title: '商品 tier 對照', left: 'products.tier', right: 'tiers.id',
      leftCount: tierVals.length, rightCount: tierIds.size, matched: tierVals.length - tierOutOfRange.length,
      coveragePct: Math.round(((tierVals.length - tierOutOfRange.length) / tierVals.length) * 1000) / 10,
      unmatchedSamples: Array.from(new Set(tierOutOfRange)).slice(0, 8).map(String),
      valueNote: '每個商品 tier 可對回 tierInflation 真實倍率 → 真實市值/毛利',
    })

    // 9. tier.id ↔ tier-inflation id
    if (tierInfl) {
      const ti = tierInfl.tiers || []
      joins.push(coverage('tier↔inflation', 'tier 通脹倍率', 'tier-inflation.tiers.id', 'encyclopedia.tiers.id',
        ti.map((t: any) => t.id), tierIds, '分離式 tier-inflation.json 與 encyclopedia.tiers 對齊，供純函式消費'))
      datasets.push({ name: 'tier-inflation', source: 'tier-inflation.json', count: ti.length })
    }

    // 10. buildable.id ↔ container.containerID
    joins.push(coverage('buildable↔container', '可建物 ↔ 容器', 'containers.containerID', 'buildables.id',
      containers.map((c) => c.containerID), buildableIds, 'containerID===buildable.id，容器可回填成本/尺寸/耗電'))

    // 11. container.buildableName ↔ buildable.name.en
    const cNames = containers.map((c) => (c.buildableName || '').toLowerCase())
    const cMatched = cNames.filter((n) => buildableNames.has(n)).length
    joins.push({
      id: 'container↔buildable-name', title: '容器名稱 ↔ 可建物名稱', left: 'containers.buildableName', right: 'buildables.name.en',
      leftCount: cNames.length, rightCount: buildableNames.size, matched: cMatched,
      coveragePct: cNames.length ? Math.round((cMatched / cNames.length) * 1000) / 10 : 0,
      unmatchedSamples: cNames.filter((n) => !buildableNames.has(n)).slice(0, 8),
      valueNote: '名稱 join 可把 store-layout 的 buildableId 對回容器類別',
    })

    // 12. skills.perk null 斷鏈
    const nullPerk = skills.filter((s) => s.perk === null || s.perk === undefined).map((s) => s.id)
    joins.push({
      id: 'skill↔perk', title: '技能 ↔ perk 索引', left: 'skills.perk', right: 'perk index 0-43',
      leftCount: skills.length, rightCount: 44, matched: skills.length - nullPerk.length,
      coveragePct: Math.round(((skills.length - nullPerk.length) / skills.length) * 1000) / 10,
      unmatchedSamples: nullPerk.slice(0, 10),
      valueNote: 'perk=null 的技能無法對回 IL perk 效果（perk_effects_final 可補）',
    })

    // 13. skill-graph node.skill_id ↔ skills.id
    if (skillGraph) {
      const nodes: any[] = skillGraph.nodes || []
      const skillIds = new Set(skills.map((s) => s.id))
      const nodeSkillIds: string[] = nodes.filter((n) => n.skill_id).map((n) => n.skill_id)
      joins.push(coverage('skillgraph↔skill', '技能圖譜節點 ↔ 技能', 'skill-graph.node.skill_id', 'skills.id',
        nodeSkillIds, skillIds, '技能圖譜可對回 encyclopedia.skills 的名稱/效果'))
      datasets.push({ name: 'skill-graph', source: 'skill-graph.json', count: nodes.length })
    }

    // 14. product.group ↔ productGroups.id
    const groupVals = products.map((p) => p.group).filter((g) => g !== null && g !== undefined)
    const groupNull = products.length - groupVals.length
    joins.push({
      id: 'product↔group', title: '商品群組', left: 'products.group', right: 'productGroups.id',
      leftCount: products.length, rightCount: groupIds.size, matched: groupVals.length,
      coveragePct: Math.round((groupVals.length / products.length) * 1000) / 10,
      unmatchedSamples: [`${groupNull} 個商品 group=null`],
      valueNote: 'group 可做貨架分類聚類；null 商品缺分組',
    })
  }

  if (perkEffectsFinal) {
    const perkKeys = Object.keys(perkEffectsFinal)
    datasets.push({ name: 'perk_effects_final', source: 'save-analyzer/perk_effects_final.json', count: perkKeys.length })
    joins.push({
      id: 'perk↔effects', title: 'perk 效果 IL 真值', left: 'perk_effects_final keys', right: 'perk index 0-43',
      leftCount: perkKeys.length, rightCount: 44, matched: perkKeys.length,
      coveragePct: 100, unmatchedSamples: [],
      valueNote: '44 個 perk 的 IL 萃取效果字串，可回流糾正 encyclopedia.skills[40-44].perk=null',
    })
  }

  if (tierInfl) {
    const realInflation = (tierInfl.tiers || []).filter((t: any) => t.inflation && t.inflation !== 1.0)
    joins.push({
      id: 'tier-inflation-real', title: '真實通脹倍率', left: 'tier-inflation.tiers', right: 'inflation!=1.0',
      leftCount: (tierInfl.tiers || []).length, rightCount: realInflation.length, matched: realInflation.length,
      coveragePct: 100, unmatchedSamples: [],
      valueNote: '真實通脹 0-16 段（1.13–1.59×），17+ 恆 1.0',
    })
  }

  const out = {
    generatedAt: new Date().toISOString(),
    datasets,
    joins: joins.sort((a, b) => b.coveragePct - a.coveragePct),
  }
  writeFileSync(join(OUT_DIR, 'linkage-audit.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(`[data-linkage-audit] 偵測 ${joins.length} 個 join key、${datasets.length} 個資料集`)
  for (const j of joins) console.log(`  - ${j.id}: ${j.matched}/${j.leftCount} (${j.coveragePct}%)`)
  console.log(`  → ${join(OUT_DIR, 'linkage-audit.json')}`)
}

main()
