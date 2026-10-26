import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createOfficialContract,officialPolicy} from '../supabase/functions/trier-api/official-contract.js';
import {TrierClient,mapProduct,publicStock} from '../supabase/functions/trier-api/integration.js';
import {applyInventory} from '../trier-inventory.js';
import {priceInfo,priceHtml,orderMessage} from '../catalog-utils.js';
const settings={enabled:true,token:'TEST_ONLY',baseUrl:'https://example.invalid/sgfpod1',storeId:'2',timeoutMs:1000,retries:0,maxProducts:10,syncDeadlineMs:120000};
const source=(code,price=63.25)=>({codigo:code,nome:'Produto teste',ativo:true,integracaoEcommerce:true,valorVenda:price,quantidadeEstoque:3});
const offer=(code,extra={})=>({codigoProduto:code,valorVenda:63.25,valorPromocao:56.99,codigoCondicaoPagamento:null,nomeCondicaoPagamento:null,...extra});
async function load(products,discounts,{fail=false}={}){
 const calls=[];
 const rows=await new TrierClient(settings,createOfficialContract(products.map(p=>String(p.codigo))),async(url,options)=>{
  calls.push(url);assert.equal(options.headers.get('Authorization'),'Bearer TEST_ONLY');
  if(url.pathname.includes('/desconto/')){if(fail)return new Response('',{status:503});return Response.json(discounts);}
  return Response.json(products);
 }).products();return {rows,calls};
}
test('bulk best discount uses exact provider cents and never applies percentage twice',async()=>{
 const {rows,calls}=await load([source(1)],[offer(1)]);assert.equal(calls.length,2);assert.match(calls[1].pathname,/melhor\/obter-todos-v1$/);
 const mapped=mapProduct(rows[0],officialPolicy,'2');assert.equal(mapped.priceCents,5699);assert.equal(mapped.regularPriceCents,6325);assert.equal(rows.discountStatus,'checked');
});
test('valid promotions apply independently of zero or negative stock, including future codes',async()=>{
 for(const [code,stock] of [[24618,0],[987654,-2],[987655,3]]){
  const {rows,calls}=await load([{...source(code),quantidadeEstoque:stock}],[offer(code)]);
  assert.equal(calls[1].searchParams.get('removerRestricaoEstoque'),'true');
  const mapped=mapProduct(rows[0],officialPolicy,'2');
  assert.equal(mapped.priceCents,5699);assert.equal(mapped.regularPriceCents,6325);
  assert.equal(mapped.stockQuantity,stock);assert.equal(mapped.available,stock>0);
 }
});
test('every discount page removes stock restriction and preserves exact product matching',async()=>{
 let pages=0;
 const rows=await new TrierClient(settings,createOfficialContract(['987654']),async(url)=>{
  if(!url.pathname.includes('/desconto/'))return Response.json([source(987654)]);
  assert.equal(url.searchParams.get('removerRestricaoEstoque'),'true');pages++;
  return Response.json(url.searchParams.get('primeiroRegistro')==='0'
   ?Array.from({length:500},(_,i)=>offer(i+1)):[offer(987654)]);
 }).products();
 assert.equal(pages,2);assert.equal(rows.discountStatus,'checked');assert.equal(rows[0].price,56.99);
});
test('conditional, ambiguous, invalid, mismatched and ecommerce-specific prices stay regular',async()=>{
 for(const discounts of [[offer(1,{codigoCondicaoPagamento:3,nomeCondicaoPagamento:'DINHEIRO'})],[offer(1),offer(1)],[offer(1,{valorPromocao:-1})],[offer(1,{valorPromocao:70})],[offer(1,{valorVenda:70})],[{codigoProduto:1,valorVenda:63.25,valorPromocao:56.99}]]){
  const {rows}=await load([source(1)],discounts);assert.equal(rows[0].price,63.25);assert.equal(rows[0].regularPrice,null);
 }
 const {rows}=await load([{...source(1),valorVendaEcommerce:55}],[offer(1)]);assert.equal(rows[0].price,55);assert.equal(rows[0].regularPrice,null);
});
test('failed or incomplete discount scans safely clear promotions without blocking stock',async()=>{
 const {rows}=await load([source(1)],[],{fail:true});assert.equal(rows.discountStatus,'unavailable');assert.equal(rows[0].price,63.25);assert.equal(rows[0].regularPrice,null);
 const tooMany=Array.from({length:500},(_,i)=>offer(i+1));const partial=await load([source(1)],tooMany);assert.equal(partial.rows.discountStatus,'unavailable');assert.equal(partial.rows[0].price,63.25);
});
test('public pair is per presentation, controls cart totals and expires to published fallback',()=>{
 const catalog={products:[{id:1,active:true,name:'Fralda',detail:'',priceCents:1000,variants:[{size:'M',priceCents:6325},{size:'G',priceCents:7000}]}]};
 const row=publicStock({product_id:1,variant_id:9,external_price_cents:5699,external_regular_price_cents:6325,stock_quantity:3,availability:true,last_trier_sync_at:new Date().toISOString()});catalog.products[0].variants[0].id=9;
 let updated=applyInventory(catalog,[row]);const p=updated.products[0];assert.equal(priceInfo(p,'M').oldPriceCents,6325);assert.equal(priceInfo(p,'G').oldPriceCents,null);assert.match(priceHtml(p,'M'),/<del/);assert.equal(p.variants[1].priceCents,7000);
 assert.match(orderMessage([{id:1,variant:'M',qty:2}],[p],{name:'Teste',receipt:'retirada'}),/113,98/);
 updated=applyInventory(catalog,[{...row,regularPriceCents:null,priceCents:6325}]);assert.equal(priceInfo(updated.products[0],'M').oldPriceCents,null);
 assert.equal(applyInventory(catalog,[{...row,lastUpdatedAt:'2020-01-01'}]).products[0].variants[0].priceCents,6325);assert.equal(catalog.products[0].variants[0].oldPriceCents,undefined);
});
test('additive migration atomically audits both prices, rejects invalid pairs and preserves RLS/catalog',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.catalog_draft(id integer,catalog jsonb);insert into public.catalog_draft values(1,'{"products":[{"id":1}]}');`);
  for(const name of ['20261013120000_trier_inventory.sql','20261021232807_trier_promotional_prices.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec("insert into public.trier_inventory(product_id,trier_reduced_code,store_id,external_price_cents) values(1,'1','2',6325)");
  const lease=(await db.query("select public.trier_claim_sync(15,'2') id")).rows[0].id;
  const apply=payload=>db.query('select public.trier_apply_inventory($1,$2)',[JSON.stringify(payload),lease]);
  const payload={reducedCode:'1',name:'Teste',priceCents:5699,regularPriceCents:6325,stockQuantity:3,available:true,storeId:'2',fetchedAt:new Date().toISOString()};
  await apply(payload);let row=(await db.query('select * from public.trier_inventory')).rows[0];assert.equal(Number(row.external_regular_price_cents),6325);assert.equal(Number(row.external_price_cents),5699);
  await assert.rejects(()=>apply({...payload,priceCents:7000,fetchedAt:new Date(Date.now()+1000).toISOString()}));
  await apply({...payload,priceCents:6325,regularPriceCents:null,fetchedAt:new Date(Date.now()+2000).toISOString()});
  row=(await db.query('select * from public.trier_inventory')).rows[0];assert.equal(row.external_regular_price_cents,null);
  const audit=(await db.query('select * from public.trier_inventory_audit order by id')).rows;assert.equal(audit.length,2);assert.equal(audit[0].new_value.external_regular_price_cents,6325);
  assert.deepEqual((await db.query('select catalog from public.catalog_draft')).rows[0].catalog,{products:[{id:1}]});
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from public.trier_inventory'),/permission denied/);await assert.rejects(()=>apply(payload),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});

test('an already-discounted current price keeps the exact universal official De/Por pair without applying another discount',async()=>{
 for(const product of [source(1,56.99),{...source(1),valorVendaEcommerce:56.99}]){
  const {rows}=await load([product],[offer(1)]);assert.equal(rows[0].price,56.99);assert.equal(rows[0].regularPrice,63.25);
  const mapped=mapProduct(rows[0],officialPolicy,'2');assert.equal(mapped.priceCents,5699);assert.equal(mapped.regularPriceCents,6325);
 }
 const conditional=await load([source(1,56.99)],[offer(1,{codigoCondicaoPagamento:3,nomeCondicaoPagamento:'DINHEIRO'})]);assert.equal(conditional.rows[0].regularPrice,null);
 const failed=await load([source(1,56.99)],[],{fail:true});assert.equal(failed.rows[0].regularPrice,null);assert.equal(failed.rows[0].price,56.99);
});

test('targeted discounts keep code boundaries, paginate, and reject partial, conditional or ambiguous responses',async()=>{
 for(const [discounts,expected] of [
  [[offer(1)],6325],
  [[offer(1,{codigoCondicaoPagamento:3,nomeCondicaoPagamento:'DINHEIRO'})],null],
  [[offer(1),offer(1)],null],
  [[offer(2)],null],
  [[offer(1,{valorVenda:50})],null],
  [[],null]
 ]){
  const rows=await new TrierClient(settings,createOfficialContract(['1'],undefined,{targetedDiscounts:true}),async url=>Response.json(url.pathname.includes('/desconto/')?discounts:[source(1)])).products();
  assert.equal(rows[0].regularPrice,expected===null?null:63.25);
  if(discounts.some(d=>d.codigoProduto===2))assert.equal(rows.discountStatus,'unavailable');
 }
 const calls=[];let pages=0;
 const rows=await new TrierClient(settings,createOfficialContract(['1','2'],undefined,{targetedDiscounts:true}),async url=>{
  if(!url.pathname.includes('/desconto/'))return Response.json([source(1),source(2)]);
  calls.push([url.searchParams.get('codigoProduto'),url.searchParams.get('primeiroRegistro')]);pages++;
  if(pages===1)return Response.json(Array.from({length:500},()=>offer(1)));
  return Response.json(url.searchParams.get('codigoProduto')==='1'?[]:[offer(2)]);
 }).products();
 assert.deepEqual(calls,[['1','0'],['1','500'],['2','0']]);assert.equal(rows[0].regularPrice,null);assert.equal(rows[1].regularPrice,63.25);
 const failed=await new TrierClient(settings,createOfficialContract(['1','2'],undefined,{targetedDiscounts:true}),async url=>{
  if(!url.pathname.includes('/desconto/'))return Response.json([source(1),source(2)]);
  return url.searchParams.get('codigoProduto')==='1'?Response.json([offer(1)]):new Response('',{status:503});
 }).products();assert.equal(failed.discountStatus,'unavailable');assert.ok(failed.every(p=>p.regularPrice===null));
});
