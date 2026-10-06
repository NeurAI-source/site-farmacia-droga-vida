import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',editor='33333333-3333-4333-8333-333333333333',outsider='44444444-4444-4444-8444-444444444444';
const base={categories:[{name:'Teste'}],products:[{id:1,shortCode:'001',name:'Sabonete 70g',detail:'70g',priceCents:600,stockQuantity:17,imageUrl:'assets/a.png',variants:[]},{id:2,shortCode:'1',name:'Sabonete 90g',priceCents:800,stockQuantity:22,variants:[]}]};
const change=(id=1,code='001',previousCents=600,priceCents=500)=>({productId:id,code,previousCents,priceCents});
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
 grant usage on schema public,auth to service_role;
 insert into auth.users values('${admin}','admin@test.invalid'),('${other}','other@test.invalid'),('${editor}','editor@test.invalid'),('${outsider}','outsider@test.invalid');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202609270000_team.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202609270001_admin.sql',import.meta.url),'utf8'));
 await db.exec(`grant select on public.team_members to service_role;insert into public.team_members values('${admin}','admin',true),('${other}','admin',true),('${editor}','editor',true);`);
 await db.query('insert into public.catalog_draft(id,catalog) values(1,$1)',[JSON.stringify(base)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261001190410_carousel_campaigns.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261002113649_neurai_auto_publication.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261006103000_variant_short_codes.sql',import.meta.url),'utf8'));
 const rpc=async(name,args)=>{await db.exec('set role service_role');try{return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;}finally{await db.exec('reset role');}};
 const save=({actor=admin,id=crypto.randomUUID(),version=1,rows=[change()],auto=false,restore=null,email='admin@test.invalid'}={})=>rpc('neurai_save_batch',[actor,id,version,JSON.stringify(rows),auto,restore,email]);
 return {db,rpc,save,close:()=>db.close(),draft:async()=>(await db.query('select * from public.catalog_draft')).rows[0],jobs:async()=>(await db.query('select * from public.publications order by draft_version')).rows};
}
test('atomic multi-product save, audit identity, idempotent response-loss recovery and manual publishing',async()=>{
 const f=await fixture();try{const id=crypto.randomUUID();const request={id,rows:[change(),change(2,'1',800,700)]};const saved=await f.save(request);
 assert.equal(saved.after_version,2);assert.equal(saved.actor_label,'admin@test.invalid');assert.equal(saved.changes.length,2);assert.equal((await f.jobs()).length,0);
 assert.equal((await f.db.query("select has_table_privilege('service_role','auth.users','SELECT') allowed")).rows[0].allowed,false);
 const draft=await f.draft();assert.deepEqual(draft.catalog.products.map(p=>p.priceCents),[500,700]);assert.equal(draft.catalog.products[0].stockQuantity,17);assert.equal(draft.catalog.products[0].imageUrl,base.products[0].imageUrl);
 assert.deepEqual(await f.save(request),saved);assert.equal((await f.draft()).version,2);assert.equal((await f.db.query('select count(*) n from public.price_batches')).rows[0].n,1);
 await assert.rejects(()=>f.save({...request,rows:[change()]}),/já utilizado/);
 await assert.rejects(()=>f.save({...request,actor:other}),/já utilizado/);
 const p=await f.rpc('catalog_request_publication',[admin,2]);assert.equal(await f.rpc('catalog_request_publication',[admin,2]),p);assert.equal((await f.jobs()).length,1);
 }finally{await f.close();}
});
test('all malformed, unknown, duplicate and ambiguous codes reject every row and never queue',async()=>{
 const f=await fixture();try{
 for(const row of [change(2,'missing'),change(2,'001'),change(1,'001',999),change(1,'001',600,0),change(1,'001',600,-1),change(1,'001',600,1.5),change(1,'001',600,'500'),change(1,'001',600,100000001)]){
  await assert.rejects(()=>f.save({rows:[change(2,'1',800,700),row],auto:true}));assert.equal((await f.draft()).version,1);assert.equal((await f.jobs()).length,0);
 }
 await assert.rejects(()=>f.save({rows:[change(),change()],auto:true}),/repetido/);
 await f.db.query("update public.catalog_draft set catalog=jsonb_set(catalog,'{products,1,shortCode}','\"001\"')");await assert.rejects(()=>f.save(),/duplicado/);
 assert.equal((await f.jobs()).length,0);assert.equal((await f.draft()).version,1);
 }finally{await f.close();}
});
test('size codes update independent diaper variant prices without changing the general product price',async()=>{
 const f=await fixture();try{
  const catalog={...base,products:[{...base.products[0],shortCode:'',variants:[{id:33,size:'P',packageQuantity:20,stockQuantity:1,shortCode:'0007P',priceCents:550},{id:34,size:'M',packageQuantity:18,stockQuantity:1,shortCode:'0007M'}]},base.products[1]]};
  await f.db.query('update public.catalog_draft set catalog=$1',[JSON.stringify(catalog)]);
  const rows=[{productId:1,variantId:33,code:'0007P',previousCents:550,priceCents:525},{productId:1,variantId:34,code:'0007M',previousCents:600,priceCents:575}];
  const saved=await f.save({rows});assert.equal(saved.changes.length,2);
  const draft=await f.draft();assert.equal(draft.catalog.products[0].priceCents,600);assert.deepEqual(draft.catalog.products[0].variants.map(v=>v.priceCents),[525,575]);
  assert.deepEqual(saved.changes.map(c=>c.variantSize),['P','M']);
 }finally{await f.close();}
});
test('optimistic concurrency: one reviewed version wins and the other administrator cannot overwrite it',async()=>{
 const f=await fixture();try{const results=await Promise.allSettled([f.save({auto:true}),f.save({actor:other,auto:true,rows:[change(2,'1',800,700)]})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/catálogo mudou/);assert.equal((await f.draft()).version,2);assert.equal((await f.jobs()).length,1);}finally{await f.close();}
});
test('publication roles and service-only RPC/table grants do not widen access',async()=>{
 const f=await fixture();try{
 await assert.rejects(()=>f.save({actor:outsider}),/não autorizado/);await assert.rejects(()=>f.save({actor:editor,auto:true}),/administradores/);
 await assert.rejects(()=>f.rpc('catalog_request_publication',[editor,1]),/administradores/);await f.save({actor:editor});
 for(const role of ['anon','authenticated']){await f.db.exec(`set role ${role}`);await assert.rejects(()=>f.db.query('select * from public.price_batches'),/permission denied/);await assert.rejects(()=>f.db.query('select public.catalog_dispatch_claim(false)'),/permission denied/);await assert.rejects(()=>f.db.query('select public.neurai_save_batch($1,$2,1,$3,true,null)',[admin,crypto.randomUUID(),JSON.stringify([change()])]),/permission denied/);await f.db.exec('reset role');}
 await f.db.query('update public.team_members set active=false where user_id=$1',[admin]);await assert.rejects(()=>f.save({version:2}),/não autorizado/);
 }finally{await f.close();}
});
test('one snapshot per batch, serialized queue, duplicate worker claim and wrong-run callback are harmless',async()=>{
 const f=await fixture();try{const a=await f.save({auto:true});const claimed=await f.rpc('catalog_dispatch_claim',[false]);assert.equal(claimed.id,a.publication_id);assert.equal(await f.rpc('catalog_dispatch_claim',[false]),null);
 const b=await f.save({version:2,auto:true,rows:[change(2,'1',800,700)]});assert.equal((await f.jobs()).length,2);assert.equal(await f.rpc('catalog_dispatch_claim',[false]),null);
 assert.ok(await f.rpc('catalog_publication_start',[a.publication_id,'123']));assert.equal(await f.rpc('catalog_publication_start',[a.publication_id,'124']),null);
 await f.rpc('catalog_publication_finish',[a.publication_id,'124','failed']);assert.equal((await f.jobs())[0].status,'building');
 await f.rpc('catalog_publication_finish',[a.publication_id,'123','published']);assert.equal((await f.rpc('catalog_dispatch_claim',[false])).id,b.publication_id);
 const second=await f.rpc('catalog_publication_start',[b.publication_id,'125']);assert.deepEqual(second.products.map(p=>p.priceCents),[500,700]);
 }finally{await f.close();}
});
test('uncertain dispatch retry is leased and reuses the ID; failed Actions retry never reapplies prices',async()=>{
 const f=await fixture();try{const a=await f.save({auto:true});await f.rpc('catalog_dispatch_claim',[false]);assert.equal(await f.rpc('catalog_dispatch_claim',[true]),null);
 await f.db.exec("update public.publications set dispatched_at=now()-interval '61 seconds',dispatch_state='uncertain'");assert.equal((await f.rpc('catalog_dispatch_claim',[true])).id,a.publication_id);
 await f.rpc('catalog_publication_start',[a.publication_id,'555']);await f.rpc('catalog_publication_finish',[a.publication_id,'555','failed']);
 await f.rpc('catalog_retry_publication',[admin,a.publication_id]);assert.equal((await f.jobs()).length,1);assert.equal((await f.draft()).version,2);assert.equal((await f.jobs())[0].status,'queued');
 await f.rpc('catalog_dispatch_claim',[false]);await f.rpc('catalog_publication_start',[a.publication_id,'556']);await f.rpc('catalog_publication_finish',[a.publication_id,'556','failed']);
 await f.save({version:2,rows:[change(2,'1',800,750)]});await assert.rejects(()=>f.rpc('catalog_retry_publication',[admin,a.publication_id]),/mais recente/);
 }finally{await f.close();}
});
test('restoration requires exact current prices and creates a fresh immutable audit entry',async()=>{
 const f=await fixture();try{const original=await f.save();const result=await f.save({version:2,restore:original.id,rows:[change(1,'001',500,600)]});assert.equal(result.restores_id,original.id);assert.equal((await f.draft()).catalog.products[0].priceCents,600);
 await assert.rejects(()=>f.save({version:3,restore:original.id,rows:[change(1,'001',600,600)]}),/Restauração bloqueada/);assert.equal((await f.draft()).version,3);
 await f.save({version:3,rows:[change(1,'001',600,500)]});await assert.rejects(()=>f.save({version:4,restore:original.id,rows:[change(1,'001',500,600)]}),/unique/);assert.equal((await f.draft()).version,4);
 }finally{await f.close();}
});
