// Room sync client: connects to the room-service mini-service via socket.io.
// Falls back to BroadcastChannel for same-browser multi-tab sync if socket unavailable.
// All requests use the Caddy gateway: io('/?XTransformPort=3003').

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useRoomStore, useSaveStore } from './store'
import type { Room, RoomMember, SaveSnapshot } from './types'

const ROOM_PORT = 3003

function buildSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  try {
    return io('/', {
      path: '/',
      query: { XTransformPort: ROOM_PORT },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      timeout: 8000,
    })
  } catch {
    return null
  }
}

export function useRoomSync() {
  const room = useRoomStore((s) => s.room)
  const selfId = useRoomStore((s) => s.selfId)
  const selfName = useRoomStore((s) => s.selfName)
  const setConnected = useRoomStore((s) => s.setConnected)
  const joinRoom = useRoomStore((s) => s.joinRoom)
  const updateRoom = useRoomStore((s) => s.updateRoom)
  const upsertMember = useRoomStore((s) => s.upsertMember)
  const removeMember = useRoomStore((s) => s.removeMember)
  const setSnapshot = useRoomStore((s) => s.setSnapshot)
  const socketRef = useRef<Socket | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const [transport, setTransport] = useState<'socket' | 'broadcast' | 'offline'>('offline')

  // initialize socket once
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
      queueMicrotask(() => setTransport('broadcast'))
    }
    const sock = buildSocket()
    socketRef.current = sock
    if (!sock) {
      setupBroadcast()
      return
    }
    sock.on('connect', () => {
      setConnected(true)
      setTransport('socket')
    })
    sock.on('disconnect', () => {
      setConnected(false)
      setTransport('offline')
    })
    sock.on('connect_error', () => {
      // fall back to broadcast
      if (transport !== 'broadcast') {
        setupBroadcast()
      }
    })
    sock.on('room:state', (state: any) => {
      joinRoom(state)
    })
    sock.on('room:member-joined', (m: RoomMember) => upsertMember(m))
    sock.on('room:member-left', (m: { id: string }) => removeMember(m.id))
    sock.on('room:event', (evt: any) => {
      // append to events
      const r = useRoomStore.getState().room
      if (r) updateRoom({ events: [...r.events.slice(-99), evt] })
    })
    sock.on('room:chat', (msg: any) => {
      const r = useRoomStore.getState().room
      if (r) updateRoom({ events: [...r.events.slice(-99), { ...msg, type: 'chat' }] })
    })
    sock.on('room:cursor', (c: any) => {
      const r = useRoomStore.getState().room
      if (r) {
        const members = r.members.map((m) => (m.id === c.id ? { ...m, cursor: c.cursor } : m))
        updateRoom({ members })
      }
    })
    return () => {
      sock.disconnect()
      bcRef.current?.close()
    }
  }, [transport])

  const createRoom = useCallback(
    (name: string, playerName: string) => {
      const sock = socketRef.current
      if (sock && sock.connected) {
        sock.emit('room:create', { name, playerName }, (state: any) => {
          if (state && !state.error) {
            joinRoom(state)
            setConnected(true)
          }
        })
      } else {
        // broadcast fallback: generate a code, create local room
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
      }
    },
    [selfId, joinRoom, setConnected],
  )

  const joinByCode = useCallback(
    (code: string, playerName: string) => {
      const sock = socketRef.current
      if (sock && sock.connected) {
        sock.emit('room:join', { code: code.toUpperCase(), playerName }, (state: any) => {
          if (state && !state.error) {
            joinRoom(state)
            setConnected(true)
          }
        })
      } else {
        toastFallback()
      }
    },
    [joinRoom, setConnected],
  )

  const leaveRoom = useCallback(() => {
    const sock = socketRef.current
    if (sock && sock.connected) {
      sock.disconnect()
      // reconnect for future
      setTimeout(() => {
        const s = buildSocket()
        if (!s) return
        socketRef.current = s
        s.on('connect', () => {
          setConnected(true)
          setTransport('socket')
        })
      }, 500)
    }
    useRoomStore.getState().leaveRoom()
  }, [setConnected])

  const broadcastPatch = useCallback(
    (patch: Partial<Room>) => {
      const r = useRoomStore.getState().room
      if (!r) return
      updateRoom(patch)
      const sock = socketRef.current
      if (sock && sock.connected) {
        sock.emit('room:patch', patch)
      }
      bcRef.current?.postMessage({ type: 'state', room: { ...r, ...patch } })
    },
    [updateRoom],
  )

  const syncSnapshot = useCallback(
    (snapshot: SaveSnapshot | null) => {
      const sock = socketRef.current
      if (sock && sock.connected) {
        sock.emit('room:patch', { snapshot })
      }
      if (snapshot) {
        useRoomStore.getState().setSnapshot(snapshot)
        bcRef.current?.postMessage({ type: 'state', room: { ...useRoomStore.getState().room!, snapshot } })
      }
    },
    [],
  )

  const sendChat = useCallback((text: string) => {
    const sock = socketRef.current
    if (sock && sock.connected) {
      sock.emit('room:chat', { text })
    }
  }, [])

  return {
    transport,
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
    import('sonner').then(({ toast }) => toast.warning('Socket 服務未連線，僅支援同瀏覽器分頁同步'))
  }
}
