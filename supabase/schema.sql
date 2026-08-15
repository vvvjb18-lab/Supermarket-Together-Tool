-- ============================================================
-- Supermarket Together Tool — Supabase Schema
-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New query → Run
--
-- Creates: rooms, saves, members, events, save_history tables + RLS + realtime.
-- Password verification is done locally in the app (bcryptjs) against the
-- stored bcrypt hash — no pgcrypto / RPC dependency.
--
-- After running, also enable Realtime on `saves` and `members`:
--   Dashboard → Database → Replication → toggle saves, members, events ON
-- ============================================================

-- ----------------------------------------------------------------
-- rooms: one row per shared session (identified by 6-char code)
-- ----------------------------------------------------------------
create table if not exists rooms (
  code           text primary key,                        -- 6-char uppercase room code
  name           text not null,                           -- room display name
  password_hash  text not null,                           -- crypt(password, gen_salt('bf'))
  host_id        text not null,                           -- host's selfId (UUID)
  host_name      text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- saves: latest save snapshot per room (1:1 with room)
-- ----------------------------------------------------------------
create table if not exists saves (
  room_code    text not null references rooms(code) on delete cascade,
  snapshot     jsonb not null,                            -- full SaveSnapshot JSON
  uploaded_by  text not null,                             -- uploader's selfId
  uploaded_at  timestamptz not null default now(),
  primary key (room_code)
);

-- ----------------------------------------------------------------
-- save_history: append-only growth curve (one row per save upload)
-- ----------------------------------------------------------------
create table if not exists save_history (
  id          bigserial primary key,
  room_code   text not null references rooms(code) on delete cascade,
  day         integer not null,                           -- game day (x-axis)
  money       double precision not null,                  -- funds (y-axis)
  kpis        jsonb not null default '{}'::jsonb,         -- lightweight extra KPIs
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_save_history_room on save_history(room_code, uploaded_at);

-- ----------------------------------------------------------------
-- members: who's currently in each room (for presence/roster)
-- ----------------------------------------------------------------
create table if not exists members (
  room_code  text not null references rooms(code) on delete cascade,
  member_id  text not null,
  name       text not null,
  role       text not null default 'member',              -- 'host' | 'member'
  last_seen  timestamptz not null default now(),
  primary key (room_code, member_id)
);

-- ----------------------------------------------------------------
-- events: activity log (chat / join / leave / save-updated)
-- ----------------------------------------------------------------
create table if not exists events (
  id         bigserial primary key,
  room_code  text not null references rooms(code) on delete cascade,
  member_id  text not null,
  type       text not null,                               -- 'chat' | 'join' | 'leave' | 'save-updated'
  payload    jsonb,
  ts         timestamptz not null default now()
);

create index if not exists idx_events_room on events(room_code, ts desc);
create index if not exists idx_members_room on members(room_code);

-- ----------------------------------------------------------------
-- Row Level Security
-- This app uses the anon key (no per-user auth). Anyone with the
-- room code + password can read/write that room's data. RLS is
-- permissive (public) but the password gate is enforced in app
-- logic (verify_room_password RPC).
-- ----------------------------------------------------------------
alter table rooms   enable row level security;
alter table saves   enable row level security;
alter table members enable row level security;
alter table events  enable row level security;
alter table save_history enable row level security;

drop policy if exists "rooms_public_insert" on rooms;
drop policy if exists "rooms_public_select" on rooms;
drop policy if exists "rooms_host_update"   on rooms;
drop policy if exists "rooms_host_delete"   on rooms;
create policy "rooms_public_insert" on rooms for insert with check (true);
create policy "rooms_public_select" on rooms for select using (true);
create policy "rooms_host_update"   on rooms for update using (true) with check (true);
create policy "rooms_host_delete"   on rooms for delete using (true);

drop policy if exists "saves_public_all" on saves;
create policy "saves_public_all" on saves for all using (true) with check (true);

drop policy if exists "members_public_all" on members;
create policy "members_public_all" on members for all using (true) with check (true);

drop policy if exists "events_public_all" on events;
create policy "events_public_all" on events for all using (true) with check (true);

drop policy if exists "save_history_public_all" on save_history;
create policy "save_history_public_all" on save_history for all using (true) with check (true);

-- ----------------------------------------------------------------
-- NOTE: No verify_room_password RPC is needed. Password verification is
-- done locally in the app (bcryptjs) against the stored bcrypt hash, so
-- there is no pgcrypto dependency.
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- Realtime: enable publication for the sync tables.
-- (Equivalent to toggling them on in Dashboard → Replication.)
-- ----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'saves'
  ) then
    alter publication supabase_realtime add table saves;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'members'
  ) then
    alter publication supabase_realtime add table members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'save_history'
  ) then
    alter publication supabase_realtime add table save_history;
  end if;
exception when others then
  raise notice 'Realtime publication tweak skipped: %', sqlerrm;
end $$;
