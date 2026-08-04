import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ynccukzeydtdxmwbizxp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FoF7c5fwCGXHy-KU9GpCgA_FoAjj5rN';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
