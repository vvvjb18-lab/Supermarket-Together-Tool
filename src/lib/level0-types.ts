// Types and loader for the pre-extracted level0 static geometry.
//
// The level0 Unity scene file is parsed offline by
// scripts/extract-level0.py (using UnityPy) into a static JSON file
// that ships with the app. This module provides typed access to it.
//
// Two layers:
//   - "ground"  : floor, outerWall, wallTop, pillar  (Y < 2.2)
//   - "ceiling" : ceiling, beam, light, vent          (Y >= 2.2 or name-based)
//
// Combined with save.json's dynamic props (shelves/decorations/doors)
// in store-layout.tsx, this produces a complete two-layer store map.

import level0Data from '@/data/level0-geometry.json'

export type StructureCategory =
  | 'floor'
  | 'outerWall'
  | 'wallTop'
  | 'pillar'
  | 'ceiling'
  | 'beam'
  | 'light'
  | 'vent'

export type StructureLayer = 'ground' | 'ceiling'

export interface StructureObject {
  name: string
  baseName: string
  category: StructureCategory
  layer: StructureLayer
  x: number
  y: number
  z: number
}

export interface Level0Meta {
  source: string
  unityVersion: string
  extractedWith: string
  objectCounts: {
    total: number
    gameObjects: number
    transforms: number
    rectTransforms: number
  }
  skipped: {
    ui: number
    unclassified: number
    noTransform: number
  }
  byCategory: Record<string, number>
  byLayer: Record<string, number>
  topBaseNames: Record<string, number>
  boundingBox: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
}

export interface Level0Geometry {
  _meta: Level0Meta
  objects: StructureObject[]
}

export const level0Geometry = level0Data as Level0Geometry

// Convenience: bounding box of the store structure.
export const storeBounds = level0Geometry._meta.boundingBox

// Convenience: objects grouped by category.
export const structureByCategory: Record<StructureCategory, StructureObject[]> =
  (() => {
    const groups: Record<string, StructureObject[]> = {}
    for (const o of level0Geometry.objects) {
      ;(groups[o.category] ??= []).push(o)
    }
    return groups as Record<StructureCategory, StructureObject[]>
  })()

// Door inference: the front wall is at Z = -3, composed of 5 wall
// segments at X = -12, -6, 0, +6, +12. The 4 gaps between them
// (X = -9, -3, +3, +9) are the 4 entrance doors.
// Door states come from save.json's decoded.DoorStates array (len=4).
export const DOOR_POSITIONS = [
  { x: -9, z: -3, label: '門 1' },
  { x: -3, z: -3, label: '門 2' },
  { x: 3, z: -3, label: '門 3' },
  { x: 9, z: -3, label: '門 4' },
] as const

export type DoorState = 'closed' | 'open' | 'auto' | 'unknown'

/** Map save.json DoorStates int values → semantic state. */
export function doorStateFromInt(v: number | undefined): DoorState {
  if (v === 0) return 'closed'
  if (v === 1) return 'open'
  if (v === 2) return 'auto'
  return 'unknown'
}
