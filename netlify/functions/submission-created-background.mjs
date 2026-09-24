import conversions from '../../server/conversions.cjs';
import reddit from '../../server/reddit-conversions.cjs';
import { dependencies, redditDependencies } from '../../server/runtime.mjs';

// Netlify authenticates platform form events before invoking this reserved handler.
// Filename convention also works with the site's existing deployment toolchain.
export default async function handler(request, context) {
  const { payload } = await request.json();
  const data = { ...payload.data, 'form-name': payload.form_name || payload.data?.['form-name'] };
  const outcomes = await Promise.allSettled([
    conversions.processAddress(data, dependencies(context)),
    reddit.processAddress(data, await redditDependencies(context))
  ]);
  if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('Address conversion delivery pending');
  const result = { meta: outcomes[0].value, reddit: outcomes[1].value };
  console.log('Address conversion:', result);
}
