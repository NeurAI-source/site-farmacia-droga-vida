import test from 'node:test';
import assert from 'node:assert/strict';
import {TrierClient, InventoryService, config} from '../supabase/functions/trier-api/integration.js';

const settings = {enabled:true,syncEnabled:true,baseUrl:'https://example.invalid',token:'mock',storeId:'test',timeoutMs:100,retries:0,intervalMinutes:15};
const contract = {request:()=>({url:'/mock',headers:{authorization:'mock'}}),decode:value=>value};

test('resource limit defaults and invalid configuration bounds', () => {
  const defaults = config(()=> '');
  assert.equal(defaults.maxResponseBytes, 2*1024*1024);
  assert.equal(defaults.maxProducts, 10000);
  assert.equal(defaults.syncDeadlineMs, 120000);
  for (const [key,value] of [['TRIER_MAX_RESPONSE_BYTES','10485761'],['TRIER_MAX_PRODUCTS','100001'],['TRIER_SYNC_DEADLINE_MS','300001'],['TRIER_MAX_PRODUCTS','0']]) {
    assert.throws(()=>config(name=>name===key?value:''), /invalid_configuration/);
  }
});

test('byte cap rejects advertised and streamed oversized responses before decode', async () => {
  let decoded=0, cancelled=false;
  const adapter={...contract,decode:value=>{decoded++;return value;}};
  const make=response=>new TrierClient({...settings,maxResponseBytes:8},adapter,async()=>response);
  await assert.rejects(()=>make(new Response('[]',{headers:{'content-length':'9'}})).products(), /response_too_large/);
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('123456789'));},cancel(){cancelled=true;}});
  await assert.rejects(()=>make(new Response(stream)).products(), /response_too_large/);
  assert.equal(decoded,0);assert.equal(cancelled,true);
});

test('byte cap counts UTF-8 bytes and allows exact cap', async () => {
  const payload='["é"]', bytes=new TextEncoder().encode(payload).length;
  const make=limit=>new TrierClient({...settings,maxResponseBytes:limit},contract,async()=>new Response(payload));
  assert.deepEqual(await make(bytes).products(),['é']);
  await assert.rejects(()=>make(bytes-1).products(), /response_too_large/);
});

test('product cap applies to decoded arrays', async () => {
  await assert.rejects(()=>new TrierClient({...settings,maxProducts:1},contract,async()=>Response.json([{},{}])).products(), /too_many_products/);
});

test('malformed adapter headers fail safely without network', async () => {
  let calls=0;
  for(const headers of ['secret',42,[["invalid header",'secret']]]) {
    await assert.rejects(()=>new TrierClient(settings,{...contract,request:()=>({url:'/mock',headers})},async()=>{calls++;}).products(), /invalid_configuration/);
  }
  assert.equal(calls,0);
});

test('stalled streamed body is cancelled by timeout', async () => {
  let cancelled=false;
  const client=new TrierClient({...settings,timeoutMs:20},contract,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})));
  // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
  const keepAlive=setTimeout(()=>{},1000);
  try { await assert.rejects(()=>client.products(), /timeout/);assert.equal(cancelled,true); }
  finally {clearTimeout(keepAlive);}
});

test('expired total deadline prevents request and retry backoff', async () => {
  let calls=0;
  const client=new TrierClient({...settings,retries:2},contract,async()=>{calls++;return new Response('',{status:503});});
  await assert.rejects(()=>client.products({deadline:Date.now()-1}), /sync_deadline_exceeded/);assert.equal(calls,0);
  await assert.rejects(()=>client.products({deadline:Date.now()+100}), /sync_deadline_exceeded/);assert.equal(calls,1);
});

test('sync stops starting writes after the total deadline', async () => {
  let writes=0, finished;
  const item={reducedCode:'001',name:'Mock',stockQuantity:1,status:'mock'};
  let active=0;
  const service=new InventoryService({settings:{...settings,syncDeadlineMs:10},policy:{priceUnit:'cents',isSellable:()=>true},client:{products:async()=>Array(9).fill(item)},repository:{claim:async()=> 'lease',apply:async()=>{writes++;active++;await new Promise(resolve=>setTimeout(resolve,20));active--;return true;},finish:async result=>{assert.equal(active,0);finished={...result};}}});
  const result=await service.refresh();assert.equal(writes,4);assert.equal(result.status,'failed');assert.equal(result.lastError,'sync_deadline_exceeded');assert.equal(finished.updated,4);
});
test('inventory writes stay bounded, audit lease is shared and all in-flight writes settle before finish',async()=>{
 let active=0,peak=0,finished=false;const seen=new Set();
 const items=Array.from({length:196},(_,i)=>({reducedCode:String(i+1),name:'Mock',stockQuantity:1,status:'mock'}));
 const service=new InventoryService({settings:{...settings,syncDeadlineMs:5000},policy:{priceUnit:'cents',isSellable:()=>true},client:{products:async()=>items},repository:{claim:async()=> 'lease',apply:async(p,lease)=>{assert.equal(lease,'lease');assert.equal(finished,false);active++;peak=Math.max(peak,active);assert.equal(seen.has(p.reducedCode),false);seen.add(p.reducedCode);await new Promise(r=>setTimeout(r,1));active--;return true;},finish:async(_,lease)=>{assert.equal(lease,'lease');assert.equal(active,0);finished=true;}}});
 const result=await service.refresh();assert.equal(result.updated,196);assert.equal(result.errors,0);assert.equal(result.status,'completed');assert.equal(peak,4);assert.equal(seen.size,196);assert.equal(finished,true);
});
