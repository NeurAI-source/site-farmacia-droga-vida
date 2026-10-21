// Server-only integration. Provider-specific wire contracts must come from official docs.
export class TrierError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}
export function config(env) {
  const integer = (key, fallback, min, max) => {
    const value = Number(env(key) || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new TrierError('invalid_configuration');
    return value;
  };
  return { enabled: env('TRIER_INTEGRATION_ENABLED') === 'true', syncEnabled: env('TRIER_SYNC_ENABLED') === 'true',
    baseUrl: env('TRIER_BASE_URL'), token: env('TRIER_API_TOKEN'), storeId: env('TRIER_STORE_ID'),
    timeoutMs: integer('TRIER_TIMEOUT_MS', 10000, 100, 60000), retries: integer('TRIER_MAX_RETRIES', 2, 0, 3),
    intervalMinutes: integer('TRIER_SYNC_INTERVAL_MINUTES', 15, 1, 1440),
    maxResponseBytes: integer('TRIER_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, 1, 10 * 1024 * 1024),
    maxProducts: integer('TRIER_MAX_PRODUCTS', 10000, 1, 100000),
    syncDeadlineMs: integer('TRIER_SYNC_DEADLINE_MS', 120000, 100, 300000) };
}
function remaining(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new TrierError('sync_deadline_exceeded');
  return ms;
}
export async function boundedJson(response, limit, signal) {
  const length = response.headers?.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > limit) throw new TrierError('response_too_large');
  if (!response.body?.getReader) throw new TrierError('invalid_response');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      let abort;
      const interrupted = new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once:true}); });
      let chunk;
      try { chunk = await Promise.race([reader.read(), interrupted]); }
      finally { signal.removeEventListener('abort', abort); }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new TrierError('response_too_large');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TrierError('invalid_json'); }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export class TrierClient {
  constructor(settings, contract, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    Object.assign(this, { settings, contract, fetcher, sleep });
  }
  async products({deadline = Date.now() + (this.settings.syncDeadlineMs ?? 120000)} = {}) {
    if (!this.settings.enabled) throw new TrierError('integration_disabled');
    if (!this.contract || !this.settings.token || !this.settings.storeId) throw new TrierError('official_contract_pending');
    let base;
    try { base = new URL(this.settings.baseUrl); } catch { throw new TrierError('invalid_configuration'); }
    if (base.protocol !== 'https:' || base.username || base.password) throw new TrierError('invalid_configuration');
    if (this.contract.load) return this.contract.load(this.settings, this.fetcher, this.sleep, deadline);
    // contract supplies documented endpoint, authentication, pagination and JSON decoder.
    let url, headers;
    try {
      const request = this.contract.request(this.settings);
      if (!request || typeof request.url !== 'string' || !request.headers || typeof request.headers !== 'object') throw Error();
      url = new URL(request.url, base); headers = new Headers(request.headers);
    } catch { throw new TrierError('invalid_configuration'); }
    if (url.origin !== base.origin || url.username || url.password) throw new TrierError('invalid_configuration');
    for (let attempt = 0; ; attempt++) {
      try {
        const signal = AbortSignal.timeout(Math.min(this.settings.timeoutMs, remaining(deadline)));
        const response = await this.fetcher(url, { method: 'GET', headers, redirect: 'error', signal });
        if (!response.ok) throw new TrierError(`http_${response.status}`, [429,500,502,503,504].includes(response.status));
        const json = await boundedJson(response, this.settings.maxResponseBytes ?? 2 * 1024 * 1024, signal);
        let items; try { items = this.contract.decode(json); } catch { throw new TrierError('unexpected_schema'); }
        if (!Array.isArray(items)) throw new TrierError('unexpected_schema');
        if (items.length > (this.settings.maxProducts ?? 10000)) throw new TrierError('too_many_products');
        remaining(deadline);
        return items;
      } catch (error) {
        const safe = error instanceof TrierError ? error : new TrierError(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'api_unavailable', true);
        if (!safe.retryable || attempt >= this.settings.retries) throw safe;
        const pause = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        if (pause >= remaining(deadline)) throw new TrierError('sync_deadline_exceeded');
        await this.sleep(pause);
      }
    }
  }
}
const identifier = value => typeof value === 'string' && value.trim() && value.length <= 128 ? value.trim() : undefined;
export function moneyToCents(value, unit) {
  if (unit === 'cents' && Number.isSafeInteger(value) && value >= 0 && value <= 100000000) return value;
  if (unit === 'decimal' && (typeof value === 'string' || typeof value === 'number') && /^\d+(\.\d{1,2})?$/.test(String(value))) {
    const [whole, fraction = ''] = String(value).split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (Number.isSafeInteger(cents) && cents <= 100000000) return cents;
  }
  throw new TrierError('invalid_price');
}
export function mapProduct(input, policy, storeId, fetchedAt = new Date().toISOString()) {
  // input is canonical adapter output, never an assumed Trier JSON shape.
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TrierError('invalid_product');
  if (typeof fetchedAt !== 'string' || !Number.isFinite(Date.parse(fetchedAt))) throw new TrierError('invalid_timestamp');
  const reducedCode = identifier(input.reducedCode), externalId = identifier(input.externalId), ean = identifier(input.ean);
  if ((!reducedCode && !externalId && !ean) || !identifier(input.name) || !Number.isFinite(input.stockQuantity) || Math.abs(input.stockQuantity) > 100000000) throw new TrierError('invalid_product');
  for (const key of ['reducedCode','externalId','ean']) if (input[key] != null && !identifier(input[key])) throw new TrierError('invalid_identifier');
  if (ean && !/^\d{8,14}$/.test(ean)) throw new TrierError('invalid_ean');
  if (!storeId || (input.storeId != null && input.storeId !== storeId)) throw new TrierError('wrong_store');
  const sellable = policy.isSellable(input.status);
  if (typeof sellable !== 'boolean') throw new TrierError('unknown_status');
  if (input.description != null && (typeof input.description !== 'string' || input.description.length > 10000)) throw new TrierError('invalid_description');
  return { externalId, reducedCode, ean, name: input.name.trim(), description: input.description, stockQuantity: input.stockQuantity,
    priceCents: input.price == null ? undefined : moneyToCents(input.price, policy.priceUnit),
    status: input.status == null ? null : String(input.status).slice(0,128), available: input.stockQuantity > 0 && sellable,
    storeId, fetchedAt };
}
export function publicStock(row) {
  return { productId: row.product_id, variantId: row.variant_id || null, stockQuantity: row.stock_quantity,
    available: row.availability, priceCents: row.external_price_cents, lastUpdatedAt: row.last_trier_sync_at };
}
export class InventoryService {
  constructor({client, repository, policy, settings, log = (_entry) => {}}) { Object.assign(this,{client,repository,policy,settings,log}); }
  async refresh({periodic = false} = {}) {
    if (!this.settings.enabled || (periodic && !this.settings.syncEnabled)) return {status:'disabled'};
    const lease = await this.repository.claim(this.settings.intervalMinutes);
    if (!lease) return {status:'cached'};
    const started = Date.now(), deadline = started + (this.settings.syncDeadlineMs ?? 120000);
    const result = {status:'completed',received:0,updated:0,skipped:0,errors:0,lastError:null};
    this.log({event:'trier_sync_started'});
    try {
      const items = await this.client.products({deadline}); result.received = items.length;
      if (items.length > (this.settings.maxProducts ?? 10000)) throw new TrierError('too_many_products');
      for (const item of items) {
        remaining(deadline);
        try {
          const mapped = mapProduct(item, this.policy, this.settings.storeId);
          remaining(deadline);
          const updated = await this.repository.apply(mapped, lease);
          if (updated) result.updated++; else result.skipped++;
        } catch (error) { result.errors++; result.lastError = error instanceof TrierError ? error.code : 'persistence_or_mapping_failed'; }
      }
    } catch (error) { result.status = 'failed'; result.errors++; result.lastError = error instanceof TrierError ? error.code : 'sync_failed'; }
    await this.repository.finish(result, lease);
    this.log({event:'trier_sync_completed',...result,durationMs:Date.now()-started});
    return result;
  }
}
