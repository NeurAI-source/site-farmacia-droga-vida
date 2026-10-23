import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {accessAction} from '../supabase/functions/admin-api/access.js';
const admin='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',editor='33333333-3333-4333-8333-333333333333',target='44444444-4444-4444-8444-444444444444',manager='55555555-5555-4555-8555-555555555555';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table auth.users(id uuid primary key);insert into auth.users values('${admin}'),('${owner}'),('${editor}'),('${target}'),('${manager}');create table public.team_members(user_id uuid primary key references auth.users on delete cascade,role text,active boolean default true);insert into public.team_members values('${admin}','admin',true),('${owner}','owner',true),('${editor}','editor',true),('${manager}','manager',true);grant usage on schema public,auth to service_role;grant select,insert,update,delete on public.team_members to service_role;create function public.prepare_panel_user_deletion(actor_id uuid,target_id uuid) returns void language plpgsql as $$begin if actor_id=target_id or not exists(select 1 from public.team_members where user_id=actor_id and role='admin' and active) then raise exception 'Unauthorized';end if;update public.team_members set active=false where user_id=target_id;end$$;revoke all on function public.prepare_panel_user_deletion(uuid,uuid) from public;grant execute on function public.prepare_panel_user_deletion(uuid,uuid) to service_role;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261023182240_panel_access_management.sql',import.meta.url),'utf8'));
 const rpc=async(name,args)=>{await db.exec('set role service_role');try{return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;}finally{await db.exec('reset role');}};return {db,rpc,close:()=>db.close()};}
test('delegation defaults closed, remains role-scoped, validates ranks and audits the actor',async()=>{const f=await fixture();try{
 assert.equal((await f.rpc('panel_access_context',[owner])).canCreate,false);assert.equal((await f.rpc('panel_access_context',[admin])).isAdmin,true);
 await assert.rejects(()=>f.rpc('panel_access_policy',[owner,'editor',true,['editor'],1]),/administradores/);
 await assert.rejects(()=>f.rpc('panel_access_policy',[admin,'manager',true,['owner'],1]),/superiores/);
 await assert.rejects(()=>f.rpc('panel_access_policy',[admin,'owner',true,['admin'],1]),/superiores/);
 await f.rpc('panel_access_policy',[admin,'owner',true,['editor'],1]);const ctx=await f.rpc('panel_access_context',[owner]);assert.deepEqual(ctx.allowedRoles,['editor']);assert.deepEqual(ctx.policies,[]);
 await assert.rejects(()=>f.rpc('panel_access_register',[owner,target,'admin']),/não pode/);
 await f.rpc('panel_access_register',[owner,target,'editor']);const audit=(await f.db.query("select * from public.panel_access_history where event='insert'")).rows[0];assert.equal(audit.actor_id,owner);assert.equal(audit.new_value.role,'editor');assert.equal(audit.target_id,target);
 await assert.rejects(()=>f.rpc('panel_access_policy',[admin,'owner',false,[],1]),/mudou/);
 await f.rpc('panel_access_policy',[admin,'owner',false,[],2]);assert.equal((await f.rpc('panel_access_context',[owner])).canCreate,false);
 }finally{await f.close();}});
test('only active administrators manage memberships; self changes and stale requests are blocked',async()=>{const f=await fixture();try{
 await assert.rejects(()=>f.rpc('panel_access_update',[owner,editor,'admin',true,'editor',true]),/administradores/);
 await assert.rejects(()=>f.rpc('panel_access_update',[admin,admin,'editor',false,'admin',true]),/própria/);
 await f.rpc('panel_access_update',[admin,editor,'manager',false,'editor',true]);assert.equal((await f.db.query('select active from public.team_members where user_id=$1',[editor])).rows[0].active,false);
 await assert.rejects(()=>f.rpc('panel_access_context',[editor]),/autorizado/);
 await assert.rejects(()=>f.rpc('panel_access_update',[admin,editor,'admin',true,'editor',true]),/mudou/);
 await f.rpc('panel_access_update',[admin,editor,'editor',true,'manager',false]);assert.equal((await f.db.query("select count(*) n from public.panel_access_history where event='update'")).rows[0].n,2);
 await f.db.query('update public.team_members set active=false where user_id=$1',[admin]);await assert.rejects(()=>f.rpc('panel_access_policy',[admin,'owner',true,['editor'],1]),/administradores/);
 }finally{await f.close();}});
test('public clients cannot call service RPCs or read, alter or erase access policies and audit',async()=>{const f=await fixture();try{
 for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(()=>f.db.query('select public.panel_access_context($1)',[admin]),/permission denied/);for(const table of ['panel_role_creation','panel_access_history'])for(const sql of ['select * from ','delete from '])await assert.rejects(()=>f.db.query(sql+'public.'+table),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.close();}});
test('server rejects unauthorized creation before Auth; rechecks policy after provisioning and removes a rejected provisional account',async()=>{
 let created=0,removed=0;const db={rpc:async(name)=>name==='panel_access_context'?{data:{isAdmin:false,canCreate:true,allowedRoles:['editor']}}:{error:{message:'Permissão revogada'}},auth:{admin:{createUser:async()=>{created++;return {data:{user:{id:target}}};},deleteUser:async()=>{removed++;return {};}}}};
 await assert.rejects(()=>accessAction({db,user:{id:owner},body:{action:'create-user',email:'teste@example.test',password:'senha-ficticia-1234',role:'admin'}}),/permissão/);assert.equal(created,0);
 await assert.rejects(()=>accessAction({db,user:{id:owner},body:{action:'create-user',email:'teste@example.test',password:'senha-ficticia-1234',role:'editor'}}),/revogada/);assert.equal(created,1);assert.equal(removed,1);
 for(const action of ['list-users','set-role-creation-policy','update-user','access-history'])await assert.rejects(()=>accessAction({db,user:{id:owner},body:{action}}),/administradores/);
});
