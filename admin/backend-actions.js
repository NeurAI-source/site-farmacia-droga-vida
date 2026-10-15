// Retry only an authentication rejection, before the server can execute a write.
// Keep the exact batch ID and payload so response-loss recovery stays idempotent.
export async function invokeAdminAction(client, action, payload = {}) {
  const request = { body: { action, ...payload } };
  let result = await client.functions.invoke('admin-api', request);
  let requiresLogin = false;
  if (result.error?.context?.status === 401) {
    try {
      const refreshed = await client.auth.refreshSession();
      if (!refreshed.error && refreshed.data?.session?.access_token) {
        result = await client.functions.invoke('admin-api', request);
        requiresLogin = result.error?.context?.status === 401;
      } else requiresLogin = true;
    } catch { requiresLogin = true; }
  }
  const { data, error } = result;
  if (error) {
    let message;
    try { const response = await error.context?.json(); if (typeof response?.error === 'string') message = response.error; } catch {}
    const failure = new Error(requiresLogin
      ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
      : message || 'Não foi possível confirmar a operação. Confira a conexão.');
    // Do not discard a saved recovery request when its session was revoked.
    failure.definitive = !requiresLogin && !!message && [400,401,403,409,413].includes(error.context?.status);
    failure.requiresLogin = requiresLogin;
    throw failure;
  }
  if (data.error) throw new Error(data.error);
  return data;
}
