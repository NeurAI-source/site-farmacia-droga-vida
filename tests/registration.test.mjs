import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {suggestRegistration,findDuplicates,buildRegistration,reviewRegistration,PENDING_IMAGE,sortRegistrationProducts} from '../registration-utils.js';
import {registrationDTO,lookupRegistration,discoveryAction} from '../supabase/functions/trier-api/discovery.js';
import {registrationAction} from '../supabase/functions/admin-api/registration.js';
import {completeTaxonomy} from '../admin/category-intelligence.js';
import {validateCatalog} from '../catalog-validation.js';
const actor='11111111-1111-4111-8111-111111111111';
const base=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
const row=(code='123')=>({shortCode:code,externalId:'sku-'+code,ean:'7891234567890',name:'SHAMPOO DOVE BOND INTENSE REPAIR 250ML',description:'Descrição retornada pela Trier.',priceCents:1999,regularPriceCents:2499,stockQuantity:4,active:true,storeId:'2',fetchedAt:new Date().toISOString()});
const small=()=>({...structuredClone(base),products:[]});
test('registration suggestions preserve facts, identify brand and quantity without assuming laboratory equals brand',()=>{
 const s=suggestRegistration(row(),completeTaxonomy(base).categories);assert.equal(s.name,'Shampoo Dove Bond Intense Repair 250 mL');assert.equal(s.brand,'Dove');assert.equal(s.category,'Cabelos');assert.equal(s.detail,'250 mL');assert.equal(s.description,row().description);
 assert.equal(suggestRegistration({...row(),name:'PRODUTO NOVO',laboratory:'Dove'},base.categories).brand,'');
});
test('duplicates use canonical code, EAN, Trier ID and each variant, but never merge similar names',()=>{
 const products=[{id:1,name:'Fralda teste',brand:'',shortCode:'',variants:[{id:8,shortCode:'00123',ean:'7891234567890',trier:{id:'official'}}]}];
 assert.equal(findDuplicates({shortCode:'123'},products)[0].variantId,8);
 assert.equal(findDuplicates({ean:'7891234567890'},products)[0].exact,true);
 assert.equal(findDuplicates({trier:{id:'official'}},products)[0].exact,true);
 assert.equal(findDuplicates({name:'FRALDA TESTE',brand:''},products)[0].exact,false);
 assert.equal(findDuplicates({shortCode:'123'},products,1).length,0);
});
test('import creates inactive pending-photo drafts, preserves source and never copies store 2 into store 1',()=>{
 const input=small(),result=buildRegistration(input,[row()],[{code:'123',mode:'new'}]);const p=result.catalog.products[0];validateCatalog(result.catalog);
 assert.equal(input.products.length,0);assert.equal(p.active,false);assert.equal(p.availableStore1,false);assert.equal(p.availableStore2,true);assert.equal(p.imageUrl,PENDING_IMAGE);assert.equal(p.imagePending,true);assert.equal(p.trier.storeId,'2');assert.equal(p.oldPriceCents,2499);assert.equal(p.content.description,row().description);
 assert.throws(()=>validateCatalog({...result.catalog,products:[{...p,active:true}]}),/foto real/);
 assert.throws(()=>buildRegistration(input,[{...row(),priceCents:null}],[{code:'123',mode:'new'}]),/Preço indisponível/);
});
test('reviewed updates retain IDs and custom commercial/editorial fields unless explicitly approved',()=>{
 const input=buildRegistration(small(),[row()],[{code:'123',mode:'new'}]).catalog;const p=input.products[0];p.priceCents=1700;p.name='Nome manual';p.imageUrl='assets/products/3.png';p.imagePending=false;
 let result=buildRegistration(input,[{...row(),priceCents:1800}],[{code:'123',mode:'update',productId:p.id}]);assert.equal(result.catalog.products[0].priceCents,1700);assert.equal(result.catalog.products[0].name,p.name);assert.equal(result.catalog.products[0].imageUrl,p.imageUrl);
 result=buildRegistration(input,[{...row(),priceCents:1800}],[{code:'123',mode:'update',productId:p.id,updateCommercial:true}]);assert.equal(result.catalog.products[0].priceCents,1800);assert.equal(result.catalog.products[0].id,p.id);
 assert.throws(()=>buildRegistration(input,[row()],[{code:'123',mode:'new',confirmSeparate:true}]),/já cadastrado/);
});
test('variant linkage requires explicit target, unique size, package quantity and correct code',()=>{
 const input=small();input.products=[{...base.products[0],id:1,shortCode:'',variants:[]}];
 const choice={code:'123',mode:'variant',productId:1,size:'G',packageQuantity:60};const result=buildRegistration(input,[row()],[choice]);
 assert.equal(result.catalog.products[0].variants[0].shortCode,'123');assert.equal(result.catalog.products[0].variants[0].packageQuantity,60);assert.equal(input.products[0].variants.length,0);
 assert.throws(()=>buildRegistration(input,[row()],[{...choice,packageQuantity:''}]),/quantidade/);
 assert.throws(()=>buildRegistration(result.catalog,[{...row('456'),ean:''}],[{...choice,code:'456'}]),/tamanho/);
});
test('review identifies incomplete registrations and ignoring one fingerprint does not hide later changes',()=>{
 const catalog=buildRegistration(small(),[row()],[{code:'123',mode:'new'}]).catalog;const p=catalog.products[0];let issues=reviewRegistration(catalog);assert.ok(issues[0].issues.some(i=>i.key==='image'));assert.ok(issues[0].issues.some(i=>i.key==='sync'));
 p.reviewIgnores=issues[0].issues.map(i=>({key:i.key,fingerprint:JSON.stringify([p.name,p.brand,p.category,p.subcategory,p.imageUrl,p.shortCode,p.ean,p.variants])}));assert.equal(reviewRegistration(catalog).length,0);p.name+=' alterado';assert.equal(reviewRegistration(catalog).length,1);
});
test('all product sort modes preserve independent cards and ignore insertion order',()=>{
 const products=[{id:1,name:'Z',brand:'Dove',category:'C',priceCents:500,createdAt:'2025',updatedAt:'2025'},{id:2,name:'A',brand:'Dove',category:'A',priceCents:100,createdAt:'2026',updatedAt:'2026'}];
 for(const mode of ['brand','name','category','price','createdAt','updatedAt'])assert.equal(sortRegistrationProducts(products,mode)[0].id,2);assert.equal(products[0].id,1);
});
const settings={enabled:true,baseUrl:'https://example.invalid/sgfpod1',token:'fixture-server-only',storeId:'2',timeoutMs:1000,retries:0,maxResponseBytes:500000,maxProducts:10000};
const wire=(i,patch={})=>({codigo:i,nome:'SHAMPOO DOVE 250ML',valorVenda:19.99,quantidadeEstoque:4,ativo:true,codigoBarras:7891234567890,...patch});
test('official lookup uses documented code/EAN filters, server Bearer, GET only, and allowlisted fields',async()=>{
 for(const mode of ['code','ean']){let called;const value=mode==='code'?'123':'7891234567890';const data=await lookupRegistration(settings,{mode,query:value},async(url,options)=>{called={url,options};return Response.json([wire(123,{valorCusto:1})]);});assert.equal(called.options.method,'GET');assert.equal(called.url.searchParams.get(mode==='code'?'codigo':'codigoBarras'),value);assert.equal(called.options.headers.get('authorization'),'Bearer fixture-server-only');assert.equal(data.rows[0].priceCents,1999);assert.equal('valorCusto' in data.rows[0],false);}
 await assert.rejects(()=>lookupRegistration({...settings,storeId:'1'},{mode:'browse'}),/wrong_store/);
});
test('bounded backend name scanning, inactive filtering and paging never invent an unsupported API parameter',async()=>{
 let calls=0;const data=await lookupRegistration(settings,{mode:'name',query:'Dove'},async url=>{assert.equal(url.searchParams.has('nome'),false);calls++;return Response.json(calls===1?Array.from({length:50},(_,i)=>wire(i+1,{nome:'Outro'})):[wire(51)]);});assert.equal(calls,2);assert.equal(data.rows.length,1);assert.equal(data.nextOffset,51);assert.equal(data.hasMore,false);
 await assert.rejects(()=>lookupRegistration(settings,{mode:'code',query:'123'},async()=>Response.json([wire(999)])),/identity/);
 await assert.rejects(()=>lookupRegistration(settings,{mode:'browse'},async()=>new Response('',{status:503})));
 assert.throws(()=>registrationDTO({...wire(1),ativo:'true'},'2',new Date().toISOString()));
});
test('registration search reuses fresh backend cache and preserves stale cache on provider outage',async()=>{
 const cache={payload:{rows:[row()],nextOffset:1,hasMore:false},expires_at:new Date(Date.now()+60000).toISOString()};const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:cache})};}};
 const env=k=>({TRIER_INTEGRATION_ENABLED:'true',TRIER_BASE_URL:settings.baseUrl,TRIER_API_TOKEN:settings.token,TRIER_STORE_ID:'2'}[k]||'');
 const hit=await discoveryAction({body:{action:'registration-search'},db,env,user:{id:actor},fetcher:()=>{throw Error();}});assert.equal(hit.cached,true);
 cache.expires_at='2000-01-01';const stale=await discoveryAction({body:{action:'registration-search'},db,env,user:{id:actor},fetcher:()=>{throw Error();}});assert.equal(stale.stale,true);assert.equal(stale.rows[0].shortCode,'123');
});
test('commit recovery returns a completed actor-bound batch before expired preview checks',async()=>{
 const body={action:'registration-commit',batchId:crypto.randomUUID(),version:1,choices:[]},entry={actor_id:actor,request:body,version:2,report:[{status:'created'}]};const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:entry})};}};
 assert.equal((await registrationAction({body,db,user:{id:actor}})).version,2);
 await assert.rejects(()=>registrationAction({body,db,user:{id:'other'}}),/já utilizado/);
 await assert.rejects(()=>registrationAction({body:{...body,version:3},db,user:{id:actor}}),/já utilizado/);
});
test('additive database migration: atomic audit, concurrency, idempotency, RLS and publication guards',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.role() returns text language sql as $$select 'authenticated'::text$$;create function auth.jwt() returns jsonb language sql as $$select '{"aal":"aal1"}'::jsonb$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;grant usage on schema auth,storage to authenticated,service_role;insert into auth.users values('${actor}');`);
 for(const file of ['202609270000_team.sql','202609270001_admin.sql','20261014130000_security_hardening.sql','20261015090000_password_login.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into public.team_members values('${actor}','admin',true);set test.uid='${actor}';grant select,update on public.catalog_draft to service_role;grant select on public.team_members to service_role;`);
 await db.query('insert into public.catalog_draft(id,catalog) values(1,$1)',[JSON.stringify(base)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261025135839_intelligent_registration.sql',import.meta.url),'utf8'));
 const before=(await db.query('select catalog from public.catalog_draft')).rows[0].catalog;assert.deepEqual(before,base);
 const next=structuredClone(base);next.products[0].name+=' conferido';next.products[0].shortCode='12345';const id=crypto.randomUUID(),req={key:'request'};
 const commit=async(version,request=req)=>{await db.exec('set role service_role');try{return (await db.query('select public.registration_save($1,$2,$3,$4,$5,$6) result',[actor,id,version,JSON.stringify(next),JSON.stringify(request),'[]'])).rows[0].result;}finally{await db.exec('reset role');}};
 assert.equal((await commit(1)).version,2);assert.equal((await commit(1)).version,2);assert.equal((await db.query('select * from public.registration_history')).rows.length,1);
 await assert.rejects(()=>commit(1,{different:true}),/Lote/);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from public.registration_history')).rows.length,1);await assert.rejects(()=>db.query('select * from public.trier_registration_cache'),/permission/);await assert.rejects(()=>db.query('delete from public.registration_history'),/permission/);await assert.rejects(()=>db.query('select public.registration_save($1,$2,2,$3,$4,$5)',[actor,crypto.randomUUID(),JSON.stringify(next),'{}','[]']),/permission/);await db.exec('reset role');
 const collision=structuredClone(next),first=collision.products.find(p=>p.shortCode);collision.products.push({...first,id:999999,shortCode:'0'+first.shortCode});if(/^\d+$/.test(first.shortCode))await assert.rejects(()=>db.query('update public.catalog_draft set catalog=$1',[JSON.stringify(collision)]),/Código Trier repetido/);
 const pending=structuredClone(next);pending.products[0].imagePending=true;pending.products[0].active=true;await assert.rejects(()=>db.query('insert into public.publications(catalog,created_by) values($1,$2)',[JSON.stringify(pending),actor]),/fotos pendentes/);
 }finally{await db.close();}
});
