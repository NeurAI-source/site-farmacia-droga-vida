import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {photoSourceAction,allowedBeautyImage,beautyCandidate} from '../supabase/functions/admin-api/photo-sources.js';
const ean='7891234567890',image=`https://images.openbeautyfacts.org/images/products/789/123/456/7890/front_pt.2.400.jpg`;
const response=()=>({status:1,product:{code:ean,product_name:'Shampoo Dove 250 ml',brands:'Dove',quantity:'250 ml',image_front_url:image}});
function fakeDb(){const cache=new Map();return {cache,catalog:{products:[{id:1,name:'Shampoo Dove 250 ml',brand:'Dove',detail:'250 ml',ean,variants:[]}]},from(table){let key,op='read',value;const q={select(){return q;},eq(_k,v){key=v;return q;},maybeSingle(){return q;},single(){return q;},delete(){op='delete';return q;},like(){return q;},lt(){return q;},insert(v){op='insert';value=v;return q;},upsert(v){op='upsert';value=v;return q;},then(resolve,reject){try{let data,error;if(table==='catalog_draft')data={catalog:structuredClone(thisDb.catalog)};else if(op==='read')data=cache.get(key)||null;else if(op==='insert'&&cache.has(value.key))error={code:'23505'};else if(op!=='delete'){cache.set(value.key,value);data=value;}return Promise.resolve({data,error}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};const thisDb=this;return q;}};}
const invoke=(db,body,extra={})=>photoSourceAction({db,body,user:{id:'actor'},role:'admin',env:()=> 'true',now:1800000000000,...extra});
test('image provider accepts only exact barcode paths on a fixed HTTPS image host',()=>{
 assert.equal(allowedBeautyImage(image,ean),true);for(const url of [image.replace('https:','http:'),image.replace('images.openbeautyfacts.org','evil.test'),image+'?url=http://localhost',image.replace('/7890/','/7891/'),'https://images.openbeautyfacts.org@evil.test/front_pt.2.400.jpg'])assert.equal(allowedBeautyImage(url,ean),false);
 assert.equal(beautyCandidate({...response(),status:0},ean),null);assert.equal(beautyCandidate(response(),'7890000000001'),null);
});
test('photo lookup requires admin permission and explicit server configuration',async()=>{
 const db=fakeDb();await assert.rejects(invoke(db,{action:'photo-find',key:'1:0'},{role:'editor'}),e=>e.status===403);const disabled=await invoke(db,{action:'photo-source-status'},{env:()=>undefined});assert.equal(disabled.enabled,false);await assert.rejects(invoke(db,{action:'photo-find',key:'1:0'},{env:()=>undefined}),e=>e.status===409);assert.equal(db.cache.size,0);
});
test('positive and negative lookups are cached, derive EAN from the draft and never mutate it',async()=>{
 for(const found of [true,false]){const db=fakeDb(),before=structuredClone(db.catalog);let calls=0;const fetcher=async(url,options)=>{calls++;assert.match(url,new RegExp(ean));assert.equal(options.redirect,'error');assert.match(options.headers['User-Agent'],/DrogaVida/);return Response.json(found?response():{status:0});};const a=await invoke(db,{action:'photo-find',key:'1:0',ean:'malicious'},{fetcher});const b=await invoke(db,{action:'photo-find',key:'1:0'},{fetcher});assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(!!a.candidate,found);assert.deepEqual(db.catalog,before);}
});
test('global atomic quota also protects simultaneous administrators',async()=>{
 const db=fakeDb();let calls=0;const fetcher=async()=>{calls++;return Response.json(response());};await invoke(db,{action:'photo-find',key:'1:0'},{fetcher});db.cache.delete('photo-obf:'+ean);await assert.rejects(invoke(db,{action:'photo-find',key:'1:0'},{fetcher,user:{id:'other'}}),e=>e.status===429);assert.equal(calls,1);
});
test('image bytes are fetched only from a live cached identity match',async()=>{
 const db=fakeDb();await assert.rejects(invoke(db,{action:'photo-source-file',key:'1:0'},{fetcher:()=>assert.fail('No unreviewed download')}),e=>e.status===409);
 await invoke(db,{action:'photo-find',key:'1:0'},{fetcher:async()=>Response.json(response())});const bytes=readFileSync(new URL('../assets/products/3.png',import.meta.url));const result=await invoke(db,{action:'photo-source-file',key:'1:0'},{fetcher:async url=>{assert.equal(url,image);return new Response(bytes,{headers:{'content-type':'image/png'}});}});assert.equal(result.mime,'image/png');assert.equal(Buffer.from(result.base64,'base64').length,bytes.length);
 db.catalog.products[0].detail='400 ml';await assert.rejects(invoke(db,{action:'photo-source-file',key:'1:0'},{fetcher:()=>assert.fail('Mismatch must be blocked')}),e=>e.status===409);
});
test('missing EAN, unavailable service and oversized metadata preserve all catalog data',async()=>{
 const db=fakeDb(),before=structuredClone(db.catalog);await assert.rejects(invoke(db,{action:'photo-find',key:'1:0'},{fetcher:async()=>new Response('',{status:503})}),e=>e.status===503);assert.deepEqual(db.catalog,before);
 await assert.rejects(invoke(fakeDb(),{action:'photo-find',key:'1:0'},{fetcher:async()=>new Response('x'.repeat(270000))}),e=>e.status===413);
 db.catalog.products[0].ean='';assert.equal((await invoke(db,{action:'photo-find',key:'1:0'},{fetcher:()=>assert.fail()})).candidate,null);
});
