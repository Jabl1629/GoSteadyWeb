(() => {
  'use strict';

  const dialog = document.querySelector('#setup-video-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const video = dialog.querySelector('video');
  const captions = video.querySelector('track');
  const errorMessage = dialog.querySelector('.setup-video-error');
  let opener;
  let placement;
  let started = false;
  const milestones = new Set();

  function track(name, props = {}) {
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
    if (typeof window.plausible === 'function') {
      window.plausible(name, { props: { video: 'getting-started-v2', placement, ...props } });
    }
  }

  document.querySelectorAll('[data-setup-video]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      if (!started) placement = link.dataset.setupVideo;
      dialog.showModal();
      document.body.classList.add('has-video-dialog');

      // No video or captions request is made until someone chooses to watch.
      if (!video.getAttribute('src')) {
        video.src = video.dataset.src;
        captions.src = captions.dataset.src;
      }
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => {
        // Browser playback restrictions leave native controls available.
      });
    });
  });

  dialog.querySelector('.setup-video-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    document.body.classList.remove('has-video-dialog');
    opener?.focus({ preventScroll: true });
  });
  video.addEventListener('error', () => { errorMessage.hidden = false; });
  video.addEventListener('playing', () => {
    errorMessage.hidden = true;
    if (started) return;
    started = true;
    track('Setup Video Started');
  });
  function trackProgress() {
    if (!started || !Number.isFinite(video.duration) || video.duration <= 0) return;
    // Use actual played ranges so scrubbing forward does not count as watching.
    let watched = 0;
    for (let i = 0; i < video.played.length; i++) {
      watched += video.played.end(i) - video.played.start(i);
    }
    const percentage = watched / video.duration * 100;
    [25, 50, 75, 95].forEach(threshold => {
      if (percentage < threshold || milestones.has(threshold)) return;
      milestones.add(threshold);
      if (threshold === 95) track('Setup Video Completed');
      else track('Setup Video Progress', { percent: threshold });
    });
  }
  video.addEventListener('timeupdate', trackProgress);
  video.addEventListener('ended', trackProgress);
})();
