import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { readBytes, readJson, verifiedSession, analyticsSource } from '../supabase/functions/security.js';
import { createHandler } from '../supabase/functions/trier-api/handler.js';
const actor='11111111-1111-4111-8111-111111111111';
const original=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
async function fixture(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_setting('test.role',true) $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('aal',current_setting('test.aal',true)) $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    grant usage on schema auth,storage to authenticated,service_role;grant insert on storage.objects to authenticated;
    insert into auth.users values('${actor}');`);
  for(const file of ['202609270000_team.sql','202609270001_admin.sql','20261014130000_security_hardening.sql','20261015090000_password_login.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.exec(`insert into public.team_members values('${actor}','admin',true);set test.uid='${actor}';set test.role='authenticated';set test.aal='aal1';`);
  await db.query('insert into public.catalog_draft(id,catalog) values(1,$1)',[JSON.stringify(original)]);
  return db;
}
test('password sessions retain member authorization, database validation and storage isolation',async()=>{
  const db=await fixture();try{
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.team_members')).rows.length,1);
    assert.equal((await db.query('select * from public.catalog_draft')).rows.length,1);
    assert.equal((await db.query('select public.save_catalog($1,1) version',[JSON.stringify(original)])).rows[0].version,2);
    await db.query('insert into storage.objects values($1,$2)',['product-images',`${actor}/x.png`]);
    await assert.rejects(()=>db.query('select public.save_catalog($1,1)',[JSON.stringify(original)]),/Conflict/);
    await db.exec('reset role');await db.exec(`update public.team_members set active=false where user_id='${actor}';set role authenticated`);
    await assert.rejects(()=>db.query('select public.save_catalog($1,2)',[JSON.stringify(original)]),/Unauthorized/);
  }finally{await db.close();}
});
test('full SQL catalog validation rejects direct forged payloads without changing version',async()=>{
  const db=await fixture();try{
    assert.equal((await db.query('select public.catalog_schema_valid($1) ok',[JSON.stringify(original)])).rows[0].ok,true);
    await db.exec("set test.aal='aal2';set role authenticated");
    const mutations=[p=>p.products[0].id='1\" onclick=evil',p=>p.products[0].priceCents=1.5,p=>p.products[0].name='<script>'.repeat(30),p=>p.products[0].imageUrl='javascript:evil()',p=>p.products[0].stockQuantity='0',p=>p.products[0].active='true',p=>p.products[0].variants=[{id:1,size:'P',packageQuantity:1,stockQuantity:0,shortCode:'x'},{id:2,size:'p',packageQuantity:1,stockQuantity:0,shortCode:'y'}],p=>{p.products[0].shortCode='same';p.products[1].shortCode='SAME';},p=>p.categories[0].subcategories='bad',p=>p.products[0].contentSources=['https://127.0.0.1/x'],p=>{p.categories[0].name='123';p.products[0].category=123;},...['https://.../x','https://example.com:999999/x','https://-invalid.example/x','https://invalid-.example/x','https://a..example/x','https://example.com:/x'].map(url=>p=>p.products[0].contentSources=[url])];
    for(const mutate of mutations){const payload=structuredClone(original);mutate(payload);await assert.rejects(()=>db.query('select public.save_catalog($1,1)',[JSON.stringify(payload)]),/Invalid catalog/);}
    const unicodeMutations=[p=>p.products[0].name='😀'.repeat(61),p=>p.products[0].name='\t\n\u00a0\u2000\ufeff',p=>p.products[0].brand='😀'.repeat(101),p=>p.categories[0].name='😀'.repeat(81),p=>p.products[0].variants=[{id:1,size:'😀'.repeat(8),packageQuantity:1,stockQuantity:0}],p=>p.products[0].variants=[{id:1,size:'\t\u00a0\ufeff',packageQuantity:1,stockQuantity:0}]];
    for(const mutate of unicodeMutations){const payload=structuredClone(original);mutate(payload);await assert.rejects(()=>db.query('select public.save_catalog($1,1)',[JSON.stringify(payload)]),/Invalid catalog/);}
    assert.equal((await db.query('select version from public.catalog_draft')).rows[0].version,1);
  }finally{await db.close();}
});
test('analytics atomic global cap bounds random UUID writes; quotas expire and service RPCs stay private',async()=>{
  const db=await fixture();try{
    await db.exec("insert into public.security_request_quotas values('analytics','global',date_trunc('day',now()),4999);insert into public.site_visits(day,session_id) values(current_date-31,gen_random_uuid());insert into public.security_request_quotas values('old','old',now()-interval '3 days',1);set test.role='service_role';set role service_role");
    assert.equal((await db.query('select public.record_view_limited(gen_random_uuid(),null) ok')).rows[0].ok,true);
    assert.equal((await db.query('select public.record_view_limited(gen_random_uuid(),null) ok')).rows[0].ok,false);
    for(let i=0;i<120;i++)assert.equal((await db.query('select public.panel_request_allow($1) ok',[actor])).rows[0].ok,true);
    assert.equal((await db.query('select public.panel_request_allow($1) ok',[actor])).rows[0].ok,false);
    await db.exec('reset role');assert.equal((await db.query('select count(*) n from public.site_visits')).rows[0].n,1);
    assert.equal((await db.query("select count(*) n from public.security_request_quotas where scope='old'")).rows[0].n,0);
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select public.record_view_limited(gen_random_uuid(),null)'),/permission denied/);await assert.rejects(()=>db.query('select public.panel_request_allow($1)',[actor]),/permission denied/);await db.exec('reset role');}
  }finally{await db.close();}
});
test('stream limits cancel excess input before parsing and count bytes rather than characters',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(60));c.enqueue(new Uint8Array(60));},cancel(){cancelled=true;}});
  await assert.rejects(()=>readBytes(new Request('https://test.invalid',{method:'POST',body:stream,duplex:'half'}),100),e=>e.status===413);assert.equal(cancelled,true);
  await assert.rejects(()=>readJson(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({x:'é'.repeat(60)})}),100),e=>e.status===413);
  for(const body of ['null','[]','{'])await assert.rejects(()=>readJson(new Request('https://test.invalid',{method:'POST',body}),100),e=>e.status===400);
});
test('assurance uses verified claims for the same validated user and source hash never stores an IP',async()=>{
  for(const claims of [{sub:actor,aal:'invalid'},{sub:'other',aal:'aal2'}])assert.equal(await verifiedSession({auth:{getClaims:async()=>({data:{claims}})}},'same-token',{id:actor}),false);
  assert.equal(await verifiedSession({auth:{getClaims:async token=>{assert.equal(token,'same-token');return {data:{claims:{sub:actor,aal:'aal1'}}};}}},'same-token',{id:actor}),true);
  const req=new Request('https://test.invalid',{headers:{'x-forwarded-for':'192.0.2.1'}});
  assert.equal(await analyticsSource(req,()=>''),null);
  const hash=await analyticsSource(req,()=> 'test-salt');assert.match(hash,/^[0-9a-f]{64}$/);assert.ok(!hash.includes('192.0.2.1'));
});
test('Trier password sessions retain verified identity and quota; server calls stay exempt',async()=>{
  const env=key=>({SITE_ORIGIN:'https://shop.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-server',TRIER_INTEGRATION_ENABLED:'false'}[key]||'');
  const request=()=>new Request('https://api.invalid',{method:'POST',headers:{origin:'https://shop.invalid',authorization:'Bearer test-user'},body:JSON.stringify({action:'sync'})});
  for(const [aal,quota,status] of [['invalid',true,403],['aal1',false,429],['aal1',true,200],['aal2',true,200]]){
    const db={auth:{getUser:async()=>({data:{user:{id:actor}}}),getClaims:async()=>({data:{claims:{sub:actor,aal}}})},from:()=>({select:()=>({eq(){return this;},single:async()=>({data:{role:'admin'}})})}),rpc:async()=>({data:quota})};
    assert.equal((await createHandler(db,env)(request())).status,status);
    const server=new Request('https://api.invalid',{method:'POST',headers:{authorization:'Bearer test-server'},body:JSON.stringify({action:'sync'})});
    assert.equal((await createHandler(db,env)(server)).status,200);
  }
});
