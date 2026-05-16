// Service-role client — DO NOT import from any file under app/ or components/.
// Used only by supabase/seed.ts and one-off Node scripts.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill in the values.'
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
