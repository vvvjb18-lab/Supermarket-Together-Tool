#!/usr/bin/env python3
"""
Extract static store geometry from Unity level0 scene file.

Outputs: src/data/level0-geometry.json

The level0 file is a Unity binary scene containing ~1185 GameObjects.
We walk every GameObject's m_Transform, compute world coordinates by
accumulating m_LocalPosition up the m_Father chain, then classify each
object by (name keyword, Y height) into structure categories.

Usage:
    python3 scripts/extract-level0.py
"""

import json
import os
import re
import sys
from collections import Counter

import UnityPy

# ----------------------------------------------------------------
# Config
# ----------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LEVEL0_PATH = os.path.join(ROOT, "upload", "level0")
OUTPUT_PATH = os.path.join(ROOT, "src", "data", "level0-geometry.json")

GROUND_Y_MAX = 2.2

# ----------------------------------------------------------------
# Classification rules (order matters — first match wins)
# ----------------------------------------------------------------
RULES = [
    # --- Ground layer ---
    (re.compile(r"^UModeler_Floor2?$"), "floor", "ground"),
    (re.compile(r"^Umodeler_OuterLargeWall$"), "outerWall", "ground"),
    (re.compile(r"^UMO_SmallOuterWall$"), "outerWall", "ground"),
    (re.compile(r"^UModeler_CrossWall$"), "outerWall", "ground"),
    (re.compile(r"^UModeler_WallTop$"), "wallTop", "ground"),
    (re.compile(r"^Pillar_Tee$"), "pillar", "ground"),
    (re.compile(r"^Pillar_Corner$"), "pillar", "ground"),
    (re.compile(r"^Pillar_BeamCross$"), "pillar", "ground"),
    # --- Ceiling layer ---
    # UModeler_Ceiling exists at two Y ranges: ~0.25 (low region) and
    # ~4.5 (high region). Both are ceiling — classify by NAME not Y.
    (re.compile(r"^UModeler_Ceiling2?$"), "ceiling", "ceiling"),
    (re.compile(r"^Beam$"), "beam", "ceiling"),
    (re.compile(r"^PillarTop_Beam(Cross|Tee|Left)$"), "beam", "ceiling"),
    (re.compile(r"^Point Light$"), "light", "ceiling"),
    (re.compile(r"^Neon_"), "light", "ceiling"),
    (re.compile(r"^Vent$"), "vent", "ceiling"),
]


def strip_instance_suffix(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", name)


def classify(name: str, y: float):
    base = strip_instance_suffix(name).strip()
    for rx, cat, layer in RULES:
        if rx.search(base):
            # Only sanity-check Y for ground-layer objects that might
            # float high due to nesting. Ceiling objects are classified
            # purely by name (they exist at both Y≈0.25 and Y≈4.5).
            if layer == "ground" and y > GROUND_Y_MAX + 1.0:
                continue
            return cat, layer
    return None, None


# ----------------------------------------------------------------
# Main extraction
# ----------------------------------------------------------------
def main():
    if not os.path.exists(LEVEL0_PATH):
        print(f"ERROR: level0 not found at {LEVEL0_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {LEVEL0_PATH} ...")
    env = UnityPy.load(LEVEL0_PATH)
    objs = list(env.objects)
    by_id = {o.path_id: o for o in objs}
    print(f"  {len(objs)} objects total, {len(by_id)} unique path_ids")

    # Count types
    type_counts = Counter(o.type.name for o in objs)
    print(f"  types: {dict(type_counts.most_common(8))}")

    memo = {}
    extracted = []
    skipped_ui = 0
    skipped_unclassified = 0
    skipped_notransform = 0
    name_counter = Counter()

    def compute_world(t_pathid):
        if t_pathid in memo:
            return memo[t_pathid]
        if t_pathid not in by_id:
            return (0.0, 0.0, 0.0)
        # Walk father chain
        chain = []
        cur = t_pathid
        visiting = set()
        while cur is not None and cur not in visiting and cur in by_id:
            visiting.add(cur)
            chain.append(cur)
            t_obj = by_id[cur]
            try:
                td = t_obj.read()
                father = td.m_Father
                cur = father.m_PathID if father else None
            except Exception:
                cur = None
        # Accumulate from root -> leaf
        total = [0.0, 0.0, 0.0]
        for tid in reversed(chain):
            if tid not in by_id:
                continue
            t_obj = by_id[tid]
            # Skip RectTransforms (UI)
            if t_obj.type.name == "RectTransform":
                return None  # signal UI
            try:
                td = t_obj.read()
                pos = td.m_LocalPosition
                total[0] += float(pos.x)
                total[1] += float(pos.y)
                total[2] += float(pos.z)
                memo[tid] = tuple(total)
            except Exception:
                continue
        return tuple(total)

    for o in objs:
        if o.type.name != "GameObject":
            continue
        try:
            go = o.read()
            name = go.m_Name or ""
        except Exception:
            continue
        if not name.strip():
            continue

        mt = go.m_Transform
        if not mt or not mt.m_PathID:
            skipped_notransform += 1
            continue

        t_obj = by_id.get(mt.m_PathID)
        if t_obj is None:
            skipped_notransform += 1
            continue

        # Skip UI (RectTransform)
        if t_obj.type.name == "RectTransform":
            skipped_ui += 1
            continue

        world = compute_world(mt.m_PathID)
        if world is None:
            skipped_ui += 1
            continue
        wx, wy, wz = world

        cat, layer = classify(name, wy)
        name_counter[strip_instance_suffix(name)] += 1

        if cat is None:
            skipped_unclassified += 1
            continue

        extracted.append({
            "name": name,
            "baseName": strip_instance_suffix(name),
            "category": cat,
            "layer": layer,
            "x": round(wx, 4),
            "y": round(wy, 4),
            "z": round(wz, 4),
        })

    xs = [e["x"] for e in extracted]
    zs = [e["z"] for e in extracted]
    bbox = {
        "minX": round(min(xs), 4) if xs else 0,
        "maxX": round(max(xs), 4) if xs else 0,
        "minZ": round(min(zs), 4) if zs else 0,
        "maxZ": round(max(zs), 4) if zs else 0,
    }

    by_cat = Counter(e["category"] for e in extracted)
    by_layer = Counter(e["layer"] for e in extracted)

    output = {
        "_meta": {
            "source": "upload/level0",
            "unityVersion": "2023.2.22f1",
            "extractedWith": "UnityPy + scripts/extract-level0.py",
            "objectCounts": {
                "total": len(objs),
                "gameObjects": type_counts.get("GameObject", 0),
                "transforms": type_counts.get("Transform", 0),
                "rectTransforms": type_counts.get("RectTransform", 0),
            },
            "skipped": {
                "ui": skipped_ui,
                "unclassified": skipped_unclassified,
                "noTransform": skipped_notransform,
            },
            "byCategory": dict(by_cat),
            "byLayer": dict(by_layer),
            "topBaseNames": dict(name_counter.most_common(30)),
            "boundingBox": bbox,
        },
        "objects": extracted,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n=== Extraction complete ===")
    print(f"  Extracted: {len(extracted)} structure objects")
    print(f"  Skipped UI: {skipped_ui}")
    print(f"  Skipped no-transform: {skipped_notransform}")
    print(f"  Skipped unclassified: {skipped_unclassified}")
    print(f"  By category: {dict(by_cat)}")
    print(f"  By layer: {dict(by_layer)}")
    print(f"  Bounding box: X[{bbox['minX']}, {bbox['maxX']}]  Z[{bbox['minZ']}, {bbox['maxZ']}]")
    print(f"  Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
