(() => {
  const dialog = document.querySelector('#family-story-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const video = dialog.querySelector('video');
  const captions = video.querySelector('track');
  const error = dialog.querySelector('.family-story-error');
  let opener;
  document.querySelectorAll('[data-family-story]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      dialog.showModal();
      document.body.classList.add('has-video-dialog');
      if (!video.getAttribute('src')) {
        video.src = video.dataset.src;
        captions.src = captions.dataset.src;
      }
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => {});
    });
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    document.body.classList.remove('has-video-dialog');
    opener?.focus({preventScroll: true});
  });
  video.addEventListener('error', () => { error.hidden = false; });
  video.addEventListener('playing', () => { error.hidden = true; });
})();
