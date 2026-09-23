# GoSteady reservation offer

Updated September 22, 2026.

## Customer offer

- Device total: $99 USD.
- Refundable deposit collected now: $49 USD.
- Remaining balance: $50 USD, collected before shipment after contacting the customer.
- Estimated shipping: December 2026.
- First two months of service are free after activation, then $20/month; cancel any time.
- Reservation payments are fully refundable before shipment. Contact: support@gosteady.co.

The homepage and address-entry step still show the $99 device price and $20
monthly service price. The preorder status, deposit split, and bonus are
disclosed after address submission, as required by the experiment design.

## Live Stripe configuration

- Account: `acct_1UFcrKQ2TfGTSvqA` (GoSteady LLC).
- Product: `gosteady_family_connect_reservation_49`.
- One-time price: `price_1UIfmRQ2TfGTSvqAtVHXRWEt` (4900 cents USD, quantity 1).
- Payment Link: `plink_1UIfmtQ2TfGTSvqAOF27Vt8v`.
- URL: https://buy.stripe.com/7sY7sN1wae664qz2x6bsc01
- The previous $99 live link `plink_1UIfdwQ2TfGTSvqAvsDU5Tqw` is inactive.
- Live charges and payouts were enabled with no verification requirements outstanding.
- Automatic tax is off; no live tax registrations were recorded when checked.
  This does not determine the business's tax obligations.

Stripe hosts the payment form and the post-payment confirmation. There are no
server secrets or card fields on the website. The link creates a customer for
the reservation and includes the offer terms in Checkout and PaymentIntent
metadata. No subscription or automatic $50 balance charge is created.

## Measurement and fulfillment

Address submission is an intent signal. The existing address-completion and
preorder-choice events remain in place. `V2 Deposit Checkout Opened` (or the
legacy equivalent) and Meta `AddPaymentInfo` describe the $49 checkout handoff,
not a successful payment.

Count paid deposits from successful, non-refunded **live Stripe payments** for
this payment link. Wait for successful payment if an asynchronous payment
method is used. An opened/completed checkout alone is not sufficient evidence.
The website deliberately does not emit `Purchase` from a `reserved=1` URL.

The website passes its `checkout_id` as Stripe's `client_reference_id`; match
the Checkout Session to the corresponding Netlify address form. The separate
`cupholder-v2-preorder-choice` form also includes `deposit_amount=49`,
`balance_due=50`, and `offer_version=deposit_49_balance_50`. A payment can still
proceed if that secondary analytics submission fails, so use Stripe as the
paid-reservation record. Match by Checkout Session reference first, not by
email alone (customers may change their email in Stripe).

Before fulfillment, contact each customer, confirm the delivery address, and
collect the $50 balance. Balance collection and the activation-based service
subscription are separate future operations; this reservation checkout does
not schedule them. Apply the two-month benefit when creating service billing
at activation. Honor refund requests through Stripe before shipment.

The optional monitoring survey still appears after the notification-only
choice. Paid customers stay on Stripe's confirmation page, so the website's
post-payment survey and browser Purchase event are not active. Server-verified
purchase reporting would require a separate webhook integration.

## Verification

Run `node --test tests/checkout.test.cjs` to verify the two checkout routes,
failure behavior, deposit metadata, live-link guard, and rejection of fake paid
return URLs. Browser QA covered address entry, the disclosed offer, and the
live Stripe handoff with the correct $49 total. No real payment was made during QA.
