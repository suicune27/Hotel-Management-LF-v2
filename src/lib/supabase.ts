import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = 
  !!supabaseUrl && 
  !!supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' && 
  supabaseUrl.trim() !== '' &&
  !supabaseAnonKey.includes('...') &&
  supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY';

// Fallback client so imports do not break if not configured yet
// Only used when ConfigurationGuide is shown; never executes real queries
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('', '');

export default supabase;
