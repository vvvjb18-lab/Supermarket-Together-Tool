// Detects whether Supabase env vars are configured.
// Used to switch the Room feature between "backend" mode (Supabase
// cross-device sync) and "local" fallback mode (BroadcastChannel
// same-browser sync only).
//
// IMPORTANT: This module is consumed by client components. Next.js
// Turbopack only inlines `process.env.NEXT_PUBLIC_*` when the access
// happens inside a client module's evaluated code. We mark this file
// 'use client' and read env via functions so the inlining happens
// correctly in the client bundle (fixes deployed-on-Vercel case where
// env vars were coming through as empty string).

'use client'

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''
}

/**
 * True only if both URL (https://...) and anon key (>20 chars) are set.
 * Empty / placeholder values fall back to local mode.
 */
export function getIsSupabaseConfigured(): boolean {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  return url.startsWith('https://') && key.length > 20
}

// Backward-compat exports (evaluated lazily via getters so the env read
// happens at call time inside client context, not at import time).
export const supabaseUrl = getSupabaseUrl()
export const supabaseAnonKey = getSupabaseAnonKey()
export const isSupabaseConfigured = getIsSupabaseConfigured()
