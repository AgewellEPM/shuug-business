/* The same progressive-enhancement player can be used on any existing site page. */
(() => {
  for (const root of document.querySelectorAll('.gig-tour')) {
    const video = root.querySelector('video');
    const chapters = [...root.querySelectorAll('button[data-seek]')];
    const status = root.querySelector('.video-status');
    const nowPlaying = root.querySelector('.now-playing');
    const runtime = root.querySelector('.runtime');
    if (!video) continue;
    let requestedStart = null;
    const timestamp = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    const playChapter = () => {
      if (requestedStart === null || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.min(requestedStart, Math.max(0, video.duration - .1));
      requestedStart = null;
      status.textContent = '';
      video.play().catch(() => { status.textContent = 'Chapter ready. Press play to continue.'; });
    };
    for (const button of chapters) {
      button.disabled = false;
      button.addEventListener('click', () => {
        const start = Number(button.dataset.seek);
        if (!Number.isFinite(start) || start < 0) return;
        requestedStart = start;
        if (video.readyState >= 1) playChapter();
        else { status.textContent = 'Loading your chapter…'; video.load(); }
      });
    }
    video.addEventListener('loadedmetadata', () => {
      Array.from(video.textTracks || []).forEach((track, index) => { track.mode = index === 0 ? 'showing' : 'disabled'; });
      if (Number.isFinite(video.duration)) runtime.textContent = `${timestamp(video.duration)} · ${chapters.length} chapters`;
      playChapter();
    });
    video.addEventListener('timeupdate', () => {
      let active = chapters[0];
      for (const button of chapters) if (Number(button.dataset.seek) <= video.currentTime + .05) active = button;
      for (const button of chapters) {
        if (button === active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
      if (active) nowPlaying.textContent = active.dataset.title;
    });
    video.addEventListener('error', () => { status.textContent = 'The video could not load. You can read every step in the transcript below.'; });
  }
})();
