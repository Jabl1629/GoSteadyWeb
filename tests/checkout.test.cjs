const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise each page's actual checkout script with isolated DOM/network adapters.
// No requests, analytics events, or payments leave this test process.
function checkout(file, { failForms = false, failAnalytics = false, failStorage = false, search = '', paymentLink, hostname = 'gosteady.co', validForm = true, storedPlan } = {}) {
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
      setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild() {}, insertBefore() {}, replaceWith() {}, reportValidity() { return validForm; } };
    elements.set(id, e); return e;
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    element(match[1], match[0].match(/class="([^"]*)"/)?.[1] || '');
  }
  element('email').value = 'review@example.com';
  const requests = [], events = [];
  element('plan-monthly').value = 'monthly';
  element('plan-annual').value = 'annual';
  const location = { hostname, search, href: 'https://gosteady.co/checkoutV2'+search };
  const storage = new Map(storedPlan ? [['gosteady-service-plan', storedPlan]] : []);
  const sandbox = {
    URL, URLSearchParams, crypto: { randomUUID: () => 'review-checkout-uuid' },
    window: { location, crypto: {}, scrollTo() {} },
    document: { referrer: '', getElementById: id => elements.get(id) || null,
      querySelector: () => element('preorder-content'), createElement: () => element('new') },
    sessionStorage: { setItem: (k,v) => { if (failStorage) throw Error('Storage blocked'); storage.set(k,v); }, getItem: k => { if (failStorage) throw Error('Storage blocked'); return storage.get(k); } },
    FormData: class extends URLSearchParams { constructor() { super({email:'review@example.com'}); } },
    plausible: (...args) => { if (failAnalytics) throw Error('Analytics blocked'); events.push(['plausible', ...args]); },
    fbq: (...args) => { if (failAnalytics) throw Error('Analytics blocked'); events.push(['meta', ...args]); },
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

// Legacy page stays covered while its public URLs redirect to V2.
for (const file of ['checkout.html']) {
  test(`${file}: address submission reveals deposit and balance without recording a purchase`, async () => {
    const c = checkout(file, {search:'?reserved=1&session_id=forged'});
    assert.equal(c.elements.get('plan-step').classList.contains('hidden'), false);
    await c.act('continue-delivery');
    assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), false);
    assert.equal(c.elements.get('deposit-summary').classList.contains('hidden'), true);
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), true);
    const visibleAfterAddress = ['preorder-step','deposit-summary','balance-summary'];
    if (file === 'checkout.html') visibleAfterAddress.push('preorder-bonus');
    for (const id of visibleAfterAddress)
      assert.equal(c.elements.get(id).classList.contains('hidden'), false);
    assert.equal(c.events.some(e => e.includes('Purchase') || e.some(v => typeof v === 'string' && v.includes('Preorder Completed'))), false);
  });
  test(`${file}: failed address capture preserves address step`, async () => {
    const c = checkout(file, {failForms:true});
    await c.act('continue-delivery');
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('shipping-error').classList.contains('show'), true);
    assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), true);
    assert.equal(c.elements.get('shipping-submit').disabled, false);
  });
  test(`${file}: reservation opens live checkout with deposit metadata and reference`, async () => {
    const c = checkout(file);
    await c.act('continue-payment');
    const url = new URL(c.location.href);
    assert.equal(url.origin+url.pathname, 'https://buy.stripe.com/cNi14p4Im3rs3mv7Rqbsc03');
    assert.equal(url.searchParams.get('client_reference_id'), 'review-checkout-uuid');
    assert.equal(url.searchParams.get('prefilled_email'), 'review@example.com');
    assert.equal(c.requests[0].get('deposit_amount'), '49');
    assert.equal(c.requests[0].get('balance_due'), '150');
    assert.equal(c.requests[0].get('device_price'), '199');
    assert.equal(c.requests[0].get('offer_version'), 'founding_family_199_2026_09');
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
  test(`${file}: annual terms and attribution persist through delivery into the annual Stripe checkout`, async () => {
    const c = checkout(file, {search:'?utm_source=facebook&utm_content=founder'});
    c.elements.get('plan-annual').checked = true;
    await c.act('plan-annual', 'change');
    await c.act('continue-delivery');
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('monthly-price').textContent, 'Then $200/yr');
    if (file === 'checkout.html') {
      assert.match(c.elements.get('service-billing-note').textContent, /first two months.*free.*Then \$200/);
    } else {
      assert.match(c.elements.get('service-summary-detail').textContent, /Billed annually.*cancel renewal/);
      const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      assert.match(html, /class="summary-free-offer">\s*<strong>First 2 months free<\/strong>\s*<p>Your free service starts when you activate your device\.<\/p>/);
    }
    await c.act('back-to-delivery');
    await c.act('back-to-plan');
    assert.equal(c.elements.get('plan-annual').checked, true);
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).pathname, '/dRm6oJ1waaTU4qz0oYbsc04');
    assert.equal(c.requests[0].get('service_plan'), 'annual');
    assert.equal(c.requests[0].get('service_price'), '200');
    assert.equal(c.requests.at(-1).get('service_interval'), 'year');
    assert.equal(c.requests.at(-1).get('utm_content'), 'founder');
    assert.equal(c.requests.at(-1).get('utm_source'), 'facebook');
    assert.equal(c.requests.at(-1).get('flow_version'), 'plans_2026_09');
  });
  test(`${file}: local design preview cannot create a live payment`, async () => {
    const c = checkout(file, {hostname:'127.0.0.1'});
    await c.act('continue-payment');
    assert.match(c.elements.get('payment-error').textContent, /Preview complete/);
    assert.equal(c.requests.length, 0);
    assert.equal(c.events.some(e => e.includes('AddPaymentInfo')), false);
  });
  test(`${file}: plan and delivery goals describe the visible step and deduplicate back navigation`, async () => {
    const c = checkout(file);
    const prefix = file === 'checkout-v2.html' ? 'V2 ' : '';
    const count = name => c.events.filter(e => e[0] === 'plausible' && e[1] === prefix + name).length;
    assert.equal(count('Plan Viewed'), 1);
    assert.equal(count('Checkout Started'), 0);
    await c.act('continue-delivery');
    await c.act('back-to-plan');
    await c.act('continue-delivery');
    assert.equal(count('Checkout Started'), 1);
    assert.equal(count('Monthly Plan Continued'), 1);
    await c.act('shipping-form', 'submit');
    await c.act('back-to-delivery');
    await c.act('shipping-form', 'submit');
    assert.equal(c.events.filter(e => e.includes('AddShippingInfo')).length, 1);
    const metaShipping = c.events.find(e => e.includes('AddShippingInfo'));
    assert.equal(metaShipping[4].eventID, 'shipping_review-checkout-uuid');
    assert.equal(metaShipping[3].value, 199);
    assert.equal(metaShipping[3].offer_version, 'founding_family_199_2026_09');
    assert.equal(c.requests[0].get('device_price'), '199');
    assert.equal(c.requests[0].get('offer_version'), 'founding_family_199_2026_09');
    assert.equal(count('Monthly Details Submitted'), 1);
    assert.equal(c.events.some(e => JSON.stringify(e).includes('review@example.com')), false);
  });
  test(`${file}: analytics and storage failures do not prevent address capture or payment`, async () => {
    const c = checkout(file, {failAnalytics:true, failStorage:true});
    await c.act('continue-delivery');
    await c.act('shipping-form', 'submit');
    assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), false);
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).hostname, 'buy.stripe.com');
  });
  test(`${file}: switching back to monthly updates the saved choice and prevents duplicate handoffs`, async () => {
    const c = checkout(file);
    c.elements.get('plan-annual').checked = true;
    await c.act('plan-annual', 'change');
    c.elements.get('plan-monthly').checked = true;
    await c.act('plan-monthly', 'change');
    await c.act('continue-payment');
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).pathname, '/cNi14p4Im3rs3mv7Rqbsc03');
    assert.equal(c.requests.length, 1);
    assert.equal(c.requests[0].get('service_plan'), 'monthly');
    assert.equal(c.requests[0].get('service_price'), '20');
  });
}


const mergedFile = 'checkout-v2.html';
async function saveAddress(c) { await c.act('shipping-form', 'submit'); }
function countMeta(c, name) { return c.events.filter(e => e[0] === 'meta' && e[2] === name).length; }

test('merged checkout opens at delivery without counting a completed address or purchase', () => {
  const c = checkout(mergedFile, {search:'?reserved=1&session_id=forged'});
  assert.equal(c.elements.has('plan-step'), false);
  assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), false);
  assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), true);
  assert.equal(countMeta(c, 'InitiateCheckout'), 1);
  assert.equal(countMeta(c, 'AddShippingInfo'), 0);
  assert.equal(countMeta(c, 'Purchase'), 0);
  assert.equal(c.events.filter(e => e[0] === 'plausible' && e[1] === 'V2 Checkout Started').length, 1);
});

test('merged checkout only counts a saved address after revealing payment and deduplicates resubmission', async () => {
  const c = checkout(mergedFile, {search:'?utm_source=facebook&utm_content=founder'});
  await saveAddress(c);
  assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), true);
  assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), false);
  assert.equal(c.elements.get('payment-progress')['aria-current'], 'step');
  assert.equal(c.elements.get('delivery-progress')['aria-current'], undefined);
  assert.equal(c.elements.get('deposit-summary').classList.contains('hidden'), false);
  assert.equal(c.elements.get('balance-summary').classList.contains('hidden'), false);
  assert.equal(countMeta(c, 'AddShippingInfo'), 1);
  const event = c.events.find(e => e[2] === 'AddShippingInfo');
  assert.equal(event[1], 'trackCustom');
  assert.equal(event[4].eventID, 'shipping_review-checkout-uuid');
  assert.equal(event[3].flow_version, 'delivery_monthly_2026_09_30');
  assert.equal(event[3].value, 199);
  assert.equal(countMeta(c, 'Purchase'), 0);
  await c.act('back-to-delivery');
  assert.equal(c.elements.get('delivery-progress')['aria-current'], 'step');
  await saveAddress(c);
  assert.equal(countMeta(c, 'AddShippingInfo'), 1);
  assert.equal(c.events.some(e => JSON.stringify(e).includes('review@example.com')), false);
});

for (const [name, options] of [['invalid fields', {validForm:false}], ['failed save', {failForms:true}]]) {
  test(`merged checkout: ${name} cannot reach payment or emit a completed-address event`, async () => {
    const c = checkout(mergedFile, options);
    await saveAddress(c);
    assert.equal(c.elements.get('shipping-step').classList.contains('hidden'), false);
    assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), true);
    assert.equal(countMeta(c, 'AddShippingInfo'), 0);
    assert.equal(c.elements.get('shipping-submit').disabled, false);
    if (options.validForm === false) assert.equal(c.requests.length, 0);
    else assert.equal(c.elements.get('shipping-error').classList.contains('show'), true);
  });
}

test('merged checkout ignores an old annual selection and uses monthly terms through Stripe', async () => {
  const c = checkout(mergedFile, {storedPlan:'annual',search:'?utm_source=facebook&utm_content=founder'});
  await saveAddress(c);
  assert.equal(c.elements.get('monthly-price').textContent, 'Then $20/mo');
  assert.equal(c.requests[0].get('service_plan'), 'monthly');
  assert.equal(c.requests[0].get('service_interval'), 'month');
  assert.equal(c.requests[0].get('service_price'), '20');
  assert.equal(c.requests[0].get('annual_price'), '');
  await c.act('continue-payment');
  await c.act('continue-payment');
  const url = new URL(c.location.href);
  assert.equal(url.origin + url.pathname, 'https://buy.stripe.com/cNi14p4Im3rs3mv7Rqbsc03');
  assert.equal(url.searchParams.get('client_reference_id'), 'review-checkout-uuid');
  assert.equal(url.searchParams.get('prefilled_email'), 'review@example.com');
  assert.equal(c.requests.length, 2);
  const choice = c.requests[1];
  assert.equal(choice.get('deposit_amount'), '49');
  assert.equal(choice.get('balance_due'), '150');
  assert.equal(choice.get('preorder_bonus_months'), '2');
  assert.equal(choice.get('service_price'), '20');
  assert.equal(choice.get('flow_version'), 'delivery_monthly_2026_09_30');
  assert.equal(choice.get('utm_source'), 'facebook');
  assert.equal(choice.get('utm_content'), 'founder');
  assert.equal(countMeta(c, 'Purchase'), 0);
});

test('merged checkout cannot hand off payment or record a lead before address save', async () => {
  const c = checkout(mergedFile);
  await c.act('continue-payment');
  await c.act('notify-button');
  assert.equal(c.requests.length, 0);
  assert.equal(new URL(c.location.href).hostname, 'gosteady.co');
  assert.equal(countMeta(c, 'AddPaymentInfo'), 0);
  assert.equal(countMeta(c, 'Lead'), 0);
});

test('merged checkout keeps a notification request distinct from purchase', async () => {
  const c = checkout(mergedFile);
  await saveAddress(c);
  await c.act('notify-button');
  assert.equal(c.elements.get('notify-confirmation').classList.contains('hidden'), false);
  assert.equal(c.requests.at(-1).get('choice'), 'notify_when_available');
  assert.equal(countMeta(c, 'Lead'), 1);
  assert.equal(countMeta(c, 'Purchase'), 0);
});

test('merged checkout analytics and storage failures do not block address saving or payment', async () => {
  const c = checkout(mergedFile, {failAnalytics:true,failStorage:true});
  await saveAddress(c);
  assert.equal(c.elements.get('preorder-step').classList.contains('hidden'), false);
  await c.act('continue-payment');
  assert.equal(new URL(c.location.href).hostname, 'buy.stripe.com');
});

test('merged checkout protects local previews and rejects sandbox links on production', async () => {
  for (const options of [{hostname:'127.0.0.1'}, {paymentLink:'https://buy.stripe.com/test_example'}]) {
    const c = checkout(mergedFile, options);
    await saveAddress(c);
    await c.act('continue-payment');
    assert.equal(new URL(c.location.href).hostname, 'gosteady.co');
    assert.equal(c.elements.get('payment-error').classList.contains('show'), true);
    assert.equal(countMeta(c, 'AddPaymentInfo'), 0);
    if (options.hostname) assert.equal(c.requests.length, 0);
  }
});
