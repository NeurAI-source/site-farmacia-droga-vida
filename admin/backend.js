import { createClient } from '../vendor/supabase.js';
import { config } from '../public-config.js';
export const client = config.url && config.key ? createClient(config.url, config.key) : null;
export async function adminAction(action, payload = {}) {
  const { data, error } = await client.functions.invoke('admin-api', { body: { action, ...payload } });
  if (error) {
    let message;
    try { const response = await error.context?.json(); if (typeof response?.error === 'string') message = response.error; } catch {}
    const failure = new Error(message || 'Não foi possível confirmar a operação. Confira a conexão.');
    failure.definitive = !!message && [400,401,403,409,413].includes(error.context?.status);
    throw failure;
  }
  if (data.error) throw new Error(data.error);
  return data;
}
