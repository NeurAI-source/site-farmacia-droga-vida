import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createCipheriv, createDecipheriv, publicEncrypt, privateDecrypt, constants, createHash, createPublicKey } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const TABLES = Object.freeze({
  team_members: 'user_id', catalog_draft: 'id', publications: 'id', site_visits: 'day,session_id',
  price_batches: 'id', campaign_assets: 'id', campaigns: 'id', campaign_pages: 'campaign_id,position',
  product_content_history: 'product_id,catalog_version', product_ai_usage: 'id',
  trier_inventory: 'product_id,variant_id', trier_sync_state: 'id', trier_inventory_audit: 'id'
});
export const BUCKETS = Object.freeze(['product-images', 'campaign-images']);
export const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 100000, PAGE = 1000;
const aad = Buffer.from('droga-vida-application-backup:v1');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = path => typeof path === 'string' && path.length <= 1024 && path.length > 0 && !path.includes('\\') && !/[\x00-\x1f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
const decode = value => {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw Error('Invalid backup encoding');
  return Buffer.from(value, 'base64');
};
export function validateBackup(value) {
  if (value?.version !== 1 || value.kind !== 'application-data' || !Number.isFinite(Date.parse(value.createdAt)) || !value.tables || !Array.isArray(value.storage)) throw Error('Invalid application backup');
  if (Object.keys(value.tables).sort().join() !== Object.keys(TABLES).sort().join()) throw Error('Unexpected or missing backup tables');
  for (const rows of Object.values(value.tables)) if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('Invalid backup rows');
  if (value.storage.length > MAX_ROWS) throw Error('Too many storage objects');
  const paths = new Set();
  for (const object of value.storage) {
    if (!BUCKETS.includes(object.bucket) || !safePath(object.path)) throw Error('Invalid storage manifest');
    const key = object.bucket + '/' + object.path;
    if (paths.has(key)) throw Error('Duplicate storage object'); paths.add(key);
    const bytes = decode(object.data);
    if (object.bytes !== bytes.length || hash(bytes) !== object.sha256) throw Error('Storage integrity mismatch');
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw Error('Backup exceeds size limit');
  return value;
}
export function encryptBackup(value, recipientKey) {
  validateBackup(value);
  const publicKey = recipientKey?.type === 'public' ? recipientKey : createPublicKey(recipientKey);
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 2048) throw Error('Backup requires an RSA public key of at least 2048 bits');
  const plaintext = Buffer.from(JSON.stringify(value)), key = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const wrapped = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
    return JSON.stringify({ version: 1, algorithm: 'RSA-OAEP-SHA256/AES-256-GCM', wrappedKey: wrapped.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
  } finally { key.fill(0); plaintext.fill(0); }
}
export function decryptBackup(envelopeText, recoveryKey) {
  if (Buffer.byteLength(envelopeText) > MAX_BYTES * 1.5) throw Error('Encrypted backup exceeds size limit');
  const envelope = JSON.parse(envelopeText);
  if (envelope.version !== 1 || envelope.algorithm !== 'RSA-OAEP-SHA256/AES-256-GCM') throw Error('Unsupported backup envelope');
  const key = privateDecrypt({ key: recoveryKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, decode(envelope.wrappedKey));
  let plaintext;
  try {
    const iv = decode(envelope.iv), tag = decode(envelope.tag);
    if (key.length !== 32 || iv.length !== 12 || tag.length !== 16) throw Error('Invalid encryption metadata');
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(decode(envelope.ciphertext)), decipher.final()]);
    return validateBackup(JSON.parse(plaintext.toString('utf8')));
  } finally { key.fill(0); plaintext?.fill(0); }
}
export async function collectBackup({ url, serviceKey, fetcher = fetch }) {
  const base = new URL(url);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || base.username || base.password || !serviceKey) throw Error('Invalid backup configuration');
  let total = 0;
  async function request(path, options = {}) {
    const response = await fetcher(new URL(path, base), { ...options, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Backup request failed (${response.status})`);
    const reader = response.body.getReader(), chunks = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_BYTES) { await reader.cancel(); throw Error('Backup exceeds transfer limit'); } chunks.push(value); }
    return Buffer.concat(chunks);
  }
  const tables = {};
  for (const [table, order] of Object.entries(TABLES)) {
    const rows = [];
    for (let offset = 0;; offset += PAGE) {
      const page = JSON.parse((await request(`/rest/v1/${table}?select=*&order=${order.split(',').map(column => column + '.asc').join(',')}&limit=${PAGE}&offset=${offset}`)).toString());
      if (!Array.isArray(page) || page.length > PAGE || rows.length + page.length > MAX_ROWS) throw Error('Table exceeds backup limits');
      rows.push(...page); if (page.length < PAGE) break;
    }
    tables[table] = rows;
  }
  const storage = [];
  for (const bucket of BUCKETS) {
    const folders = [''], seen = new Set();
    while (folders.length) {
      const prefix = folders.shift(); if (seen.has(prefix)) throw Error('Duplicate storage folder'); seen.add(prefix);
      if (seen.size > MAX_ROWS) throw Error('Storage exceeds folder limit');
      for (let offset = 0;; offset += PAGE) {
        const entries = JSON.parse((await request(`/storage/v1/object/list/${bucket}`, { method: 'POST', body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }) })).toString());
        if (!Array.isArray(entries) || entries.length > PAGE || offset + entries.length > MAX_ROWS) throw Error('Storage listing exceeds limit');
        for (const entry of entries) {
          if (typeof entry.name !== 'string' || entry.name.includes('/')) throw Error('Invalid storage entry');
          const path = prefix ? prefix + '/' + entry.name : entry.name;
          if (!safePath(path) || path.split('/').length > 16) throw Error('Invalid storage path');
          if (!entry.id) { folders.push(path); continue; }
          if (storage.length >= MAX_ROWS) throw Error('Storage exceeds object limit');
          const bytes = await request(`/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
          storage.push({ bucket, path, bytes: bytes.length, sha256: hash(bytes), contentType: typeof entry.metadata?.mimetype === 'string' ? entry.metadata.mimetype : 'application/octet-stream', data: bytes.toString('base64') });
        }
        if (entries.length < PAGE) break;
      }
    }
  }
  const backup = validateBackup({ version: 1, kind: 'application-data', createdAt: new Date().toISOString(), tables, storage });
  const serialized = JSON.stringify(backup);
  if (serialized.includes(serviceKey) || /sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(serialized)) throw Error('Credential material detected in application data');
  return backup;
}
async function main() {
  if (process.argv[2] === 'restore') {
    if (!process.env.SECURITY_BACKUP_PRIVATE_KEY_FILE || !process.argv[3] || !process.argv[4]) throw Error('Restore requires private-key file, encrypted input and explicit output path');
    const backup = decryptBackup(await readFile(process.argv[3], 'utf8'), await readFile(process.env.SECURITY_BACKUP_PRIVATE_KEY_FILE, 'utf8'));
    await writeFile(process.argv[4], JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('Recovery verified; application data written to the requested file. Database unchanged.');
  } else if (process.argv[2] === 'backup') {
    const publicKey = process.env.SECURITY_BACKUP_PUBLIC_KEY || await readFile(new URL('../security/backup-public.pem', import.meta.url), 'utf8');
    const backup = await collectBackup({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
    await writeFile(process.argv[3] || 'application-backup.enc', encryptBackup(backup, publicKey), { flag: 'wx', mode: 0o600 });
    console.log('Encrypted application backup completed.');
  } else throw Error('Usage: backup.mjs backup [encrypted-output] | restore encrypted-input explicit-json-output');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Backup/recovery failed; no complete backup can be claimed. Check configuration and limits.'); process.exitCode = 1; });
