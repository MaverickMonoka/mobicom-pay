import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from './env';

// The v0.2 schema is installed from SQL rather than generated Supabase types.
// Keep the client intentionally untyped until generated Database types are added.
let cached: SupabaseClient<any> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;
  cached = createClient<any>(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
