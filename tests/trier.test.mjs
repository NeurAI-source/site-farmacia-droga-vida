import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {TrierClient,mapProduct,moneyToCents,InventoryService,publicStock,config} from '../supabase/functions/trier-api/integration.js';
import {createHandler} from '../supabase/functions/trier-api/handler.js';
import {internalRequest,serverKey} from '../supabase/functions/trier-api/server-auth.js';
const mock={reducedCode:'00123',ean:'7891234567890',name:'Produto de teste',price:'12.90',stockQuantity:17,status:'MOCK_ACTIVE'};
const policy={priceUnit:'decimal',isSellable:status=>status==='MOCK_ACTIVE'};
const settings={enabled:true,syncEnabled:true,token:'TEST_SECRET_ONLY',baseUrl:'https://example.invalid',storeId:'test',timeoutMs:100,retries:2,intervalMinutes:15};
const contract={request:()=>({url:'/mock-only',headers:{'x-mock-secret':settings.token}}),decode:x=>x};
test('server authentication accepts only platform-injected secret keys or exact legacy key',()=>{
 const env=key=>({SUPABASE_SERVICE_ROLE_KEY:'legacy-test',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_mock_only"}'}[key] || '');
 assert.equal(serverKey(env),'sb_secret_mock_only');
 assert.equal(internalRequest(new Headers({apikey:'sb_secret_mock_only'}),env),true);
 assert.equal(internalRequest(new Headers({authorization:'Bearer legacy-test'}),env),true);
 for(const headers of [{apikey:'sb_publishable_mock'},{apikey:'sb_secret_unknown'},{authorization:'Bearer fake-service-role-jwt'},{}]) assert.equal(internalRequest(new Headers(headers),env),false);
 assert.equal(internalRequest(new Headers({apikey:'sb_secret_mock_only'}),()=>'{malformed'),false);
 assert.equal(internalRequest(new Headers(),()=>''),false);
});
test('internal endpoint reads safe cached DTO, rejects private products and protects administrative operations',async()=>{
 const env=key=>({SUPABASE_SERVICE_ROLE_KEY:'server-secret',SITE_ORIGIN:'https://shop.invalid',TRIER_INTEGRATION_ENABLED:'false'}[key] || '');
 let cacheReads=0;
 const db={auth:{getUser:async()=>({data:{user:null},error:true})},from:table=>{
   const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:{catalog:{products:[{id:1,active:true,variants:[]}]}}}),
     then:resolve=>{cacheReads++;resolve({data:[{product_id:1,variant_id:0,stock_quantity:17,availability:true,external_price_cents:1290,last_trier_sync_at:'2026-10-13T00:00:00Z',token:'server-secret'}]});}};
   assert.ok(['publications','trier_inventory'].includes(table));return query;
 }};
 const handler=createHandler(db,env);
 const get=await handler(new Request('https://api.invalid/?productId=1'));assert.equal(get.status,200);const body=await get.json();assert.equal(body.inventory[0].stockQuantity,17);assert.ok(!JSON.stringify(body).includes('server-secret'));
 assert.equal((await handler(new Request('https://api.invalid/?productId=2'))).status,404);assert.equal(cacheReads,1);
 assert.equal((await handler(new Request('https://api.invalid/?productId=invalid'))).status,400);
 const post=(headers={})=>new Request('https://api.invalid/',{method:'POST',headers,body:JSON.stringify({action:'sync'})});
 assert.equal((await handler(post())).status,403);assert.equal((await handler(post({origin:'https://shop.invalid'}))).status,401);
 const disabled=await handler(post({authorization:'Bearer server-secret'}));assert.deepEqual(await disabled.json(),{status:'disabled'});
 const malformed=new Request('https://api.invalid/',{method:'POST',headers:{authorization:'Bearer server-secret'},body:'null'});
 assert.equal((await handler(malformed)).status,400);
});
test('canonical mock mapping preserves codes, EAN, cents and numeric inventory',()=>{
 const p=mapProduct(mock,policy,'test'); assert.equal(p.reducedCode,'00123');assert.equal(p.ean,mock.ean);assert.equal(p.priceCents,1290);assert.equal(p.stockQuantity,17);assert.equal(p.available,true);
 assert.equal(mapProduct({...mock,stockQuantity:0},policy,'test').available,false);
 assert.equal(mapProduct({...mock,stockQuantity:-1},policy,'test').available,false);
 assert.equal(mapProduct({...mock,status:'MOCK_BLOCKED'},policy,'test').available,false);
 assert.equal(mapProduct({...mock,ean:undefined},policy,'test').ean,undefined);
 for (const bad of [{stockQuantity:NaN},{stockQuantity:'17'},{ean:123},{price:'12,90'},{storeId:'other'},{reducedCode:null,ean:null}]) assert.throws(()=>mapProduct({...mock,...bad},policy,'test'));
 assert.equal(moneyToCents('10.90','decimal'),1090);assert.equal(moneyToCents(1090,'cents'),1090);
 assert.throws(()=>moneyToCents(10.90,'cents'));assert.throws(()=>moneyToCents(1.001,'decimal'));
});
test('disabled integration and missing official contract never call network',async()=>{
 let calls=0; const fetcher=async()=>{calls++;};
 await assert.rejects(()=>new TrierClient({...settings,enabled:false},contract,fetcher).products(),/integration_disabled/);
 await assert.rejects(()=>new TrierClient(settings,null,fetcher).products(),/official_contract_pending/);assert.equal(calls,0);
 assert.equal(config(()=> '').enabled,false);
});
for(const status of [400,401,403,404,429,500,502,503]) test(`HTTP ${status} has bounded appropriate retries`,async()=>{
 let calls=0;const client=new TrierClient(settings,contract,async()=>{calls++;return new Response('',{status});},async()=>{});
 await assert.rejects(()=>client.products(),new RegExp(`http_${status}`));assert.equal(calls,[429,500,502,503].includes(status)?3:1);
});
test('invalid JSON, schema, timeout and unavailable API are sanitized',async()=>{
 await assert.rejects(()=>new TrierClient(settings,contract,async()=>new Response('{'),async()=>{}).products(),/invalid_json/);
 await assert.rejects(()=>new TrierClient(settings,contract,async()=>Response.json({}),async()=>{}).products(),/unexpected_schema/);
 let bodyCalls=0;await assert.rejects(()=>new TrierClient(settings,contract,async()=>{bodyCalls++;return new Response(new ReadableStream({pull(){throw Object.assign(Error('body timed out'),{name:'TimeoutError'});}}));},async()=>{}).products(),/timeout/);assert.equal(bodyCalls,3);
 for(const [name,code] of [['TimeoutError','timeout'],['TypeError','api_unavailable']]) {
 let count=0;await assert.rejects(()=>new TrierClient(settings,contract,async()=>{count++;throw Object.assign(Error(settings.token),{name});},async()=>{}).products(),new RegExp(code));assert.equal(count,3);
 }
});
test('failure preserves last valid cache; invalid item does not abort batch; public DTO excludes secrets',async()=>{
 let cached=17;const repo={claim:async()=>true,apply:async p=>{cached=p.stockQuantity;return true;},finish:async()=>{}};
 const service=new InventoryService({settings,policy,repository:repo,client:{products:async()=>{throw Error(settings.token);}}});
 const failed=await service.refresh();assert.equal(cached,17);assert.equal(failed.lastError,'sync_failed');assert.ok(!JSON.stringify(failed).includes(settings.token));
 service.client={products:async()=>[{...mock,stockQuantity:'invalid'},mock]};const batch=await service.refresh();assert.equal(batch.updated,1);assert.equal(batch.errors,1);
 const dto=publicStock({product_id:1,stock_quantity:17,availability:true,token:settings.token,rawData:mock});assert.ok(!JSON.stringify(dto).includes(settings.token));assert.equal(dto.rawData,undefined);
});
test('migration persists stock and audit atomically, preserves price, isolates store and locks public roles',async()=>{
 const db=new PGlite();try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.catalog_draft(id integer,catalog jsonb);insert into public.catalog_draft values(1,'{"products":[{"id":1}]}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261013120000_trier_inventory.sql',import.meta.url),'utf8'));
 await db.exec("insert into public.trier_inventory(product_id,trier_reduced_code,store_id,external_price_cents) values(1,'00123','test',1000)");
 const call=async(name,args)=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const lease=await call('trier_claim_sync',[15,'test']);assert.match(lease,/^[0-9a-f-]{36}$/);assert.equal(await call('trier_claim_sync',[15,'test']),null);
 assert.equal(await call('trier_apply_inventory',[JSON.stringify(mapProduct({...mock,price:undefined},policy,'test')),lease]),true);
 const row=(await db.query('select * from public.trier_inventory')).rows[0];assert.equal(Number(row.stock_quantity),17);assert.equal(Number(row.external_price_cents),1000);
 assert.equal((await db.query('select count(*) n from public.trier_inventory_audit')).rows[0].n,1);
 await assert.rejects(()=>call('trier_apply_inventory',[JSON.stringify(mapProduct(mock,policy,'other')),lease]),/Store mismatch/);
 await db.exec("insert into public.trier_inventory(product_id,trier_product_id,ean,store_id) values(2,'other-id','7891234567890','test')");
 await assert.rejects(()=>call('trier_apply_inventory',[JSON.stringify(mapProduct(mock,policy,'test')),lease]),/Identifier conflict/);
 assert.equal((await db.query('select count(*) n from public.trier_inventory_audit')).rows[0].n,1);
 await assert.rejects(()=>call('trier_apply_inventory',[JSON.stringify({...mapProduct(mock,policy,'test'),stockQuantity:null}),lease]),/Invalid inventory/);
 await db.exec("update public.trier_sync_state set lease_until=now()-interval '1 minute', started_at=now()-interval '31 minutes'");
 const nextLease=await call('trier_claim_sync',[15,'test']);assert.notEqual(nextLease,lease);
 await assert.rejects(()=>call('trier_apply_inventory',[JSON.stringify(mapProduct(mock,policy,'test')),lease]),/superseded/);
 await assert.rejects(()=>call('trier_finish_sync',[JSON.stringify({status:'failed'}),lease]),/superseded/);
 assert.equal(await call('trier_finish_sync',[JSON.stringify({status:'completed'}),nextLease]),true);
 for(const role of ['anon','authenticated']) {await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from public.trier_inventory'),/permission denied/);await assert.rejects(()=>call('trier_claim_sync',[15,'test']),/permission denied/);await assert.rejects(()=>call('trier_finish_sync',[JSON.stringify({}),nextLease]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
