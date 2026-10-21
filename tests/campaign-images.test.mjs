import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignImageCache } from '../campaign-images.js';
const origin = 'https://example.supabase.co';
const source = token => `${origin}/storage/v1/object/sign/campaign-images/11111111-1111-4111-8111-111111111111.webp?token=${token}`;
const image = () => ({ src: '', getAttribute() { return this.src; } });
const response = () => new Response(new Blob(['image'], {type:'image/webp'}), {headers:{'content-type':'image/webp'}});
function fixture(extra={}) {
  let calls=0, sequence=0; const revoked=[];
  const cache=createCampaignImageCache({origin,fetcher:async()=>{calls++;return response();},urls:{createObjectURL:()=>`blob:${++sequence}`,revokeObjectURL:url=>revoked.push(url)},...extra});
  return {cache,revoked,get calls(){return calls;}};
}
test('rotating signed URLs and concurrent carousel/viewer loads download an immutable asset once',async()=>{
  const f=fixture(),a=image(),b=image();
  await Promise.all([f.cache.setSource(a,source('one')),f.cache.setSource(b,source('two'))]);
  await f.cache.setSource(image(),source('three'));
  assert.equal(f.calls,1);assert.equal(a.src,b.src);assert.match(a.src,/^blob:/);
});
test('other origins, public objects and different paths never alias a private asset',async()=>{
  const f=fixture(),a=image();
  const external=source('one').replace(origin,'https://other.example');
  await f.cache.setSource(a,external);assert.equal(a.src,external);assert.equal(f.calls,0);
  await f.cache.setSource(a,source('one'));
  await f.cache.setSource(a,source('two').replace('11111111-1111','22222222-2222'));
  assert.equal(f.calls,2);
});
test('failed downloads fall back to current signed URL and allow retry',async()=>{
  let calls=0;const f=fixture({fetcher:async()=>{if(++calls===1)throw Error();return response();}}),a=image();
  await f.cache.setSource(a,source('one'));assert.equal(a.src,source('one'));
  await f.cache.setSource(a,source('two'));assert.match(a.src,/^blob:/);
});
test('memory eviction revokes old blobs and downloads them again only when needed',async()=>{
  const f=fixture({maxEntries:1}),a=image();
  await f.cache.setSource(a,source('one'));
  await f.cache.setSource(a,source('one').replace('11111111-1111','22222222-2222'));
  assert.deepEqual(f.revoked,['blob:1']);
  await f.cache.setSource(a,source('two'));assert.equal(f.calls,3);
  f.cache.clear();assert.equal(f.revoked.length,3);
});
test('a slow previous selection cannot overwrite a newer viewer page',async()=>{
  let finish;const f=fixture({fetcher:()=>new Promise(resolve=>{finish=()=>resolve(response());})}),a=image();
  const pending=f.cache.setSource(a,source('one'));
  await f.cache.setSource(a,'/assets/new.webp');finish();await pending;
  assert.equal(a.src,'/assets/new.webp');
});
