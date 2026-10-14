import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { allowedOrigin } from '../cors.js';
import { readJson, analyticsSource, RequestLimitError } from '../security.js';
const origins = Deno.env.get('SITE_ORIGINS') || Deno.env.get('SITE_ORIGIN') || '';
const baseHeaders = { 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
Deno.serve(async req => {
  const origin = allowedOrigin(origins, req.headers.get('origin'));
  const headers = { ...baseHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
  if (!origin) return new Response(null, { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers });
  try {
    const { id } = await readJson(req, 100);
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw Error();
    const source_hash = await analyticsSource(req, key => Deno.env.get(key) || '');
    const { data, error } = await db.rpc('record_view_limited', { visitor: id, source_hash });
    if (error) throw error;
    if (data !== true) return new Response(null, { status: 429, headers });
    return new Response(null, { status: 204, headers });
  } catch (error) { return new Response(null, { status: error instanceof RequestLimitError ? error.status : 400, headers }); }
});
