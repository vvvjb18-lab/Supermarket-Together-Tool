# 後端同步服務接入方案

> **狀態**：socket.io room-service（port 3003）已於 Task 10 停用。
> 本文檔為下一階段後端接入的設計與選型建議。

## 需求回顧

- **Host 上載存檔** → 房間成員共用同一份存檔快照
- **房間密碼認證** → 共享密碼（非 per-user 帳號）
- **免費** → 使用者個人/小團體用途
- **跨裝置同步** → 手機/電腦/朋友都能連
- **即時更新**（可選）→ host 換存檔時成員自動收到

---

## 推薦：Supabase（首選）

### 為什麼選 Supabase

| 需求 | Supabase 對應 |
|------|--------------|
| 免費 | Free tier：500MB Postgres + 1GB Storage + 50k MAU Auth + Realtime |
| 房間密碼 | 一張 `rooms` 表存 `code` + `password_hash`（用 `pgcrypto` 加密） |
| Host 上載存檔 | `saves` 表存 JSON（或 Storage 存檔案） |
| 跨裝置 | 純 HTTP + Realtime websocket，任何裝置可連 |
| 即時更新 | 內建 Realtime subscriptions（取代 socket.io） |
| 存取控制 | Row Level Security（RLS）— 只有成員能讀自己房間 |

### 免費額度（2024-2025）

- **Database**：500MB（存檔 JSON ~150KB，可存 ~3000 個存檔）
- **Storage**：1GB（若存檔用檔案而非 JSON 欄位）
- **Auth**：50,000 月活用戶（本方案不需要 per-user auth，可略過）
- **Realtime**：不限連線數（免費 tier 夠用）
- **API 請求**：無限（Free tier 不限 API calls）

### 註冊與設定步驟（你去做）

1. 到 https://supabase.com 註冊（可用 GitHub 登入）
2. 建立 New Project → 取個名字（例如 `stl-sync`）→ 選 free tier → 設一組 database password（記下來）
3. 等約 2 分鐘 provisioning 完成
4. 進入 Project Settings → API → 複製：
   - **Project URL**（例如 `https://xxxxx.supabase.co`）
   - **anon public key**（`eyJ...` 開頭的長字串）
5. 到 SQL Editor 貼入下面的 schema（見「Schema 設計」）→ Run
6. 把 URL + anon key 給我，我來接前端

### Schema 設計（貼到 SQL Editor）

```sql
-- 啟用加密擴充（用來 hash 房間密碼）
create extension if not exists pgcrypto;

-- 房間表
create table if not exists rooms (
  code text primary key,                       -- 6 碼大寫房間代碼
  name text not null,                          -- 房間名稱
  password_hash text not null,                 -- crypt(password, gen_salt('bf'))
  host_id text not null,                       -- host 的 selfId（UUID）
  host_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 存檔表（每個房間一份最新存檔）
create table if not exists saves (
  room_code text not null references rooms(code) on delete cascade,
  snapshot jsonb not null,                     -- 完整 SaveSnapshot JSON
  uploaded_by text not null,                   -- 上傳者 selfId
  uploaded_at timestamptz not null default now(),
  primary key (room_code)
);

-- 成員表（追蹤誰在線上）
create table if not exists members (
  room_code text not null references rooms(code) on delete cascade,
  member_id text not null,                     -- selfId
  name text not null,
  role text not null default 'member',         -- 'host' | 'member'
  last_seen timestamptz not null default now(),
  primary key (room_code, member_id)
);

-- 房間事件/聊天 log（可選）
create table if not exists events (
  id bigserial primary key,
  room_code text not null references rooms(code) on delete cascade,
  member_id text not null,
  type text not null,                          -- 'chat' | 'join' | 'leave' | 'save-updated'
  payload jsonb,
  ts timestamptz not null default now()
);

-- Row Level Security：任何人可建房間、憑密碼加入後可讀
alter table rooms enable row level security;
alter table saves enable row level security;
alter table members enable row level security;
alter table events enable row level security;

-- rooms：所有人可 insert（建房間）、可 select（加入時驗證）、host 可 update/delete
create policy "rooms_public_insert" on rooms for insert with check (true);
create policy "rooms_public_select" on rooms for select using (true);
create policy "rooms_host_update" on rooms for update using (auth.role() = 'anon');

-- saves：所有人可 insert/upsert（host 上傳）、可 select（成員讀取）
create policy "saves_public_all" on saves for all using (true) with check (true);

-- members：所有人可 insert/upsert/delete
create policy "members_public_all" on members for all using (true) with check (true);

-- events：所有人可 insert/select
create policy "events_public_all" on events for all using (true) with check (true);

-- 啟用 realtime（在 Supabase Dashboard → Database → Replication → 勾選 saves/events/members）
```

### 前端接入（我來做，你給我 keys 後）

```bash
bun add @supabase/supabase-js
```

```typescript
// src/lib/backend-sync.ts (待實作)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// host 建房間
export async function createRoom(name, password, hostName, hostId) {
  const code = genCode()
  const { error } = await supabase.from('rooms').insert({
    code, name,
    password_hash: crypto_hash(password), // 用 bcrypt-js 在前端 hash
    host_id: hostId, host_name: hostName,
  })
  return code
}

// host 上載存檔
export async function uploadSave(roomCode, snapshot, uploaderId) {
  await supabase.from('saves').upsert({
    room_code: roomCode,
    snapshot, uploaded_by: uploaderId,
  })
}

// 成員加入（驗證密碼）
export async function joinRoom(code, password, memberId, memberName) {
  const { data } = await supabase.from('rooms').select('*').eq('code', code).single()
  if (!data || !verify(password, data.password_hash)) throw new Error('房間代碼或密碼錯誤')
  await supabase.from('members').upsert({ room_code: code, member_id: memberId, name: memberName, role: 'member' })
  return data
}

// 成員訂閱存檔更新（即時）
export function subscribeSave(roomCode, onUpdate) {
  return supabase
    .channel(`saves:${roomCode}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'saves', filter: `room_code=eq.${roomCode}` }, onUpdate)
    .subscribe()
}
```

### 密碼處理

- **前端 hash**：用 `bcryptjs`（browser-safe）在 host 建房間時 hash 密碼，成員加入時也前端 hash 後比對（避免明文傳輸）。
- **或後端 hash**：用 Supabase 的 `pgcrypto` `crypt()` 函式（更安全，但需 RPC）。
- 建議先用前端 bcrypt（簡單），後續可改 RPC。

---

## 備選方案

### 2. Firebase Firestore（備選）

- **優點**：Google 出品、NoSQL 彈性高、real-time listeners 原生
- **缺點**：Google 帳號綁定、lock-in 較深、free tier 1GB Firestore + 10GB transfer
- **適合**：已用 Firebase 生態的人
- **設定**：https://console.firebase.google.com → 建 project → Firestore Database → 建 `rooms/{code}` document

### 3. JSONBin.io（最簡單，無即時）

- **優點**：超簡單，只是 JSON storage；free tier 10k requests/月、50 bins
- **缺點**：**無 realtime**、無 auth（靠 bin ID + access key）
- **適合**：只 host 上傳 + 成員手動重新整理讀取（不要即時）
- **設定**：https://jsonbin.io → 註冊 → 建 bin → 拿 bin URL + X-Master-Key
- **用法**：host PUT 存檔 JSON → 成員 GET（手動 refresh 或 30 秒輪詢）

### 4. PocketBase（自架）

- **優點**：SQLite + Auth + Realtime 一個 binary、免費完全自架
- **缺點**：**需要自己的 server/VPS**（不能跑在本 sandbox）
- **適合**：有 VPS 或本機長開的人
- **設定**：https://pocketbase.io → 下載 binary → `./pocketbase serve` → 建 `rooms` collection

---

## 選型建議

| 你的情況 | 推薦 |
|---------|------|
| 要免費 + 即時 + 不想自己架站 | **Supabase**（首選） |
| 已用 Firebase 生態 | Firebase Firestore |
| 只要最簡單、不在乎即時 | JSONBin.io |
| 有 VPS、想完全自控 | PocketBase |

---

## 遷移路徑（socket.io → Supabase）

### 現狀（Task 10 後）
- `src/lib/room-sync.ts` 的 `buildSocket()` 回傳 `null`（socket.io 停用）
- `useRoomSync()` 只用 BroadcastChannel（同瀏覽器分頁同步）
- room store 仍用 Zustand persist（localStorage）

### 接入 Supabase 後
1. 新增 `src/lib/backend-sync.ts`：用 `@supabase/supabase-js` 實作 `createRoom` / `joinRoom` / `uploadSave` / `subscribeSave`
2. 改寫 `useRoomSync()`：改呼叫 backend-sync，保留 BroadcastChannel 作 fallback
3. room.tsx：
   - 建房間表單加「房間密碼」欄位
   - 加入房間表單加「密碼」欄位
   - host 專屬「上載存檔」按鈕（呼叫 `uploadSave`）
   - 成員端自動 `subscribeSave` → 收到更新即更新 room store
4. 移除 `mini-services/room-service/`（socket.io 服務不再需要）
5. 環境變數：`.env.local` 加 `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 預估工作量
- Supabase 註冊 + schema：15 分鐘（你做）
- 前端接入 + 測試：1-2 小時（我做，你給我 keys）

---

## 下一步

1. **你**：到 https://supabase.com 註冊 → 建 project → 貼 schema → 給我 Project URL + anon key
2. **我**：安裝 `@supabase/supabase-js` → 寫 `backend-sync.ts` → 改 `useRoomSync` → 更新 room.tsx UI（密碼欄位 + host 上載按鈕）→ 測試

等你 keys 就可以開工。
