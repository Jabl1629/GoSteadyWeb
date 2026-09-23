import { getStore } from '@netlify/blobs';
import conversions from './conversions.cjs';
export function dependencies(context) {
  const config = conversions.runtimeConfig(process.env, context.deploy.context);
  return {
    config,
    store: getStore({ name: 'gosteady-conversions', consistency: 'strong' }),
    now: () => Math.floor(Date.now() / 1000),
    send: (event, test) => conversions.sendToMeta(event, config, fetch, test)
  };
}
