// Platform-injected server credentials only. Never trust an unverified JWT's role.
export function secretKeys(env) {
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}');
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return [];
    return Object.values(keys).filter(key => typeof key === 'string' && key.startsWith('sb_secret_'));
  } catch { return []; }
}
export function serverKey(env) { return secretKeys(env)[0] || env('SUPABASE_SERVICE_ROLE_KEY'); }
export function internalRequest(headers, env) {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy && headers.get('authorization') === `Bearer ${legacy}`) return true;
  const key = headers.get('apikey');
  return !!key && secretKeys(env).includes(key);
}
// Verify an existing server key through PostgREST's own role validation when
// the key is not in the Edge Runtime's injected key dictionary (rotated keys).
// The probe RPC is executable ONLY by service_role, never anon/authenticated.
export async function verifiedServerRequest(headers, env, fetcher = fetch) {
  if (internalRequest(headers, env)) return true;
  const key = headers.get('apikey') || headers.get('authorization')?.replace(/^Bearer /i,'');
  if (!key || key.length > 4096 || !(key.startsWith('sb_secret_') || /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key))) return false;
  const base = env('SUPABASE_URL');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)) return false;
  try {
    const auth = { apikey:key, 'Content-Type':'application/json' };
    if (!key.startsWith('sb_secret_')) auth.Authorization=`Bearer ${key}`;
    const response = await fetcher(`${base}/rest/v1/rpc/trier_scheduler_authorized`, {method:'POST',headers:auth,body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)});
    return response.ok && (await response.text()).trim() === 'true';
  } catch { return false; }
}
