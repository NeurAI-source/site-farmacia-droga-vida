import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
// Copy shared validator into _shared when deploying (npm run prepare:functions).
import { allowedOrigin } from '../cors.js';
import { checked, dispatchNext, neuraiAction } from './publication.js';
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
      const body = await req.json();
      if (body.action !== 'dispatch-next') return reply({ error: 'Ação interna inválida.' }, 400);
      return reply(await dispatchNext(db, env));
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: 'Faça login novamente.' }, 401);
    const { data: member } = await db.from('team_members').select('role').eq('user_id', user.id).eq('active', true).single();
    if (!member) return reply({ error: 'Usuário não autorizado.' }, 403);
    const raw = await req.text();
    if (raw.length > 50000) return reply({ error: 'Solicitação muito grande.' }, 413);
    const body = JSON.parse(raw);
    if (['price-batch','price-history','publication-status','retry-publication'].includes(body.action)) {
      try { return reply(await neuraiAction({ body, db, user, env })); }
      catch (error) { return reply({ error: error instanceof Error ? error.message : 'Não foi possível concluir.' }, 409); }
    }
    if (member.role !== 'admin') return reply({ error: 'Somente administradores podem fazer isso.' }, 403);
    if (body.action === 'list-users') {
      const { data: members, error } = await db.from('team_members').select('user_id,role,active').order('user_id');
      if (error) throw error;
      const users = [];
      for (const entry of members || []) {
        const { data, error: lookupError } = await db.auth.admin.getUserById(entry.user_id);
        if (lookupError) throw lookupError;
        users.push({ id: entry.user_id, email: data.user.email, role: entry.role, active: entry.active, isSelf: entry.user_id === user.id });
      }
      return reply({ users });
    }
    if (body.action === 'delete-user') {
      if (typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId) || typeof body.confirmEmail !== 'string')
        return reply({ error: 'Selecione um usuário e confirme o e-mail.' }, 400);
      if (body.userId === user.id) return reply({ error: 'Você não pode excluir sua própria conta.' }, 400);
      const { data: target } = await db.auth.admin.getUserById(body.userId);
      if (!target.user?.email || body.confirmEmail.trim().toLowerCase() !== target.user.email.toLowerCase())
        return reply({ error: 'O e-mail de confirmação não corresponde ao usuário.' }, 400);
      const { error: prepareError } = await db.rpc('prepare_panel_user_deletion', { actor_id: user.id, target_id: body.userId });
      if (prepareError) return reply({ error: 'Não foi possível remover este usuário. Sua conta e o último administrador são protegidos.' }, 409);
      const { error: deleteError } = await db.auth.admin.deleteUser(body.userId);
      if (deleteError) return reply({ error: 'O acesso foi desativado, mas a exclusão não foi concluída. Tente novamente ou consulte o responsável pelo sistema.' }, 409);
      return reply({ ok: true });
    }
    if (body.action === 'create-user') {
      const { email, password, role } = body;
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof password !== 'string' || password.length < 12 || password.length > 128 || !['admin','editor','owner','manager'].includes(role))
        return reply({ error: 'Informe e-mail, senha com pelo menos 12 caracteres e cargo válido.' }, 400);
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return reply({ error: 'Não foi possível cadastrar esse e-mail. Confira se já está cadastrado.' }, 400);
      const { error: insertError } = await db.from('team_members').insert({ user_id: data.user.id, role });
      if (insertError) { await db.auth.admin.deleteUser(data.user.id); throw insertError; }
      return reply({ ok: true });
    }
    if (body.action === 'publish') {
      const id = checked(await db.rpc('catalog_request_publication', { actor_id: user.id, expected_version: body.version }));
      const delivery = await dispatchNext(db, env);
      return reply({ id, ...delivery });
    }
    return reply({ error: 'Ação inválida.' }, 400);
  } catch { return reply({ error: 'Não foi possível concluir a operação.' }, 500); }
});
