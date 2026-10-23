import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { collectIncrementalBackup } from '../scripts/incremental-backup.mjs';
import { encryptBackup, decryptBackup } from '../scripts/backup.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const options = { url: 'https://example.supabase.co', serviceKey: 'test-server-secret', publicKey: keys.publicKey };
function fixture() {
  const state = { revision: '2026-10-22T00:00:00Z', body: 'private-art', downloads: 0, deleted: false, metadata: true };
  state.fetcher = async (url, request) => {
    if (url.pathname.startsWith('/rest/')) return Response.json([]);
    if (url.pathname.includes('/object/authenticated/')) { state.downloads++; return new Response(state.body); }
    assert.equal(request.method, 'POST');
    return Response.json(url.pathname.endsWith('campaign-images') && !state.deleted ? [{ id: 'immutable-id', name: 'private.png', updated_at: state.metadata ? state.revision : null, metadata: { size: Buffer.byteLength(state.body), mimetype: 'image/png' } }] : []);
  };
  return state;
}
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'encrypted-media-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('unchanged private bytes are reused encrypted; each archive restores without cache or earlier backups', async t => {
  const cacheDir = await temporary(t), state = fixture();
  const first = await collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher });
  const second = await collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher });
  assert.equal(state.downloads, 1);
  const contents = await readFile(join(cacheDir, (await readdir(cacheDir))[0]), 'utf8');
  for (const sensitive of ['private-art', 'private.png', 'campaign-images', options.serviceKey]) assert.ok(!contents.includes(sensitive));
  const archives = [first, second].map(value => encryptBackup(value, keys.publicKey));
  await rm(cacheDir, { recursive: true });
  for (const archive of archives) {
    const value = decryptBackup(archive, keys.privateKey);
    assert.equal(value.version, 1);
    assert.equal(Buffer.from(value.storage[0].data, 'base64').toString(), state.body);
    assert.equal(value.storage[0].bucket, 'campaign-images');
  }
});
test('changed objects are fetched again, deleted objects are omitted, missing revision cannot reuse cache', async t => {
  const cacheDir = await temporary(t), state = fixture();
  const collect = () => collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher });
  await collect(); state.revision = '2026-10-23T00:00:00Z'; state.body = 'changed-art';
  const changed = await collect(); assert.equal(state.downloads, 2);
  assert.equal(Buffer.from(decryptBackup(encryptBackup(changed, keys.publicKey), keys.privateKey).storage[0].data, 'base64').toString(), state.body);
  state.metadata = false; await collect(); await collect(); assert.equal(state.downloads, 4);
  state.deleted = true; assert.equal((await collect()).storage.length, 0);
});
test('cache tampering, server-secret rotation, recipient rotation and project boundaries force fresh downloads', async t => {
  const cacheDir = await temporary(t), state = fixture();
  await collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher });
  const file = join(cacheDir, (await readdir(cacheDir))[0]), cached = JSON.parse(await readFile(file, 'utf8'));
  cached.payload = cached.payload.replace('image/png', 'image/jpeg'); await writeFile(file, JSON.stringify(cached));
  await collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher }); assert.equal(state.downloads, 2);
  await collectIncrementalBackup({ ...options, serviceKey: 'rotated-server-secret', cacheDir, fetcher: state.fetcher }); assert.equal(state.downloads, 3);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const value = await collectIncrementalBackup({ ...options, publicKey: other.publicKey, cacheDir, fetcher: state.fetcher }); assert.equal(state.downloads, 4);
  assert.equal(decryptBackup(encryptBackup(value, other.publicKey), other.privateKey).storage.length, 1);
  await collectIncrementalBackup({ ...options, url: 'https://another.supabase.co', cacheDir, fetcher: state.fetcher }); assert.equal(state.downloads, 5);
});
test('a substituted image ciphertext cannot be restored under a different object path', async t => {
  const cacheDir = await temporary(t), state = fixture();
  const value = await collectIncrementalBackup({ ...options, cacheDir, fetcher: state.fetcher });
  value.storage[0].path = 'substituted.png';
  assert.throws(() => decryptBackup(encryptBackup(value, keys.publicKey), keys.privateKey));
});
