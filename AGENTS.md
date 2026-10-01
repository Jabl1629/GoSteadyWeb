# Checkout decisions

User decision, October 1, 2026:

- The D2C checkout has three steps: Founding Family Offer, Address details,
  then Payment.
- Availability, estimated shipping, and preorder/deposit details are
  intentionally disclosed at step 3, before payment. The experiment measures
  willingness to proceed with the product offer before that disclosure. Do not
  move these details into steps 1 or 2 unless the user changes this decision.
- This is a measure of offer interest, not proof of willingness to pay or a sale.
  Never emit a purchase event before a verified payment.
- The new Meta optimization goal is `OfferAccepted`: an explicit transition
  from the offer into the address step. Browser Pixel and server CAPI use the
  same event ID. `AddShippingInfo` remains a successfully saved address;
  `Purchase` remains a verified paid deposit.
- The user handles Meta campaign configuration. Website work must not change
  campaigns or ad budgets.
