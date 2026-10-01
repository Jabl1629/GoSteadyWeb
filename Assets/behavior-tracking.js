/* Public shopping-flow diagnostics. No form values or customer identifiers are sent. */
(function (w, d) {
  'use strict';
  var OPT_OUT_KEY = 'gosteady-replay-opt-out';
  var QA_KEY = 'gosteady-behavior-qa';
  var projectId = d.currentScript && d.currentScript.getAttribute('data-clarity-project');
  var params = new URLSearchParams(w.location.search);
  var checkout = /^\/(checkoutV2|checkout-v2\.html)\/?$/.test(w.location.pathname);
  var publicPage = checkout || /^\/(index\.html)?$/.test(w.location.pathname);
  var qa = /^(qa|test|internal)$/i.test(params.get('utm_source') || '') ||
    /^(qa|test)$/i.test(params.get('utm_medium') || '') || params.get('qa') === '1';
  try {
    if (qa) w.sessionStorage.setItem(QA_KEY, '1');
    qa = qa || w.sessionStorage.getItem(QA_KEY) === '1';
  } catch (_) { /* The URL exclusion still works with storage disabled. */ }
  var optedOut = false;
  try { optedOut = w.localStorage.getItem(OPT_OUT_KEY) === '1'; } catch (_) {}
  var privateQuery = false;
  params.forEach(function (value, key) {
    if (/^(email|prefilled_email|phone|address|first_name|last_name|token|session_id|client_reference_id)$/i.test(key) ||
        /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) privateQuery = true;
  });
  if (w.location.hostname !== 'gosteady.co' || !publicPage || qa || optedOut || privateQuery ||
      w.navigator.globalPrivacyControl || w.navigator.doNotTrack === '1') return;

  var seen = new Set();
  function safely(fn) { try { return fn(); } catch (_) {} }
  function replay() {
    var args = arguments;
    safely(function () { if (typeof w.clarity === 'function') w.clarity.apply(w, args); });
  }
  function plan() {
    var annual = d.getElementById('plan-annual');
    return annual && annual.checked ? 'annual' : 'monthly';
  }
  var currentStage = checkout ? 'plan' : 'homepage';
  function signal(name, plausibleName, detail) {
    replay('event', name);
    if (!plausibleName || seen.has(plausibleName)) return;
    seen.add(plausibleName);
    var props = Object.assign({ checkout_stage: currentStage, experience_version: 'replay_2026_09_29' }, detail || {});
    if (checkout) props.service_plan = plan();
    safely(function () {
      if (typeof w.plausible === 'function') w.plausible(plausibleName, { props: props });
    });
  }

  // Mask before loading the recorder. Clarity also masks inputs in every mode.
  d.querySelectorAll('input, textarea, select, [data-private]').forEach(function (node) {
    node.setAttribute('data-clarity-mask', 'true');
  });
  if (projectId && /^[a-z0-9]+$/i.test(projectId)) {
    w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
    var script = d.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + projectId;
    d.head.appendChild(script);
    // Do not manufacture a consent grant. Clarity's regional consent defaults apply.
    replay('set', 'experience_version', 'replay_2026_09_29');
    replay('set', 'page_type', checkout ? 'checkout' : 'homepage');
  }

  w.addEventListener('error', function (event) {
    if (event.message) signal('script_error', 'V2 Browser Error');
  });
  w.addEventListener('unhandledrejection', function () {
    signal('unhandled_error', 'V2 Browser Error');
  });

  if (!checkout) {
    replay('event', 'homepage_viewed');
    d.querySelectorAll('[data-v2-cta], [data-pricing-cta]').forEach(function (link) {
      link.addEventListener('click', function () {
        if (link.getAttribute('href') !== '#pricing') replay('event', 'homepage_checkout_clicked');
      });
    });
    return;
  }

  var stages = ['plan-step', 'shipping-step', 'preorder-step', 'notify-confirmation'];
  var stageNames = ['plan', 'delivery', 'reservation', 'notification_confirmation'];
  var stageObserver;
  function updateStage() {
    var next = stages.findIndex(function (id) {
      var element = d.getElementById(id);
      return element && !element.classList.contains('hidden');
    });
    if (next === -1) return;
    var name = stageNames[next];
    if (name === currentStage && seen.has('stage_initialized')) return;
    currentStage = name;
    seen.add('stage_initialized');
    replay('set', 'checkout_stage', name);
    replay('event', name + '_viewed');
    updateButtonExposure();
  }

  var continueButton = d.getElementById('continue-delivery');
  var exposureTimer = null;
  var inView = false;
  function updateButtonExposure() {
    if (exposureTimer !== null) { w.clearTimeout(exposureTimer); exposureTimer = null; }
    if (!inView || currentStage !== 'plan' || d.visibilityState !== 'visible' || seen.has('delivery_button_seen')) return;
    exposureTimer = w.setTimeout(function () {
      exposureTimer = null;
      if (d.visibilityState !== 'visible' || currentStage !== 'plan' || !inView) return;
      seen.add('delivery_button_seen');
      replay('set', 'delivery_button_seen', 'yes');
      signal('delivery_button_seen', 'V2 Delivery Button Seen');
    }, 1000);
  }
  if (continueButton) {
    continueButton.addEventListener('click', function () {
      replay('set', 'plan_continued', 'yes');
      replay('set', 'service_plan', plan());
      replay('event', 'plan_continue_clicked');
    });
    if (typeof w.IntersectionObserver === 'function') {
      var exposureObserver = new w.IntersectionObserver(function (entries) {
        inView = entries.some(function (entry) { return entry.isIntersecting && entry.intersectionRatio >= 0.5; });
        updateButtonExposure();
      }, { threshold: [0, 0.5] });
      exposureObserver.observe(continueButton);
      d.addEventListener('visibilitychange', updateButtonExposure);
    }
  }
  ['plan-monthly', 'plan-annual'].forEach(function (id) {
    var radio = d.getElementById(id);
    if (radio) radio.addEventListener('change', function () {
      replay('set', 'service_plan', plan());
      replay('event', 'service_plan_changed');
    });
  });
  replay('set', 'service_plan', plan());
  updateStage();
  if (typeof w.MutationObserver === 'function') {
    stageObserver = new w.MutationObserver(function () { safely(updateStage); });
    stages.forEach(function (id) {
      var node = d.getElementById(id);
      if (node) stageObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
    });
  }

  var form = d.getElementById('shipping-form');
  var fieldIds = ['first-name', 'last-name', 'email', 'phone', 'address-one', 'address-two', 'city', 'region', 'postal-code'];
  function startForm(event) {
    if (currentStage !== 'delivery' || fieldIds.indexOf(event.target.id) === -1 || seen.has('address_form_started')) return;
    if (!String(event.target.value || '').trim()) return;
    seen.add('address_form_started');
    replay('set', 'address_form_started', 'yes');
    signal('address_form_started', 'V2 Address Form Started');
  }
  if (form) {
    form.addEventListener('input', startForm);
    form.addEventListener('change', startForm);
    form.addEventListener('invalid', function (event) {
      if (fieldIds.indexOf(event.target.id) === -1) return;
      signal('address_validation_error', 'V2 Address Validation Error', { field: event.target.id });
    }, true);
    form.addEventListener('submit', function () { replay('event', 'address_submit_attempted'); });
  }
  if (typeof w.MutationObserver === 'function') {
    [['shipping-error', 'address_save_error', 'V2 Address Save Error'],
      ['payment-error', 'payment_handoff_error', 'V2 Payment Handoff Error']].forEach(function (item) {
      var element = d.getElementById(item[0]);
      if (!element) return;
      var errorObserver = new w.MutationObserver(function () {
        if (element.classList.contains('show')) signal(item[1], item[2]);
      });
      errorObserver.observe(element, { attributes: true, attributeFilter: ['class'] });
    });
  }
  var reserve = d.getElementById('continue-payment');
  if (reserve) reserve.addEventListener('click', function () { replay('event', 'reservation_continue_clicked'); });
  var notify = d.getElementById('notify-button');
  if (notify) notify.addEventListener('click', function () { replay('event', 'notify_requested'); });
})(window, document);
