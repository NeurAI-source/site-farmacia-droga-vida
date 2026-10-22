import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialContract,officialPolicy} from '../supabase/functions/trier-api/official-contract.js';
import {TrierClient,mapProduct,publicStock} from '../supabase/functions/trier-api/integration.js';
import {applyInventory} from '../trier-inventory.js';
import {stockState,cartStockIssue} from '../product-stock.js';
const settings={enabled:true,token:'TEST_ONLY',baseUrl:'https://example.invalid/sgfpod1',storeId:'2',timeoutMs:1000,retries:0,maxProducts:20};
const product=(codigo,extra={})=>({codigo,nome:'FR TESTE',ativo:true,integracaoEcommerce:false,valorVenda:34.99,quantidadeEstoque:23,...extra});
async function load(products){
 return new TrierClient(settings,createOfficialContract(products.map(p=>String(p.codigo))),async(url,options)=>{
  assert.equal(options.method,'GET');
  return Response.json(url.pathname.includes('/desconto/')?[]:products);
 }).products();
}
test('WhatsApp preorder accepts active stock independent of ecommerce opt-in; inactive and empty stay blocked',async()=>{
 const cases=[
  [product(1),true], [product(2,{integracaoEcommerce:true}),true],
  [product(3,{ativo:false}),false], [product(4,{ativo:false,integracaoEcommerce:true}),false],
  [product(5,{quantidadeEstoque:0}),false], [product(6,{quantidadeEstoque:-2}),false],
  [product(7,{quantidadeEstoqueEcommerce:0}),false]
 ];
 const rows=await load(cases.map(([p])=>p));
 rows.forEach((row,i)=>assert.equal(mapProduct(row,officialPolicy,'2').available,cases[i][1],`code ${row.reducedCode}`));
 assert.equal(mapProduct(rows[0],officialPolicy,'2').stockQuantity,23);
 assert.equal(mapProduct(rows[0],officialPolicy,'2').priceCents,3499);
 for(const ativo of [null,undefined,'true',1])await assert.rejects(()=>load([product(1,{ativo})]),/unexpected_schema/);
});
test('per-size provider status flows through cache DTO to the cart, without releasing inactive sizes',async()=>{
 const now=Date.now(),catalog={products:[{id:9,active:true,name:'FR TESTE',variants:[{id:1,size:'M'},{id:2,size:'G'},{id:3,size:'XG'}]}]};
 const rows=await load([product(101),product(102,{ativo:false}),product(103,{quantidadeEstoque:0})]);
 const dto=rows.map((r,i)=>{
  const p=mapProduct(r,officialPolicy,'2',new Date(now).toISOString());
  return publicStock({product_id:9,variant_id:i+1,stock_quantity:p.stockQuantity,availability:p.available,external_price_cents:p.priceCents,last_trier_sync_at:p.fetchedAt});
 });
 const products=applyInventory(catalog,dto,now).products;
 assert.equal(stockState(products[0],'M',now).limit,23);
 assert.equal(cartStockIssue([{id:9,variant:'M',qty:1}],products,now),'');
 assert.match(cartStockIssue([{id:9,variant:'M',qty:24}],products,now),/23 pacotes disponíveis/);
 for(const size of ['G','XG'])assert.notEqual(cartStockIssue([{id:9,variant:size,qty:1}],products,now),'');
 assert.deepEqual(catalog.products[0].variants,[{id:1,size:'M'},{id:2,size:'G'},{id:3,size:'XG'}]);
});
