# Deployment Guide

This guide explains how to deploy the Supermarket Together Tool and correctly configure the Supabase environment variables on your hosting platform.

---

## ⚠️ Critical: GitHub env vars ≠ Hosting platform env vars

Environment variables added in **GitHub repo → Settings → Secrets and variables → Actions** are ONLY available to GitHub Actions workflows (`.github/workflows/*.yml`). They are **NOT** injected into your deployed app.

For the deployed website to use Supabase, you must set the env vars on your **hosting platform's dashboard**.

Additionally, `NEXT_PUBLIC_*` variables in Next.js are **inlined at build time**. This means:
1. You must set them on the hosting platform **before** deploying.
2. If you change them later, you must **redeploy** (re-run the build) for the change to take effect.

---

## Required environment variables

| Variable | Value | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (long JWT) | Supabase Dashboard → Project Settings → API → `anon` public key |

> Without these, the Room page runs in **LOCAL mode** (BroadcastChannel, same-browser sync only).

---

## Platform-specific setup

### Vercel (recommended for Next.js)

1. Go to https://vercel.com → log in → click your project
2. Top tabs → **Settings** → left sidebar **Environment Variables**
3. Add both variables. For each:
   - Select all environments: **Production** + **Preview** + **Development** (or at least Production)
   - Click **Save**
4. **Redeploy** (required because `NEXT_PUBLIC_*` is build-time):
   - Go to **Deployments** tab
   - Click the latest deployment → `⋯` menu → **Redeploy** → confirm

> Vercel auto-deploys on every `git push` to your main branch. After setting env vars, the NEXT push (or a manual redeploy) will include them.

### Netlify

1. Go to your site → **Site settings** → **Environment variables**
2. Click **Add a variable** → add both keys
3. **Trigger deploy** → Deploy site (to rebuild with new env vars)

### Cloudflare Pages

1. Go to your project → **Settings** → **Environment variables**
2. Add both keys (set for both **Production** and **Preview**)
3. Go to **Deployments** → latest → `⋯` → **Retry deployment**

### Self-hosted / Docker

The project uses `output: "standalone"` in `next.config.ts`. After `bun run build`:

```bash
# Set env vars in the shell or docker run -e
export NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Run the standalone server
node .next/standalone/server.js
```

For Docker, pass them via `-e` flags or an env file:

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  your-image
```

> ⚠️ **Important for Docker/self-hosting**: Since `NEXT_PUBLIC_*` is build-time, you must either:
> - Build the image AFTER setting the env vars (`docker build --build-arg ...`), OR
> - Use Next.js runtime env loading (requires code changes to read from `window` / a runtime config endpoint)

---

## Supabase setup checklist

Before the Room feature works in production, ensure you've run the SQL schema:

1. Go to Supabase Dashboard → your project → **SQL Editor**
2. Open `/supabase/schema.sql` from this repo
3. Paste the entire file → **Run**
4. Verify in **Table Editor**: you should see `rooms`, `saves`, `members`, `events` tables
5. Enable Realtime: **Database → Replication** → ensure `saves`, `members`, `events` are toggled ON

---

## Verifying it works

After deployment, visit your site → **多人房間** (Multiplayer Room) page.

- ✅ **Green banner**: "Supabase 已連線 · 跨裝置同步啟用" → working
- ❌ **Orange banner**: "本地模式 — 尚未設定 Supabase" → env vars not set or not rebuilt

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Still shows "本地模式" after setting env vars | Didn't redeploy | Trigger a rebuild / redeploy |
| Shows green but creating room fails | Supabase schema not applied | Run `supabase/schema.sql` in SQL Editor |
| Shows green but join fails | RPC `verify_room_password` missing | Re-run the schema SQL (includes the RPC) |
| CORS errors in console | Supabase project URL mismatch | Double-check the URL matches your project |
| `NEXT_PUBLIC_SUPABASE_URL` is undefined at runtime | Set as a secret (not public) in hosting platform | `NEXT_PUBLIC_*` must NOT be marked as "secret" — they need to be exposed to the client bundle |
