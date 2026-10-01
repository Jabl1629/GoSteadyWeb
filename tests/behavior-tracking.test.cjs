const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../Assets/behavior-tracking.js'), 'utf8');

// Isolated DOM, observers and timers: no visitor data, network or live events.
function page(options = {}) {
  const ids = ['plan-step', 'shipping-step', 'preorder-step', 'notify-confirmation',
    'continue-delivery', 'plan-monthly', 'plan-annual', 'shipping-form', 'email',
    'shipping-error', 'payment-error', 'continue-payment', 'notify-button'];
  function target(id) {
    const listeners = {}, classes = new Set();
    return { id, listeners, classes, attributes: {}, checked: false,
      classList: { contains: value => classes.has(value) },
      addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
      emit(type, event = {}) { (listeners[type] || []).forEach(fn => fn(event)); },
      setAttribute(name, value) { this.attributes[name] = value; } };
  }
  const nodes = Object.fromEntries(ids.map(id => [id, target(id)]));
  ['shipping-step', 'preorder-step', 'notify-confirmation'].forEach(id => nodes[id].classes.add('hidden'));
  if (options.combined) {
    delete nodes['plan-step'];
    delete nodes['continue-delivery'];
    delete nodes['plan-monthly'];
    delete nodes['plan-annual'];
    nodes['shipping-step'].classes.delete('hidden');
  }
  if (options.offer) {
    delete nodes['plan-step']; delete nodes['continue-delivery'];
    nodes['offer-step'] = target('offer-step'); nodes['continue-address'] = target('continue-address');
  }
  nodes.email.value = 'private-customer@example.com';
  const document = Object.assign(target('document'), {
    visibilityState: 'visible',
    currentScript: { getAttribute: () => 'testproject' },
    getElementById: id => nodes[id] || null,
    querySelectorAll: selector => selector.includes('input') ? [nodes.email] : [],
    createElement: () => ({}),
    head: { appendChild(script) {
      assert.equal(nodes.email.attributes['data-clarity-mask'], 'true', 'mask before recorder loads');
      scripts.push(script);
    } }
  });
  const scripts = [], events = [], observers = [], timers = new Map();
  let now = 0, timerId = 0, intersection;
  const session = options.session || new Map(), local = options.local || new Map();
  function storage(map) { return {
    getItem(key) { if (options.blockStorage) throw Error('blocked'); return map.get(key); },
    setItem(key, value) { if (options.blockStorage) throw Error('blocked'); map.set(key, value); }
  }; }
  const window = Object.assign(target('window'), {
    location: { hostname: 'gosteady.co', pathname: '/checkoutV2', search: '', ...options.location },
    navigator: options.navigator || {}, sessionStorage: storage(session), localStorage: storage(local),
    plausible(...args) { if (options.failAnalytics) throw Error('blocked'); events.push(args); },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, {fn, at: now + ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; this.nodes = []; observers.push(this); }
      observe(node) { this.nodes.push(node); }
    }
  });
  if (options.failAnalytics) window.clarity = () => { throw Error('blocked'); };
  vm.runInNewContext(source, { window, document, URLSearchParams, Set });
  return {window, document, nodes, scripts, events, session,
    replay: () => Array.from(window.clarity?.q || [], args => Array.from(args)),
    mutate(id) { observers.filter(observer => observer.nodes.includes(nodes[id])).forEach(observer => observer.fn()); },
    view(ratio) { intersection([{isIntersecting: ratio > 0, intersectionRatio: ratio}]); },
    advance(ms) { now += ms; [...timers].forEach(([id, timer]) => { if (timer.at <= now) { timers.delete(id); timer.fn(); } }); },
    delivery() { nodes['plan-step'].classes.add('hidden'); nodes['shipping-step'].classes.delete('hidden'); this.mutate('shipping-step'); }
  };
}

test('recordings exclude previews, private pages, QA, sensitive URLs and privacy opt-outs', () => {
  for (const options of [
    {location: {hostname: 'localhost'}}, {location: {pathname: '/userdemo/'}},
    {location: {search: '?utm_source=qa'}}, {location: {search: '?utm_medium=test'}},
    {location: {search: '?prefilled_email=private%40example.com'}},
    {location: {search: '?utm_content=private%40example.com'}},
    {location: {search: '?session_id=private-reference'}},
    {navigator: {globalPrivacyControl: true}}, {navigator: {doNotTrack: '1'}},
    {local: new Map([['gosteady-replay-opt-out', '1']])},
  ]) {
    const p = page(options);
    assert.equal(p.scripts.length, 0, JSON.stringify(options));
    assert.equal(p.events.length, 0);
  }
  const first = page({location: {search: '?qa=1'}});
  assert.equal(page({session: first.session}).scripts.length, 0, 'QA exclusion persists across pages');
  assert.equal(page({blockStorage: true, location: {search: '?qa=1'}}).scripts.length, 0);
});

test('public checkout masks inputs before recording and records actual step transitions', () => {
  const p = page({blockStorage: true});
  assert.equal(p.scripts.length, 1);
  assert.equal(p.scripts[0].src, 'https://www.clarity.ms/tag/testproject');
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'plan_viewed'));
  p.delivery();
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'delivery_viewed'));
  assert.equal(p.events.length, 0, 'existing stage goals are not duplicated');
  assert.equal(p.document.listeners.scroll, undefined, 'existing scroll tracking is sufficient');
});

test('delivery CTA exposure requires a visible second, cancels on exit and only counts once', () => {
  const p = page();
  p.view(0.49); p.advance(2000);
  assert.equal(p.events.length, 0);
  p.view(1); p.advance(999);
  assert.equal(p.events.length, 0);
  p.document.visibilityState = 'hidden'; p.document.emit('visibilitychange'); p.advance(2000);
  assert.equal(p.events.length, 0);
  p.document.visibilityState = 'visible'; p.document.emit('visibilitychange'); p.advance(500);
  p.view(0); p.advance(2000);
  assert.equal(p.events.length, 0);
  p.view(1); p.advance(1000);
  assert.equal(p.events[0][0], 'V2 Delivery Button Seen');
  p.view(0); p.view(1); p.advance(2000);
  assert.equal(p.events.length, 1);
  const other = page(); other.view(1); other.delivery(); other.advance(2000);
  assert.equal(other.events.length, 0, 'leaving plan page cancels pending exposure');
});

test('form interaction and errors send only fixed milestones and allowlisted field IDs', () => {
  const p = page();
  const form = p.nodes['shipping-form'];
  form.emit('input', {target: p.nodes.email});
  assert.equal(p.events.length, 0, 'hidden address form does not count');
  p.delivery();
  form.emit('focus', {target: p.nodes.email});
  assert.equal(p.events.length, 0, 'focus alone is not form entry');
  form.emit('input', {target: p.nodes.email}); form.emit('change', {target: p.nodes.email});
  assert.equal(p.events.filter(e => e[0] === 'V2 Address Form Started').length, 1);
  form.emit('invalid', {target: {id: 'private-customer@example.com'}});
  form.emit('invalid', {target: p.nodes.email});
  assert.equal(p.events.at(-1)[1].props.field, 'email');
  p.nodes['shipping-error'].textContent = 'private-customer@example.com cannot be saved';
  p.nodes['shipping-error'].classes.add('show'); p.mutate('shipping-error');
  p.window.emit('error', {message: 'private-customer@example.com exception'});
  assert.ok(p.events.some(e => e[0] === 'V2 Address Save Error'));
  assert.ok(p.events.some(e => e[0] === 'V2 Browser Error'));
  assert.doesNotMatch(JSON.stringify([p.replay(), p.events]), /private-customer|cannot be saved|exception/);
});

test('broken recorder and analytics never interrupt checkout interaction listeners', () => {
  const p = page({failAnalytics: true});
  assert.doesNotThrow(() => {
    p.nodes['continue-delivery'].emit('click'); p.delivery();
    p.nodes['shipping-form'].emit('input', {target: p.nodes.email});
    p.nodes['continue-payment'].emit('click');
  });
});

test('combined checkout starts in delivery and only records genuine form entry', () => {
  const p = page({combined: true});
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'delivery_viewed'));
  assert.equal(p.replay().some(e => e[1] === 'plan_viewed'), false);
  p.nodes.email.value = '';
  p.nodes['shipping-form'].emit('input', {target:p.nodes.email});
  assert.equal(p.events.length, 0);
  p.nodes.email.value = 'private-customer@example.com';
  p.nodes['shipping-form'].emit('change', {target:p.nodes.email});
  assert.equal(p.events.filter(e => e[0] === 'V2 Address Form Started').length, 1);
  p.nodes['shipping-step'].classes.add('hidden');
  p.nodes['preorder-step'].classes.delete('hidden');
  p.mutate('preorder-step');
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'reservation_viewed'));
  assert.doesNotMatch(JSON.stringify([p.replay(), p.events]), /private-customer/);
});


test('three-step offer flow records separate offer and address views without early form entry', () => {
  const p = page({offer:true});
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'offer_viewed'));
  p.nodes['shipping-form'].emit('input', {target:p.nodes.email});
  assert.equal(p.events.length,0);
  p.nodes['continue-address'].emit('click');
  p.nodes['offer-step'].classes.add('hidden'); p.nodes['shipping-step'].classes.delete('hidden');
  p.mutate('shipping-step');
  assert.ok(p.replay().some(e => e[0] === 'event' && e[1] === 'delivery_viewed'));
  p.nodes['shipping-form'].emit('input', {target:p.nodes.email});
  assert.equal(p.events.filter(e => e[0] === 'V2 Address Form Started').length,1);
});
