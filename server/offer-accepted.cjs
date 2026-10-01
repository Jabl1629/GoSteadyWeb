const { isIP } = require('node:net');
const { sourceURL, matchingData, deliverOnce } = require('./conversions.cjs');

const reply = (status, body) => new Response(body ? JSON.stringify(body) : null, {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

// This is a client-reported funnel milestone, never proof of an address or sale.
// Keep the public endpoint narrowly scoped; all event names and offer fields
// are server-owned. IP comes from Netlify, not the request body/forwarded headers.
async function handleOfferAccepted(request, context, getDependencies) {
  if (request.method !== 'POST') return reply(405);
  if (new URL(request.url).origin !== 'https://gosteady.co' ||
      request.headers.get('origin') !== 'https://gosteady.co' ||
      request.headers.get('sec-fetch-site') === 'cross-site') return reply(403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415);
  if (request.headers.get('sec-gpc') === '1') return reply(204);
  const body = await request.text();
  if (body.length > 4096) return reply(413);
  let data;
  try { data = JSON.parse(body); } catch (_) { return reply(400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400);
  if (data.meta_opt_out === 'true' || data.meta_opt_out === true) return reply(204);
  if (typeof data.checkout_id !== 'string' || !/^[a-zA-Z0-9_-]{8,200}$/.test(data.checkout_id)) return reply(400);
  const source = sourceURL(data.source_url);
  if (!source || !['https://gosteady.co/checkoutV2', 'https://gosteady.co/checkout-v2.html'].includes(source)) return reply(400);
  const referrer = request.headers.get('referer');
  if (referrer && !sourceURL(referrer)) return reply(403);
  const qaURL = new URL(referrer || data.source_url);
  const qa = data.qa === true || /^(qa|test|internal)$/i.test(qaURL.searchParams.get('utm_source') || '') ||
    /^(qa|test)$/i.test(qaURL.searchParams.get('utm_medium') || '') || qaURL.searchParams.get('qa') === '1';
  const deps = getDependencies(context);
  if (!deps.config.enabled) return reply(204);
  const test = !!deps.config.testCode && !!deps.config.testCheckoutId && data.checkout_id === deps.config.testCheckoutId;
  if (qa && !test) return reply(204);
  if (!Number.isInteger(data.event_time) || data.event_time > deps.now() + 60 || data.event_time < deps.now() - 7200) return reply(400);
  const userData = matchingData({ fbp: data.fbp, fbc: data.fbc,
    client_user_agent: request.headers.get('user-agent') || '' });
  if (isIP(context.ip || '')) userData.client_ip_address = context.ip;
  if (!userData.client_user_agent || (!userData.client_ip_address && !userData.fbp && !userData.fbc)) return reply(400);
  try {
    const result = await deliverOnce({
      event_name: 'OfferAccepted', event_id: `offer_${data.checkout_id}`,
      event_time: data.event_time, action_source: 'website', event_source_url: source,
      user_data: userData,
      custom_data: { offer_version: 'founding_family_199_2026_09', device_price: 199,
        service_plan: 'monthly', flow_version: 'offer_address_payment_2026_10_01' }
    }, deps, { test });
    return reply(200, { status: result });
  } catch (_) {
    // deliverOnce persists transport failures for the existing hourly retry job.
    // If storage itself failed, return 503 so the client can retry the same ID.
    return reply(503, { status: 'pending' });
  }
}

module.exports = { handleOfferAccepted };
