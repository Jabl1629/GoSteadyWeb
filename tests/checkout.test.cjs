const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise each page's actual checkout script with isolated DOM/network adapters.
// No requests, analytics events, or payments leave this test process.
function checkout(file, { failForms = false, search = '', paymentLink } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  let script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  if (paymentLink) script = script.replace(/const PAYMENT_LINK_URL = '[^']+';/,
    `const PAYMENT_LINK_URL = ${JSON.stringify(paymentLink)};`);
  const elements = new Map();
  function element(id, classes = '') {
    if (elements.has(id)) return elements.get(id);
    const tokens = new Set(classes.split(/\s+/));
    const e = { id, value: '', textContent: '', disabled: false, dataset: {}, listeners: {},
      classList: { add: x => tokens.add(x), remove: x => tokens.delete(x), contains: x => tokens.has(x) },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild() {}, insertBefore() {}, replaceWith() {} };
    elements.set(id, e); return e;
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    element(match[1], match[0].match(/class="([^"]*)"/)?.[1] || '');
  }
  element('email').value = 'review@example.com';
  const requests = [], events = [];
  const location = { hostname: 'gosteady.co', search, href: 'https://gosteady.co/checkoutV2'+search };
  const storage = new Map();
  const sandbox = {
    URL, URLSearchParams, crypto: { randomUUID: () => 'review-checkout-uuid' },
    window: { location, crypto: {}, scrollTo() {} },
    document: { referrer: '', getElementById: id => elements.get(id) || null,
      querySelector: () => element('preorder-content'), createElement: () => element('new') },
    sessionStorage: { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k) },
    FormData: class extends URLSearchParams { constructor() { super({email:'review@example.com'}); } },
    plausible: (...args) => events.push(['plausible', ...args]),
    fbq: (...args) => events.push(['meta', ...args]),
    fetch: async (url, options) => { requests.push(new URLSearchParams(options.body)); return {ok:!failForms}; }
  };
  vm.runInNewContext(script, sandbox);
  return { elements, requests, events, location,
    async act(id, type = 'click') {
      elements.get(id).listeners[type].call(elements.get(id), {preventDefault(){}});
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

for (const file of ['checkout.html', 'checkout-v2.html']) {
  test(`${file}: address submission reveals deposit and balance without recording a purchase`, async () => {
    const c = checkout(file, {search:'?reserved=1&session_id=forged'});
    assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), false);
    assert.equal(c.elements.get('deposit-summary').classList.contains('hidden'), true);
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), true);
    for (const id of ['preorder-step','deposit-summary','balance-summary','preorder-bonus'])
      assert.equal(c.elements.get(id).classList.contains('hidden'), false);
    assert.equal(c.events.some(e => e.includes('Purchase') || e.some(v => typeof v === 'string' && v.includes('Preorder Completed'))), false);
  });
  test(`${file}: failed address capture preserves address step`, async () => {
    const c = checkout(file, {failForms:true});
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('shipping-error').classList.contains('show'), true);
    assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), true);
    assert.equal(c.elements.get('shipping-submit').disabled, false);
  });
  test(`${file}: reservation opens live checkout with deposit metadata and reference`, async () => {
    const c = checkout(file);
    await c.act('continue-payment');
    const url = new URL(c.location.href);
    assert.equal(url.origin+url.pathname, 'https://buy.stripe.com/7sY7sN1wae664qz2x6bsc01');
    assert.equal(url.searchParams.get('client_reference_id'), 'review-checkout-uuid');
    assert.equal(url.searchParams.get('prefilled_email'), 'review@example.com');
    assert.equal(c.requests[0].get('deposit_amount'), '49');
    assert.equal(c.requests[0].get('balance_due'), '50');
    assert.equal(c.requests[0].get('device_price'), '99');
    assert.equal(c.requests[0].get('preorder_bonus_months'), '2');
    const event = c.events.find(e => e.includes('AddPaymentInfo'));
    assert.equal(event.at(-1).value, 49);
    assert.equal(c.events.some(e => e.includes('Purchase')), false);
  });
  test(`${file}: analytics capture failure does not block Stripe`, async () => {
    const c = checkout(file, {failForms:true});
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).hostname, 'buy.stripe.com');
  });
  test(`${file}: sandbox link cannot be used by the public checkout`, async () => {
    const c = checkout(file, {paymentLink:'https://buy.stripe.com/test_example'});
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).hostname, 'gosteady.co');
    assert.equal(c.elements.get('payment-error').classList.contains('show'), true);
    assert.equal(c.elements.get('continue-payment').disabled, false);
  });
  test(`${file}: notification choice remains a lead, not a paid reservation`, async () => {
    const c = checkout(file);
    await c.act('notify-button');
    assert.equal(c.requests[0].get('choice'), 'notify_when_available');
    assert.equal(c.elements.get('notify-confirmation').classList.contains('hidden'), false);
    assert.equal(c.events.some(e => e.includes('Lead')), true);
    assert.equal(c.events.some(e => e.includes('Purchase')), false);
  });
}
