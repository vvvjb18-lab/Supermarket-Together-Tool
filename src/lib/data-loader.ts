// Loads the generated encyclopedia.json and demo-save.json into typed objects.
import encyclopediaJson from './data/encyclopedia.json'
import demoSaveJson from './data/demo-save.json'
import type { Encyclopedia, SaveSnapshot, Product, Tier, ProductGroup, Buildable, Container } from './types'

export const encyclopedia = encyclopediaJson as unknown as Encyclopedia
export const demoSave = demoSaveJson as unknown as SaveSnapshot

// pre-indexed maps for fast lookup
export const productById = new Map<number, Product>(encyclopedia.products.map((p) => [p.id, p]))
export const tierById = new Map<number, Tier>(encyclopedia.tiers.map((t) => [t.id, t]))
export const groupById = new Map<number, ProductGroup>(encyclopedia.productGroups.map((g) => [g.id, g]))
export const buildableById = new Map<number, Buildable>(encyclopedia.buildables.map((b) => [b.id, b]))
export const containerByBuildableName = new Map<string, Container>(encyclopedia.containers.map((c) => [c.buildableName, c]))

export function productName(id: number): string {
  return productById.get(id)?.name.en ?? `#${id}`
}

export function productZhName(id: number): string {
  return productById.get(id)?.name.zhHant ?? `#${id}`
}
