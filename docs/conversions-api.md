# Meta server conversion integration

Verified September 23, 2026. Both the browser/server address event and an
actual Stripe sandbox deposit reached Meta Test Events successfully. The
user generated the Meta token in their regular browser and saved it directly
as a production-only Netlify secret. The token never entered source control.
The Dataset Quality API setup route was explicitly approved by the user.

Production uses `META_CAPI_ENABLED=true`, `META_CAPI_ACCESS_TOKEN` (secret),
and `STRIPE_WEBHOOK_SECRET` (secret). Temporary Meta test routing, sandbox
link IDs, and the sandbox signing secret are removed after QA. Manual CLI
alias deployments use the branch-deploy runtime context and cannot enable
production reporting.

Existing Stripe endpoints (do not duplicate):
- Live: `we_1UIvOfQ2TfGTSvqA9Md1vGK6`; enabled after final deployment.
- Sandbox: `we_1UIvNNL5ztGHn39elNEr9t6n`; disabled after QA.

Ads remain unpublished. No live card payment was made during this verification.

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
| `AddShippingInfo` | Verified Netlify address-form submission | $199 device interest (legacy $99 retained) | `shipping_<checkout_id>` shared with browser |
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
  The sandbox signing secret is not retained after QA; rotate/recreate the
  sandbox endpoint's signing credential if another hosted test is needed.

Production values must not be configured for preview contexts. Netlify's
Personal plan supports secret variables but not per-feature variable scopes;
build code never reads or embeds these values.

## Verification

`npm test` exercises real checkout scripts, event filters, hashing, privacy
preferences, raw-body signature verification, duplicate and concurrent
delivery, retry recovery, asynchronous payments and sandbox isolation.
`netlify build` bundles the functions and registers the background handler
and hourly schedule. The suite passed 49 checks. Hosted checks additionally
confirmed webhook GET=405, a correctly signed unpaid sandbox fixture=200/ignored,
unsigned/tampered/stale requests=400, external form-event calls=403, and server
source/package files=404.

End-to-end QA used production deployment `6ab429bb090b128fd942a880` with
temporary sandbox routing and Meta Test Events code `TEST41311`:

- Checkout reference: `24b53c45-1380-4fcd-a804-2f7c571cbddc`.
- Address entered through the actual website UI with `utm_source=qa`,
  `utm_medium=test`, and `utm_campaign=capi_verification`.
- Browser `AddShippingInfo` arrived at 13:32:50 MDT. The same address was
  resubmitted after the server configuration deployment. Its server event
  arrived at 13:36:03 and Meta explicitly marked it **Deduplicated**, sharing
  `shipping_24b53c45-1380-4fcd-a804-2f7c571cbddc` with the browser.
- Netlify form submissions: `6ab4296123513217a888813c` and
  `6ab42a2141b9cc0f49c9dc9e`. Both are labeled GoSteady Conversion QA.
- Sandbox Checkout Session:
  `cs_test_a1Kirq8Y8K9CXZcoz6rsDfXKsq5YjWvcvGP4N3Cq4yQmIW5asQN2znTAbT`.
- Stripe confirmed `status=complete`, `payment_status=paid`, and
  `amount_total=4900` with the same checkout reference.
- Meta received **Purchase / Processed / Server** at 13:38:51 MDT with
  value **49 USD**, content name **GoSteady refundable reservation deposit**,
  and matching keys Email, Browser id, and User agent. The event ID is
  `deposit_<the Checkout Session above>`.
- Netlify Blobs contains `state=sent` receipts for both QA events. Successful
  receipts retain no matching data.
- PaymentIntent: `pi_3UIw0DL5ztGHn39e0fTJlPTB`.
- Full sandbox refund: `re_3UIw0DL5ztGHn39e0d3Qbjt4`, $49, `succeeded`.

This confirms receipt and address deduplication, not attribution to a paid ad:
the controlled test did not come from an ad click. Purchase retries/concurrent
delivery and asynchronous-payment filtering were verified in automated tests,
not by manually resending a hosted Stripe event. Exclude the marked QA session
from interest/conversion analysis.

Before ads launch, verify Meta receipt in Test Events, Stripe webhook delivery
responses and Netlify function logs. These are separate from publishing ads;
the campaign remains unpublished until the business payment card is ready.
