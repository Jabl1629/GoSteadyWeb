# Checkout analytics

## Current checkout — September 30, 2026

Flow version: `delivery_monthly_2026_09_30`. The offer and delivery address form
now share the first screen. New customers see monthly service only: two free
months after activation, then $20/month. The next screen discloses the preorder
and $49 reservation before the Stripe handoff.

**Meta campaign optimization target: `AddShippingInfo`**, in dataset
**GoSteady Waitlist** (`2755897781476379`). This existing custom event means a
valid address form was successfully saved. The payment/reservation screen is
shown before the browser event fires. It does not fire on arrival, typing,
validation failure, or a failed save. Pixel `trackCustom` and the existing
Conversions API use the same event name and `shipping_<checkout_id>` identifier
for deduplication. If Ads Manager requires a custom conversion, base it on this
event, not a `/checkoutV2` URL visit: both steps use that same URL.

Current funnel:

| Plausible event | Meta event | Meaning |
| --- | --- | --- |
| `V2 Checkout Started` | `InitiateCheckout` | Combined offer/address page loaded; shallow diagnostic |
| `V2 Address Form Started` | None | First nonempty address-field edit; diagnostic only |
| `V2 Details Submitted` | `AddShippingInfo` | Address saved and payment/reservation screen shown |
| `V2 Availability Disclosed` | None | Preorder and deposit terms shown |
| `V2 Deposit Checkout Opened` | `AddPaymentInfo` | Stripe handoff started; not a payment |
| Server-verified deposit | `Purchase` | Successful Stripe deposit, value $49 |

Use `AddShippingInfo` for the new campaign, not `InitiateCheckout` or a
form-start event. The latter remain useful for diagnosis. Campaign settings
are managed by the owner; this deployment does not alter Meta budgets or ads.

`V2 Plan Viewed`, plan-selection/continued events, and `V2 Delivery Button Seen`
are retired in this flow. Their historical dashboard goals may remain, but
should not be used as new-flow denominators. `V2 Checkout Started` retains its
address-page-reached meaning and now occurs on initial load. Monthly details
and Stripe-handoff goals are retained. Clarity starts at `delivery_viewed`, then
records `address_form_started` and `reservation_viewed`; existing privacy and
QA exclusions remain in place. Homepage `V2 Landing Viewed` is noninteractive
so a page-load event alone does not lower the reported bounce rate.

The $199 device quote and offer version remain unchanged. Legacy `/checkout`
and `/checkout.html` redirect to `/checkoutV2`. Prior annual reservations and
webhook records remain intact. Use dates and `flow_version` to separate cohorts.

Checkout confidence update: optional phone collection is removed and the
optional apartment field is collapsed by default. The setup video opens in a
dialog without resetting the form; its existing `Setup Video Started`,
`Setup Video Progress`, and `Setup Video Completed` events use `placement=checkout`.
The `AddShippingInfo` trigger and payment events are unchanged.

The sections below describe earlier versions and retained instrumentation.

## Behavior diagnosis — September 29, 2026

Microsoft Clarity project `yq0g49ty6c` adds session replay on the homepage and V2 checkout. Existing
Plausible scroll/video events and Meta optimization goals are unchanged. Replay
is prospective: it cannot reconstruct earlier visits. Ad blockers and consent
restrictions can make its totals differ from Plausible and Meta.

The recorder has custom events for `plan_viewed`, `delivery_button_seen`,
`plan_continue_clicked`, `delivery_viewed`, `address_form_started`,
`address_submit_attempted`, `reservation_viewed`, and checkout errors. Stage
changes are captured even though checkout stays on one URL. Tags include
`page_type`, `checkout_stage`, `service_plan`, `delivery_button_seen`,
`plan_continued`, `address_form_started`, and
`experience_version=replay_2026_09_29`. Tags accumulate over a Clarity session;
use event order in replay to determine the final step or plan choice.

Start with mobile recordings containing `plan_viewed` and no `delivery_viewed`.
Compare those with and without `delivery_button_seen`; then inspect plan
switching, long pauses, repeated/dead clicks, errors and quick returns to the
homepage. Check sessions with `plan_continue_clicked` but no `delivery_viewed`
first for a functional failure. Replay shows behavior, not a visitor's reason
for leaving; repeated patterns should guide one change at a time.

Additional Plausible custom-event goals (exact event names):

| Event | Meaning |
| --- | --- |
| `V2 Delivery Button Seen` | At least half of Continue to delivery visible for one continuous second in an active tab |
| `V2 Address Form Started` | First input/change in a delivery field; focus alone does not count |
| `V2 Address Validation Error` | Browser rejected a delivery field; only its fixed field ID is included |
| `V2 Address Save Error` | Address could not be saved |
| `V2 Payment Handoff Error` | Stripe handoff error displayed |
| `V2 Browser Error` | Script error or unhandled rejection; no raw error message |

These goals are once per page load. All six are registered in Plausible's Goals
settings under the `Behavior ·` and `Error ·` display names. Existing `V2 Checkout Started` still means the
delivery step was reached, and `V2 Details Submitted` still means address saved.

Form fields are explicitly masked before the recorder loads. No customer
identity, field values, or raw error messages are passed as custom properties.
No recorder is installed in the family portal, demos, or Stripe. Local previews,
URLs containing sensitive query parameters, GPC/DNT browsers and replay opt-outs
are excluded. `utm_source=qa|test|internal`, `utm_medium=qa|test`, or `qa=1`
excludes recording and these new diagnostics for the rest of that browser tab's
session. This does not change the filtering of older analytics integrations.
The privacy page contains a browser-specific replay opt-out. Clarity's regional
consent defaults apply; the site never manufactures a consent grant.

Public project configuration is in the `data-clarity-project` attribute of each
page's behavior-tracking script. There are no new secret tokens or server costs.

Deployment verification: production homepage, checkout, scripts and privacy
page returned HTTP 200; the recorder loaded its Clarity library on a deliberately
labeled verification visit, with all 96 checkout inputs explicitly masked.
The QA-tagged checkout loaded no recorder. Clarity's live view received both the
verification visit and an independent mobile visit attributed to the Meta
campaign. Completed recordings and dashboard aggregates can arrive later.
Clarity has a saved `Mobile visitors` segment (last three days, mobile devices).
Exclude campaign `clarity_install_check` (source `diagnostic`, medium
`verification`) from customer analysis: that visit included plan-to-delivery
navigation but no form submission or payment. The test suite passed 69 checks.

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
