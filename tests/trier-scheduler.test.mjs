import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {verifiedScheduledRequest} from '../supabase/functions/trier-api/server-auth.js';
import {createHandler} from '../supabase/functions/trier-api/handler.js';
test('scheduled capability only authorizes sync and cannot read status or manage catalog',async()=>{
 const token='a'.repeat(64);let calls=0;
 const db={rpc:async(name,args)=>{calls++;assert.equal(name,'trier_schedule_authorized');return {data:args.provided_token===token,error:null};}};
 for(const value of ['', 'short','A'.repeat(64)])assert.equal(await verifiedScheduledRequest(new Headers({'x-trier-schedule':value}),db),false);
 assert.equal(calls,0);assert.equal(await verifiedScheduledRequest(new Headers({'x-trier-schedule':token}),db),true);
 const handler=createHandler(db,()=> '');
 const request=action=>new Request('https://example.invalid/',{method:'POST',headers:{'x-trier-schedule':token,'Content-Type':'application/json'},body:JSON.stringify({action})});
 assert.equal((await handler(request('status'))).status,403);
 assert.equal((await handler(request('publish'))).status,403);
 assert.deepEqual(await (await handler(request('sync'))).json(),{status:'disabled'});
 assert.equal(await verifiedScheduledRequest(new Headers({'x-trier-schedule':'b'.repeat(64)}),db),false);
 assert.equal(await verifiedScheduledRequest(new Headers({'x-trier-schedule':token}),{rpc:async()=>({data:true,error:{message:'denied'}})}),false);
});
test('scheduler migration keeps capability in Vault, restricts RPCs and reuses the interval/lease',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema vault;create schema cron;create schema net;
 create table public.trier_sync_state(id int,started_at timestamptz,lease_until timestamptz);insert into public.trier_sync_state values(1,null,null);
 create table vault.secrets(id uuid default gen_random_uuid(),name text unique,description text,secret text);
 create view vault.decrypted_secrets as select *,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(value text,label text,details text) returns uuid language sql as $$insert into vault.secrets(name,description,secret) values(label,details,value) returning id$$;
 create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active bool default true);
 create function cron.schedule(label text,timing text,sql_command text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(label,timing,sql_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
 create function cron.alter_job(job_id bigint,active bool) returns void language sql as $$update cron.job set active=alter_job.active where jobid=job_id$$;
 create table net.requests(id bigint generated always as identity,url text,headers jsonb,body jsonb,timeout_milliseconds int);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$insert into net.requests(url,headers,body,timeout_milliseconds) values(url,headers,body,timeout_milliseconds) returning id$$;
 revoke all on schema vault from public,anon,authenticated;`);
 const sql=(await readFile(new URL('../supabase/migrations/20261022150050_reliable_trier_scheduler.sql',import.meta.url),'utf8')).replace(/^create extension .*;\n/gm,'');
 await db.exec(sql);
 const token=(await db.query('select secret from vault.secrets')).rows[0].secret;assert.match(token,/^[a-f0-9]{64}$/);
 const job=(await db.query('select * from cron.job')).rows[0];assert.equal(job.active,false);assert.equal(job.schedule,'*/5 * * * *');assert.equal(job.command,'select public.trier_run_scheduled_sync();');
 await db.exec(sql);assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1);
 assert.equal((await db.query('select public.trier_schedule_authorized($1) as ok',[token])).rows[0].ok,true);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select public.trier_schedule_authorized($1)',[token]),/permission denied/);await assert.rejects(()=>db.query('select public.trier_run_scheduled_sync()'),/permission denied/);await assert.rejects(()=>db.query('select * from vault.decrypted_secrets'),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await db.query('select public.trier_schedule_authorized($1) as ok',[token])).rows[0].ok,true);await assert.rejects(()=>db.query('select public.trier_run_scheduled_sync()'),/permission denied/);await db.exec('reset role');
 assert.equal((await db.query('select public.trier_run_scheduled_sync() as id')).rows[0].id,1);
 const request=(await db.query('select * from net.requests')).rows[0];assert.equal(request.headers['x-trier-schedule'],token);assert.deepEqual(request.body,{action:'sync'});assert.equal(request.timeout_milliseconds,10000);
 await db.exec("update public.trier_sync_state set started_at=now()-interval '5 minutes'");assert.equal((await db.query('select public.trier_run_scheduled_sync() as id')).rows[0].id,null);
 await db.exec("update public.trier_sync_state set started_at=now()-interval '30 minutes',lease_until=now()+interval '10 minutes'");assert.equal((await db.query('select public.trier_run_scheduled_sync() as id')).rows[0].id,null);
 assert.equal((await db.query('select count(*)::int as n from net.requests')).rows[0].n,1);
 }finally{await db.close();}
});
