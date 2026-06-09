'use client';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';

let supabaseClient: ReturnType<typeof createSupabaseClient<Database>> | null = null;

// Static-export mode: the client runs entirely in the browser, so we don't
// need the @supabase/ssr cookie helpers. Using the underlying createClient
// from @supabase/supabase-js keeps generics aligned with the postgrest types
// and persists the auth session in localStorage by default.
export function createClient() {
  if (supabaseClient) return supabaseClient;
  
  supabaseClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
  
  return supabaseClient;
}
