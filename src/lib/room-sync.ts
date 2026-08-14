// Room sync client.
//
// STATUS (Task 10): The socket.io mini-service on :3003 has been DISABLED.
// We are migrating to a backend service (Supabase recommended) with room
// password auth, where only the host uploads the save. See
// /home/z/my-project/BACKEND_SYNC_RECOMMENDATION.md for the migration plan.
//
// Until the backend is wired up, room state operates in LOCAL mode:
//   - Room store is persisted to localStorage (Zustand persist).
//   - BroadcastChannel enables same-browser multi-tab sync (e.g. opening
//     the app in two tabs to simulate host + member).
//   - No cross-device sync. The UI shows a "本地模式" banner.
//
// The socket.io code path is retained but buildSocket() returns null so
// no connection is ever attempted. When the backend lands, replace
// buildSocket + the emit/on handlers with Supabase client calls.

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRoomStore } from './store'
import type { Room, RoomMember, SaveSnapshot } from './types'

/** @deprecated socket.io disabled in Task 10 — returns null. Backend TBD. */
function buildSocket(): null {
  return null
}

export type RoomSyncMode = 'local' | 'backend'

export function useRoomSync() {
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const selfName = useRoomStore((s) => s.selfName)
  const setConnected = useRoomStore((s) => s.setConnected)
  const updateRoom = useRoomStore((s) => s.updateRoom)
  const removeMember = useRoomStore((s) => s.removeMember)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const [transport, setTransport] = useState<'socket' | 'broadcast' | 'offline'>('offline')
  const [mode, setMode] = useState<RoomSyncMode>('local')

  // initialize BroadcastChannel once (socket.io disabled)
  useEffect(() => {
    const setupBroadcast = () => {
      if (!bcRef.current && typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('stl-room')
        bc.onmessage = (ev) => {
          const msg = ev.data
          if (!msg || !msg.type) return
          if (msg.type === 'state') updateRoom(msg.room)
          if (msg.type === 'member-left') removeMember(msg.id)
        }
        bcRef.current = bc
      }
      queueMicrotask(() => {
        setTransport('broadcast')
        setConnected(true)
        setMode('local')
      })
    }
    setupBroadcast()
    return () => {
      bcRef.current?.close()
      bcRef.current = null
    }
  }, [setConnected, updateRoom, removeMember])

  const createRoom = useCallback(
    (name: string, playerName: string) => {
      // LOCAL mode (socket.io disabled): generate code, create local room,
      // broadcast to same-browser tabs.
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()
      const host: RoomMember = {
        id: selfId,
        name: playerName,
        role: 'host',
        color: '#f43f5e',
        cursor: null,
        lastSeen: Date.now(),
      }
      useRoomStore.getState().createRoom(code, name, host)
      bcRef.current?.postMessage({ type: 'state', room: useRoomStore.getState().room })
      setConnected(true)
      setMode('local')
    },
    [selfId, setConnected],
  )

  const joinByCode = useCallback(
    (_code: string, _playerName: string) => {
      // LOCAL mode: cross-device join not available until backend is wired.
      toastFallback()
    },
    [],
  )

  const leaveRoom = useCallback(() => {
    bcRef.current?.postMessage({ type: 'member-left', id: selfId })
    useRoomStore.getState().leaveRoom()
  }, [selfId])

  const broadcastPatch = useCallback(
    (patch: Partial<Room>) => {
      const r = useRoomStore.getState().room
      if (!r) return
      updateRoom(patch)
      bcRef.current?.postMessage({ type: 'state', room: { ...r, ...patch } })
    },
    [updateRoom],
  )

  const syncSnapshot = useCallback(
    (snapshot: SaveSnapshot | null) => {
      if (snapshot) {
        useRoomStore.getState().setSnapshot(snapshot)
        const r = useRoomStore.getState().room
        if (r) {
          bcRef.current?.postMessage({ type: 'state', room: { ...r, snapshot } })
        }
      }
    },
    [],
  )

  const sendChat = useCallback((_text: string) => {
    // LOCAL mode: chat not synced across devices. Could store locally if needed.
  }, [])

  return {
    transport,
    mode,
    createRoom,
    joinByCode,
    leaveRoom,
    broadcastPatch,
    syncSnapshot,
    sendChat,
    room,
    selfId,
    selfName,
  }
}

function toastFallback() {
  if (typeof window !== 'undefined') {
    import('sonner').then(({ toast }) =>
      toast.info('多人同步已停用（遷移至後端服務中）。目前僅支援同瀏覽器分頁同步。'),
    )
  }
}
