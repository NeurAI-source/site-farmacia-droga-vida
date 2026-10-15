import { createClient } from '../vendor/supabase.js';
import { config } from '../public-config.js';
import { invokeAdminAction } from './backend-actions.js';
export const client = config.url && config.key ? createClient(config.url, config.key) : null;
export async function adminAction(action, payload = {}) {
  return invokeAdminAction(client, action, payload);
}
