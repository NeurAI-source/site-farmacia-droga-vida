import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRegistrationCommand,isPerfumery,collectAgentProducts} from '../registration-agent-utils.js';
import {completeTaxonomy} from '../admin/category-intelligence.js';
import {readFileSync} from 'node:fs';
const catalog={...completeTaxonomy(JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url)))),products:[]};
const row=n=>({shortCode:String(n),name:'SHAMPOO DOVE 250ML',active:true});
test('agent accepts bounded real commands and rejects unsupported quantities or vague requests',()=>{
 assert.deepEqual(parseRegistrationCommand('Neur.AI, prepare 50 produtos de perfumaria'),{action:'products',count:50});assert.equal(parseRegistrationCommand('Localizar fotos dos produtos pendentes',100).action,'photos');
 for(const text of ['Comprar 30 produtos','Preparar 200 produtos','Preparar 10 ou 50 produtos'])assert.throws(()=>parseRegistrationCommand(text));
});
test('perfumery classification is conservative and does not include medicines or supplements',()=>{
 assert.equal(isPerfumery(row(1),catalog.categories),true);for(const name of ['DIPIRONA 500MG','LAVITAN COLAGENO 300G','PRODUTO SEM DESCRICAO'])assert.equal(isPerfumery({name},catalog.categories),false);
});
test('agent paginates and skips existing identities, inactive rows and repeated results',async()=>{
 const c=structuredClone(catalog);c.products=[{id:1,...row(1),variants:[]}];let calls=0;
 const result=await collectAgentProducts({count:10,catalog:c,lookup:async p=>{assert.equal(p.activeOnly,true);calls++;return p.offset===0?{rows:[row(1),row(2),{...row(3),active:false}],nextOffset:3,hasMore:true}:{rows:[row(2),...Array.from({length:10},(_,i)=>row(i+4))],nextOffset:14,hasMore:false};}});
 assert.equal(calls,2);assert.equal(result.rows.length,10);assert.equal(result.duplicates,1);assert.equal(result.excluded,1);assert.equal(new Set(result.rows.map(r=>r.shortCode)).size,10);assert.equal(c.products.length,1);
});
test('stale pages, invalid pagination and provider failure never create catalog products',async()=>{
 for(const lookup of [async()=>({stale:true}),async()=>({rows:[],nextOffset:0,hasMore:true}),async()=>{throw Error('offline');}])await assert.rejects(collectAgentProducts({count:10,catalog,lookup}));assert.equal(catalog.products.length,0);
});
test('cancellation and repetitive provider pages are bounded without writes',async()=>{
 let calls=0;const cancelled=await collectAgentProducts({count:10,catalog,cancelled:()=>true,lookup:async()=>{calls++;}});assert.equal(cancelled.cancelled,true);assert.equal(calls,0);
 const result=await collectAgentProducts({count:10,catalog,lookup:async p=>{calls++;return {rows:[{...row(1),name:'desconhecido'}],nextOffset:p.offset+1,hasMore:true};}});assert.equal(calls,40);assert.equal(result.rows.length,0);
});
