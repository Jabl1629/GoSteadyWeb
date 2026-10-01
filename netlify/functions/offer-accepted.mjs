import offer from '../../server/offer-accepted.cjs';
import { dependencies } from '../../server/runtime.mjs';

export default function handler(request, context) {
  return offer.handleOfferAccepted(request, context, dependencies);
}

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 20 }
};
