import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

export const isServerSupabaseConfigured = Boolean(
  config.supabaseUrl &&
  (config.supabaseAnonKey || config.supabaseServiceRoleKey) &&
  config.supabaseUrl !== 'https://placeholder.supabase.co' &&
  !config.supabaseUrl.includes('your-supabase')
);

// Standard Supabase client using anon key for user-context validation
export const supabaseAuthClient = createClient(
  config.supabaseUrl || 'https://placeholder.supabase.co',
  config.supabaseAnonKey || config.supabaseServiceRoleKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
