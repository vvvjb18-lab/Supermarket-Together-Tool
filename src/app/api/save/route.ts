// POST /api/save — save-file ingest endpoint for the local `autosync.py` watcher.
//
// The local watcher (F:\游戲副本\save-analyzer\tools\autosync.py) watches the
// game save `StoreFile0.es3`, decodes it into the v1.0 `save.json` (11-key
// format), and POSTs it here. This route:
//   1. Verifies the room code + password (via the `verify_room_password` RPC,
//      using pgcrypto bcrypt — same gate the browser Room feature uses).
//   2. Auto-provisions the room on first use (so the user doesn't have to
//      create it in the UI first; just configure code + password in
//      autosync_config.json and both sides agree).
//   3. Parses the raw v1.0 save.json into the app's `SaveSnapshot` shape using
//      the exact same parser the browser uses (`parseSaveFile`), so the stored
//      snapshot is byte-for-byte what the dashboard / profit / pricing tools
//      consume.
//   4. Upserts the snapshot into the `saves` table (keyed by room_code) and
//      writes a `save-updated` event. Supabase Realtime then pushes the update
//      to any connected browser, so an open dashboard reflects the game state
//      live.
//
// Request body:  { "code": "ABC123", "password": "…", "save": <save.json v1.0> }
// Response 200:  { "ok": true, "day": 38, "money": 14913.17, "source": "…", "uploadedAt": "…" }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { parseSaveFile } from '@/lib/es3-parser'

export const dynamic = 'force-dynamic'

function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ''
  )
}

function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  )
}

function getClient() {
  const url = supabaseUrl()
  const key = supabaseKey()
  if (!url.startsWith('https://') || key.length < 20) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// bcryptjs v3 may emit `$2b$`; pgcrypto crypt() only verifies `$2a$`, so
// rewrite the prefix (identical bytes otherwise). Same policy as the browser.
function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10).replace(/^\$2b\$/, '$2a$')
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'save-ingest', configured: getClient() !== null })
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: '無法解析 request body（需為 JSON）' }, { status: 400 })
  }

  const raw = (body ?? {}) as Record<string, unknown>
  const code = String(raw.code ?? '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
  const password = String(raw.password ?? '')
  const save = raw.save

  if (code.length < 4) {
    return NextResponse.json({ ok: false, error: '缺少或無效的 code（至少 4 位 A-Z0-9）' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: '缺少 password' }, { status: 400 })
  }
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    return NextResponse.json({ ok: false, error: '缺少 save（需為 save.json v1.0 物件）' }, { status: 400 })
  }

  const supabase = getClient()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: '伺服器尚未設定 Supabase 環境變數' },
      { status: 500 },
    )
  }

  // 1. Verify the room password (or auto-provision the room on first use).
  const { data: okRaw, error: rpcErr } = await supabase.rpc('verify_room_password', {
    p_code: code,
    p_password: password,
  })
  if (rpcErr) {
    return NextResponse.json({ ok: false, error: `驗證房間密碼失敗：${rpcErr.message}` }, { status: 500 })
  }

  if (!okRaw) {
    const { data: existing, error: selErr } = await supabase
      .from('rooms')
      .select('code')
      .eq('code', code)
      .maybeSingle()
    if (selErr) {
      return NextResponse.json({ ok: false, error: `查詢房間失敗：${selErr.message}` }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ ok: false, error: '房間代碼或密碼錯誤' }, { status: 401 })
    }

    // Auto-provision: create the room so the user only has to configure
    // code + password in autosync_config.json once.
    const { error: insErr } = await supabase.from('rooms').insert({
      code,
      name: `本機同步 ${code}`,
      password_hash: hashPassword(password),
      host_id: 'autosync',
      host_name: '本機自動同步',
    })
    if (insErr) {
      // 23505 = unique_violation (race: room created between check and insert)
      if (insErr.code !== '23505') {
        return NextResponse.json({ ok: false, error: `建立房間失敗：${insErr.message}` }, { status: 500 })
      }
    }
  }

  // 2. Parse the raw v1.0 save.json into the app's SaveSnapshot.
  const fileName = `autosync:${code}.json`
  let snapshot
  try {
    const result = parseSaveFile(JSON.stringify(save), fileName)
    if (result.status === 'failed' || result.snapshot.parseStatus === 'failed') {
      const why = (result.warnings ?? []).join('; ')
      return NextResponse.json({ ok: false, error: `存檔解析失敗：${why || '未知原因'}` }, { status: 400 })
    }
    snapshot = result.snapshot
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `存檔解析失敗：${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    )
  }

  // 3. Upsert the latest snapshot (one per room).
  const uploadedAt = new Date().toISOString()
  const { error: upErr } = await supabase.from('saves').upsert(
    {
      room_code: code,
      snapshot: snapshot as unknown as Record<string, unknown>,
      uploaded_by: 'autosync',
      uploaded_at: uploadedAt,
    },
    { onConflict: 'room_code' },
  )
  if (upErr) {
    return NextResponse.json({ ok: false, error: `寫入存檔失敗：${upErr.message}` }, { status: 500 })
  }

  // 3.5 Append a history point for the growth curve (best-effort, non-fatal —
  //     table may not exist until the schema.sql migration has been run).
  try {
    await supabase.from('save_history').insert({
      room_code: code,
      day: snapshot.day,
      money: snapshot.money,
      kpis: {
        level: snapshot.lastAwardedLevel ?? null,
        fp: snapshot.franchisePoints ?? null,
        xp: snapshot.franchiseExperience ?? null,
        spaceBought: snapshot.spaceBought ?? null,
        storageBought: snapshot.storageBought ?? null,
        skillCount: snapshot.skillUnlocks?.length ?? 0,
        employeeCount: snapshot.employees?.length ?? 0,
        storeName: snapshot.storeName ?? null,
        supermarketName: snapshot.supermarketName ?? null,
      },
      uploaded_by: 'autosync',
      uploaded_at: uploadedAt,
    })
  } catch (e) {
    console.warn('[save] history insert failed (table not migrated?):', e)
  }

  // 4. Append a save-updated event (best-effort, non-fatal).
  try {
    await supabase.from('events').insert({
      room_code: code,
      member_id: 'autosync',
      type: 'save-updated',
      payload: { day: snapshot.day, money: snapshot.money, source: snapshot.source },
    })
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    day: snapshot.day,
    money: snapshot.money,
    source: snapshot.source,
    uploadedAt,
  })
}
