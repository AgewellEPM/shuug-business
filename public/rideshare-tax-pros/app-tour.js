/* A guided gallery of authentic screenshots, never a simulated app connection. */
(() => {
  document.querySelectorAll('[data-app-tour]').forEach(tour => {
    const frames = [...tour.querySelectorAll('[data-tour-frame]')];
    const select = tour.querySelector('[data-tour-select]');
    const previous = tour.querySelector('[data-tour-prev]');
    const next = tour.querySelector('[data-tour-next]');
    const status = tour.querySelector('[data-tour-status]');
    if (!frames.length || !select || !previous || !next || !status) return;
    let current = 0;
    function show(index) {
      current = Math.min(frames.length - 1, Math.max(0, index));
      frames.forEach((frame, i) => { frame.hidden = i !== current; });
      select.value = frames[current].dataset.screenId;
      previous.disabled = current === 0;
      next.disabled = current === frames.length - 1;
      status.textContent = `${current + 1} of ${frames.length} · ${select.selectedOptions[0]?.textContent || 'App screen'}`;
    }
    select.disabled = false;
    previous.addEventListener('click', () => show(current - 1));
    next.addEventListener('click', () => show(current + 1));
    select.addEventListener('change', () => {
      const index = frames.findIndex(frame => frame.dataset.screenId === select.value);
      if (index >= 0) show(index);
    });
    for (const control of [previous, next]) control.addEventListener('keydown', event => {
      const indices = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: frames.length - 1 };
      if (!(event.key in indices)) return;
      event.preventDefault();
      show(indices[event.key]);
      if (control.disabled) (current === 0 ? next : previous).focus();
    });
    tour.classList.add('app-tour-ready');
    show(0);
  });
})();
