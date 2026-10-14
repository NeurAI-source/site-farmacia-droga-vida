import { client, adminAction } from './backend.js';
const $ = s => document.querySelector(s);
export let membership;
// The backend must independently require aal2; this gate also keeps draft data out of the UI.
async function requireMFA() {
  const panel = $('#mfa-screen'), status = $('#mfa-status'), code = $('#mfa-code');
  $('#login-form').hidden = true; panel.hidden = false;
  let factorId, enrolledId, busy = false;
  const clearSecret = () => { $('#mfa-qr').removeAttribute('src'); $('#mfa-secret').textContent = ''; code.value = ''; };
  try {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data.currentLevel === 'aal2') { panel.hidden = true; return true; }
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    factorId = factors.data.totp.find(f => f.status === 'verified')?.id;
    $('#mfa-enroll').hidden = !!factorId;
    $('#mfa-form').hidden = !factorId;
    $('#mfa-description').textContent = factorId ? 'Digite o código de seis números do seu aplicativo autenticador.' : 'Para proteger sua conta, configure um aplicativo autenticador antes de entrar no painel.';
  } catch { status.textContent = 'Não foi possível verificar a proteção da conta. Saia e tente entrar novamente.'; $('#mfa-enroll').hidden = $('#mfa-form').hidden = true; }
  return new Promise(resolve => {
    const lock = value => { busy = value; panel.querySelectorAll('button,input').forEach(el => el.disabled = value); };
    $('#mfa-enroll').onclick = async () => {
      if (busy) return; lock(true); status.textContent = 'Preparando o autenticador…';
      try {
        const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Droga Vida ${crypto.randomUUID()}`, issuer: 'Droga Vida Popular' });
        if (result.error) throw result.error;
        factorId = enrolledId = result.data.id;
        const qr = result.data.totp.qr_code;
        // SVG remains an isolated image document, never active markup in the administrative DOM.
        if (typeof qr !== 'string' || !qr.trimStart().startsWith('<svg')) throw Error();
        $('#mfa-qr').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
        $('#mfa-secret').textContent = result.data.totp.secret;
        $('#mfa-setup').hidden = false; $('#mfa-enroll').hidden = true; $('#mfa-form').hidden = false;
        status.textContent = 'Escaneie o QR code ou copie a chave no autenticador. Depois confirme o código.'; code.focus();
      } catch { status.textContent = 'Não foi possível configurar o autenticador. Saia e tente novamente ou fale com o administrador.'; }
      finally { lock(false); }
    };
    $('#mfa-form').onsubmit = async event => {
      event.preventDefault(); if (busy || !factorId) return;
      const value = code.value.trim(); if (!/^\d{6}$/.test(value)) { status.textContent = 'Digite os seis números do autenticador.'; return; }
      lock(true); status.textContent = 'Confirmando o código…';
      try {
        const result = await client.auth.mfa.challengeAndVerify({ factorId, code: value });
        if (result.error) throw result.error;
        enrolledId = null;
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error || assurance.data.currentLevel !== 'aal2') throw Error();
        enrolledId = null; clearSecret(); panel.hidden = true; resolve(true);
      } catch { code.value = ''; status.textContent = 'Código não confirmado. Confira o aplicativo e tente novamente.'; }
      finally { lock(false); }
    };
    $('#mfa-cancel').onclick = async () => {
      if (busy) return; lock(true); clearSecret();
      try {
        // Only discard an unfinished factor created by this screen, never an existing verified factor.
        if (enrolledId) {
          const factors = await client.auth.mfa.listFactors();
          if (!factors.error && factors.data.all?.some(f => f.id === enrolledId && f.status === 'unverified')) {
            await client.auth.mfa.unenroll({ factorId: enrolledId });
          }
        }
        const result = await client.auth.signOut();
        if (result?.error) throw result.error;
        location.reload();
      } catch { status.textContent = 'Não foi possível sair. Recarregue a página e tente novamente.'; lock(false); }
    };
  });
}
export async function authorize() {
  if (!client) {
    $('#login-status').textContent = 'Conexão pendente: o projeto Supabase ainda precisa ser configurado.';
    $('#login-form').hidden = true;
    return false;
  }
  const { data: { session } } = await client.auth.getSession();
  if (!session) return false;
  if (!await requireMFA()) return false;
  const { data, error } = await client.from('team_members').select('role,active').eq('user_id', session.user.id).single();
  if (error || !data?.active) {
    $('#login-status').textContent = 'Este usuário não tem acesso autorizado. Fale com o administrador.';
    await client.auth.signOut();
    return false;
  }
  membership = { ...data, userId: session.user.id };
  document.body.classList.remove('locked');
  $('#login-screen').hidden = true;
  $('.mode').textContent = ({ admin: 'Administrador', editor: 'Editor', owner: 'Proprietário(a)', manager: 'Gerente' })[data.role] || 'Usuário';
  $('#manage-users').hidden = $('#publish').hidden = data.role !== 'admin';
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') location.reload(); });
  return true;
}
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const button = e.target.querySelector('button'); button.disabled = true;
  $('#login-status').textContent = 'Entrando…';
  try {
    const { error } = await client.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value });
    $('#login-password').value = '';
    if (error) throw error;
    location.reload();
  } catch { $('#login-status').textContent = 'Não foi possível entrar. Confira e-mail e senha.'; }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => { await client.auth.signOut(); location.reload(); };
const roleLabels = { admin: 'Administrador', editor: 'Editor', owner: 'Proprietário(a)', manager: 'Gerente' };
let selectedUser;
async function loadUsers() {
  $('#users-status').textContent = 'Carregando usuários…';
  $('#users-list').replaceChildren();
  try {
    const { users } = await adminAction('list-users');
    for (const user of users) {
      const row = document.createElement('div'); row.className = 'user-row';
      const details = document.createElement('div');
      const email = document.createElement('strong'); email.textContent = user.email;
      const cargo = document.createElement('span'); cargo.textContent = (roleLabels[user.role] || 'Usuário') + (user.active ? '' : ' · Acesso desativado');
      details.append(email, cargo); row.append(details);
      if (user.isSelf) { const you = document.createElement('span'); you.textContent = 'Você'; row.append(you); }
      else { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Excluir'; remove.setAttribute('aria-label', 'Excluir ' + user.email);
        remove.onclick = () => { selectedUser = user; $('#delete-user-form').reset(); $('#delete-user-description').textContent = user.email; $('#delete-user-status').textContent = ''; $('#delete-user-dialog').showModal(); }; row.append(remove); }
      $('#users-list').append(row);
    }
    $('#users-status').textContent = users.length ? '' : 'Nenhum usuário cadastrado.';
  } catch (error) { $('#users-status').textContent = error.message; }
}
$('#manage-users').onclick = () => { $('#users-dialog').showModal(); loadUsers(); };
$('#close-users').onclick = () => $('#users-dialog').close();
$('#add-user').onclick = () => { $('#user-status').textContent = ''; $('#user-dialog').showModal(); };
$('#cancel-delete-user').onclick = () => $('#delete-user-dialog').close();
$('#delete-user-form').onsubmit = async e => {
  e.preventDefault();
  if (!selectedUser || $('#delete-user-email').value.trim().toLowerCase() !== selectedUser.email.toLowerCase()) { $('#delete-user-status').textContent = 'Digite o e-mail exato do usuário selecionado.'; return; }
  const button = e.target.querySelector('[type=submit]'); button.disabled = true;
  try { await adminAction('delete-user', { userId: selectedUser.id, confirmEmail: $('#delete-user-email').value.trim() }); $('#delete-user-dialog').close(); selectedUser = null; await loadUsers(); $('#users-status').textContent = 'Usuário excluído com sucesso.'; }
  catch (error) { $('#delete-user-status').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#close-user').onclick = () => $('#user-dialog').close();
$('#user-form').onsubmit = async e => {
  e.preventDefault();
  const button = e.target.querySelector('[type=submit]'); button.disabled = true;
  const fields = new FormData(e.target);
  try {
    await adminAction('create-user', Object.fromEntries(fields));
    e.target.reset(); $('#user-status').textContent = 'Usuário cadastrado com sucesso.'; await loadUsers();
  } catch (error) { $('#user-status').textContent = error.message; }
  finally { button.disabled = false; }
};
export async function refreshTraffic() {
  const { data, error } = await client.rpc('traffic_summary');
  if (error) { $('#traffic-summary').textContent = 'Não foi possível carregar os acessos.'; return; }
  const views = data.reduce((sum, day) => sum + Number(day.views), 0);
  const visits = data.reduce((sum, day) => sum + Number(day.visits), 0);
  $('#traffic-summary').textContent = `${views.toLocaleString('pt-BR')} visualizações · ${visits.toLocaleString('pt-BR')} visitas estimadas nos últimos 30 dias`;
}
export async function refreshPublication() {
  const { data, error } = await client.from('publications').select('id,status,created_at').order('created_at', { ascending: false }).limit(1);
  if (error) { $('#publication-status').textContent = 'Não foi possível consultar a publicação.'; return; }
  const last = data[0];
  const labels = { queued: 'Aguardando a publicação anterior.', pending: 'Publicação na fila do GitHub.', building: 'Publicando o site…', published: 'Publicação concluída.', failed: 'A publicação falhou. Confira o GitHub Actions.' };
  $('#publication-status').textContent = last ? `${labels[last.status]} ${new Date(last.created_at).toLocaleString('pt-BR')}` : 'Nenhuma publicação pelo painel ainda.';
  $('#publish').disabled = !!last && ['queued','pending','building'].includes(last.status);
}
