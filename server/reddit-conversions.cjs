const common = require('./conversions.cjs');
const FORMS = new Set(['cupholder-shipping-intent', 'cupholder-v2-shipping-intent']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,200}$/.test(value);
const validClick = value => typeof value === 'string' && /^[A-Za-z0-9._~-]{1,512}$/.test(value);
function runtimeConfig(env = process.env, context) {
  return {
    enabled: context === 'production' && env.REDDIT_CAPI_ENABLED === 'true',
    token: env.REDDIT_CAPI_ACCESS_TOKEN, pixel: 'a2_jqogsii64m2e',
    testId: env.REDDIT_TEST_EVENT_ID, testCheckoutId: env.REDDIT_TEST_CHECKOUT_ID,
    testLinks: new Set((env.STRIPE_TEST_PAYMENT_LINK_IDS || '').split(',').filter(Boolean))
  };
}
function matchingData(data) {
  const user = {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) {
    const [local, domain] = email.split('@');
    user.email = common.hash(local.split('+')[0].replaceAll('.', '') + '@' + domain);
  }
  if (typeof data.reddit_uuid === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(data.reddit_uuid)) user.uuid = data.reddit_uuid;
  if (typeof data.client_user_agent === 'string' && data.client_user_agent.length <= 1024) user.user_agent = data.client_user_agent;
  return { user, ...(validClick(data.rdt_cid) ? { click_id: data.rdt_cid } : {}) };
}
// A small internal envelope lets Reddit reuse the tested durable lease/receipt code.
function envelope(name, id, time, source, match, metadata = {}) {
  return { event_name: name, event_id: id, event_time: time, payload: {
    event_at: time * 1000, action_source: 'WEBSITE', event_source_url: source,
    type: name === 'Purchase' ? { tracking_type: 'PURCHASE' } : { tracking_type: 'CUSTOM', custom_event_name: name },
    ...match, metadata: { ...metadata, conversion_id: id }
  } };
}
async function sendToReddit(event, config, fetcher = fetch, test = false) {
  if (!config.token || !/^a2_[a-z0-9]+$/.test(config.pixel)) throw new Error('Reddit configuration incomplete');
  if (test && !config.testId) throw new Error('Reddit test destination is not configured');
  const body = { data: { events: [event.payload], ...(test ? { test_id: config.testId } : {}) } };
  const response = await fetcher(`https://ads-api.reddit.com/api/v3/pixels/${config.pixel}/conversion_events`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.data?.message !== 'Successfully processed 1 conversion events.')
    throw new Error(`Reddit delivery failed (HTTP ${response.status})`);
}
async function processAddress(data, deps) {
  if (!deps.config.enabled || !FORMS.has(data['form-name']) || data['bot-field'] || !validId(data.checkout_id)) return 'ignored';
  const source = common.sourceURL(data.source_url);
  if (!source) return 'ignored';
  const key = `attribution/${data.checkout_id}`;
  if (data.reddit_opt_out === 'true' || data.meta_opt_out === 'true') {
    await deps.store.setJSON(key, { opt_out: true, created_at: deps.now() });
    return 'opted-out';
  }
  const match = matchingData(data);
  if (!match.user.email) return 'ignored';
  await deps.store.setJSON(key, { match, source_url: source, created_at: deps.now() }, { onlyIfNew: true });
  const stored = await deps.store.get(key, { type: 'json', consistency: 'strong' });
  if (stored.opt_out) return 'opted-out';
  const test = !!deps.config.testCheckoutId && data.checkout_id === deps.config.testCheckoutId;
  return common.deliverOnce(envelope('AddressCompleted', `shipping_${data.checkout_id}`, stored.created_at, source, stored.match), deps, { test });
}
async function processPayment(event, deps) {
  if (!deps.config.enabled) return 'disabled';
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return 'ignored';
  const session = event.data.object, test = !event.livemode;
  const links = test ? deps.config.testLinks : common.LIVE_LINKS;
  if (session.object !== 'checkout.session' || session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.status !== 'complete' || !links.has(session.payment_link) || session.amount_total !== 4900 ||
      session.currency !== 'usd' || !validId(session.id)) return 'ignored';
  if (test && !deps.config.testId) throw new Error('Reddit sandbox reporting is disabled');
  let record = validId(session.client_reference_id)
    ? await deps.store.get(`attribution/${session.client_reference_id}`, { type: 'json', consistency: 'strong' }) : null;
  // Existing pre-integration checkouts have no Reddit record. The shared Meta
  // attribution store preserves their opt-out without requiring backfill events.
  if (!record && validId(session.client_reference_id) && deps.legacyStore)
    record = await deps.legacyStore.get(`attribution/${session.client_reference_id}`, { type: 'json', consistency: 'strong' });
  if (validId(session.client_reference_id) && !record) throw new Error('Waiting for address attribution');
  if (record?.opt_out) return 'opted-out';
  if (record && deps.now() - record.created_at > 90 * 86400) record = null;
  const email = matchingData({ email: session.customer_details?.email }).user;
  const match = { ...record?.match, user: { ...record?.match?.user, ...email } };
  if (!match.user.email && !match.user.uuid && !match.click_id) throw new Error('No Reddit matching data');
  return common.deliverOnce(envelope('Purchase', `deposit_${session.id}`, event.created,
    record?.source_url || 'https://gosteady.co/checkoutV2', match,
    { currency: 'USD', value: 49, item_count: 1, products: [{ id: 'gosteady-reservation', name: 'GoSteady refundable reservation deposit' }] }), deps, { test });
}
module.exports = { runtimeConfig, matchingData, envelope, sendToReddit, processAddress, processPayment };
