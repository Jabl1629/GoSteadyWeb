# GoSteady reservation offer

Updated September 23, 2026.

## Customer offer

- Founding Family device total: $199 USD; planned retail: $249 USD.
- Refundable deposit collected now: $49 USD.
- Remaining balance: $150 USD, collected before shipment after contacting the customer.
- Estimated shipping: December 2026.
- First two months of service are free after activation, then the selected plan:
  $20/month (cancel any time) or $200/year (cancel renewal any time).
- Annual billing starts after the two free months and covers a full year.
  $200/year is approximately $16.67/month and saves $40 against 12 monthly payments.
- Reservation payments are fully refundable before shipment. Contact: support@gosteady.co.

Checkout begins with box contents and monthly/annual service selection. The
device is $199. The homepage labels $249 as planned retail and shows the
required Family Plan separately ($20/month or $200/year). The preorder status
and deposit split are disclosed after address submission. The two free service
months are also explained in the homepage Family Plan section.

## Live Stripe configuration

- Account: `acct_1UFcrKQ2TfGTSvqA` (GoSteady LLC).
- Product: `gosteady_founding_family_199_monthly`.
- One-time price: `price_1UIwVtQ2TfGTSvqAnLz2pdLI` (4900 cents USD, quantity 1).
- Payment Link: `plink_1UIwWXQ2TfGTSvqAuINb79n3`.
- URL: https://buy.stripe.com/cNi14p4Im3rs3mv7Rqbsc03
- Annual-choice deposit product: `gosteady_founding_family_199_annual`.
- Annual-choice one-time deposit price: `price_1UIwWBQ2TfGTSvqAxNlmF0Vp` ($49).
- Annual-choice Payment Link: `plink_1UIwWcQ2TfGTSvqACjfPpIAH`.
- Annual-choice URL: https://buy.stripe.com/dRm6oJ1waaTU4qz0oYbsc04
- Future service billing product: `gosteady_family_connect_service`.
- Monthly recurring price: `price_1UIsIeQ2TfGTSvqA4AXf0teS` ($20/month).
- Annual recurring price: `price_1UIsJ0Q2TfGTSvqAd1daXPm9` ($200/year).
- The previous $99 live link `plink_1UIfdwQ2TfGTSvqAvsDU5Tqw` is inactive.
- Live charges and payouts were enabled with no verification requirements outstanding.
- Automatic tax is off; no live tax registrations were recorded when checked.
  This does not determine the business's tax obligations.

Stripe hosts the payment form and the post-payment confirmation. There are no
server secrets or card fields on the website. The link creates a customer for
the reservation and includes the offer terms in Checkout and PaymentIntent
metadata. No subscription or automatic $150 balance charge is created.
Both deposit links charge $49 once. They record `service_plan`,
`service_interval`, `service_price_usd`, and the future `service_price_id` on
Checkout Sessions and PaymentIntents, and show plan-specific terms and confirmation.
Recurring prices are catalog entries for activation; they are not attached to
the deposit links and do not start a trial or subscription now.

## Earlier reservations

The earlier $99 device / $49 deposit / $50 balance offer has separate Stripe
products, prices, and links. Its existing records are unchanged. Honor the
terms recorded on each paid Session and PaymentIntent rather than applying
the new website price to all customers. Earlier links:
`plink_1UIfmtQ2TfGTSvqAOF27Vt8v` (monthly) and
`plink_1UIsKMQ2TfGTSvqAa8gJbV1b` (annual).
The earlier links are retired when the new offer is deployed. They remain in
the server webhook allowlist for delayed payment notifications.

## Measurement and fulfillment

Address submission is an intent signal. The existing address-completion and
preorder-choice events remain in place. `V2 Deposit Checkout Opened` (or the
legacy equivalent) and Meta `AddPaymentInfo` describe the $49 checkout handoff,
not a successful payment.

Count paid deposits from successful, non-refunded **live Stripe payments** for
these two payment links. Wait for successful payment if an asynchronous payment
method is used. An opened/completed checkout alone is not sufficient evidence.
The website deliberately does not emit `Purchase` from a `reserved=1` URL.

The website passes its `checkout_id` as Stripe's `client_reference_id`; match
the Checkout Session to the corresponding Netlify address form. The separate
`cupholder-v2-preorder-choice` form also includes `deposit_amount=49`,
`balance_due=150`, and `offer_version=founding_family_199_2026_09`. A payment can still
proceed if that secondary analytics submission fails, so use Stripe as the
paid-reservation record. Match by Checkout Session reference first, not by
email alone (customers may change their email in Stripe).

Before fulfillment, contact each customer, confirm the delivery address, and
collect the $150 balance. Balance collection and the activation-based service
subscription are separate future operations; this reservation checkout does
not schedule them. Apply the two-month benefit when creating service billing
at activation using the selected recurring price, and review tax registration
and collection before enabling service billing. Automatic tax remains off.
Honor refund requests through Stripe before shipment.

All Netlify checkout forms now declare and save `service_plan`, `service_interval`,
`service_price`, `annual_price`, and `flow_version=plans_2026_09`. Choice and
monitoring forms also retain source URL, referrer, UTMs, and fbclid. A customer
can change plans after first submitting their address; the later choice record
and Stripe Session contain their final choice. See [analytics.md](analytics.md)
for the updated event map. Local previews do not submit forms or open payments.

The optional monitoring survey still appears after the notification-only
choice. Paid customers stay on Stripe's confirmation page, so the website's
post-payment survey and browser Purchase event are not active. Server-verified
purchase reporting passed end-to-end sandbox verification and is enabled for
production. See [conversions-api.md](conversions-api.md) for the test evidence,
configuration, and existing webhook endpoint IDs.

## Verification

Run `node --test tests/checkout.test.cjs` to verify the two checkout routes,
failure behavior, deposit metadata, live-link guard, and rejection of fake paid
return URLs. Browser QA covered address entry, the disclosed offer, and the
live Stripe handoff with the correct $49 total. No real payment was made during QA.

Sandbox card payments, declines, 3D Secure cancellation/retry, and full refunds
were also tested successfully. See [the sandbox QA record](stripe-sandbox-qa-2026-09-22.md)
for results, test object IDs, and scope limits.

September 23 annual-plan verification: hosted sandbox Checkout captured exactly
$49 with `service_plan=annual`, `service_interval=year`, and `service_price_usd=200`
on both Session and PaymentIntent. No subscription or future-use setup was created.
The confirmation showed the annual terms. The test payment was fully refunded.

- Sandbox link: `plink_1UIsP0L5ztGHn39eKvnfBhDD`.
- Session: `cs_test_a1VaUdJ0RGMsBr5CtZvYrxQI1DCUcXceyfm4HMPWj4A3k7EnSAjQKlLEou`.
- PaymentIntent: `pi_3UIsQoL5ztGHn39e0mAC9Vcp`.
- Refund: `re_3UIsQoL5ztGHn39e0BAJTXim` (`succeeded`, $49).

The expanded automated suite passes 22 checks across both checkout routes,
including plan changes, annual routing, attribution, step-specific analytics,
back-navigation deduplication, analytics/storage failures, and local-preview safety.

Founding Family price update: 52 automated checks pass, including both new live
link IDs, $199 address values, legacy $99 attribution, and $49 paid-deposit
values. Local desktop/mobile layouts and the live monthly/annual Stripe pages
were checked; no new card payment was made for this pricing-only update.
