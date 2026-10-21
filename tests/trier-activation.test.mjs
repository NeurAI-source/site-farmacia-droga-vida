import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import{readFile}from'node:fs/promises';import{createOfficialContract,officialPolicy}from'../supabase/functions/trier-api/official-contract.js';import{TrierClient,mapProduct}from'../supabase/functions/trier-api/integration.js';import{applyInventory}from'../trier-inventory.js';
const settings={enabled:true,token:'TEST_ONLY',baseUrl:'https://example.invalid/sgfpod1',storeId:'2',timeoutMs:1000,retries:0,maxProducts:100};
test('official batches use repeated codes, correct base path, decimal prices and ecommerce availability',async()=>{
 const calls=[];const rows=await new TrierClient(settings,createOfficialContract(['123','456','46295']),async(url,options)=>{calls.push(url);assert.equal(options.headers.get('Authorization'),'Bearer TEST_ONLY');assert.deepEqual(url.searchParams.getAll('codigo'),['123','456']);return Response.json([{codigo:123,nome:'Produto',ativo:true,integracaoEcommerce:true,valorVenda:12.9,quantidadeEstoque:3},{codigo:456,nome:'Bloqueado',ativo:true,integracaoEcommerce:false,valorVendaEcommerce:10.5,quantidadeEstoqueEcommerce:1}]);}).products();
 assert.equal(calls[0].pathname,'/sgfpod1/rest/integracao/produto/obter-v1');assert.equal(mapProduct(rows[0],officialPolicy,'2').priceCents,1290);assert.equal(mapProduct(rows[1],officialPolicy,'2').available,false);
});
test('unexpected product codes cannot enter a requested batch',async()=>{await assert.rejects(()=>new TrierClient(settings,createOfficialContract(['123']),async()=>Response.json([{codigo:999}])).products(),/unexpected_schema/);});
test('frontend overlays fresh stock without editing source catalog; stale data falls back',()=>{const c={products:[{id:1,active:true,priceCents:100,oldPriceCents:150,variants:[]}]};const row={productId:1,variantId:null,priceCents:200,stockQuantity:3,available:true,lastUpdatedAt:new Date().toISOString()};const updated=applyInventory(c,[row]);assert.equal(updated.products[0].priceCents,200);assert.equal(updated.products[0].oldPriceCents,null);assert.equal(c.products[0].priceCents,100);assert.equal(applyInventory(c,[{...row,lastUpdatedAt:'2020-01-01'}]).products[0].priceCents,100);});
test('activation links variants by code, excludes delivery item and protects bindings',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.catalog_draft(id integer,catalog jsonb);insert into public.catalog_draft values(1,'{"products":[{"id":1,"shortCode":"123","variants":[]},{"id":2,"shortCode":"","variants":[{"id":9,"shortCode":"456"}]},{"id":3,"shortCode":"46295","variants":[]}]}');`);
 for(const file of ['20261013120000_trier_inventory.sql','20261021170000_trier_activation.sql','20261021180000_trier_scheduler_auth.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*) n from public.trier_inventory')).rows[0].n,2);
 await db.exec('set role anon');await assert.rejects(()=>db.query("select public.trier_refresh_bindings('2')"),/permission denied/);await assert.rejects(()=>db.query('select public.trier_scheduler_authorized()'),/permission denied/);await db.exec('reset role;set role service_role');assert.equal((await db.query('select public.trier_scheduler_authorized() as allowed')).rows[0].allowed,true);
 }finally{await db.close();}});
import {verifiedServerRequest} from '../supabase/functions/trier-api/server-auth.js';
test('scheduler accepts only provider-verified service-role RPC and never decoded JWT roles',async()=>{
 const env=k=>k==='SUPABASE_URL'?'https://test.supabase.co':'';
 const headers=new Headers({apikey:'sb_secret_rotated_test'});
 for(const [status,body,expected]of[[200,'true',true],[403,'true',false],[401,'true',false],[200,'false',false],[200,'{"role":"service_role"}',false]]){
  assert.equal(await verifiedServerRequest(headers,env,async(url,options)=>{assert.equal(url,'https://test.supabase.co/rest/v1/rpc/trier_scheduler_authorized');assert.equal(options.method,'POST');return new Response(body,{status});}),expected);
 }
 assert.equal(await verifiedServerRequest(new Headers({apikey:'sb_publishable_test'}),env,()=>{throw Error('must not call');}),false);
});
