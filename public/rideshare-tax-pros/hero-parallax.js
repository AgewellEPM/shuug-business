'use strict';
(() => {
  const frames = [...document.querySelectorAll('.mobile-hero-frame[data-hero-parallax]')];
  if (!frames.length) return;

  const mobile = window.matchMedia('(max-width: 1023px)');
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const visible = new Set();
  const previousOffsets = new WeakMap();
  let enabled = false;
  let frameRequest = 0;
  let intersectionObserver;
  let resizeObserver;

  function update() {
    frameRequest = 0;
    if (!enabled) return;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    // Read layout before writing transforms. The frame itself never moves.
    const offsets = [...visible].map(frame => {
      const rect = frame.getBoundingClientRect();
      const limit = Math.min(24, rect.height * 0.045);
      const travel = viewportHeight + rect.height;
      const progress = travel > 0 ? (viewportHeight - rect.top) / travel : 0.5;
      const shift = Math.max(-1, Math.min(1, progress * 2 - 1)) * limit;
      return [frame, `${shift.toFixed(3)}px`];
    });
    for (const [frame, offset] of offsets) {
      if (previousOffsets.get(frame) === offset) continue;
      frame.style.setProperty('--hero-shift', offset);
      previousOffsets.set(frame, offset);
    }
  }

  function schedule() {
    if (enabled && visible.size && !frameRequest) frameRequest = window.requestAnimationFrame(update);
  }

  function stop() {
    enabled = false;
    if (frameRequest) window.cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    intersectionObserver?.disconnect();
    resizeObserver?.disconnect();
    intersectionObserver = undefined;
    resizeObserver = undefined;
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    visible.clear();
    for (const frame of frames) {
      frame.classList.remove('hero-parallax-active');
      frame.style.removeProperty('--hero-shift');
      previousOffsets.delete(frame);
    }
  }

  function reconcile() {
    if (!mobile.matches || !motion.matches) {
      stop();
      return;
    }
    if (enabled) {
      schedule();
      return;
    }
    enabled = true;
    frames.forEach(frame => frame.classList.add('hero-parallax-active'));
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        schedule();
      }, { rootMargin: '120px 0px 120px 0px' });
      frames.forEach(frame => intersectionObserver.observe(frame));
    } else frames.forEach(frame => visible.add(frame));
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(schedule);
      frames.forEach(frame => resizeObserver.observe(frame));
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  for (const query of [mobile, motion]) {
    if (query.addEventListener) query.addEventListener('change', reconcile);
    else query.addListener(reconcile);
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', reconcile);
  reconcile();
})();
