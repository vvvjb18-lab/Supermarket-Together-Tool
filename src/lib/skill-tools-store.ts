// Tiny store for skill-tool inter-tool state sharing (Task 11-b).
// The orchestrator forbids editing src/lib/store.ts, so we create a small
// dedicated Zustand store for the Build Planner / FP Simulator / NextStep
// recommender to share state without touching the main store.
//
// State:
//   - buildPlan: number[] (skill ids from encyclopedia.skills[*].id)
//   - simSelection: number[] (perk indices selected in the FP simulator)
//   - lastApplySource: string | null (which tool last touched the plan, for toasts)
//
// Persisted to localStorage so the user can refresh and keep their build.

'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SkillToolsState {
  /** Skill ids (encyclopedia.skills[*].id, e.g. 'skill1') in the Build plan. */
  buildPlan: string[]
  /** Perk indices (0-43) selected in the FP simulator. */
  simSelection: number[]
  /** Track which tool last touched the plan (for UX feedback only). */
  lastApplySource: string | null
  /** Add a skill id to the build plan (no-op if already present). */
  addToBuild: (skillId: string, source?: string) => void
  /** Add many skill ids at once (preserves order, dedupes). */
  addManyToBuild: (skillIds: string[], source?: string) => void
  /** Remove a skill id from the build plan. */
  removeFromBuild: (skillId: string) => void
  /** Replace the entire build plan. */
  setBuildPlan: (skillIds: string[], source?: string) => void
  /** Clear the build plan. */
  clearBuild: () => void
  /** Toggle a perk index in the FP simulator. */
  toggleSim: (perkIdx: number) => void
  /** Replace the entire simulator selection. */
  setSimSelection: (perkIdxs: number[]) => void
  /** Clear the simulator selection. */
  clearSim: () => void
}

export const useSkillToolsStore = create<SkillToolsState>()(
  persist(
    (set) => ({
      buildPlan: [],
      simSelection: [],
      lastApplySource: null,
      addToBuild: (skillId, source) =>
        set((s) =>
          s.buildPlan.includes(skillId)
            ? s
            : { buildPlan: [...s.buildPlan, skillId], lastApplySource: source ?? null },
        ),
      addManyToBuild: (skillIds, source) =>
        set((s) => {
          const next = [...s.buildPlan]
          for (const id of skillIds) {
            if (!next.includes(id)) next.push(id)
          }
          return { buildPlan: next, lastApplySource: source ?? null }
        }),
      removeFromBuild: (skillId) =>
        set((s) => ({ buildPlan: s.buildPlan.filter((id) => id !== skillId) })),
      setBuildPlan: (skillIds, source) =>
        set({ buildPlan: skillIds, lastApplySource: source ?? null }),
      clearBuild: () => set({ buildPlan: [] }),
      toggleSim: (perkIdx) =>
        set((s) => ({
          simSelection: s.simSelection.includes(perkIdx)
            ? s.simSelection.filter((p) => p !== perkIdx)
            : [...s.simSelection, perkIdx],
        })),
      setSimSelection: (perkIdxs) => set({ simSelection: perkIdxs }),
      clearSim: () => set({ simSelection: [] }),
    }),
    {
      name: 'stl-skill-tools',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
