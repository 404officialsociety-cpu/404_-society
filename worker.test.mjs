import test from 'node:test';
import assert from 'node:assert';
import worker, { validate, price } from '../src/worker.js';
const cu = { firstName: 'A', email: 'a@b.co', phone: '9876543210', address1: '12 Main Street', city: 'Salem', province: 'Tamilnadu', zip: '636701' };
const ok = { customer: cu, items: [{ id: '404-tee-black', size: 'M', qty: 1 }] };
test('valid order passes', () => assert.equal(validate(ok), null));
test('negative quantity rejected', () => assert.ok(validate({ ...ok, items: [{ id: '404-tee-black', size: 'M', qty: -1 }] })));
test('fractional / huge quantity rejected', () => { assert.ok(validate({ ...ok, items: [{ id: '404-tee-black', size: 'M', qty: 0.5 }] })); assert.ok(validate({ ...ok, items: [{ id: '404-tee-black', size: 'M', qty: 99 }] })); });
test('unknown product or size rejected', () => { assert.ok(validate({ ...ok, items: [{ id: 'x', size: 'M', qty: 1 }] })); assert.ok(validate({ ...ok, items: [{ id: '404-tee-black', size: 'XXL', qty: 1 }] })); });
test('bad phone / PIN rejected', () => { assert.ok(validate({ ...ok, customer: { ...cu, phone: '123' } })); assert.ok(validate({ ...ok, customer: { ...cu, zip: '12' } })); });
test('shipping: free up to 2000, 69 above', () => {
  assert.deepEqual([price([{ id: '404-tee-black', size: 'M', qty: 1 }]).shipping, price([{ id: '404-hoodie-black', size: 'M', qty: 1 }]).shipping], [0, 0]);
  const p = price([{ id: '404-hoodie-black', size: 'M', qty: 2 }]); assert.deepEqual([p.subtotal, p.shipping, p.total], [2998, 69, 3067]);
});
test('webhook with bad signature is rejected', async () => {
  const r = await worker.fetch(new Request('https://s/api/cashfree/webhook', { method: 'POST', headers: { 'x-webhook-signature': 'x', 'x-webhook-timestamp': '1' }, body: '{}' }), { CASHFREE_CLIENT_SECRET: 's' });
  assert.equal(r.status, 401);
});
test('checkout without signing in is rejected', async () => {
  const r = await worker.fetch(new Request('https://s/api/checkout', { method: 'POST', headers: { origin: 'https://s' }, body: JSON.stringify(ok) }), { SESSION_SECRET: 'x'.repeat(40) });
  assert.equal(r.status, 401);
});
