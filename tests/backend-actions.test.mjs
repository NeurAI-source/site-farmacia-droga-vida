import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAdminAction } from '../admin/backend-actions.js';
const failed = (status, message) => ({ data: null, error: { context: { status, json: async () => ({ error: message }) } } });
function client(results, refresh) {
  let renewals = 0;
  const calls = [];
  return { calls, get renewals() { return renewals; }, functions: { invoke: async (name, request) => { calls.push({ name, request }); return results.shift(); } }, auth: { refreshSession: async () => { renewals++; return refresh; } } };
}
test('expired session refreshes once and retries the identical reviewed batch ID and payload', async () => {
  const db = client([failed(401, 'Faça login novamente.'), { data: { batch: { id: 'same-batch' } } }], { data: { session: { access_token: 'refreshed-test-session' } } });
  const request = { batchId: 'same-batch', version: 7, rows: [{ code: '001', priceCents: 500 }], autoPublish: true };
  const result = await invokeAdminAction(db, 'price-batch', request);
  assert.equal(result.batch.id, 'same-batch');
  assert.equal(db.renewals, 1); assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls[0], db.calls[1]);
  assert.deepEqual(db.calls[1].request.body, { action: 'price-batch', ...request });
});
test('revoked or still rejected sessions require login and preserve the recovery request', async () => {
  for (const refresh of [{ error: Error('Session not found') }, { data: { session: { access_token: 'test' } } }]) {
    const db = client([failed(401, 'Faça login novamente.'), failed(401, 'Faça login novamente.')], refresh);
    await assert.rejects(() => invokeAdminAction(db, 'price-batch', { batchId: 'same-batch' }), e => e.requiresLogin && !e.definitive && /Entre novamente/.test(e.message));
    assert.equal(db.renewals, 1); assert.ok(db.calls.length <= 2);
  }
});
test('validation failures and connection loss never refresh or automatically replay a write', async () => {
  for (const status of [403, 409, 500]) {
    const db = client([failed(status, 'Falha de teste')]);
    await assert.rejects(() => invokeAdminAction(db, 'price-batch'), e => e.definitive === (status !== 500));
    assert.equal(db.calls.length, 1); assert.equal(db.renewals, 0);
  }
  const db = client([{ error: {} }]);
  await assert.rejects(() => invokeAdminAction(db, 'price-batch'), e => !e.definitive && /conexão/.test(e.message));
  assert.equal(db.calls.length, 1); assert.equal(db.renewals, 0);
});
