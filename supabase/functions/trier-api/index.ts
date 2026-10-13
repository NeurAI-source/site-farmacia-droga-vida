// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHandler } from './handler.js';
const env = (key: string) => Deno.env.get(key) || '';
const db = createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(db, env));
