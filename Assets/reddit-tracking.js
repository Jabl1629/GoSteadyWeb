/* GoSteady website advertising only; never loaded in the product demos. */
(function (w, d) {
  'use strict';
  function allowed() { return w.location.hostname === 'gosteady.co' && !w.navigator.globalPrivacyControl; }
  if (!allowed()) return;
  var params = new URLSearchParams(w.location.search);
  var clickId = params.get('rdt_cid') || '';
  if (!/^[A-Za-z0-9._~-]{1,512}$/.test(clickId)) clickId = '';
  try {
    if (clickId) w.sessionStorage.setItem('gs_reddit_click', JSON.stringify({ id: clickId, at: Date.now() }));
    else {
      var saved = JSON.parse(w.sessionStorage.getItem('gs_reddit_click') || 'null');
      if (saved && Date.now() - saved.at < 28 * 86400000 && /^[A-Za-z0-9._~-]{1,512}$/.test(saved.id)) clickId = saved.id;
    }
  } catch (_) {}
  function attribution() {
    if (!allowed()) return { reddit_opt_out: 'true' };
    var uuid = '';
    try {
      var match = d.cookie.match(/(?:^|;\s*)_rdt_uuid=([^;]*)/);
      if (match) uuid = decodeURIComponent(match[1]).split('.').pop();
    } catch (_) {}
    return { reddit_opt_out: 'false', rdt_cid: clickId, reddit_uuid: uuid };
  }
  // Keep arbitrary form fields and care-recipient information out of ad events.
  var mapping = {
    InitiateCheckout: 'CheckoutStarted', CheckoutDeliveryViewed: 'DeliveryViewed',
    ServicePlanSelected: 'PlanSelected', AddShippingInfo: 'AddressCompleted',
    AddPaymentInfo: 'DepositCheckoutOpened', Lead: 'UpdatesRequested'
  };
  function milestone(name, id) {
    if (!allowed() || !mapping[name]) return;
    try {
      var data = { customEventName: mapping[name] };
      if (id) data.conversionId = id;
      w.rdt('track', 'Custom', data);
    } catch (_) {}
  }
  w.GoSteadyReddit = { attribution: attribution, milestone: milestone };
  !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement('script');t.src='https://www.redditstatic.com/ads/pixel.js?pixel_id=a2_jqogsii64m2e';t.async=true;var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(t,s);}}(w,d);
  w.rdt('init', 'a2_jqogsii64m2e');
  w.rdt('track', 'PageVisit');
})(window, document);
