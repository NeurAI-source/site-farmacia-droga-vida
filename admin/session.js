import { client, adminAction } from './backend.js?v=20261002';
const $ = s => document.querySelector(s);
export let membership;
export async function authorize() {
  if (!client) {
    $('#login-status').textContent = 'Conexão pendente: o projeto Supabase ainda precisa ser configurado.';
    $('#login-form').hidden = true;
    return false;
  }
  const { data: { session } } = await client.auth.getSession();
  if (!session) return false;
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
