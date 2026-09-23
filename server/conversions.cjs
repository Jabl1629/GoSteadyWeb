const { createHash } = require('node:crypto');
const Stripe = require('stripe');

// Webhook verification needs only its signing secret, never a Stripe API key.
const stripe = new Stripe(undefined, {
  authenticator: async () => { throw new Error('Stripe API access is not configured'); }
});
const FORMS = new Set(['cupholder-shipping-intent', 'cupholder-v2-shipping-intent']);
// Keep the earlier offer eligible for delayed payment notifications and retries.
const LIVE_LINKS = new Set([
  'plink_1UIfmtQ2TfGTSvqAOF27Vt8v', 'plink_1UIsKMQ2TfGTSvqAa8gJbV1b',
  'plink_1UIwWXQ2TfGTSvqAuINb79n3', 'plink_1UIwWcQ2TfGTSvqACjfPpIAH'
]);
function quotedOffer(price) {
  if (String(price) === '199') return { device_price: 199, offer_version: 'founding_family_199_2026_09' };
  if (price == null || String(price) === '99') return { device_price: 99, offer_version: 'deposit_49_balance_50' };
  return null;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,200}$/.test(value);
const epoch = () => Math.floor(Date.now() / 1000);

function sourceURL(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://gosteady.co' && ['/checkout', '/checkout.html', '/checkoutV2', '/checkout-v2.html'].includes(url.pathname))
      return url.origin + url.pathname;
  } catch (_) {}
  return null;
}

function matchingData(data) {
  const result = {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) result.em = [hash(email)];
  for (const key of ['fbc', 'fbp']) {
    if (typeof data[key] === 'string' && /^fb\.\d\.\d{13}\.[A-Za-z0-9_-]{1,500}$/.test(data[key])) result[key] = data[key];
  }
  if (typeof data.client_user_agent === 'string' && data.client_user_agent.length <= 1024)
    result.client_user_agent = data.client_user_agent;
  return result;
}

function runtimeConfig(env = process.env, deployContext) {
  return {
    enabled: deployContext === 'production' && env.META_CAPI_ENABLED === 'true',
    token: env.META_CAPI_ACCESS_TOKEN,
    pixel: env.META_PIXEL_ID || '2755897781476379',
    apiVersion: env.META_GRAPH_API_VERSION || 'v24.0',
    liveSecret: env.STRIPE_WEBHOOK_SECRET,
    testSecret: env.STRIPE_TEST_WEBHOOK_SECRET,
    testCode: env.META_TEST_EVENT_CODE,
    testCheckoutId: env.META_TEST_CHECKOUT_ID,
    testLinks: new Set((env.STRIPE_TEST_PAYMENT_LINK_IDS || '').split(',').filter(Boolean))
  };
}

async function sendToMeta(event, config, fetcher = fetch, test = false) {
  if (!config.token || !/^\d+$/.test(config.pixel) || !/^v\d+\.\d+$/.test(config.apiVersion))
    throw new Error('Meta configuration incomplete');
  if (test && !config.testCode) throw new Error('Meta test destination is not configured');
  const body = { data: [event] };
  if (test) body.test_event_code = config.testCode;
  const response = await fetcher(`https://graph.facebook.com/${config.apiVersion}/${config.pixel}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  // Do not log request payloads, credentials, or Meta's potentially sensitive error body.
  if (!response.ok || result.events_received !== 1)
    throw new Error(`Meta delivery failed (HTTP ${response.status}, code ${Number(result.error?.code) || 0})`);
}

// Durable receipt + expiring lease: retries retain the same Meta event_id.
// A timeout after Meta accepted an event is safely retried with that same ID.
async function deliverOnce(event, { store, send, now = epoch }, { test = false } = {}) {
  const key = `receipts/${test ? 'test' : 'live'}/${event.event_id}`;
  const existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  if (existing?.data.state === 'sent') return 'duplicate';
  if (existing?.data.state === 'expired') return 'expired';
  if (existing?.data.until > now()) throw new Error('Event delivery already in progress');
  const lease = await store.setJSON(key, { state: 'sending', until: now() + 60, event, test },
    existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true });
  if (!lease.modified) throw new Error('Event delivery already in progress');
  try {
    await send(event, test);
    const saved = await store.setJSON(key, { state: 'sent', sent_at: now(), event_name: event.event_name }, { onlyIfMatch: lease.etag });
    if (!saved.modified) throw new Error('Delivery receipt changed');
    return 'sent';
  } catch (error) {
    await store.setJSON(key, { state: 'retry', until: 0, event, test }, { onlyIfMatch: lease.etag }).catch(() => {});
    throw error;
  }
}

async function processAddress(data, deps) {
  if (!deps.config.enabled || !FORMS.has(data['form-name']) || data['bot-field'] || !validId(data.checkout_id)) return 'ignored';
  const url = sourceURL(data.source_url);
  if (!url) return 'ignored';
  const key = `attribution/${data.checkout_id}`;
  if (data.meta_opt_out === 'true') {
    await deps.store.setJSON(key, { opt_out: true, created_at: deps.now() });
    return 'opted-out';
  }
  const userData = matchingData(data);
  if (!userData.em) return 'ignored';
  const offer = quotedOffer(data.device_price ?? data.presented_price);
  if (!offer) return 'ignored';
  const record = { user_data: userData, source_url: url, created_at: deps.now(), offer };
  await deps.store.setJSON(key, record, { onlyIfNew: true });
  const stored = await deps.store.get(key, { type: 'json', consistency: 'strong' });
  if (stored.opt_out) return 'opted-out';
  const test = !!deps.config.testCheckoutId && data.checkout_id === deps.config.testCheckoutId;
  return deliverOnce({
    event_name: 'AddShippingInfo', event_id: `shipping_${data.checkout_id}`,
    event_time: stored.created_at, action_source: 'website', event_source_url: url,
    user_data: stored.user_data,
    custom_data: { currency: 'USD', value: (stored.offer || quotedOffer()).device_price,
      ...(stored.offer || quotedOffer()), service_plan: data.service_plan === 'annual' ? 'annual' : 'monthly' }
  }, deps, { test });
}

function verifyStripe(body, signature, config) {
  for (const [secret, live] of [[config.liveSecret, true], [config.testSecret, false]]) {
    if (!secret) continue;
    try {
      const event = stripe.webhooks.constructEvent(body, signature, secret, 300);
      if (event.livemode === live && event.data?.object?.livemode === live) return event;
    } catch (_) {}
  }
  throw new Error('Invalid webhook signature or mode');
}

async function processPayment(event, deps) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return 'ignored';
  const session = event.data.object;
  const test = !event.livemode;
  const allowedLinks = test ? deps.config.testLinks : LIVE_LINKS;
  if (session.object !== 'checkout.session' || session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.status !== 'complete' || !allowedLinks.has(session.payment_link) ||
      session.amount_total !== 4900 || session.currency !== 'usd' || !validId(session.id)) return 'ignored';
  if (!deps.config.enabled) throw new Error('Conversions integration is not enabled');
  if (test && !deps.config.testCode) throw new Error('Sandbox reporting is disabled');
  let record = validId(session.client_reference_id)
    ? await deps.store.get(`attribution/${session.client_reference_id}`, { type: 'json', consistency: 'strong' }) : null;
  // Form processing can lag behind a fast payment. Retry rather than lose the
  // customer's privacy preference or attribute the payment to the wrong click.
  if (validId(session.client_reference_id) && !record) throw new Error('Waiting for address attribution');
  if (record?.opt_out) return 'opted-out';
  if (record && deps.now() - record.created_at > 90 * 86400) record = null;
  const emailData = matchingData({ email: session.customer_details?.email });
  const userData = { ...record?.user_data, ...emailData };
  if (!userData.em && !userData.fbc && !userData.fbp) throw new Error('No matching data for paid checkout');
  return deliverOnce({
    event_name: 'Purchase', event_id: `deposit_${session.id}`, event_time: event.created,
    action_source: 'website', event_source_url: record?.source_url || 'https://gosteady.co/checkoutV2',
    user_data: userData,
    custom_data: { currency: 'USD', value: 49, content_name: 'GoSteady refundable reservation deposit',
      ...quotedOffer(session.metadata?.device_price_usd),
      service_plan: session.metadata?.service_plan === 'annual' ? 'annual' : 'monthly' }
  }, deps, { test });
}

module.exports = { stripe, hash, sourceURL, matchingData, runtimeConfig, sendToMeta, deliverOnce, processAddress, verifyStripe, processPayment };
