// This file has been updated to use our own Supabase instance for LGPD compliance.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://bfrfqguajngxeanqzjof.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_F-uTtmNv3DiLpYMNIC8GKg_LZz1a2hN";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
