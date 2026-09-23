import conversions from '../../server/conversions.cjs';
import { dependencies } from '../../server/runtime.mjs';

// Netlify authenticates platform form events before invoking this reserved handler.
// Filename convention also works with the site's existing deployment toolchain.
export default async function handler(request, context) {
  const { payload } = await request.json();
  const data = { ...payload.data, 'form-name': payload.form_name || payload.data?.['form-name'] };
  const result = await conversions.processAddress(data, dependencies(context));
  console.log('Address conversion:', result);
}
