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
