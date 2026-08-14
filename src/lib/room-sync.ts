// useRoomSync — Room sync hook with Supabase backend + local fallback.
//
// Two modes:
//   - 'backend'  (env vars configured): all ops hit Supabase. Realtime
//     channels on saves/members/events keep the room store in sync.
//   - 'local'    (env not configured): BroadcastChannel for same-browser
//     multi-tab sync. Passwords are bcrypt-hashed and stored in
//     localStorage so other tabs on the same browser can verify joins.
//
// The exported API matches the contract Room.tsx consumes:
//   { mode, transport, connected, ready, createRoom, joinRoom,
//     leaveRoom, uploadSave, lastError, clearError }

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoomStore, useSaveStore } from './store'
import type { Room, RoomMember, SaveSnapshot } from './types'
import { getIsSupabaseConfigured } from './backend-config'
import {
  createRoom as backendCreateRoom,
  joinRoom as backendJoinRoom,
  uploadSave as backendUploadSave,
  fetchSave,
  fetchSaveRow,
  fetchMembers,
  fetchEvents,
  heartbeat,
  leaveRoom as backendLeaveRoom,
  subscribeSave,
  subscribeMembers,
  subscribeEvents,
  verifyPassword,
  hashPassword,
  type MemberRow,
  type EventRow,
} from './backend-sync'

export type RoomSyncMode = 'local' | 'backend'
export type RoomTransport = 'supabase' | 'broadcast' | 'offline'

interface LocalRoomCreds {
  [code: string]: {
    name: string
    passwordHash: string
    hostId: string
    hostName: string
    createdAt: number
  }
}

const LOCAL_CREDS_KEY = 'stl-room-creds'

function readLocalCreds(): LocalRoomCreds {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CREDS_KEY) || '{}') as LocalRoomCreds
  } catch {
    return {}
  }
}

function writeLocalCreds(c: LocalRoomCreds) {
  try {
    localStorage.setItem(LOCAL_CREDS_KEY, JSON.stringify(c))
  } catch {
    /* ignore quota errors */
  }
}

const MEMBER_COLORS = [
  '#f43f5e',
  '#10b981',
  '#06b6d4',
  '#8b5cf6',
  '#f59e0e',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
]

function pickColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return MEMBER_COLORS[h % MEMBER_COLORS.length]
}

function memberFromRow(row: MemberRow): RoomMember {
  return {
    id: row.member_id,
    name: row.name,
    role: row.role,
    color: pickColor(row.member_id),
    cursor: null,
    lastSeen: new Date(row.last_seen).getTime(),
  }
}

function eventFromRow(row: EventRow) {
  return {
    id: String(row.id),
    ts: new Date(row.ts).getTime(),
    playerId: row.member_id,
    type: row.type,
    payload: row.payload ?? {},
  }
}

export function useRoomSync() {
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const setConnected = useRoomStore((s) => s.setConnected)
  const updateRoom = useRoomStore((s) => s.updateRoom)
  const removeMember = useRoomStore((s) => s.removeMember)

  const bcRef = useRef<BroadcastChannel | null>(null)
  const unsubRef = useRef<Array<() => void>>([])
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [mounted, setMounted] = useState(false)

  // Re-evaluate env config at render time inside the client component
  // so Turbopack inlines NEXT_PUBLIC_* correctly into the client bundle.
  const mode: RoomSyncMode = getIsSupabaseConfigured() ? 'backend' : 'local'
  const [transport, setTransport] = useState<RoomTransport>('offline')
  const [ready, setReady] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const clearError = useCallback(() => setLastError(null), [])

  // ---------- Mount: set up transport ----------
  useEffect(() => {
    setMounted(true)
    if (mode === 'backend') {
      setTransport('supabase')
      setConnected(true)
      setReady(true)
    } else {
      // Local mode: BroadcastChannel for same-browser multi-tab sync.
      if (typeof BroadcastChannel !== 'undefined' && !bcRef.current) {
        const bc = new BroadcastChannel('stl-room')
        bc.onmessage = (ev) => {
          const msg = ev.data
          if (!msg || !msg.type) return
          if (msg.type === 'state') updateRoom(msg.room)
          if (msg.type === 'member-left') removeMember(msg.id)
          if (msg.type === 'snapshot') {
            useRoomStore.getState().setSnapshot(msg.snapshot)
            useSaveStore.getState().setSnapshot(msg.snapshot)
          }
        }
        bcRef.current = bc
      }
      setTransport('broadcast')
      setConnected(true)
      setReady(true)
    }
    return () => {
      bcRef.current?.close()
      bcRef.current = null
      // Clean up any subscriptions.
      for (const fn of unsubRef.current) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
      unsubRef.current = []
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [mode, setConnected, updateRoom, removeMember])

  // ---------- Helper: clear subscriptions ----------
  const clearSubs = useCallback(() => {
    for (const fn of unsubRef.current) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    unsubRef.current = []
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  // ---------- Helper: setup backend realtime + heartbeat ----------
  const setupBackendSubscriptions = useCallback(
    (code: string) => {
      clearSubs()

      // Subscribe to save changes.
      unsubRef.current.push(
        subscribeSave(code, (snap) => {
          useSaveStore.getState().setSnapshot(snap)
          useRoomStore.getState().setSnapshot(snap)
        }),
      )

      // Subscribe to member changes — refetch full roster on any change.
      unsubRef.current.push(
        subscribeMembers(code, async () => {
          try {
            const rows = await fetchMembers(code)
            const members = rows.map(memberFromRow)
            updateRoom({ members })
          } catch (e) {
            console.warn('[room-sync] member refetch failed:', e)
          }
        }),
      )

      // Subscribe to new events — append to room.events.
      unsubRef.current.push(
        subscribeEvents(code, (e) => {
          const evt = eventFromRow(e)
          const r = useRoomStore.getState().room
          if (!r) return
          // Dedupe by event id.
          if (r.events.some((x) => x.id === evt.id)) return
          updateRoom({ events: [evt, ...r.events].slice(0, 200) })
        }),
      )

      // Heartbeat every 20s.
      heartbeatRef.current = setInterval(() => {
        heartbeat({ roomCode: code, memberId: selfId }).catch(() => {
          /* ignore */
        })
      }, 20_000)
    },
    [clearSubs, selfId, updateRoom],
  )

  // ---------- createRoom ----------
  const createRoom = useCallback(
    async (name: string, playerName: string, password: string): Promise<string> => {
      setLastError(null)
      try {
        if (mode === 'backend') {
          const { code } = await backendCreateRoom({
            name,
            password,
            hostId: selfId,
            hostName: playerName,
          })
          const host: RoomMember = {
            id: selfId,
            name: playerName,
            role: 'host',
            color: pickColor(selfId),
            cursor: null,
            lastSeen: Date.now(),
          }
          useRoomStore.getState().createRoom(code, name, host)
          useRoomStore.getState().setSelf(selfId, playerName)
          // Pre-fetch members + save (likely empty).
          try {
            const rows = await fetchMembers(code)
            updateRoom({ members: rows.map(memberFromRow) })
          } catch {
            /* ignore */
          }
          setupBackendSubscriptions(code)
          return code
        }

        // Local mode
        if (!password) throw new Error('請輸入房間密碼')
        if (!name) throw new Error('請輸入房間名稱')
        if (!playerName) throw new Error('請輸入你的名字')
        const code = Math.random().toString(36).slice(2, 8).toUpperCase()
        const passwordHash = hashPassword(password)
        const creds = readLocalCreds()
        creds[code] = {
          name,
          passwordHash,
          hostId: selfId,
          hostName: playerName,
          createdAt: Date.now(),
        }
        writeLocalCreds(creds)
        const host: RoomMember = {
          id: selfId,
          name: playerName,
          role: 'host',
          color: pickColor(selfId),
          cursor: null,
          lastSeen: Date.now(),
        }
        useRoomStore.getState().createRoom(code, name, host)
        useRoomStore.getState().setSelf(selfId, playerName)
        bcRef.current?.postMessage({
          type: 'state',
          room: useRoomStore.getState().room,
        })
        return code
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setLastError(msg)
        throw e
      }
    },
    [mode, selfId, setupBackendSubscriptions, updateRoom],
  )

  // ---------- joinRoom ----------
  const joinRoom = useCallback(
    async (code: string, playerName: string, password: string): Promise<boolean> => {
      setLastError(null)
      const upperCode = code.toUpperCase().trim()
      try {
        if (mode === 'backend') {
          const { room: roomRow } = await backendJoinRoom({
            code: upperCode,
            password,
            memberId: selfId,
            memberName: playerName,
          })
          const me: RoomMember = {
            id: selfId,
            name: playerName,
            role: roomRow.host_id === selfId ? 'host' : 'member',
            color: pickColor(selfId),
            cursor: null,
            lastSeen: Date.now(),
          }
          // Build a minimal Room object in the store; members + snapshot
          // will be populated by fetch + realtime.
          const stub: Room = {
            id: upperCode,
            code: upperCode,
            name: roomRow.name,
            createdAt: new Date(roomRow.created_at).getTime(),
            members: [me],
            snapshot: null,
            checklist: [],
            tasks: [],
            pricePlan: [],
            restockPlan: [],
            shelfAssignments: {},
            skillVotes: {},
            events: [],
          }
          useRoomStore.getState().joinRoom(stub)
          useRoomStore.getState().setSelf(selfId, playerName)

          // Fetch members + save + recent events.
          try {
            const rows = await fetchMembers(upperCode)
            updateRoom({ members: rows.map(memberFromRow) })
          } catch {
            /* ignore */
          }
          try {
            const saveRow = await fetchSaveRow(upperCode)
            if (saveRow) {
              useSaveStore.getState().setSnapshot(saveRow.snapshot)
              useRoomStore.getState().setSnapshot(saveRow.snapshot)
            }
          } catch {
            /* ignore */
          }
          try {
            const evs = await fetchEvents(upperCode, 50)
            const r = useRoomStore.getState().room
            if (r) {
              const mapped = evs.map(eventFromRow)
              // Reverse to chronological asc for display, then dedupe later.
              updateRoom({ events: mapped })
            }
          } catch {
            /* ignore */
          }

          setupBackendSubscriptions(upperCode)
          return true
        }

        // Local mode — verify against localStorage if a room was created
        // on this browser; otherwise simulate (cross-browser impossible).
        const creds = readLocalCreds()
        const entry = creds[upperCode]
        if (entry) {
          if (!verifyPassword(password, entry.passwordHash)) {
            throw new Error('房間代碼或密碼錯誤')
          }
        }
        // No entry → simulate (e.g. joining a room code shared verbally
        // across browsers in local mode has no real backend to check).
        const me: RoomMember = {
          id: selfId,
          name: playerName,
          role: 'member',
          color: pickColor(selfId),
          cursor: null,
          lastSeen: Date.now(),
        }
        const stub: Room = {
          id: upperCode,
          code: upperCode,
          name: entry?.name ?? `房間 ${upperCode}`,
          createdAt: entry?.createdAt ?? Date.now(),
          members: [me],
          snapshot: null,
          checklist: [],
          tasks: [],
          pricePlan: [],
          restockPlan: [],
          shelfAssignments: {},
          skillVotes: {},
          events: [],
        }
        useRoomStore.getState().joinRoom(stub)
        useRoomStore.getState().setSelf(selfId, playerName)
        bcRef.current?.postMessage({
          type: 'state',
          room: useRoomStore.getState().room,
        })
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setLastError(msg)
        throw e
      }
    },
    [mode, selfId, setupBackendSubscriptions, updateRoom],
  )

  // ---------- uploadSave (host-only) ----------
  const uploadSave = useCallback(async (): Promise<void> => {
    setLastError(null)
    try {
      const snap = useSaveStore.getState().snapshot
      const r = useRoomStore.getState().room
      if (!snap) throw new Error('尚未載入存檔，請先到「存檔上傳」頁面載入或上傳 .es3 檔。')
      if (!r) throw new Error('尚未加入房間')

      if (mode === 'backend') {
        await backendUploadSave({
          roomCode: r.code,
          snapshot: snap,
          uploaderId: selfId,
        })
        // Local mirror + optimistic update.
        useRoomStore.getState().setSnapshot(snap)
        return
      }

      // Local mode
      useRoomStore.getState().setSnapshot(snap)
      const updated = useRoomStore.getState().room
      if (updated) {
        bcRef.current?.postMessage({ type: 'snapshot', snapshot: snap })
        bcRef.current?.postMessage({ type: 'state', room: updated })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLastError(msg)
      throw e
    }
  }, [mode, selfId])

  // ---------- leaveRoom ----------
  const leaveRoom = useCallback(async (): Promise<void> => {
    setLastError(null)
    const r = useRoomStore.getState().room
    try {
      if (mode === 'backend' && r) {
        clearSubs()
        await backendLeaveRoom({ roomCode: r.code, memberId: selfId }).catch(() => {
          /* ignore — best effort */
        })
      } else if (bcRef.current && r) {
        bcRef.current.postMessage({ type: 'member-left', id: selfId })
      }
    } finally {
      useRoomStore.getState().leaveRoom()
    }
  }, [mode, selfId, clearSubs])

  // ---------- Cleanup on unmount ----------
  useEffect(() => {
    return () => {
      clearSubs()
    }
  }, [clearSubs])

  return {
    mode,
    transport: mounted ? transport : 'offline',
    connected: mounted,
    ready,
    createRoom,
    joinRoom,
    leaveRoom,
    uploadSave,
    lastError,
    clearError,
  }
}

// Re-export SaveSnapshot type for consumers that may import from here.
export type { SaveSnapshot }
