import conversions from '../../server/conversions.cjs';
import { dependencies } from '../../server/runtime.mjs';

export default async function handler(request, context) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const config = conversions.runtimeConfig();
  if (!config.liveSecret && !config.testSecret) return new Response('Not configured', { status: 503 });
  const body = await request.text();
  if (body.length > 1_000_000) return new Response('Payload too large', { status: 413 });
  let event;
  try {
    event = conversions.verifyStripe(body, request.headers.get('stripe-signature'), config);
  } catch (_) { return new Response('Invalid signature', { status: 400 }); }
  try {
    const result = await conversions.processPayment(event, dependencies(context));
    console.log('Deposit conversion:', result);
    return Response.json({ received: true, result });
  } catch (error) {
    console.error('Deposit conversion delivery failed; Stripe should retry.', error.message);
    return new Response('Delivery temporarily unavailable', { status: 503 });
  }
}
