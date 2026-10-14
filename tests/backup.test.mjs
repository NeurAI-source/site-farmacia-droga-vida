import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { encryptBackup, decryptBackup, collectBackup, TABLES, validateBackup } from '../scripts/backup.mjs';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const backup = () => ({ version: 1, kind: 'application-data', createdAt: new Date().toISOString(), tables: Object.fromEntries(Object.keys(TABLES).map(table => [table, []])), storage: [] });
test('encrypted recovery preserves application data without exposing plaintext', () => {
  const value = backup(); value.tables.catalog_draft = [{ id: 1, catalog: { products: [{ name: 'Confidential draft' }] } }];
  const encrypted = encryptBackup(value, keys.publicKey);
  assert.ok(!encrypted.includes('Confidential draft'));
  assert.deepEqual(decryptBackup(encrypted, keys.privateKey), value);
});
test('ciphertext and authentication metadata tampering are rejected', () => {
  const encrypted = JSON.parse(encryptBackup(backup(), keys.publicKey));
  for (const field of ['ciphertext', 'iv', 'tag', 'wrappedKey']) {
    const changed = structuredClone(encrypted), bytes = Buffer.from(changed[field], 'base64'); bytes[0] ^= 1; changed[field] = bytes.toString('base64');
    assert.throws(() => decryptBackup(JSON.stringify(changed), keys.privateKey));
  }
});
test('wrong recovery key and unsupported envelope version are rejected', () => {
  const encrypted = encryptBackup(backup(), keys.publicKey);
  assert.throws(() => decryptBackup(encrypted, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey));
  const changed = JSON.parse(encrypted); changed.version = 2;
  assert.throws(() => decryptBackup(JSON.stringify(changed), keys.privateKey));
});
test('restore validation rejects missing tables, extra auth data and storage traversal', () => {
  const value = backup(); delete value.tables.campaigns; assert.throws(() => validateBackup(value));
  const auth = backup(); auth.tables.users = []; assert.throws(() => validateBackup(auth));
  const bad = backup(); bad.storage.push({ bucket: 'product-images', path: '../private', data: '', bytes: 0, sha256: '' }); assert.throws(() => validateBackup(bad));
  const unsupported = backup(); unsupported.version = 2; assert.throws(() => validateBackup(unsupported));
});
test('collection uses fixed Supabase endpoints, includes private images and fails on incomplete data', async () => {
  const paths = [];
  const fetcher = async (url, options) => {
    assert.equal(url.origin, 'https://example.supabase.co'); assert.equal(options.redirect, 'error'); paths.push(url.pathname);
    if (url.pathname.startsWith('/rest/v1/')) return Response.json([]);
    if (url.pathname.endsWith('/campaign-images')) return Response.json([{ id: 'asset', name: 'cover.png', metadata: { mimetype: 'image/png' } }]);
    if (url.pathname.includes('/object/authenticated/')) return new Response('image-bytes');
    return Response.json([]);
  };
  const value = await collectBackup({ url: 'https://example.supabase.co', serviceKey: 'test-key', fetcher });
  assert.equal(value.storage.length, 1); assert.equal(value.storage[0].bucket, 'campaign-images');
  assert.ok(paths.every(path => !path.includes('/auth/')));
  assert.deepEqual(decryptBackup(encryptBackup(value, keys.publicKey), keys.privateKey), value);
  await assert.rejects(collectBackup({ url: 'https://example.supabase.co', serviceKey: 'test-key', fetcher: async () => new Response('', { status: 403 }) }));
  await assert.rejects(collectBackup({ url: 'https://attacker.test', serviceKey: 'test-key', fetcher }));
});
