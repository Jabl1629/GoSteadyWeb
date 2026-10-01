const test = require('node:test');
const assert = require('node:assert/strict');
const { handleOfferAccepted } = require('../server/offer-accepted.cjs');
const { deliverOnce } = require('../server/conversions.cjs');
const NOW = Math.floor(Date.now() / 1000);
function setup() {
  const records = new Map(); let revision = 0;
  const sent = [];
  const deps = {
    config: { enabled:true }, now:()=>NOW, sent, records,
    send: async (event, test) => sent.push({event, test}),
    store: {
      async get(key) { return structuredClone(records.get(key)?.data || null); },
      async getWithMetadata(key) { return structuredClone(records.get(key) || null); },
      async setJSON(key, data, options = {}) {
        if (options.onlyIfNew && records.has(key) || options.onlyIfMatch && records.get(key)?.etag !== options.onlyIfMatch) return {modified:false};
        const etag = String(++revision); records.set(key, {data:structuredClone(data), etag}); return {modified:true, etag};
      }
    }
  };
  return deps;
}
const payload = overrides => ({ checkout_id:'offer-fixture-123', event_time:NOW,
  source_url:'https://gosteady.co/checkoutV2?utm_content=private',
  fbp:'fb.1.1790000000000.12345', fbc:'fb.1.1790000000000.validclick', ...overrides });
function request(data = {}, headers = {}, options = {}) {
  const method = options.method || 'POST';
  return new Request(options.url || 'https://gosteady.co/.netlify/functions/offer-accepted', {
    method, headers:{'content-type':'application/json',origin:'https://gosteady.co',
      referer:'https://gosteady.co/checkoutV2','user-agent':'Actual browser', ...headers},
    ...(method === 'POST' ? {body:options.raw ?? JSON.stringify(payload(data))} : {})
  });
}
function run(deps, req = request(), context = {ip:'192.0.2.1'}) {
  return handleOfferAccepted(req, context, () => deps);
}

test('offer acceptance sends minimal fixed CAPI event matching the Pixel ID without waiting for an address', async () => {
  const d = setup();
  const result = await run(d, request({email:'private@example.com', address:'Private street',
    client_ip_address:'1.1.1.1', client_user_agent:'forged', event_name:'Purchase', value:100000}));
  assert.equal(result.status, 200);
  const e = d.sent[0].event;
  assert.equal(e.event_name, 'OfferAccepted'); assert.equal(e.event_id,'offer_offer-fixture-123');
  assert.equal(e.action_source,'website'); assert.equal(e.event_source_url,'https://gosteady.co/checkoutV2');
  assert.equal(e.user_data.client_ip_address,'192.0.2.1');
  assert.equal(e.user_data.client_user_agent,'Actual browser');
  assert.equal(e.user_data.fbc,payload().fbc); assert.equal(e.user_data.em,undefined);
  assert.equal(e.custom_data.value,undefined); assert.equal(e.custom_data.device_price,199);
  assert.doesNotMatch(JSON.stringify(e), /private|forged|Purchase/);
  assert.equal([...d.records.keys()].some(k => k.startsWith('attribution/')), false, 'must not overwrite verified address attribution');
  const receipt = await d.store.get('receipts/live/offer_offer-fixture-123');
  assert.equal(receipt.state,'sent'); assert.equal(receipt.event,undefined);
});

test('offer conversion deduplicates repeats and concurrent requests', async () => {
  const d = setup(); await Promise.all([run(d), run(d), run(d)]);
  assert.equal(d.sent.length,1);
  assert.equal((await run(d)).status,200); assert.equal(d.sent.length,1);
});

test('offer transport failure persists a retry with the same ID for the hourly delivery job', async () => {
  const d = setup(); const send = d.send;
  d.send = async () => { throw Error('offline'); };
  assert.equal((await run(d)).status,503);
  const record = await d.store.get('receipts/live/offer_offer-fixture-123');
  assert.equal(record.state,'retry'); assert.equal(record.event.event_id,'offer_offer-fixture-123');
  d.send = send; await deliverOnce(record.event,d,{test:record.test});
  assert.equal((await run(d)).status,200); assert.equal(d.sent.length,1);
});

for (const [name, data, headers, options, expected] of [
  ['GET', {}, {}, {method:'GET'},405],
  ['cross-origin', {}, {origin:'https://example.com'}, {},403],
  ['missing origin', {}, {origin:''}, {},403],
  ['cross-site', {}, {'sec-fetch-site':'cross-site'}, {},403],
  ['wrong content type', {}, {'content-type':'text/plain'}, {},415],
  ['invalid JSON', {}, {}, {raw:'{broken'},400],
  ['oversized body', {}, {}, {raw:'x'.repeat(4100)},413],
  ['invalid checkout ID', {checkout_id:'../x'}, {}, {},400],
  ['invalid source', {source_url:'https://elsewhere.com/checkoutV2'}, {}, {},400],
  ['local source', {source_url:'http://localhost/checkoutV2'}, {}, {},400],
  ['homepage source', {source_url:'https://gosteady.co/'}, {}, {},400],
  ['foreign referrer', {}, {referer:'https://elsewhere.com'}, {},403],
  ['stale event', {event_time:NOW-7201}, {}, {},400],
  ['future event', {event_time:NOW+61}, {}, {},400],
  ['GPC', {}, {'sec-gpc':'1'}, {},204],
  ['body opt-out', {meta_opt_out:'true'}, {}, {},204],
  ['boolean opt-out', {meta_opt_out:true}, {}, {},204],
  ['QA traffic', {}, {referer:'https://gosteady.co/checkoutV2?utm_source=qa'}, {},204],
  ['preview deployment host', {}, {}, {url:'https://preview.netlify.app/.netlify/functions/offer-accepted'},403],
]) test(`${name} cannot create a live offer conversion`, async () => {
  const d = setup(); assert.equal((await run(d,request(data,headers,options))).status, expected);
  assert.equal(d.sent.length,0);
});

test('disabled integration and anonymous requests lacking any matching data do not report', async () => {
  const d = setup(); d.config.enabled=false;
  assert.equal((await run(d)).status,204); assert.equal(d.sent.length,0);
  d.config.enabled=true;
  assert.equal((await run(d,request({fbp:'',fbc:''}),{})).status,400);
  assert.equal(d.sent.length,0);
  assert.equal((await run(d,request({fbp:'',fbc:''}))).status,200, 'trusted IP plus browser works without cookies');
});

test('explicitly configured QA checkout is isolated into Meta Test Events', async () => {
  const d = setup(); d.config.testCheckoutId='offer-fixture-123'; d.config.testCode='TEST-FIXTURE';
  assert.equal((await run(d,request({}, {referer:'https://gosteady.co/checkoutV2?utm_source=qa'}))).status,200);
  assert.equal(d.sent[0].test,true);
  assert.ok(d.records.has('receipts/test/offer_offer-fixture-123'));
  assert.equal(d.records.has('receipts/live/offer_offer-fixture-123'),false);
});
