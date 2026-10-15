import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uploadProductImage } from '../supabase/functions/admin-api/product-image.js';
import { invokeAdminRequest } from '../admin/backend-actions.js';
const user = { id: '11111111-1111-4111-8111-111111111111' };
function fixture(fail = false) {
  const calls = [];
  const db = { storage: { from(name) {
    assert.equal(name, 'product-images');
    return {
      async upload(path, bytes, options) { calls.push({path, bytes, options}); return {error: fail ? Error('private database detail') : null}; },
      getPublicUrl(path) { return {data: {publicUrl: `https://isolated.supabase.co/storage/v1/object/public/product-images/${path}`}}; }
    };
  } } };
  const req = (body, type) => new Request('https://isolated.supabase.co/functions/v1/admin-api?action=upload-product-image', {method: 'POST', headers: {'content-type': type}, body});
  return {calls, send: (body, type, identity = user) => uploadProductImage(req(body, type), db, identity)};
}
test('validated PNG, JPEG and WebP uploads preserve the existing bucket and derive unique paths from verified identity', async () => {
  const f = fixture();
  for (const [file, type] of [['3.png','image/png'],['11.jpg','image/jpeg'],['27.webp','image/webp']]) {
    const bytes = new Uint8Array(await readFile(new URL(`../assets/products/${file}`, import.meta.url)));
    const result = await f.send(bytes, type);
    const call = f.calls.at(-1);
    assert.ok(call.path.startsWith(user.id + '/'));
    assert.match(result.url, /^https:\/\/isolated\.supabase\.co\/storage\/v1\/object\/public\/product-images\//);
    assert.deepEqual(call.bytes, bytes);assert.equal(call.options.contentType, type);assert.equal(call.options.upsert, false);
  }
  assert.equal(new Set(f.calls.map(c => c.path)).size, 3);
});
test('invalid identities, disguised files, MIME mismatch and oversized files never write to storage', async () => {
  const f = fixture(), png = new Uint8Array(await readFile(new URL('../assets/products/3.png',import.meta.url)));
  for (const identity of [null,{id:'../../another-user'}]) await assert.rejects(() => f.send(png,'image/png',identity), e => e.status === 401);
  for (const [body,type] of [[new TextEncoder().encode('<svg><script>bad</script></svg>'),'image/png'],[png,'image/jpeg'],[new Uint8Array(5242881),'image/png']]) await assert.rejects(() => f.send(body,type), e => [400,413].includes(e.status));
  assert.equal(f.calls.length, 0);
});
test('storage failure returns a safe retryable message without leaking delivery table details', async () => {
  const f = fixture(true), png = new Uint8Array(await readFile(new URL('../assets/products/3.png',import.meta.url)));
  await assert.rejects(() => f.send(png,'image/png'), e => e.status === 503 && !e.message.includes('private') && /guardar a imagem/.test(e.message));
});
test('an expired session can renew before upload, using the same file bytes and MIME exactly once after rejection', async () => {
  const calls = [], file = new Blob(['test image bytes'], {type:'image/webp'});
  const client = {functions:{invoke:async (name,request) => {calls.push({name,request});return calls.length===1?{error:{context:{status:401}}}:{data:{url:'https://isolated/image.webp'}};}},auth:{refreshSession:async()=>({data:{session:{access_token:'renewed-test'}}})}};
  const result = await invokeAdminRequest(client,'admin-api?action=upload-product-image',{body:file,headers:{'Content-Type':file.type}});
  assert.equal(result.url,'https://isolated/image.webp');assert.equal(calls.length,2);assert.equal(calls[1].request.body,file);assert.equal(calls[1].request.headers['Content-Type'],'image/webp');
});
