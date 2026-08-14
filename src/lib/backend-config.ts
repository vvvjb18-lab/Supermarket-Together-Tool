// Detects whether Supabase env vars are configured.
// Used to switch the Room feature between "backend" mode (Supabase
// cross-device sync) and "local" fallback mode (BroadcastChannel
// same-browser sync only).

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''

/**
 * True only if both URL (https://...) and anon key (>20 chars) are set.
 * Empty / placeholder values fall back to local mode.
 */
export const isSupabaseConfigured: boolean =
  supabaseUrl.startsWith('https://') && supabaseAnonKey.length > 20
