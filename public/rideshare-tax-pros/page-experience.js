'use strict';
(() => {
  // Filters enhance ordinary links; without JavaScript every service stays visible.
  const filters = document.querySelector('[data-service-filters]');
  if (filters) {
    const cards = [...document.querySelectorAll('[data-service-category]')];
    const count = document.querySelector('[data-service-count]');
    filters.hidden = false;
    count.hidden = false;
    filters.addEventListener('click', event => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      const selected = button.dataset.filter;
      for (const item of filters.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
      for (const card of cards) card.hidden = selected !== 'all' && card.dataset.serviceCategory !== selected;
      const visible = cards.filter(card => !card.hidden).length;
      count.textContent = `${visible} ${visible === 1 ? 'service' : 'services'} shown`;
    });
  }
  const jumpLinks = [...document.querySelectorAll('.section-nav a')];
  if ('IntersectionObserver' in window && jumpLinks.length) {
    const tracker = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      for (const link of jumpLinks) {
        if (link.hash === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }, { rootMargin: '-15% 0px -45% 0px' });
    jumpLinks.forEach(link => { const section = document.getElementById(link.hash.slice(1)); if (section) tracker.observe(section); });
  }
  // Content is always visible. Animate once on entry; never hide it pending JS.
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('section-entered');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('main > section:not(:first-child), .home-native > section:not(:first-child), .services-card, .app-feature, .about-help-card').forEach(section => observer.observe(section));
})();
