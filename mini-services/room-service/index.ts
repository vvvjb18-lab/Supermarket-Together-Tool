// Supermarket Together Lab — Room sync mini-service.
// Port 3003. Socket.IO with path '/' (required by Caddy gateway).
// Collections mirror Firestore-style: rooms/{roomId} with members, snapshots, plans, events.

import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface RoomState {
  id: string
  name: string
  members: Map<string, { id: string; name: string; role: 'host' | 'member'; color: string; lastSeen: number }>
  data: {
    snapshot: any | null
    checklist: any[]
    tasks: any[]
    pricePlan: any[]
    restockPlan: any[]
    shelfAssignments: Record<string, string>
    skillVotes: Record<string, string[]>
  }
}

const rooms = new Map<string, RoomState>()

function genCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function getOrCreateRoom(roomId: string, name: string): RoomState {
  let room = rooms.get(roomId)
  if (!room) {
    room = {
      id: roomId,
      name,
      members: new Map(),
      data: { snapshot: null, checklist: [], tasks: [], pricePlan: [], restockPlan: [], shelfAssignments: {}, skillVotes: {} },
    }
    rooms.set(roomId, room)
  }
  return room
}

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#eab308']

io.on('connection', (socket) => {
  console.log(`[room-service] connected: ${socket.id}`)

  socket.on('room:create', (payload: { name: string; playerName: string }, ack?: (r: any) => void) => {
    const code = genCode()
    const room = getOrCreateRoom(code, payload.name)
    const hostId = socket.id
    room.members.set(hostId, {
      id: hostId,
      name: payload.playerName || 'Host',
      role: 'host',
      color: COLORS[room.members.size % COLORS.length],
      lastSeen: Date.now(),
    })
    socket.join(code)
    socket.data.roomId = code
    socket.data.playerId = hostId
    const summary = { id: code, code, name: room.name, members: Array.from(room.members.values()), ...room.data }
    ack?.(summary)
    io.to(code).emit('room:state', summary)
    console.log(`[room-service] created room ${code} by ${payload.playerName}`)
  })

  socket.on('room:join', (payload: { code: string; playerName: string }, ack?: (r: any) => void) => {
    const code = payload.code.toUpperCase()
    const room = rooms.get(code)
    if (!room) {
      ack?.({ error: 'room not found' })
      return
    }
    const pid = socket.id
    room.members.set(pid, {
      id: pid,
      name: payload.playerName || 'Player',
      role: 'member',
      color: COLORS[room.members.size % COLORS.length],
      lastSeen: Date.now(),
    })
    socket.join(code)
    socket.data.roomId = code
    socket.data.playerId = pid
    const summary = { id: code, code, name: room.name, members: Array.from(room.members.values()), ...room.data }
    ack?.(summary)
    io.to(code).emit('room:state', summary)
    io.to(code).emit('room:member-joined', { id: pid, name: payload.playerName })
    console.log(`[room-service] ${payload.playerName} joined room ${code}`)
  })

  socket.on('room:patch', (patch: any) => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room) return
    // merge top-level data patches
    for (const key of Object.keys(patch)) {
      if (key in room.data) {
        (room.data as any)[key] = patch[key]
      }
    }
    io.to(roomId).emit('room:state', { id: roomId, code: roomId, name: room.name, members: Array.from(room.members.values()), ...room.data })
  })

  socket.on('room:event', (evt: { type: string; payload: any }) => {
    const roomId = socket.data.roomId
    if (!roomId) return
    io.to(roomId).emit('room:event', { id: Math.random().toString(36).slice(2), ts: Date.now(), playerId: socket.data.playerId, type: evt.type, payload: evt.payload })
  })

  socket.on('room:cursor', (cursor: { x: number; y: number; view?: string }) => {
    const roomId = socket.data.roomId
    const pid = socket.data.playerId
    if (!roomId) return
    socket.to(roomId).emit('room:cursor', { id: pid, cursor })
  })

  socket.on('room:chat', (msg: { text: string }) => {
    const roomId = socket.data.roomId
    const pid = socket.data.playerId
    if (!roomId) return
    const room = rooms.get(roomId)
    const name = room?.members.get(pid)?.name ?? 'Unknown'
    io.to(roomId).emit('room:chat', { id: Math.random().toString(36).slice(2), ts: Date.now(), playerId: pid, name, text: msg.text })
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    const pid = socket.data.playerId
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room) return
    const m = room.members.get(pid)
    room.members.delete(pid)
    io.to(roomId).emit('room:member-left', { id: pid, name: m?.name })
    io.to(roomId).emit('room:state', { id: roomId, code: roomId, name: room.name, members: Array.from(room.members.values()), ...room.data })
    // cleanup empty rooms after 5 min
    if (room.members.size === 0) {
      setTimeout(() => {
        if (rooms.get(roomId)?.members.size === 0) {
          rooms.delete(roomId)
          console.log(`[room-service] cleaned empty room ${roomId}`)
        }
      }, 5 * 60 * 1000)
    }
    console.log(`[room-service] disconnected: ${socket.id} from room ${roomId}`)
  })

  socket.on('error', (err) => console.error(`[room-service] socket error ${socket.id}:`, err))
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[room-service] Supermarket Together Lab room sync on port ${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
