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
    for (const track of video.textTracks) track.mode = 'disabled';
  });
  video.addEventListener('error', () => { status.textContent = 'The video could not load. Open Chapters & transcript below to follow the guide.'; });
})();
