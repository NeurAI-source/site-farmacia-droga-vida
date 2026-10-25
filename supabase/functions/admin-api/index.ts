import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
// Copy shared validator into _shared when deploying (npm run prepare:functions).
import { allowedOrigin } from '../cors.js';
import { publicationHistory } from './publication-history.js';
import { uploadProductImage } from './product-image.js';
import { checked, dispatchNext, neuraiAction, requestPublication } from './publication.js';
import { accessAction, accessActions } from './access.js';
import { registrationAction, registrationActions } from './registration.js';
import { readJson, verifiedSession, panelQuota, RequestLimitError } from '../security.js';
const env = (key: string) => Deno.env.get(key) || '';
const origins = env('SITE_ORIGINS') || env('SITE_ORIGIN');
const baseHeaders = { 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Vary': 'Origin' };
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(async req => {
  const internal = req.headers.get('authorization') === `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` && !!env('SUPABASE_SERVICE_ROLE_KEY');
  const origin = allowedOrigin(origins, req.headers.get('origin'));
  const headers = { ...baseHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!origin && !internal) return reply({ error: 'Origem não autorizada.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Método inválido.' }, 405);
  try {
    if (internal) {
      const body = await readJson(req, 1024);
      if (body.action !== 'dispatch-next') return reply({ error: 'Ação interna inválida.' }, 400);
      return reply(await dispatchNext(db, env));
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: 'Faça login novamente.' }, 401);
    if (!await verifiedSession(db, token, user)) return reply({ error: 'Sessão inválida. Entre novamente.', code: 'invalid_session' }, 403);
    const { data: member } = await db.from('team_members').select('role').eq('user_id', user.id).eq('active', true).single();
    if (!member) return reply({ error: 'Usuário não autorizado.' }, 403);
    await panelQuota(db, user.id);
    if (new URL(req.url).searchParams.get('action') === 'upload-product-image') {
      return reply(await uploadProductImage(req, db, user));
    }
    const body = await readJson(req, 50000);
    if(registrationActions.includes(body.action)){
      try{return reply(await registrationAction({body,db,user}));}
      catch(error){return reply({error:error instanceof Error?error.message:'Não foi possível importar.'},409);}
    }
    if (['publication-history','publication-detail'].includes(body.action)) {
      try { return reply(await publicationHistory({body,db,env})); }
      catch { return reply({error:'Não foi possível consultar esta publicação.'},409); }
    }
    if (['price-batch','price-history','publication-status','retry-publication'].includes(body.action)) {
      try { return reply(await neuraiAction({ body, db, user, env })); }
      catch (error) { return reply({ error: error instanceof Error ? error.message : 'Não foi possível concluir.' }, 409); }
    }
    if (accessActions.includes(body.action)) {
      try { return reply(await accessAction({body,db,user})); }
      catch(error) { return reply({error:error instanceof Error?error.message:'Não foi possível gerenciar o acesso.'},409); }
    }
    if (member.role !== 'admin') return reply({ error: 'Somente administradores podem fazer isso.' }, 403);
    if (body.action === 'delete-user') {
      if (typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId) || typeof body.confirmEmail !== 'string')
        return reply({ error: 'Selecione um usuário e confirme o e-mail.' }, 400);
      if (body.userId === user.id) return reply({ error: 'Você não pode excluir sua própria conta.' }, 400);
      const { data: target } = await db.auth.admin.getUserById(body.userId);
      if (!target.user?.email || body.confirmEmail.trim().toLowerCase() !== target.user.email.toLowerCase())
        return reply({ error: 'O e-mail de confirmação não corresponde ao usuário.' }, 400);
      const { error: prepareError } = await db.rpc('panel_access_prepare_delete', { actor_id: user.id, target_id: body.userId });
      if (prepareError) return reply({ error: 'Não foi possível remover este usuário. Sua conta e o último administrador são protegidos.' }, 409);
      const { error: deleteError } = await db.auth.admin.deleteUser(body.userId);
      if (deleteError) return reply({ error: 'O acesso foi desativado, mas a exclusão não foi concluída. Tente novamente ou consulte o responsável pelo sistema.' }, 409);
      return reply({ ok: true });
    }
    if (body.action === 'publish') {
      return reply(await requestPublication(db, env, user.id, body.version));
    }
    return reply({ error: 'Ação inválida.' }, 400);
  } catch (error) { return reply({ error: error instanceof RequestLimitError ? error.message : 'Não foi possível concluir a operação.' }, error instanceof RequestLimitError ? error.status : 500); }
});
