// Supabase backend sync for the multiplayer Room feature.
//
// Design (Task 11-a):
//   - All functions are async and throw Error with Traditional Chinese
//     messages on failure so the UI can surface them via `lastError`.
//   - The Supabase client is created lazily and only when env vars are
//     configured (`isSupabaseConfigured`). When not configured, every
//     function throws and the hook falls back to local BroadcastChannel.
//   - Password hashing uses bcryptjs in the browser (host hashes on
//     createRoom; joinRoom verifies via the `verify_room_password` RPC
//     which uses pgcrypto's crypt() — same bcrypt scheme).
//   - Realtime subscriptions are exposed as unsubscribe fns so the hook
//     can clean them up on leaveRoom / unmount.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from './backend-config'
import type { SaveSnapshot } from './types'

// ---------- Row types (mirror supabase/schema.sql) ----------
export interface RoomRow {
  code: string
  name: string
  password_hash: string
  host_id: string
  host_name: string
  created_at: string
  updated_at: string
}

export interface SaveRow {
  room_code: string
  snapshot: SaveSnapshot
  uploaded_by: string
  uploaded_at: string
}

export interface MemberRow {
  room_code: string
  member_id: string
  name: string
  role: 'host' | 'member'
  last_seen: string
}

export interface EventRow {
  id: number
  room_code: string
  member_id: string
  type: string
  payload: Record<string, unknown> | null
  ts: string
}

// ---------- Singleton client ----------
let _client: SupabaseClient | null = null

/** Returns the shared Supabase client, or null if env vars are not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  }
  return _client
}

// ---------- Password hashing (browser bcrypt) ----------
export function hashPassword(plain: string): string {
  // bcryptjs hashSync is sync ~50ms — fine for a one-shot host action.
  return bcrypt.hashSync(plain, 10)
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash)
  } catch {
    return false
  }
}

// ---------- Helpers ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1
function generateCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return s
}

function requireClient(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase 尚未設定。請在 .env 加入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。')
  return c
}

// ---------- Operations ----------

export async function createRoom(opts: {
  name: string
  password: string
  hostId: string
  hostName: string
}): Promise<{ code: string }> {
  const supabase = requireClient()
  if (!opts.password) throw new Error('請輸入房間密碼')
  if (!opts.name) throw new Error('請輸入房間名稱')
  if (!opts.hostName) throw new Error('請輸入你的名字')

  const passwordHash = hashPassword(opts.password)

  // Retry on rare code collision (PK on rooms.code).
  let code = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode()
    const { error } = await supabase.from('rooms').insert({
      code: candidate,
      name: opts.name,
      password_hash: passwordHash,
      host_id: opts.hostId,
      host_name: opts.hostName,
    })
    if (!error) {
      code = candidate
      break
    }
    // 23505 = unique_violation (code collision) → retry
    if (error.code !== '23505') {
      throw new Error(`建立房間失敗：${error.message}`)
    }
  }
  if (!code) throw new Error('建立房間失敗：無法產生不重複的房間代碼，請再試一次。')

  // Upsert host into members with role 'host'.
  const { error: memberErr } = await supabase
    .from('members')
    .upsert(
      { room_code: code, member_id: opts.hostId, name: opts.hostName, role: 'host' },
      { onConflict: 'room_code,member_id' },
    )
  if (memberErr) {
    // Non-fatal: room is created; member row can be re-upserted on heartbeat.
    console.warn('[backend-sync] host member upsert failed:', memberErr.message)
  }

  // Insert 'join' event for the host.
  await insertEvent(code, opts.hostId, 'join', { name: opts.hostName }).catch(() => {
    /* non-fatal */
  })

  return { code }
}

export async function joinRoom(opts: {
  code: string
  password: string
  memberId: string
  memberName: string
}): Promise<{ room: RoomRow; ok: boolean }> {
  const supabase = requireClient()
  if (!opts.code) throw new Error('請輸入房間代碼')
  if (!opts.password) throw new Error('請輸入房間密碼')
  if (!opts.memberName) throw new Error('請輸入你的名字')

  // 1. Verify password via RPC (pgcrypto bcrypt on the server).
  const { data: okRaw, error: rpcErr } = await supabase.rpc('verify_room_password', {
    p_code: opts.code,
    p_password: opts.password,
  })
  if (rpcErr) throw new Error(`驗證房間密碼失敗：${rpcErr.message}`)
  const ok = Boolean(okRaw)
  if (!ok) throw new Error('房間代碼或密碼錯誤')

  // 2. Fetch room row.
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', opts.code)
    .maybeSingle()
  if (roomErr) throw new Error(`讀取房間資料失敗：${roomErr.message}`)
  if (!room) throw new Error('找不到此房間代碼')

  // 3. Upsert member (role 'member' — host slot is reserved for host_id).
  const role = room.host_id === opts.memberId ? 'host' : 'member'
  const { error: memberErr } = await supabase
    .from('members')
    .upsert(
      { room_code: opts.code, member_id: opts.memberId, name: opts.memberName, role },
      { onConflict: 'room_code,member_id' },
    )
  if (memberErr) throw new Error(`加入房間失敗：${memberErr.message}`)

  // 4. Insert 'join' event.
  await insertEvent(opts.code, opts.memberId, 'join', { name: opts.memberName }).catch(() => {
    /* non-fatal */
  })

  return { room: room as RoomRow, ok: true }
}

export async function uploadSave(opts: {
  roomCode: string
  snapshot: SaveSnapshot
  uploaderId: string
}): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase.from('saves').upsert(
    {
      room_code: opts.roomCode,
      snapshot: opts.snapshot as unknown as Record<string, unknown>,
      uploaded_by: opts.uploaderId,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: 'room_code' },
  )
  if (error) throw new Error(`上傳存檔失敗：${error.message}`)

  await insertEvent(opts.roomCode, opts.uploaderId, 'save-updated', {
    day: opts.snapshot.day,
    money: opts.snapshot.money,
    source: opts.snapshot.source,
  }).catch(() => {
    /* non-fatal */
  })
}

export async function fetchSave(roomCode: string): Promise<SaveSnapshot | null> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('saves')
    .select('snapshot, uploaded_at, uploaded_by')
    .eq('room_code', roomCode)
    .maybeSingle()
  if (error) throw new Error(`讀取存檔失敗：${error.message}`)
  if (!data) return null
  return data.snapshot as unknown as SaveSnapshot
}

export async function fetchSaveRow(
  roomCode: string,
): Promise<{ snapshot: SaveSnapshot; uploadedAt: string; uploadedBy: string } | null> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('saves')
    .select('snapshot, uploaded_at, uploaded_by')
    .eq('room_code', roomCode)
    .maybeSingle()
  if (error) throw new Error(`讀取存檔失敗：${error.message}`)
  if (!data) return null
  return {
    snapshot: data.snapshot as unknown as SaveSnapshot,
    uploadedAt: data.uploaded_at as string,
    uploadedBy: data.uploaded_by as string,
  }
}

export async function fetchMembers(roomCode: string): Promise<MemberRow[]> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('room_code', roomCode)
    .order('role', { ascending: false }) // 'host' before 'member'
    .order('last_seen', { ascending: false })
  if (error) throw new Error(`讀取成員清單失敗：${error.message}`)
  return (data ?? []) as unknown as MemberRow[]
}

export async function fetchEvents(roomCode: string, limit = 50): Promise<EventRow[]> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('room_code', roomCode)
    .order('ts', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`讀取活動紀錄失敗：${error.message}`)
  return (data ?? []) as unknown as EventRow[]
}

export async function heartbeat(opts: {
  roomCode: string
  memberId: string
}): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase
    .from('members')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_code', opts.roomCode)
    .eq('member_id', opts.memberId)
  if (error) {
    // Non-fatal — heartbeat is best-effort.
    console.warn('[backend-sync] heartbeat failed:', error.message)
  }
}

export async function leaveRoom(opts: {
  roomCode: string
  memberId: string
}): Promise<void> {
  const supabase = requireClient()
  // Insert 'leave' event first (member still exists).
  await insertEvent(opts.roomCode, opts.memberId, 'leave', {}).catch(() => {
    /* non-fatal */
  })
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('room_code', opts.roomCode)
    .eq('member_id', opts.memberId)
  if (error) {
    console.warn('[backend-sync] leaveRoom delete failed:', error.message)
  }
}

// ---------- Internal: insert event ----------
async function insertEvent(
  roomCode: string,
  memberId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase.from('events').insert({
    room_code: roomCode,
    member_id: memberId,
    type,
    payload,
  })
  if (error) throw error
}

// ---------- Realtime subscriptions ----------
// Each subscribe* function returns an unsubscribe () => void.

export function subscribeSave(
  roomCode: string,
  onUpdate: (snap: SaveSnapshot) => void,
): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`saves:room_code=eq.${roomCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'saves',
        filter: `room_code=eq.${roomCode}`,
      },
      (payload) => {
        const row = payload.new as { snapshot?: SaveSnapshot } | undefined
        if (row?.snapshot) onUpdate(row.snapshot)
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeMembers(
  roomCode: string,
  onUpdate: () => void,
): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`members:room_code=eq.${roomCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'members',
        filter: `room_code=eq.${roomCode}`,
      },
      () => onUpdate(),
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeEvents(
  roomCode: string,
  onEvent: (e: EventRow) => void,
): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`events:room_code=eq.${roomCode}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: `room_code=eq.${roomCode}`,
      },
      (payload) => {
        const row = payload.new as EventRow
        onEvent(row)
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
