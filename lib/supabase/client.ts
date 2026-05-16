'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../types';

// Browser-side Supabase client. Reads/writes happen with the user's session.
// In static-export mode this is the only client variant used at runtime.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
