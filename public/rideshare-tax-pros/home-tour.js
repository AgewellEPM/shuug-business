(() => {
  const dialog = document.querySelector('#home-tour');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const video = dialog.querySelector('video');
  const status = dialog.querySelector('[data-tour-status]');
  let opener;
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-home-tour]');
    if (!trigger) return;
    event.preventDefault(); opener = trigger;
    dialog.showModal(); status.textContent = '';
    if (window.matchMedia('(max-width: 767px)').matches) {
      // Safari can reject fullscreen until the media has loaded. Playback and
      // the native fullscreen control must still work after that rejection.
      try {
        if (video.requestFullscreen) video.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')?.catch(() => {})).catch(() => {});
        else if (video.readyState >= 1 && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } catch { /* Native controls remain available. */ }
    }
    video.play().catch(() => { status.textContent = 'Press play to watch the tour.'; });
  });
  dialog.querySelector('[data-tour-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { video.pause(); opener?.focus(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  video.addEventListener('loadedmetadata', () => {
    if (video.textTracks.length) video.textTracks[0].mode = 'showing';
  });
  video.addEventListener('error', () => { status.textContent = 'The video could not load. Please try again, or open gigtax.pro/tour for the transcript.'; });
})();
