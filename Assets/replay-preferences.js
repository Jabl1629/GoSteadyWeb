(function (w, d) {
  'use strict';
  var button = d.getElementById('replay-preference');
  var status = d.getElementById('replay-preference-status');
  if (!button || !status) return;
  var key = 'gosteady-replay-opt-out';
  function update() {
    var off = w.localStorage.getItem(key) === '1';
    button.textContent = off ? 'Allow session replay in this browser' : 'Turn off session replay in this browser';
    status.textContent = off ? 'Session replay is off in this browser.' :
      'Session replay follows your browser privacy preferences and applicable consent settings.';
    if (w.navigator.globalPrivacyControl || w.navigator.doNotTrack === '1') {
      status.textContent = 'Your browser’s privacy signal already disables session replay.';
    }
  }
  button.addEventListener('click', function () {
    try {
      var off = w.localStorage.getItem(key) === '1';
      w.localStorage.setItem(key, off ? '0' : '1');
      update();
    } catch (_) {
      status.textContent = 'Your browser blocked saving this preference. You can enable Global Privacy Control to disable session replay.';
    }
  });
  try { update(); } catch (_) {}
})(window, document);
