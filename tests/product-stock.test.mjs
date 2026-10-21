import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stockState,stockMarkup,cartStockIssue,STOCK_MAX_AGE} from '../product-stock.js';
const now=Date.parse('2026-10-21T22:00:00Z');
const item={id:1,name:'Produto',stockQuantity:1,variants:[]};
const fresh=(p={},qty=5,available=true)=>({...item,stockQuantity:qty,trierAvailable:available,trierUpdatedAt:new Date(now).toISOString(),...p});
test('legacy, missing, invalid, expired and future stock never masquerade as a real balance',()=>{
 for(const p of [item,fresh({trierUpdatedAt:'bad'}),fresh({trierUpdatedAt:new Date(now-STOCK_MAX_AGE-1).toISOString()}),fresh({trierUpdatedAt:new Date(now+60001).toISOString()}),fresh({},NaN),fresh({},-1),fresh({},5,'true')]) assert.equal(stockState(p,'',now).known,false);
 assert.match(stockMarkup(item,{now}),/Consulte a disponibilidade/);
 assert.doesNotMatch(stockMarkup(item,{now}),/1 unidade/);
});
test('recent stock uses the sale unit and never the quantity printed inside the package',()=>{
 const p=fresh({name:'FR BABYSEC MEGA',variants:[{size:'M',packageQuantity:38,...fresh({},8)}]});
 assert.equal(stockState(p,'M',now).label,'8 pacotes disponíveis');
 assert.equal(stockState(p,'M',now).limit,8);
 assert.equal(stockState(fresh({},1),'',now).label,'1 unidade disponível');
 assert.equal(stockState(fresh({},120),'',now).limit,99);
});
test('each size is independent; missing size is unknown, zero is sold out, blocked is unavailable',()=>{
 const p={...item,variants:[{...fresh({},8),size:'M'},{...fresh({},0),size:'G'},{...fresh({},5,false),size:'XG'},{size:'P',stockQuantity:1}]};
 assert.equal(stockState(p,'M',now).quantity,8);assert.equal(stockState(p,'G',now).short,'Esgotado');
 assert.equal(stockState(p,'XG',now).short,'Indisponível');assert.equal(stockState(p,'P',now).known,false);
 const html=stockMarkup(p,{now,selectable:true});assert.equal((html.match(/class="dv-stock-chip/g)||[]).length,4);
 assert.match(html,/data-stock-size="G" disabled/);assert.match(html,/data-stock-size="P"/);
});
test('cart respects current per-size quantities without inventing reservations or deleting saved items',()=>{
 const p={...item,variants:[{...fresh({},2),size:'M'},{...fresh({},7),size:'G'}]};
 const cart=[{id:1,variant:'M',qty:3}],before=structuredClone(cart);
 assert.match(cartStockIssue(cart,[p],now),/2 unidades disponíveis/);assert.deepEqual(cart,before);
 assert.equal(cartStockIssue([{id:1,variant:'G',qty:7}],[p],now),'');
 assert.equal(cartStockIssue([{id:1,variant:'',qty:99}],[item],now),'');
});
test('untrusted size labels are escaped, and fractional stock is never rounded up',()=>{
 const p={...item,variants:[{...fresh({},2.9),size:'<img onerror="bad">'}]};
 assert.equal(stockState(p,p.variants[0].size,now).quantity,2);assert.doesNotMatch(stockMarkup(p,{now,selectable:true}),/<img/);
});
test('cart keeps customer details in memory and continues using the existing WhatsApp order builder',async()=>{
 const src=await readFile(new URL('../cart-chat.js',import.meta.url),'utf8');
 assert.match(src,/orderMessage\(getCart\(\),getProducts\(\),customer\)/);
 assert.doesNotMatch(src,/localStorage|fetch\(|supabase|service_role/i);
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/querySelectorAll\('\.cart-trigger'\)/);assert.doesNotMatch(src,/scrollIntoView/);
});
