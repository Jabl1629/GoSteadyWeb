const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../server/conversions.cjs');
const NOW = Math.floor(Date.now() / 1000);
function setup() {
  const data = new Map(); let revision = 0;
  const store = {
    async get(key) { return data.has(key) ? structuredClone(data.get(key).data) : null; },
    async getWithMetadata(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && data.has(key) || options.onlyIfMatch && data.get(key)?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = String(++revision); data.set(key, { data: structuredClone(value), etag }); return { modified: true, etag };
    }
  };
  const sent = [];
  return { store, sent, now: () => NOW, config: { enabled: true, liveSecret: 'live-fixture', testSecret: 'test-fixture', testCode: 'TEST-FIXTURE', testLinks: new Set(['plink_test_fixture']) },
    send: async (event, test) => sent.push({ event, test }) };
}
const address = (overrides = {}) => ({
  'form-name': 'cupholder-v2-shipping-intent', checkout_id: 'checkout-fixture-123',
  source_url: 'https://gosteady.co/checkoutV2?email=private@example.com&utm_content=founder',
  email: ' Buyer@Example.com ', first_name: 'Private', phone: '1234567890', address: 'Private address',
  service_plan: 'annual', fbc: 'fb.1.1790000000000.validclick', fbp: 'fb.1.1790000000000.12345',
  client_user_agent: 'Test browser', ...overrides
});
const payment = (overrides = {}, eventOverrides = {}) => ({
  id: 'evt_fixture123', type: 'checkout.session.completed', created: NOW, livemode: true,
  data: { object: { object: 'checkout.session', id: 'cs_live_fixture123', livemode: true, mode: 'payment', status: 'complete',
    payment_status: 'paid', payment_link: 'plink_1UIfmtQ2TfGTSvqAOF27Vt8v', amount_total: 4900, currency: 'usd',
    client_reference_id: 'checkout-fixture-123', customer_details: { email: 'buyer@example.com' }, metadata: { service_plan: 'monthly' }, ...overrides } }, ...eventOverrides
});

test('verified address sends a hashed minimal event with the browser event ID', async () => {
  const deps = setup(); assert.equal(await c.processAddress(address(), deps), 'sent');
  const { event } = deps.sent[0];
  assert.equal(event.event_id, 'shipping_checkout-fixture-123');
  assert.equal(event.event_source_url, 'https://gosteady.co/checkoutV2');
  assert.deepEqual(event.user_data.em, [c.hash('buyer@example.com')]);
  assert.equal(event.user_data.fbc, address().fbc);
  assert.equal(JSON.stringify(event).includes('Private'), false);
  assert.equal(JSON.stringify(event).includes('buyer@example.com'), false);
});
test('duplicate address submissions are sent once', async () => {
  const deps = setup(); await c.processAddress(address(), deps);
  assert.equal(await c.processAddress(address(), deps), 'duplicate'); assert.equal(deps.sent.length, 1);
});
test('concurrent deliveries cannot both acquire the event lease', async () => {
  const deps = setup();
  await Promise.allSettled([c.processAddress(address(), deps), c.processAddress(address(), deps)]);
  assert.equal(deps.sent.length, 1);
});
test('temporary failures persist a retry and retain the same event ID', async () => {
  const deps = setup(); const send = deps.send; deps.send = async () => { throw Error('offline'); };
  await assert.rejects(c.processAddress(address(), deps));
  const pending = await deps.store.get('receipts/live/shipping_checkout-fixture-123');
  assert.equal(pending.state, 'retry'); assert.equal(pending.event.event_name, 'AddShippingInfo');
  deps.send = send; await c.processAddress(address(), deps); assert.equal(deps.sent.length, 1);
});
for (const [label, overrides] of Object.entries({
  'unrelated form': { 'form-name': 'survey' }, 'honeypot': { 'bot-field': 'spam' },
  'local preview': { source_url: 'http://localhost:8765/checkoutV2' },
  'third party': { source_url: 'https://example.com/checkoutV2' }, 'invalid ID': { checkout_id: '../../' },
  'invalid email': { email: 'not-an-email' }
})) test(`${label} cannot become an address conversion`, async () => {
  const deps = setup(); assert.equal(await c.processAddress(address(overrides), deps), 'ignored'); assert.equal(deps.sent.length, 0);
});
test('GPC opt-out suppresses both address and later paid conversion', async () => {
  const deps = setup(); assert.equal(await c.processAddress(address({ meta_opt_out: 'true' }), deps), 'opted-out');
  assert.equal(await c.processPayment(payment(), deps), 'opted-out'); assert.equal(deps.sent.length, 0);
});
test('paid deposit uses actual $49 and preserves click attribution across Stripe', async () => {
  const deps = setup(); await c.processAddress(address(), deps);
  assert.equal(await c.processPayment(payment({ metadata: { service_plan: 'annual' } }), deps), 'sent');
  const event = deps.sent[1].event;
  assert.equal(event.event_name, 'Purchase'); assert.equal(event.custom_data.value, 49);
  assert.equal(event.custom_data.service_plan, 'annual'); assert.equal(event.user_data.fbc, address().fbc);
  assert.equal(event.event_id, 'deposit_cs_live_fixture123');
});
test('Stripe duplicate events and completed/async events share one receipt', async () => {
  const deps = setup(); await c.processPayment(payment({client_reference_id: null}), deps);
  assert.equal(await c.processPayment(payment({client_reference_id: null}, { id: 'evt_other', type: 'checkout.session.async_payment_succeeded' }), deps), 'duplicate');
  assert.equal(deps.sent.length, 1);
});
for (const [label, overrides] of Object.entries({
  unpaid: { payment_status: 'unpaid' }, free: { payment_status: 'no_payment_required' },
  incomplete: { status: 'open' }, subscription: { mode: 'subscription' },
  'wrong amount': { amount_total: 9900 }, 'wrong currency': { currency: 'eur' },
  'unrelated payment': { payment_link: 'plink_other' }
})) test(`${label} is not a paid reservation conversion`, async () => {
  const deps = setup(); assert.equal(await c.processPayment(payment(overrides), deps), 'ignored'); assert.equal(deps.sent.length, 0);
});
test('pending payment converts only when the asynchronous success arrives', async () => {
  const deps = setup(); await c.processPayment(payment({ payment_status: 'unpaid' }), deps);
  await c.processPayment(payment({client_reference_id: null}, { type: 'checkout.session.async_payment_succeeded' }), deps);
  assert.equal(deps.sent.length, 1);
});
test('real Stripe SDK verifies raw payload and rejects tampering, replay and wrong mode', () => {
  const deps = setup(); const payload = JSON.stringify(payment());
  const header = c.stripe.webhooks.generateTestHeaderString({ payload, secret: 'live-fixture' });
  assert.equal(c.verifyStripe(payload, header, deps.config).id, 'evt_fixture123');
  assert.throws(() => c.verifyStripe(payload + ' ', header, deps.config));
  assert.throws(() => c.verifyStripe(payload, null, deps.config));
  const stale = c.stripe.webhooks.generateTestHeaderString({ payload, secret: 'live-fixture', timestamp: NOW - 600 });
  assert.throws(() => c.verifyStripe(payload, stale, deps.config));
  const wrongMode = c.stripe.webhooks.generateTestHeaderString({ payload, secret: 'test-fixture' });
  assert.throws(() => c.verifyStripe(payload, wrongMode, deps.config));
});
test('sandbox payments can only send to Meta test events', async () => {
  const deps = setup(); const event = payment({ livemode: false, client_reference_id: null, payment_link: 'plink_test_fixture' }, { livemode: false });
  await c.processPayment(event, deps); assert.equal(deps.sent[0].test, true);
  deps.config.testCode = ''; await assert.rejects(c.processPayment(event, deps), /Sandbox/);
});
test('Meta transport requires acknowledged acceptance and isolates test events', async () => {
  const config = { token: 'credential-fixture', pixel: '123', apiVersion: 'v24.0', testCode: 'TEST-CODE' };
  let sent;
  await c.sendToMeta({ event_name: 'Purchase' }, config, async (_, options) => {
    sent = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  }, true);
  assert.equal(sent.test_event_code, 'TEST-CODE'); assert.equal(sent.access_token, undefined);
  await assert.rejects(c.sendToMeta({}, config, async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
test('nonproduction deployments do not enable production reporting', () => {
  assert.equal(c.runtimeConfig({ META_CAPI_ENABLED: 'true' }, 'deploy-preview').enabled, false);
  assert.equal(c.runtimeConfig({ META_CAPI_ENABLED: 'true' }, 'production').enabled, true);
});
test('fast payment waits for address processing before reporting', async () => {
  const deps = setup(); await assert.rejects(c.processPayment(payment(), deps), /Waiting for address/);
  await c.processAddress(address(), deps);
  assert.equal(await c.processPayment(payment(), deps), 'sent');
});
test('paused integration still acknowledges unpaid events but never reports payments', async () => {
  const deps = setup(); deps.config.enabled = false;
  assert.equal(await c.processPayment(payment({ payment_status: 'unpaid' }), deps), 'ignored');
  await assert.rejects(c.processPayment(payment(), deps), /not enabled/);
  assert.equal(deps.sent.length, 0);
});
