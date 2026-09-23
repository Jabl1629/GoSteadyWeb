# Meta server conversion integration

Prepared September 23, 2026. Activation and live acceptance must be verified
before treating the direct integration as operational.

Release state: Meta-enabled web connection is active. This release includes
the direct integration behind `META_CAPI_ENABLED=false` in production. Both
Stripe endpoints remain disabled until the end-to-end test succeeds.
49 automated checks pass. Hosted preview checks confirm webhook GET=405, a correctly
signed unpaid sandbox fixture=200/ignored, unsigned/tampered/stale requests=400,
external form-event calls=403, and server source/package files=404. These are
signature and handler checks, not a completed sandbox payment test. The latest
preview deploy is `6ab4226ecc42f44a17bf22b3`, at
`https://conversion-qa--gosteadyweb.netlify.app`.

Meta's standard token generator returned an application error repeatedly.
The user approved the Dataset Quality API route on September 23, including
its current inability to opt out. Generating a token through that route also
failed twice with Meta's "Ouch! Something went wrong..." application error.
No token was returned or copied; Quality API activation is not yet confirmed.
The user has been asked to try the token generator in their regular browser
and save any resulting credential directly in Netlify as the production
secret `META_CAPI_ACCESS_TOKEN`.

Both Stripe endpoints now exist and are **disabled** until activation:
- Live: `we_1UIvOfQ2TfGTSvqA9Md1vGK6`.
- Sandbox: `we_1UIvNNL5ztGHn39elNEr9t6n`.

Their separate signing secrets are stored as Netlify secret variables. The
live secret is production-only; the sandbox secret is currently configured
for production, deploy-preview and branch-deploy to support testing. Manual
CLI alias deployments use the branch-deploy runtime context even when the
build is run with `--context deploy-preview`.

Remaining: obtain Meta credential, configure its token and test settings,
deploy the runtime configuration, enable the sandbox endpoint, verify address deduplication
and a sandbox payment in Meta Test Events, remove temporary test settings,
disable the sandbox endpoint and enable the live endpoint. Then record final
activation details here. Ads remain unpublished.

## Connections and cost

Dataset: GoSteady Waitlist (`2755897781476379`). Meta-enabled Conversions API
was enabled in Events Manager. This is the web-only connection supported by
Meta, not a paid partner gateway. Its setup did not show a new fee or trial.
Meta says this connection can coexist with a direct or partner integration:
https://www.facebook.com/business/help/1861378164396295

The direct integration runs in GoSteady's existing Netlify Personal account.
The account includes background functions and 1,000 monthly credits. No new
subscription or plan upgrade is required. Function compute and requests use
the existing allowance; they are not unlimited or guaranteed to cost zero.
Current rates: 10 credits/GB-hour compute, 2 credits/10,000 requests, and
15 credits per production deployment. See:
https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## Direct event coverage

| Event | Proof | Value | Deduplication |
| --- | --- | --- | --- |
| `AddShippingInfo` | Verified Netlify address-form submission | $99 device interest | `shipping_<checkout_id>` shared with browser |
| `Purchase` | Signed Stripe Checkout event, status complete and payment_status paid | $49 actually paid | `deposit_<checkout_session_id>` |

Both checkout pages and both live deposit Payment Links are supported. Browser
milestones, plan selections, video views and other existing events remain
browser events. The Meta-enabled web connection can supplement those; it
does not independently know that a Stripe payment succeeded.

Only `checkout.session.completed` and `checkout.session.async_payment_succeeded`
are subscribed. An unpaid completed checkout, opened Payment Link, return URL,
unrelated product, wrong amount/currency or subscription never counts as a
paid deposit. Delayed payments count only after success. No browser Purchase
is generated. Stripe remains the source of truth for refunds and net deposits;
Meta Purchase reports gross successful deposits and is not reversed on refund.

## Hosting and safety

- Secrets are environment variables in Netlify, never in static files.
- `scripts/build.cjs` copies only tracked public files into `dist/`; server
  modules, package files, tests and documentation stay off the CDN.
- Production context plus `META_CAPI_ENABLED=true` is required to send events.
- Netlify authenticates its reserved `submission-created-background` event
  handler; it is not a public client-reporting endpoint.
- Stripe signatures are verified against the raw request body with the
  official SDK, a five-minute tolerance and separate live/sandbox secrets.
  This webhook needs no Stripe API key or permission to move money.
- Strongly consistent Netlify Blobs receipts and conditional leases prevent
  duplicate deliveries. Meta retries retain the same event ID. Failures return
  503 to Stripe so it retries; pending records also get an hourly retry.
- The browser never waits for a Meta request. Netlify address processing runs
  in the background. Payment handling waits for the address record when a
  checkout reference exists, preserving privacy preferences and attribution.
- Match data is limited to hashed email, Meta browser/click IDs and user agent.
  No names, street addresses, phone numbers, care-recipient information,
  activity data or payment-card details are sent by this integration.
- Source URLs have query strings removed. Global Privacy Control suppresses
  the checkout browser pixel and both direct conversion types.
- Attribution records expire after 90 days. Successful delivery receipts,
  which contain no matching data, expire after 400 days. Failed deliveries
  expire after six days and leave a diagnostic marker.

## Environment and activation

Set these in the Netlify project `gosteadyweb`, using production-context values:

- `META_CAPI_ENABLED=true` after setup is complete.
- `META_CAPI_ACCESS_TOKEN` (secret) for GoSteady Waitlist.
- `META_PIXEL_ID=2755897781476379` (also the code default).
- `META_GRAPH_API_VERSION=v24.0` (also the code default).
- `STRIPE_WEBHOOK_SECRET` (secret) from the live webhook endpoint.

Endpoint: `https://gosteady.co/.netlify/functions/stripe-webhook`.
It already exists on live account `acct_1UFcrKQ2TfGTSvqA`, subscribing only to
the two Checkout events above, using Stripe API version `2026-08-26.dahlia`.
Update the existing endpoint rather than creating a duplicate.

For sandbox verification only:

- Use the existing separate endpoint in `acct_1UFcrTL5ztGHn39e` with the same URL.
- Store its distinct secret as `STRIPE_TEST_WEBHOOK_SECRET`.
- `STRIPE_TEST_PAYMENT_LINK_IDS` contains the two allowed $49 sandbox links,
  comma-separated.
- `META_TEST_EVENT_CODE` comes from Events Manager > Test events. Sandbox
  payments fail closed if this code is absent and never become live events.
  The code displayed on September 23 was `TEST41311`; recheck the UI at test time.
- Optional `META_TEST_CHECKOUT_ID` routes only that exact address-test
  reference into Meta Test Events. All other production addresses remain live.
- Remove the optional test configuration and disable the sandbox webhook
  after testing. Never send a fabricated live Purchase for verification.

Production values must not be configured for preview contexts. Netlify's
Personal plan supports secret variables but not per-feature variable scopes;
build code never reads or embeds these values.

## Verification

`npm test` exercises real checkout scripts, event filters, hashing, privacy
preferences, raw-body signature verification, duplicate and concurrent
delivery, retry recovery, asynchronous payments and sandbox isolation.
`netlify build` bundles the functions and registers the background handler
and hourly schedule. Complete one sandbox payment and inspect Meta Test
Events before enabling live payment reporting. Confirm the browser and
server address event IDs match and Meta reports deduplication.

Before ads launch, verify Meta receipt in Test Events, Stripe webhook delivery
responses and Netlify function logs. These are separate from publishing ads;
the campaign remains unpublished until the business payment card is ready.
