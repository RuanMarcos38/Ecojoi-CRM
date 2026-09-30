import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './env';

export function createAdminClient(){
  const url=getSupabaseUrl();
  const serviceRole=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
  return createSupabaseClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
}
