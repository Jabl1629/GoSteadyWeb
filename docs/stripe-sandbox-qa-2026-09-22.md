# Stripe sandbox reservation QA — September 22, 2026

## Result

The tested card reservation flow passed. No live payments or live configuration
changes were made. Both successful sandbox payments were fully refunded.

## Configuration

The sandbox still contained the previous $99 offer. A separate $49 sandbox
product, price, and Payment Link were created for the current reservation offer:

- Account: `acct_1UFcrTL5ztGHn39e` (GoSteady LLC sandbox).
- Product: `gosteady_family_connect_reservation_49_qa_20260922`.
- Price: `price_1UIgEIL5ztGHn39eTpVhdZAT`.
- Payment Link: `plink_1UIgEVL5ztGHn39eNeSIzTaE`.
- Test checkout: https://buy.stripe.com/test_bJe14ofry2aq8WO1epcMM01

Compared against live link `plink_1UIfmtQ2TfGTSvqAOF27Vt8v` using read-only
Stripe API access. Amount, currency, quantity, confirmation text, checkout
disclosure, customer creation, automatic tax, invoice creation, billing/shipping
collection, payment-method configuration selection, and one-time payment behavior
match. Metadata differs intentionally: `environment=sandbox` and
`qa_run=2026-09-22`. Account-specific payment-method availability can differ.

The public website continues to use its original live link. The older sandbox
$99 link was left unchanged.

## Executed checks

| Scenario | Observed result |
| --- | --- |
| Standard card (`4242`) through hosted Checkout | $49 USD captured; Session complete/paid; PaymentIntent succeeded. |
| Insufficient funds (`9995`) | Visible decline; Session open/unpaid; received amount zero. |
| Cancel 3D Secure challenge (`3220`) | Returned to checkout with authentication error; Session remained open/unpaid; received amount zero. |
| Retry and complete 3D Secure | Same Session and PaymentIntent succeeded; Stripe recorded challenge authentication. Exactly one successful captured charge on this PaymentIntent, plus the earlier failed attempt. |
| Full refunds | Both $49 refunds returned `status=succeeded`. |
| Email and reference handoff | Prefilled test emails and distinct `client_reference_id` values survived into completed Sessions. |
| Offer metadata | Session and PaymentIntent retained $49 deposit, $50 balance, $99 device, December 2026 shipping, two bonus months, and $20 monthly service. |
| Confirmation | Hosted confirmation displayed deposit, remaining balance, estimated shipping, activation-based free months, and refund contact. |
| Future billing | Both Sessions had no subscription or SetupIntent; both PaymentIntents had `setup_future_usage=null`. |
| Website regression checks | `node --test tests/checkout.test.cjs`: 12/12 passed across both checkout pages. |

Website checks cover address-save failure, offer disclosure, checkout reference
and email URL parameters, deposit metadata, resilience to secondary analytics
submission failure, rejection of sandbox links on public checkout, notification
leads, and rejection of forged paid-return URLs. These are isolated tests with
mocked form requests; this run did not submit fake addresses to production Netlify
or generate production analytics events.

## Stripe evidence

| Scenario | Identifier |
| --- | --- |
| Standard payment Session | `cs_test_a1DrG3NssorenoGF4HDFdKl3smqQsUlD7bwvzC7Jr0EfLWzU115a2I5t8d` |
| Standard PaymentIntent | `pi_3UIgGEL5ztGHn39e0oZXlvNU` |
| Standard payment refund | `re_3UIgGEL5ztGHn39e0wkI6Zs1` |
| Decline/cancel/retry Session | `cs_test_a1KECYxEmrJGYeAR7M3beIuIqg9Ai8NNdjjIGiUraUXv5bCmpIhN4Wg22u` |
| Decline/cancel/retry PaymentIntent | `pi_3UIgGsL5ztGHn39e1sqv46Lr` |
| Authenticated payment refund | `re_3UIgGsL5ztGHn39e1N5n6P2x` |

Session `payment_status=paid` and PaymentIntent `status=succeeded` can remain
after a refund. Paid-reservation reporting must also inspect refunded charges.

## Scope limits

This verifies sandbox card payments, failures, authentication, and refunds. It
does not verify live bank settlement, receipt email delivery, wallets, bank
payments, or installment providers. No webhook integration exists to test.
The $50 balance collection and service subscription at activation remain future
operations, as documented in [reservations.md](reservations.md).

Test inputs followed Stripe's [testing documentation](https://docs.stripe.com/testing)
and [3D Secure test scenarios](https://docs.stripe.com/payments/3d-secure/authentication-flow).
