# Reddit conversion tracking

Account `jqogsii64m2e`; Pixel `a2_jqogsii64m2e`.

## Events

| Action | Reddit event | Delivery |
| --- | --- | --- |
| Homepage or checkout page loaded | PageVisit | Pixel |
| Plan-selection page opened | CheckoutStarted (custom) | Pixel |
| Continue with selected plan | PlanSelected (custom) | Pixel |
| Address-entry step displayed | DeliveryViewed (custom) | Pixel |
| Address form successfully saved | AddressCompleted (custom) | Pixel + CAPI, same conversion ID |
| Stripe deposit checkout opened | DepositCheckoutOpened (custom) | Pixel |
| Updates requested instead of depositing | UpdatesRequested (custom) | Pixel |
| Stripe confirms a paid reservation | Purchase, USD 49 | CAPI only |

The public browser never reports Purchase. The existing authenticated Stripe webhook
validates the signed event, allowed payment link, payment status, and amount before
sending the paid deposit. Pixel/CAPI address events share `shipping_<checkout_id>`;
paid events share `deposit_<Stripe session ID>` across retries.

## Deployment

Production Netlify Functions require `REDDIT_CAPI_ENABLED=true` and the secret
`REDDIT_CAPI_ACCESS_TOKEN`. The Pixel ID is public; the token must never appear in
public assets or Git. Nonproduction contexts do not enable the integration.

Reddit and Meta have independent durable receipts and attribution stores. A provider
failure does not prevent attempting the other provider. Failed deliveries are retried
through the existing scheduled retention job; Stripe also retries failed webhooks.

## Privacy

Honor Global Privacy Control for Pixel and CAPI. Disable Reddit's automatic advanced
matching and enhanced metadata in Events Manager; only explicit events and matching
fields should be collected. Email is normalized and SHA-256 hashed on the server.
Server events may include the Reddit click ID, UUID and user agent, but no names,
street addresses, phone numbers, or care-recipient/device data. Attribution expires
after 90 days. Successful delivery receipts contain no matching data.

`rdt_cid` follows the site-to-checkout handoff and is retained in session storage.
The `_rdt_uuid` cookie is reduced to its UUID component before CAPI submission.
Plausible campaign reporting uses UTM parameters independently of Reddit attribution.

## Testing and optimization

`npm test` covers paid-only reporting, duplicates, concurrency, temporary failures,
invalid input, privacy suppression, sandbox isolation, and browser event mapping.
For live API QA, use Reddit Event Testing's test ID; never submit simulated purchases
without test routing. Sandbox Stripe reporting requires `REDDIT_TEST_EVENT_ID` and
an allowlisted `STRIPE_TEST_PAYMENT_LINK_IDS` entry. These are not needed for live
payments. An optional `REDDIT_TEST_CHECKOUT_ID` isolates a specific address test.

Adding tracking does not change the ad campaign's optimization goal. The existing
campaign was observed using Clicks. Conversion optimization is a separate campaign
choice, after the relevant event is available in Reddit.

## Verification on September 24, 2026

Production deployment `6ab5a144b6507a6fc1647d0e` includes the Pixel and event
handlers. Reddit Event Testing showed Healthy Pixel events for Page Visit,
CheckoutStarted, PlanSelected and DeliveryViewed through the actual homepage
and checkout UI at 16:17–16:18 MDT. The session was tagged `utm_source=qa`,
`utm_medium=test`, `utm_campaign=reddit_tracking_qa_20260924`; exclude it from
customer-interest analysis. No address was submitted and no payment was made.

All 64 automated tests pass, and Netlify bundled all three Functions successfully.
The existing ad destination now includes `utm_source=reddit`,
`utm_medium=paid_social`, `utm_campaign=gs_reddit_test_20260924`, and
`utm_content=multi_asset`. Budget and optimization were not changed.

Server delivery was enabled after explicit user approval of Reddit's token terms.
The token named `GoSteady website production` is stored only in Netlify's production
secret `REDDIT_CAPI_ACCESS_TOKEN`; `REDDIT_CAPI_ENABLED=true` activates delivery.
The earlier unused token named `GoSteady Netlify conversions` remains in Reddit.

At 17:29:50 MDT, the actual Reddit v3 transport returned HTTP 200 for isolated
AddressCompleted and Purchase fixtures, and Reddit Event Testing displayed both as
**CAPI / Healthy / Direct integration**. The Purchase fixture was USD 49. These
requests used test ID `t2_iaer4azvx`, not production conversion reporting. No card
was charged and this was not an end-to-end Stripe sandbox payment. Stripe signature
verification and paid-only filtering remain covered by the automated tests.

The test ID is not configured in production. Live reporting only sends eligible
paid Stripe deposits and successfully saved addresses. Campaign budget and click
optimization remain unchanged.

Activation deployed successfully in production as `6ab5b2acf75dd2f8b58f35b5`.
Reddit's expanded Purchase test confirmed value 49, currency USD, item count 1,
Pixel ID `a2_jqogsii64m2e`, and source URL `https://gosteady.co/checkoutV2`.
