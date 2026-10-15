// Shared Edge Function boundaries. Claims are verified by Supabase, never trusted by decoding alone.
export class RequestLimitError extends Error {
  constructor(message = 'Solicitação muito grande.', status = 413) { super(message); this.status = status; }
}
export async function readBytes(req, limit) {
  const reader = req.body?.getReader();
  if (!reader) throw new RequestLimitError('Corpo ausente.', 400);
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestLimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readJson(req, limit) {
  const bytes = await readBytes(req, limit);
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw new RequestLimitError('Solicitação inválida.', 400); }
}
export async function verifiedSession(db, token, validatedUser) {
  if (!validatedUser?.id || !token) return false;
  try {
    const { data, error } = await db.auth.getClaims(token);
    return !error && data?.claims?.sub === validatedUser.id && ['aal1', 'aal2'].includes(data.claims.aal);
  } catch { return false; }
}
export async function panelQuota(db, actor) {
  const { data, error } = await db.rpc('panel_request_allow', { actor_id: actor });
  if (error) throw new RequestLimitError('Proteção de acesso temporariamente indisponível.', 503);
  if (data !== true) throw new RequestLimitError('Muitas solicitações. Aguarde um minuto.', 429);
}
export async function analyticsSource(req, env) {
  const salt = env('ANALYTICS_SOURCE_SALT');
  if (!salt) return null;
  // Forwarded addresses are only a supplementary bucket: the global DB quota is authoritative.
  // Hosting must verify its proxy header contract before treating this as a per-client limit.
  const source = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 128);
  if (!source) return null;
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${day}\n${source}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
