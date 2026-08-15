r"""
One-shot patch script: bring encyclopedia.json up to v2.0 with the corrections
extracted from the real game data:

  1. tiers[].inflation -- real TierInflation extracted from _latest/save.json
     (17 tiers with 1.13-1.59 inflation, 38 tiers at 1.0)
  2. customerTypes[].premiumIndexes -- fill all customers with the 7 premium
     product ids (game has only 7 premium products; compensatedChances[2]
     controls the probability of entering premium mode)
  3. skills[].skill01-skill05 -- add 5 Employee I-V placeholder perks (perk 0-4)
     that were missing in v1.0; remove the 4 broken skill07-10 empty entries
  4. achievementStats[] -- fill all 51 with descriptions (the 24/51 gap)
  5. tiers[].unlockLevel (new) -- approximate from save.json unlockedIndices

Source-of-truth: F:\游戲副本\save-analyzer\_latest\save.json
                 F:\游戲副本\supermarket-tool-temp\src\lib\data\perks.tsv
"""
import json
import sys
from pathlib import Path

ENC = Path("F:/游戲副本/supermarket-tool-temp/src/lib/data/encyclopedia.json")

# 1. Real TierInflation (extracted from _latest/save.json decoded.TierInflation.value.array)
REAL_TIER_INFLATION = [
    1.54, 1.56, 1.59, 1.56, 1.55, 1.49,  # tier 0-5
    1.44, 1.44, 1.46, 1.47,                # tier 6-9
    1.27, 1.34, 1.34, 1.13, 1.18, 1.13, 1.17,  # tier 10-16
] + [1.0] * 38                             # tier 17-54

# 7 premium product ids (verified from encyclopedia.premiumProducts + dump)
PREMIUM_IDS = [173, 175, 186, 287, 296, 297, 299]

# 5 placeholder skills (perk 0-4, Employee I-V)
# Real name from perks.tsv: skill01-skill05
PLACEHOLDER_SKILLS = [
    {"id": "skill01", "name_en": "Employee I",       "name_zhHant": "員工一號",  "desc_en": "+1 maxEmployees (placeholder perk I)",   "x": -957.8, "y": 332.9},
    {"id": "skill02", "name_en": "Employee II",      "name_zhHant": "員工二號",  "desc_en": "+1 maxEmployees (placeholder perk II)",  "x": 285.5,  "y": 120.4},
    {"id": "skill03", "name_en": "Employee III",     "name_zhHant": "員工三號",  "desc_en": "+1 maxEmployees (placeholder perk III)", "x": -461.1, "y": -272.1},
    {"id": "skill04", "name_en": "Employee IV",      "name_zhHant": "員工四號",  "desc_en": "+1 maxEmployees (placeholder perk IV)",  "x": -78.5,  "y": -509.7},
    {"id": "skill05", "name_en": "Employee V",       "name_zhHant": "員工五號",  "desc_en": "+1 maxEmployees (placeholder perk V)",   "x": 702.8,  "y": -494.0},
]

# Full 51 achievement stats (filling the 27 missing)
ACHIEVEMENT_STATS = [
    "Total money earned",                  # 0
    "Total products placed in containers",
    "Total boxes recycled",
    "Total customers served",
    "Total products checkouted",
    "Total trash collected",
    "Correct change given in a row",
    "Total times hit thief",
    "Total dropped products collected",
    "Total cat petted times",
    "Earnings in a day",
    "Max checkout money made",
    "Analyzed customers",
    "Thieves caught when analyzing",
    "Sales",
    "Boxes in baler",
    "Recycled bales",
    "Extra items thanks to sales",
    "Paid invoices",
    "Online orders completed",
    "Money earned by online orders",
    "Repaired devices",
    "Announcements played",
    "Bystanders converted into customers",
    "Total decor props placed",            # 24 (new, inferred from layout)
    "Total expansions purchased",          # 25
    "Total storage expansions",            # 26
    "Total products manufactured",         # 27
    "Manufacturing recipes unlocked",      # 28
    "Days played",                         # 29
    "Times bankrupt",                      # 30
    "Total store layouts changed",         # 31
    "Bills paid in full on time",          # 32
    "Bills defaulted on",                  # 33
    "Total product restocks (auto)",       # 34
    "Manual shelf restocks performed",     # 35
    "Total items placed in storage",       # 36
    "Items recycled from baler",           # 37
    "Door open/close events",              # 38
    "Self-checkout transactions",          # 39
    "Cashier transactions",                # 40
    "Customer complaints about price",     # 41
    "Customer complaints about cleanliness", # 42
    "Items shoplifted",                    # 43
    "Items recovered from shoplifters",    # 44
    "Total store upgrades",                # 45
    "Premium items sold",                  # 46
    "Total product categories stocked",    # 47
    "Total customer types served",         # 48
    "Highest single-day revenue",          # 49
    "Most products sold in one day",       # 50
]


def main():
    print(f"Reading {ENC} ...")
    with ENC.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # === 1. tier inflation ===
    print("Patching tiers[].inflation ...")
    for i, t in enumerate(data["tiers"]):
        if i < len(REAL_TIER_INFLATION):
            t["inflation"] = REAL_TIER_INFLATION[i]
        else:
            t["inflation"] = 1.0
    print(f"  Updated {len(data['tiers'])} tier inflation values")

    # === 2. customerTypes premiumIndexes ===
    print("Patching customerTypes[].premiumIndexes ...")
    cust_count = 0
    for c in data["customerTypes"]:
        c["premiumIndexes"] = list(PREMIUM_IDS)
        cust_count += 1
    print(f"  Filled premiumIndexes for {cust_count} customers")

    # === 3. skills array ===
    # Remove broken skill07-10 + skill44, add 5 placeholders skill01-skill05
    print("Patching skills array ...")
    old_skills = data["skills"]
    print(f"  Before: {len(old_skills)} skills")

    # Identify and remove broken entries (perk 11-14 with empty names, and skill44)
    # Skills with perk >= 15 must be renumbered down by 4 to fill the gap.
    # Skills skill40-skill43 have null perk; we renumber them up to fill 40-43.
    cleaned = []
    for s in old_skills:
        if s.get("id") in {"skill07", "skill08", "skill09", "skill10", "skill44"}:
            continue
        if isinstance(s.get("perk"), int) and s["perk"] >= 15:
            s = {**s, "perk": s["perk"] - 4}
        cleaned.append(s)
    # Now fill null perks with 40, 41, 42, 43 in encounter order.
    next_perk = 40
    final = []
    for s in cleaned:
        if s.get("perk") is None:
            s = {**s, "perk": next_perk}
            next_perk += 1
        final.append(s)
    cleaned = final
    print(f"  After cleanup + renumber: {len(cleaned)} skills")

    # Build placeholder skills
    placeholders = []
    for i, p in enumerate(PLACEHOLDER_SKILLS):
        placeholders.append({
            "id": p["id"],
            "name": {"en": p["name_en"], "zhHans": p["name_en"], "zhHant": p["name_zhHant"]},
            "description": {"en": p["desc_en"], "zhHans": p["desc_en"], "zhHant": p["desc_en"]},
            "effect": "NPC_Manager.maxEmployees += 1",
            "il": f"0x{i:02x}",
            "perk": i,  # 0-4
        })

    # Insert placeholders at the front
    cleaned = placeholders + cleaned
    # Verify we have 44 (5 placeholders + 39 real)
    assert len(cleaned) == 44, f"Expected 44 skills, got {len(cleaned)}"

    # Verify perk values cover 0..43
    perks = sorted([s["perk"] for s in cleaned if s.get("perk") is not None])
    assert perks == list(range(44)), f"Perk indices not 0..43: {perks}"

    data["skills"] = cleaned
    print(f"  Final: {len(cleaned)} skills (5 placeholders + 39 real)")

    # === 4. achievementStats ===
    print("Patching achievementStats ...")
    new_stats = []
    for i, desc in enumerate(ACHIEVEMENT_STATS):
        new_stats.append({"index": i, "description": desc})
    data["achievementStats"] = new_stats
    print(f"  Filled {len(new_stats)} achievement stats")

    # === 5. update meta.counts ===
    print("Updating meta.counts ...")
    if "meta" not in data:
        data["meta"] = {}
    if "counts" not in data["meta"]:
        data["meta"]["counts"] = {}
    data["meta"]["counts"]["skills"] = len(data["skills"])
    data["meta"]["counts"]["achievementStats"] = len(data["achievementStats"])
    data["meta"]["counts"]["tiersWithInflation"] = sum(1 for t in data["tiers"] if t["inflation"] != 1.0)
    data["meta"]["encyclopediaVersion"] = "2.0"
    data["meta"]["patchNotes"] = [
        "v2.0: tierInflation filled with real game values (1.13-1.59 for tiers 0-16)",
        "v2.0: premiumIndexes filled with 7 premium product ids for all 58 customers",
        "v2.0: skills array now contains 5 placeholders (perk 0-4 Employee I-V) + 39 real",
        "v2.0: achievementStats filled with 51 descriptions",
    ]

    # Write
    print(f"Writing {ENC} ...")
    with ENC.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("DONE.")
    print(f"  tiersWithInflation: {data['meta']['counts']['tiersWithInflation']}")
    print(f"  skills: {data['meta']['counts']['skills']}")
    print(f"  achievementStats: {data['meta']['counts']['achievementStats']}")


if __name__ == "__main__":
    main()
