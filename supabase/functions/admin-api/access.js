const roles=['admin','owner','manager','editor'];
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const rpc=async(db,name,body)=>{const {data,error}=await db.rpc(name,body);if(error)throw Error(error.message||'Não foi possível gerenciar o acesso.');return data;};
export const accessActions=['access-context','list-users','create-user','update-user','set-role-creation-policy','access-history'];
export async function accessAction({body,db,user}) {
  const context=await rpc(db,'panel_access_context',{actor_id:user.id});
  if(body.action==='access-context')return context;
  if(body.action==='create-user'){
    const {email,password,role}=body;
    if(!context.allowedRoles.includes(role))throw Error('Seu cargo não tem permissão para criar este acesso.');
    if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||typeof password!=='string'||password.length<12||password.length>128)throw Error('Informe e-mail e senha inicial com pelo menos 12 caracteres.');
    const {data,error}=await db.auth.admin.createUser({email:email.trim(),password,email_confirm:true});
    if(error||!data?.user?.id)throw Error('Não foi possível cadastrar esse e-mail. Confira se já está cadastrado.');
    try{await rpc(db,'panel_access_register',{actor_id:user.id,target_id:data.user.id,target_role:role});}
    catch(error){await db.auth.admin.deleteUser(data.user.id);throw error;}
    return {ok:true};
  }
  if(!context.isAdmin)throw Error('Somente administradores podem gerenciar acessos e permissões.');
  if(body.action==='list-users'){
    const {data:members,error}=await db.from('team_members').select('user_id,role,active').order('user_id');if(error)throw Error('Não foi possível consultar os usuários.');
    const users=[];
    for(const member of members||[]){const {data,error}=await db.auth.admin.getUserById(member.user_id);if(error||!data?.user)throw Error('Não foi possível consultar um dos usuários.');users.push({id:member.user_id,email:data.user.email||'',role:member.role,active:member.active,isSelf:member.user_id===user.id,createdAt:data.user.created_at||null,lastSignInAt:data.user.last_sign_in_at||null});}
    return {users,...context};
  }
  if(body.action==='update-user'){
    if(!uuid(body.userId)||!roles.includes(body.role)||typeof body.active!=='boolean'||!roles.includes(body.expectedRole)||typeof body.expectedActive!=='boolean')throw Error('Confira o usuário, cargo e situação.');
    await rpc(db,'panel_access_update',{actor_id:user.id,target_id:body.userId,target_role:body.role,target_active:body.active,expected_role:body.expectedRole,expected_active:body.expectedActive});
    return {ok:true};
  }
  if(body.action==='set-role-creation-policy'){
    if(!roles.slice(1).includes(body.role)||typeof body.enabled!=='boolean'||!Array.isArray(body.allowedRoles)||body.allowedRoles.some(r=>!roles.slice(1).includes(r))||!Number.isSafeInteger(body.version)||body.version<1)throw Error('Confira as permissões do cargo.');
    await rpc(db,'panel_access_policy',{actor_id:user.id,job:body.role,enabled:body.enabled,allowed_roles:body.allowedRoles,expected_version:body.version});return {ok:true};
  }
  if(body.action==='access-history'){
    const {data,error}=await db.from('panel_access_history').select('id,actor_id,target_id,event,previous_value,new_value,created_at').order('id',{ascending:false}).limit(50);if(error)throw Error('Não foi possível consultar o histórico.');return {history:data||[]};
  }
  throw Error('Ação de acesso inválida.');
}
