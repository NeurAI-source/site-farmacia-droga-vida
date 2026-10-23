import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, createHmac, createPublicKey, timingSafeEqual } from 'node:crypto';
import { collectBackup, encryptBytes, storageContext, MAX_BYTES } from './backup.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const mac = (value, key) => createHmac('sha256', key).update(value).digest();

export async function collectIncrementalBackup({ publicKey, cacheDir, ...options }) {
  const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048 || !options.serviceKey) throw Error('Invalid backup configuration');
  const recipient = hash(key.export({ type: 'spki', format: 'der' }));
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const stats = { downloaded: 0, reused: 0, downloadedBytes: 0 };
  const backup = await collectBackup({ ...options, storeImage: async ({ bucket, path, entry, download }) => {
    // Unknown revisions are always re-downloaded. Never assume a filename is immutable.
    const size = entry.metadata?.size;
    const versioned = typeof entry.id === 'string' && entry.id && typeof entry.updated_at === 'string' &&
      Number.isFinite(Date.parse(entry.updated_at)) && Number.isSafeInteger(size) && size >= 0 && size <= MAX_BYTES;
    const identity = hash(JSON.stringify({ version: 1, project: options.url, recipient, bucket, path,
      id: entry.id, updated: entry.updated_at, created: entry.created_at, metadata: entry.metadata }));
    const filename = join(cacheDir, `${identity}.json`);
    if (versioned) {
      try {
        const text = await readFile(filename, 'utf8');
        if (Buffer.byteLength(text) > MAX_BYTES * 1.5) throw Error('Invalid cache');
        const cached = JSON.parse(text), signature = Buffer.from(cached.mac || '', 'hex');
        const expected = mac(cached.payload, options.serviceKey);
        if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw Error('Invalid cache authentication');
        const record = JSON.parse(cached.payload), object = record.object;
        if (record.identity !== identity || object.bytes !== size || !/^[a-f0-9]{64}$/.test(object.sha256) || typeof object.encryptedData !== 'string') throw Error('Invalid cache manifest');
        stats.reused++;
        return object;
      } catch { /* Cache expiration, corruption, secret/key rotation: download a fresh copy. */ }
    }
    const bytes = await download();
    try {
      if (versioned && bytes.length !== size) throw Error('Storage changed during backup');
      const object = { bytes: bytes.length, sha256: hash(bytes),
        contentType: typeof entry.metadata?.mimetype === 'string' ? entry.metadata.mimetype : 'application/octet-stream',
        encryptedData: encryptBytes(bytes, key, storageContext(bucket, path)) };
      stats.downloaded++; stats.downloadedBytes += bytes.length;
      if (versioned) {
        // Only ciphertext, sizes and hashes go into Actions cache. No keys, paths or table data.
        // Authenticate with the existing server secret to reject poisoned cache entries.
        const payload = JSON.stringify({ identity, object });
        await writeFile(filename + '.tmp', JSON.stringify({ payload, mac: mac(payload, options.serviceKey).toString('hex') }), { mode: 0o600 });
        await rename(filename + '.tmp', filename);
      }
      return object;
    } finally { bytes.fill(0); }
  } });
  options.progress?.(`Image backup: downloaded=${stats.downloaded}; reused=${stats.reused}; downloadedBytes=${stats.downloadedBytes}`);
  // Every daily archive embeds all encrypted images; cache is never a restore dependency.
  return backup;
}
