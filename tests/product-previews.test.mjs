import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { buildProductPreviews, publicProductSource } from '../scripts/product-previews.mjs';
const origin = 'https://example.supabase.co';
const source = `${origin}/storage/v1/object/public/product-images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png`;
test('preview builder preserves ratio/alpha and originals, reuses public source, excludes all private or external URLs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'product-previews-')); t.after(() => rm(root, { recursive: true, force: true }));
  const original = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 240, g: 20, b: 10, alpha: .5 } } }).png().toBuffer();
  let downloads = 0;
  const catalog = { products: [source, source, source.replace('/public/', '/authenticated/'), source.replace('/public/product-images/', '/sign/campaign-images/'), source.replace('example.supabase.co', 'other.supabase.co')].map(imageUrl => ({ imageUrl })) };
  const opts = { catalog, projectUrl: origin, cacheDir: join(root, 'cache'), outDir: join(root, 'dist'), fetcher: async () => { downloads++; return new Response(original); } };
  const first = await buildProductPreviews(opts), second = await buildProductPreviews(opts);
  assert.equal(downloads, 1); assert.equal(Object.keys(first.previews).length, 1); assert.deepEqual(first.previews, second.previews);
  const preview = await readFile(join(root, 'dist', first.previews[source])), metadata = await sharp(preview).metadata();
  assert.equal(metadata.width, 480); assert.equal(metadata.height, 240); assert.equal(metadata.hasAlpha, true);
  assert.ok(preview.length < original.length); assert.deepEqual(await sharp(original).metadata().then(m => [m.width, m.height]), [1200, 600]);
});
test('source allowlist rejects credentials, querystrings, untrusted domains and private media', () => {
  assert.equal(publicProductSource(source, origin), true);
  for (const url of [source + '?token=secret', source + '#fragment', source.replace('https://', 'https://user:secret@'), source.replace('/public/', '/authenticated/'), source.replace('product-images', 'campaign-images')]) assert.equal(publicProductSource(url, origin), false);
});
