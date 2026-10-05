import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCampaignHandler} from '../supabase/functions/campaign-api/handler.js';
const user='11111111-1111-4111-8111-111111111111',origin='https://www.drogavidapopular.com.br';
function fixture({active=true,role='admin'}={}) {
  let uploads=0,writes=0;
  const bucket={createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:`https://test.supabase.co/storage/v1/object/sign/campaign-images/${path}?token=short-lived`}))}),upload:async()=>{uploads++;return {data:{}};},remove:async()=>({data:{}})};
  const db={storage:{from:name=>{assert.equal(name,'campaign-images');return bucket;}},auth:{getUser:async token=>({data:{user:token==='valid'?{id:user}:null},error:token==='valid'?null:Error('bad')})},from:name=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,active}})})}),insert:async()=>({data:{}})}),rpc:async name=>{if(name==='campaign_public_snapshot')return {data:{server_now:new Date().toISOString(),next_start:null,campaigns:[{id:user,title:'Oferta aprovada',kind:'post',cover_path:'approved.png',page_paths:[],active:true,publication_state:'published'}]}};writes++;return {data:user};}};
  return {handler:createCampaignHandler({db,origins:origin}),counts:()=>({uploads,writes})};
}
function req({method='POST',token='valid',body={action:'list'},path='',requestOrigin=origin,type='application/json'}={}) {return new Request(`https://test.supabase.co/functions/v1/campaign-api${path}`,{method,headers:{origin:requestOrigin,authorization:`Bearer ${token}`,'content-type':type},...(method==='GET'||method==='OPTIONS'?{}:{body:typeof body==='object'&&!(body instanceof Uint8Array)?JSON.stringify(body):body})});}
test('public API is uncached, signs approved assets and strips internal paths',async()=>{
  const {handler}=fixture();const response=await handler(req({method:'GET',path:'?action=public',token:''}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('cdn-cache-control'),'no-store');const body=await response.json();assert.equal(body.lease_ms,60000);assert.ok(body.campaigns[0].cover_url.includes('/sign/'));assert.equal('cover_path' in body.campaigns[0],false);assert.equal('page_paths' in body.campaigns[0],false);
});
test('untrusted origins, unauthenticated and inactive accounts cannot manage campaigns',async()=>{
  assert.equal((await fixture().handler(req({requestOrigin:'https://evil.example'}))).status,403);
  assert.equal((await fixture().handler(req({token:'bad'}))).status,401);
  assert.equal((await fixture({active:false}).handler(req())).status,403);
});
test('uploads validate the bytes on the server and never use the product bucket',async()=>{
  const f=fixture();let response=await f.handler(req({path:'?action=upload',body:new TextEncoder().encode('<svg><script>alert(1)</script></svg>'),type:'image/png'}));assert.equal(response.status,400);assert.equal(f.counts().uploads,0);
  response=await f.handler(req({path:'?action=upload',body:new Uint8Array(await readFile(new URL('../assets/products/3.png',import.meta.url))),type:'image/png'}));assert.equal(response.status,200);assert.equal(f.counts().uploads,1);const data=await response.json();assert.ok(data.id&&data.url);
  response=await f.handler(req({path:'?action=upload',body:new Uint8Array(5242881),type:'image/png'}));assert.equal(response.status,400);assert.equal(f.counts().uploads,1);
});
test('editor publication is rejected before any write and body limits apply to JSON',async()=>{
  const f=fixture({role:'editor'});const campaign={id:crypto.randomUUID(),version:0,title:'Teste',kind:'post',cover_id:user,pages:[],starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+60000).toISOString(),sort_order:0,active:true,publication_state:'published',link_url:''};
  assert.equal((await f.handler(req({body:{action:'save',campaign}}))).status,403);assert.equal(f.counts().writes,0);
  assert.equal((await f.handler(req({body:'x'.repeat(20001)}))).status,400);
});
