import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createCampaignHandler } from './handler.js';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false}});
Deno.serve(createCampaignHandler({db, origins: Deno.env.get('SITE_ORIGINS') || Deno.env.get('SITE_ORIGIN') || ''}));
