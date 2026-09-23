# Checkout analytics

Updated September 23, 2026; checkout flow `plans_2026_09`.

## Primary goals in Plausible

| Display name | Event | Trigger |
| --- | --- | --- |
| 00 · Homepage viewed | `V2 Landing Viewed` | Homepage loaded |
| 01 · Check availability clicked | `V2 Primary CTA` | Homepage CTA clicked |
| 02 · Plan page viewed | `V2 Plan Viewed` | Box contents and plan selector shown |
| 03 · Address page reached | `V2 Checkout Started` | Delivery step actually shown |
| 04 · Address completed | `V2 Details Submitted` | Address successfully saved to Netlify |
| 05 · Reservation offer seen | `V2 Availability Disclosed` | Deposit and availability disclosed |
| 06 · Stripe deposit checkout opened | `V2 Deposit Checkout Opened` | Redirect to selected Stripe link initiated |

`V2 Checkout Started` retains its historical meaning (address page reached);
it no longer fires on initial checkout load, because the new plan screen comes
first. Meta `InitiateCheckout` now fires on the plan screen, while custom event
`CheckoutDeliveryViewed` identifies address entry. `AddShippingInfo` remains
the successful address-save signal; `AddPaymentInfo` remains the $49 handoff.
An initiated redirect does not confirm Stripe loaded or that payment succeeded.

## Plan comparison on Starter

Dedicated goals avoid requiring Plausible Business custom-property reports:

| Display name | Event |
| --- | --- |
| Plan · Monthly continued | `V2 Monthly Plan Continued` |
| Plan · Annual continued | `V2 Annual Plan Continued` |
| Plan · Monthly address completed | `V2 Monthly Details Submitted` |
| Plan · Annual address completed | `V2 Annual Details Submitted` |
| Plan · Monthly Stripe opened | `V2 Monthly Deposit Checkout Opened` |
| Plan · Annual Stripe opened | `V2 Annual Deposit Checkout Opened` |

"Continued" means the person pressed Continue to delivery with that plan selected,
including the monthly default. It is stronger than merely toggling the control.
The raw `V2 Service Plan Changed` event and Meta `ServicePlanChanged` capture
toggle changes; Meta `ServicePlanSelected` captures continuing with a selection.

Back navigation does not repeat a milestone within a page load. A person who
changes their mind may appear in both plan-specific goals; do not sum them to
infer distinct people or treat them as mutually exclusive final-choice cohorts.
Use the latest Netlify choice record and Stripe metadata for final selections.
Page reloads begin a new event scope; use Plausible unique conversions for
visitor-level comparisons. Existing video, scroll, and updates-requested goals
remain available. Starter does not include a visual funnel report.

## Attribution and reliability

Each ad should have distinct `utm_content` (for example `ad1_reassurance`,
`ad2_founder`, `ad3_drawer`) and a consistent campaign/source/medium. Homepage
CTA links carry those parameters into checkout. Netlify stores them with the
address and subsequent choice. Stripe's `client_reference_id` matches the
Netlify `checkout_id`, linking paid deposits back to that source record.

Browser event properties include plan, flow version, device price, and offer
version but no email, address, or phone. Meta's AddShippingInfo event ID includes the random checkout identifier
so browser and server submissions can be deduplicated. Analytics exceptions and
unavailable browser storage cannot block form capture or payment. Nonproduction previews suppress
checkout events, Meta initialization, form submissions, and payment navigation.

Address completion occurs before preorder disclosure and measures initial
interest, not acceptance of the preorder. No browser `Purchase` event is emitted.
Paid deposits are successful, non-refunded Stripe charges. A server-verified
Purchase webhook passed end-to-end sandbox verification and is enabled for
production. See [conversions-api.md](conversions-api.md) for the evidence and
configuration. It reports gross successful $49 deposits; use Stripe for
refunds and net paid reservations. Filter experiments from this deployment
forward when comparing the new flow to the older address-first checkout.

## Founding Family price baseline — September 23, 2026

The active offer is `founding_family_199_2026_09`: $199 device, $49 deposit,
$150 balance. Homepage landing, CTA, and checkout events include `device_price` and
`offer_version`; Netlify address, choice, and survey records retain both.
Stripe Session and PaymentIntent metadata use `device_price_usd=199` and
`offer=founding_family_199_2026_09`. The funnel version stays `plans_2026_09`
because its steps have not changed.

Meta InitiateCheckout and AddShippingInfo use the $199 quoted device value.
Purchase continues to use the actual $49 payment. Server events retain the
older $99 quote for earlier forms and use Stripe metadata for paid offers.
This is a new baseline, not a randomized price experiment. On Plausible Starter,
compare deployment date ranges; use the saved offer metadata for precise
cohorts, since Starter does not include custom-property reports.
