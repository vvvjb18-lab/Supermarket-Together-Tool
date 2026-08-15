// Global app state via Zustand.
// Three stores: encyclopedia (static), save (current snapshot), room (multiplayer).

'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SaveSnapshot, Room, RoomMember, ChecklistItem, TaskAssignment, PriceExperiment, RestockItem } from './types'
import { demoSave } from './data-loader'

// ---------- save store ----------
interface SaveStore {
  snapshot: SaveSnapshot | null
  setSnapshot: (s: SaveSnapshot | null) => void
  loadDemo: () => void
  clear: () => void
  updatePricing: (productId: number, price: number) => void
}

export const useSaveStore = create<SaveStore>()(
  persist(
    (set) => ({
      snapshot: null,
      setSnapshot: (s) => set({ snapshot: s }),
      loadDemo: () => set({ snapshot: { ...demoSave } }),
      clear: () => set({ snapshot: null }),
      updatePricing: (productId, price) =>
        set((state) => {
          if (!state.snapshot) return {}
          const productPlayerPricing = { ...state.snapshot.productPlayerPricing, [productId]: price }
          return { snapshot: { ...state.snapshot, productPlayerPricing } }
        }),
    }),
    { name: 'stl-save', storage: createJSONStorage(() => localStorage) },
  ),
)

// ---------- UI store (theme, active view, command palette) ----------
type ViewId =
  | 'dashboard'
  | 'upload'
  | 'wiki'
  | 'profit'
  | 'salt'
  | 'simulator'
  | 'restock'
  | 'pricing'
  | 'layout'
  | 'containers'
  | 'skills'
  | 'employees'
  | 'manufacturing'
  | 'seasons'
  | 'achievements'
  | 'exploits'
  | 'rawdata'
  | 'room'
  | 'atlas'

export type Lang = 'zhHant' | 'en' | 'both'

interface UIStore {
  view: ViewId
  setView: (v: ViewId) => void
  commandOpen: boolean
  setCommandOpen: (b: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  selectedProductId: number | null
  setSelectedProduct: (id: number | null) => void
  /** Display language for game data names. Default zhHant (matches in-game Chinese UI). */
  lang: Lang
  setLang: (l: Lang) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      view: 'dashboard',
      setView: (view) => set({ view }),
      commandOpen: false,
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      selectedProductId: null,
      setSelectedProduct: (selectedProductId) => set({ selectedProductId }),
      lang: 'zhHant',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'stl-ui', storage: createJSONStorage(() => localStorage) },
  ),
)

export type { ViewId }

// ---------- room store ----------
interface RoomStore {
  room: Room | null
  selfId: string
  selfName: string
  connected: boolean
  setSelf: (id: string, name: string) => void
  setConnected: (b: boolean) => void
  createRoom: (code: string, name: string, host: RoomMember) => void
  joinRoom: (room: Room) => void
  leaveRoom: () => void
  updateRoom: (patch: Partial<Room>) => void
  upsertMember: (m: RoomMember) => void
  removeMember: (id: string) => void
  setSnapshot: (s: SaveSnapshot) => void
  toggleChecklist: (id: string) => void
  addChecklist: (label: string) => void
  removeChecklist: (id: string) => void
  addTask: (t: TaskAssignment) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  assignTask: (id: string, playerId: string) => void
  addPriceExperiment: (e: PriceExperiment) => void
  voteSkill: (skillId: string, playerId: string) => void
  unvoteSkill: (skillId: string, playerId: string) => void
  setRestockPlan: (items: RestockItem[]) => void
  assignShelf: (propIndex: string, playerId: string) => void
}

const SELF_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

export const useRoomStore = create<RoomStore>()(
  persist(
    (set, get) => ({
      room: null,
      selfId: SELF_ID,
      selfName: 'Player',
      connected: false,
      setSelf: (selfId, selfName) => set({ selfId, selfName }),
      setConnected: (connected) => set({ connected }),
      createRoom: (code, name, host) =>
        set({
          room: {
            id: code,
            code,
            name,
            createdAt: Date.now(),
            members: [host],
            snapshot: null,
            checklist: defaultChecklist(),
            tasks: defaultTasks(),
            pricePlan: [],
            restockPlan: [],
            shelfAssignments: {},
            skillVotes: {},
            events: [],
          },
        }),
      joinRoom: (room) => set({ room }),
      leaveRoom: () => set({ room: null, connected: false }),
      updateRoom: (patch) => set((s) => (s.room ? { room: { ...s.room, ...patch } } : {})),
      upsertMember: (m) =>
        set((s) => {
          if (!s.room) return {}
          const exists = s.room.members.find((x) => x.id === m.id)
          const members = exists ? s.room.members.map((x) => (x.id === m.id ? m : x)) : [...s.room.members, m]
          return { room: { ...s.room, members } }
        }),
      removeMember: (id) =>
        set((s) => (s.room ? { room: { ...s.room, members: s.room.members.filter((m) => m.id !== id) } } : {})),
      setSnapshot: (snap) =>
        set((s) => (s.room ? { room: { ...s.room, snapshot: snap } } : {})),
      toggleChecklist: (id) =>
        set((s) => {
          if (!s.room) return {}
          return {
            room: {
              ...s.room,
              checklist: s.room.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
            },
          }
        }),
      addChecklist: (label) =>
        set((s) =>
          s.room
            ? { room: { ...s.room, checklist: [...s.room.checklist, { id: Math.random().toString(36).slice(2), label, done: false }] } }
            : {},
        ),
      removeChecklist: (id) =>
        set((s) =>
          s.room ? { room: { ...s.room, checklist: s.room.checklist.filter((c) => c.id !== id) } } : {},
        ),
      addTask: (t) => set((s) => (s.room ? { room: { ...s.room, tasks: [...s.room.tasks, t] } } : {})),
      toggleTask: (id) =>
        set((s) =>
          s.room
            ? { room: { ...s.room, tasks: s.room.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) } }
            : {},
        ),
      removeTask: (id) =>
        set((s) => (s.room ? { room: { ...s.room, tasks: s.room.tasks.filter((t) => t.id !== id) } } : {})),
      assignTask: (id, playerId) =>
        set((s) =>
          s.room
            ? { room: { ...s.room, tasks: s.room.tasks.map((t) => (t.id === id ? { ...t, assignedTo: playerId } : t)) } }
            : {},
        ),
      addPriceExperiment: (e) =>
        set((s) => (s.room ? { room: { ...s.room, pricePlan: [...s.room.pricePlan.filter((x) => x.id !== e.id), e] } } : {})),
      voteSkill: (skillId, playerId) =>
        set((s) => {
          if (!s.room) return {}
          const cur = s.room.skillVotes[skillId] ?? []
          if (cur.includes(playerId)) return {}
          return { room: { ...s.room, skillVotes: { ...s.room.skillVotes, [skillId]: [...cur, playerId] } } }
        }),
      unvoteSkill: (skillId, playerId) =>
        set((s) => {
          if (!s.room) return {}
          const cur = s.room.skillVotes[skillId] ?? []
          return { room: { ...s.room, skillVotes: { ...s.room.skillVotes, [skillId]: cur.filter((p) => p !== playerId) } } }
        }),
      setRestockPlan: (items) => set((s) => (s.room ? { room: { ...s.room, restockPlan: items } } : {})),
      assignShelf: (propIndex, playerId) =>
        set((s) => (s.room ? { room: { ...s.room, shelfAssignments: { ...s.room.shelfAssignments, [propIndex]: playerId } } } : {})),
    }),
    {
      name: 'stl-room',
      storage: createJSONStorage(() => localStorage),
      // Only persist stable identity — the live `room`/`connected` state must
      // NOT be rehydrated (it would surface stale members/snapshot after a
      // reload, and realtime subscriptions would not be re-established).
      partialize: (s) => ({ selfId: s.selfId, selfName: s.selfName }),
    },
  ),
)

function defaultChecklist(): ChecklistItem[] {
  return [
    { id: 'c1', label: '價格已檢查（無過高/過低）', done: false },
    { id: 'c2', label: '高 demand 商品已補貨', done: false },
    { id: 'c3', label: '空貨架已填充', done: false },
    { id: 'c4', label: '員工任務已分配', done: false },
    { id: 'c5', label: '訂貨計畫已確認', done: false },
    { id: 'c6', label: '製造佇列已設定', done: false },
    { id: 'c7', label: '防盜/監控已就位', done: false },
  ]
}

function defaultTasks(): TaskAssignment[] {
  return [
    { id: 't1', playerId: '', category: 'buy', label: '採購高 demand 商品', done: false },
    { id: 't2', playerId: '', category: 'restock', label: '補貨到貨架', done: false },
    { id: 't3', playerId: '', category: 'manufacturing', label: '製造佇列管理', done: false },
    { id: 't4', playerId: '', category: 'checkout', label: '結帳/訂單處理', done: false },
    { id: 't5', playerId: '', category: 'security', label: '防盜巡邏', done: false },
  ]
}
