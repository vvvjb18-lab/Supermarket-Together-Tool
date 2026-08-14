# Task 11-a — Supabase backend sync (room password auth + host upload)

## Work Log
- Read worklog.md (Tasks 1–11-foundation) + room-sync.ts (LOCAL mode, socket.io disabled in Task 10) + room.tsx + store.ts + types.ts + supabase/schema.sql (rooms/saves/members/events + verify_room_password RPC).
- Created `src/lib/backend-config.ts` — reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY, exports `isSupabaseConfigured: boolean` (URL must start with https://, anon key length > 20).
- Created `src/lib/backend-sync.ts` (~370 lines):
  - Lazy singleton `getSupabase()` returning `SupabaseClient | null`.
  - `hashPassword` / `verifyPassword` (bcryptjs sync variants).
  - Row types: `RoomRow`, `SaveRow`, `MemberRow`, `EventRow`.
  - Functions: `createRoom` (6-char code from alphabet without I/O/0/1, retry on PK conflict, upsert host into members, insert 'join' event), `joinRoom` (verify_room_password RPC + fetch room + upsert member + insert 'join' event), `uploadSave` (upsert into saves + 'save-updated' event), `fetchSave`, `fetchSaveRow` (with uploadedAt/uploadedBy), `fetchMembers`, `fetchEvents`, `heartbeat`, `leaveRoom` (insert 'leave' event then delete member row), `insertEvent` (internal).
  - Realtime: `subscribeSave`, `subscribeMembers`, `subscribeEvents` — each returns unsubscribe fn; channels scoped by `room_code=eq.{code}`.
  - All error messages in Traditional Chinese; helper `requireClient()` throws if env not configured.
- Rewrote `src/lib/room-sync.ts` `useRoomSync()` hook with dual-mode API:
  - Exports `{ mode, transport, connected, ready, createRoom, joinRoom, leaveRoom, uploadSave, lastError, clearError }` per orchestrator spec.
  - `mode = isSupabaseConfigured ? 'backend' : 'local'` (module-level const → no hydration mismatch).
  - `mounted` state guards client-only values (transport='offline' until mounted).
  - Backend mode: setupBackendSubscriptions(code) wires subscribeSave (→ useSaveStore.setSnapshot + useRoomStore.setSnapshot), subscribeMembers (→ refetch + updateRoom({members})), subscribeEvents (→ dedupe + updateRoom({events})). 20s heartbeat interval. clearSubs() on leaveRoom + unmount.
  - Local mode: BroadcastChannel('stl-room') for state/member-left/snapshot messages. Local-mode createRoom stores bcrypt-hashed password in localStorage `stl-room-creds` keyed by code; joinRoom verifies via bcryptjs compareSync if entry exists, otherwise simulates (cross-browser impossible locally).
  - lastError captured from thrown Errors; clearError resets.
- Rewrote `src/components/lab/room.tsx` (~620 lines) with new flow:
  - **ModeBanner**: green "Supabase 已連線 · 跨裝置同步啟用" for backend; amber "本地模式 — 尚未設定 Supabase. 請在 .env 加入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY" for local.
  - **RoomLobby**: side-by-side Create (Host) + Join (Member) cards on md+, stacked on mobile.
    - Create card: 房間名稱 / 你的名字 / 房間密碼 (PasswordInput with Eye/EyeOff toggle). "建立房間" button (disabled if no password). On success → big dashed-border emerald code display with text-3xl font-mono tracking-[0.3em] + copy button.
    - Join card: 房間代碼 (auto-uppercase, sanitized A-Z0-9, maxLength 6, font-mono tracking) / 你的名字 / 房間密碼. "加入房間" button. Renders sync.lastError in red AlertCircle box.
  - **RoomWorkspace** (in-room):
    - Header: LayoutGrid icon + room name + code (mono badge) + RoleBadge (Host=Crown amber, Member=User muted) + transport badge (Supabase green / 本地 amber) + copy-code button (Check icon on copy) + 離開 button.
    - Left column: HostUploadCard (Host) — "上傳目前存檔到房間" button (disabled if !saveSnapshot, Loader2 spinner while uploading), last upload time, link to upload view if no save. MemberWaitCard (Member) — emerald check if snapshot exists, amber spinner "等待 Host 上傳存檔" otherwise. Members CANNOT upload.
    - SnapshotPreviewCard — 4 tiles (Day / Money / 偵測欄位數 / 來源) + "查看 Dashboard" button.
    - Right column: MembersCard (grid of MemberRow: avatar circle with initials in member color, name, role tooltip badge, last-seen relative time "X秒前"), ActivityCard (max-h-64 overflow-y-auto with custom webkit-scrollbar styling, ActivityRow per event with icon + text + relative time; join=emerald User, leave=rose LogOut, save-updated=primary Upload).
  - All text Traditional Chinese. Lucide icons: Crown, Copy, Check, Users, LogOut, Wifi, WifiOff, Upload, Loader2, Lock, KeyRound, Eye, EyeOff, User, AlertCircle, CheckCircle2, History, Package, Clock, LayoutGrid.
  - Responsive: single column mobile, lg:grid-cols-3 workspace (left 2/3 + right 1/3). p-4 card padding, gap-4 spacing. Touch targets ≥ 36px.

## Quality
- `bun run lint` → 0 errors, 0 warnings.
- `bunx tsc --noEmit` → src/ 0 errors (only skills/ gitignored dir has pre-existing unrelated errors).
- No hydration mismatch (mounted state + module-level isSupabaseConfigured const).
- App works in LOCAL mode right now (no env vars set): create/join/upload all functional via BroadcastChannel + localStorage password creds.

## Files
- Created: `src/lib/backend-config.ts`, `src/lib/backend-sync.ts`
- Rewrote: `src/lib/room-sync.ts`, `src/components/lab/room.tsx`
- Did NOT touch: store.ts, types.ts, i18n.ts, supabase/schema.sql, skill-*.tsx, shared/*

## Stage Summary
- When env vars are added later, the Room feature seamlessly switches from local BroadcastChannel mode to Supabase backend mode with cross-device realtime sync (saves/members/events), bcrypt password auth (host hashes client-side; join verifies via verify_room_password RPC using pgcrypto server-side bcrypt), and host-only save upload with member realtime view.
