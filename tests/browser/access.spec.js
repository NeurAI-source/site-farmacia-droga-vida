import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../catalog.json',import.meta.url)));
const self='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
async function setup(page,{role='admin',allow=false}={}){
 const state={allow,calls:[],created:0,users:[{id:self,email:'responsavel@example.test',role,active:true,isSelf:true,lastSignInAt:'2026-10-23T12:00:00Z'},{id:other,email:'equipe@example.test',role:'editor',active:true,isSelf:false,lastSignInAt:null}],policies:['owner','manager','editor'].map(role=>({role,enabled:false,allowed_roles:['editor'],version:1})),history:[]};
 const context=()=>({isAdmin:role==='admin',canCreate:role==='admin'||state.allow,allowedRoles:role==='admin'?['admin','owner','manager','editor']:state.allow?['editor']:[],policies:role==='admin'?state.policies:[]});
 await page.route('**/public-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const config={url:"https://access-test.supabase.co",key:"sb_publishable_test"};'}));
 const user={id:self,email:'responsavel@example.test',role:'authenticated',aud:'authenticated'},token=`e30.${Buffer.from(JSON.stringify({sub:self,role:'authenticated',aal:'aal2',exp:4102444800})).toString('base64url')}.test`;
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-access-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:4102444800,token_type:'bearer',user})),{user,token});
 await page.route('https://access-test.supabase.co/**',async r=>{const url=new URL(r.request().url());let data={};
 if(url.pathname.endsWith('/user'))data=user;
 else if(url.pathname.includes('/team_members'))data={role,active:true};
 else if(url.pathname.includes('/catalog_draft'))data={catalog,version:1};
 else if(url.pathname.includes('/traffic_summary')||url.pathname.includes('/publications'))data=[];
 else if(url.pathname.endsWith('/admin-api')){const b=r.request().postDataJSON();state.calls.push(b);
 if(b.action==='access-context')data=context();
 if(b.action==='list-users')data={users:state.users,...context()};
 if(b.action==='access-history')data={history:state.history};
 if(b.action==='update-user'){const u=state.users.find(u=>u.id===b.userId);if(u.isSelf)return r.fulfill({status:409,json:{error:'Conta protegida.'}});const previous={role:u.role,active:u.active};Object.assign(u,{role:b.role,active:b.active});state.history.unshift({id:1,event:'update',actor_id:self,target_id:u.id,previous_value:previous,new_value:{role:u.role,active:u.active},created_at:new Date().toISOString()});data={ok:true};}
 if(b.action==='set-role-creation-policy'){const p=state.policies.find(p=>p.role===b.role);Object.assign(p,{enabled:b.enabled,allowed_roles:b.allowedRoles,version:p.version+1});data={ok:true};}
 if(b.action==='create-user'){if(!context().allowedRoles.includes(b.role))return r.fulfill({status:409,json:{error:'Permissão revogada pelo administrador.'}});state.created++;data={ok:true};}
 if(b.action==='price-history')data={batches:[]};}
 await r.fulfill({json:data});});
 await page.goto('/admin/');await expect(page.locator('#login-screen')).toBeHidden();return state;
}
test('admin reviews role/status changes, sees last login and history, and cannot edit their own access',async({page})=>{
 const state=await setup(page);await page.locator('[data-view="access"]').click();await expect(page.locator('[data-access-list]')).toContainText('responsavel@example.test');await expect(page.locator('[data-access-list]')).toContainText('23/10/2026');await expect(page.locator('[data-edit-access="'+self+'"]')).toHaveCount(0);
 await page.locator('[data-edit-access="'+other+'"]').click();const d=page.getByRole('dialog',{name:'Editar acesso',exact:true});await d.getByLabel('Cargo do usuário').selectOption('manager');await d.getByLabel('Acesso ativo').uncheck();await d.getByRole('button',{name:'Revisar alteração de acesso'}).click();expect(state.users[1].active).toBe(true);
 await page.getByRole('dialog',{name:'Confirmar alteração de acesso'}).getByRole('button',{name:'Confirmar alteração',exact:true}).click();await expect(page.locator('[data-access-message]')).toContainText('atualizado com sucesso');expect(state.users[1].role).toBe('manager');expect(state.users[1].active).toBe(false);await expect(page.locator('[data-access-history-list]')).toContainText('Acesso atualizado');expect(state.calls.some(c=>c.action==='publish')).toBe(false);
});
test('admin explicitly confirms delegation by role and allowed target roles',async({page})=>{
 const state=await setup(page);await page.locator('[data-view="access"]').click();const card=page.locator('[data-role-policy="manager"]');await card.getByLabel('Permitir criar acessos').check();await card.getByRole('button',{name:'Revisar permissão de Gerente'}).click();expect(state.policies.find(p=>p.role==='manager').enabled).toBe(false);await page.getByRole('dialog',{name:'Confirmar alteração de acesso'}).getByRole('button',{name:'Confirmar alteração',exact:true}).click();await expect(page.locator('[data-access-message]')).toContainText('atualizado com sucesso');expect(state.policies.find(p=>p.role==='manager').allowed_roles).toEqual(['editor']);expect(state.policies.find(p=>p.role==='manager').enabled).toBe(true);
});
test('delegated creator can only create allowed roles, never manage accounts, and a revoked grant rejects the open form',async({page})=>{
 const state=await setup(page,{role:'manager',allow:true});await page.locator('[data-view="access"]').click();await expect(page.locator('[data-access-admin]')).toBeHidden();await expect(page.locator('#publish')).toBeHidden();await page.getByRole('button',{name:'Novo acesso',exact:true}).click();const d=page.locator('#user-dialog');await expect(d.locator('select[name="role"] option')).toHaveText(['Editor']);await d.getByLabel('E-mail',{exact:true}).fill('novo@example.test');await d.getByLabel('Senha inicial',{exact:true}).fill('Senha-ficticia-1234');state.allow=false;await d.getByRole('button',{name:'Cadastrar usuário'}).click();await expect(page.locator('#user-status')).toContainText('revogada');expect(state.created).toBe(0);await expect(d.getByLabel('Senha inicial',{exact:true})).toHaveValue('');
});
test('non delegated members do not see the access management tab or shortcut',async({page})=>{
 await setup(page,{role:'editor'});await expect(page.locator('[data-view="access"]')).toBeHidden();await expect(page.locator('#manage-users')).toBeHidden();
});
