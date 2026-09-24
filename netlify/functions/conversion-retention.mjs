import { dependencies, redditDependencies } from '../../server/runtime.mjs';
import conversions from '../../server/conversions.cjs';

// Attribution is needed only during the reservation journey, not indefinitely.
export default async function handler(request, context) {
  for (const deps of [dependencies(context), await redditDependencies(context)]) {
    const { config, store, now } = deps;
    if (!config.enabled) continue;
    for (const prefix of ['attribution/', 'receipts/']) {
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const blob of page.blobs) {
          const record = await store.get(blob.key, { type: 'json', consistency: 'strong' });
          if (record?.event && record.until < now()) {
            if (record.event.event_time < now() - 6 * 86400) {
              // Ad platforms accept recent events only. Keep an audit marker, not matching data.
              await store.setJSON(blob.key, { state: 'expired', sent_at: now(), event_name: record.event.event_name });
              console.error('Conversion delivery expired:', blob.key);
            } else {
              await conversions.deliverOnce(record.event, deps, { test: record.test })
                .catch(error => console.error('Conversion retry failed:', error.message));
            }
            continue;
          }
          const saved = record?.created_at || record?.sent_at;
          if (saved && saved < now() - (prefix === 'attribution/' ? 90 : 400) * 86400) await store.delete(blob.key);
        }
      }
    }
  }
}
export const config = { schedule: '0 * * * *' };
