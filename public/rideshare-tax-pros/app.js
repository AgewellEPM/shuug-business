'use strict';
(() => {
  const navigation = document.querySelector('#navigation');
  const information = document.querySelector('#information');
  const title = document.querySelector('#information-title');
  const description = document.querySelector('#information-description');
  const extra = document.querySelector('#information-extra');
  const actions = document.querySelector('#information-actions');
  let config = {};
  let currentPanel = null;
  const content = {
    start: ['Let’s get you tax-ready.', 'Rideshare tax preparation, records review and year-round support, all centered on the way you work.'],
    portal: ['Your client workspace.', 'Your Rideshare Tax Pros client workspace is powered by Shuug.'],
    filing: ['Built for rideshare drivers.', 'Tax preparation for Uber, Lyft and independent drivers, with a workflow that keeps your records and accountant review together.'],
    deductions: ['Make your records count.', 'Bring your income, mileage and business expense records together for review with your tax professional.'],
    quarterly: ['Plan beyond tax season.', 'Quarterly review support helps you and your accountant stay organized throughout the year.'],
    support: ['A team for the whole year.', 'Get support with tax questions, business records and planning as your rideshare business grows.'],
    platform: ['Powered by Shuug.', 'One AI Business Operating System. Any Industry. Your Rules. Rideshare Tax Pros uses Shuug’s configurable Tax Firm industry pack.'],
  };
  function safeUrl(value) {
    if (!value) return null;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  function link(label, href, primary = true) {
    const a = document.createElement('a');
    a.className = `button ${primary ? 'primary' : 'secondary'}`;
    a.textContent = label; a.href = href;
    actions.append(a);
  }
  function renderPanel(key) {
    if (!content[key]) return;
    currentPanel = key;
    title.textContent = content[key][0]; description.textContent = content[key][1];
    extra.replaceChildren(); actions.replaceChildren();
    const workspace = safeUrl(config.workspaceUrl);
    const drake = safeUrl(config.drakePortalUrl);
    const email = typeof config.contactEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail) ? config.contactEmail : null;
    const phone = typeof config.contactPhone === 'string' && /^\+?[\d ()-]{7,25}$/.test(config.contactPhone) ? config.contactPhone : null;
    if (key === 'platform') {
      const p = document.createElement('p'); p.textContent = 'Your firm’s brand. A shared, modular business platform.'; extra.append(p);
      return;
    }
    if (workspace) link('Open my Shuug workspace ↗', workspace);
    if (key === 'portal' && drake) link('External filing portal ↗', drake, !workspace);
    if (phone) link(`Call ${phone}`, `tel:${phone.replace(/[^+\d]/g, '')}`, !workspace);
    if (email) link('Contact Rideshare Tax Pros', `mailto:${email}`, !workspace && !phone);
    if (!workspace && !phone && !email && !(key === 'portal' && drake)) {
      const p = document.createElement('p'); p.className = 'availability';
      p.textContent = key === 'portal' ? 'Client access is opening soon. Please check back for your secure sign-in link.' : 'New client onboarding is opening soon. Please check back for availability.';
      extra.append(p);
    }
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-dialog]');
    if (trigger) {
      navigation.close(); renderPanel(trigger.dataset.dialog);
      if (!information.open) information.showModal();
      return;
    }
    if (event.target.closest('[data-menu]')) {
      navigation.showModal(); document.querySelectorAll('[data-menu]').forEach(button => button.setAttribute('aria-expanded', 'true')); return;
    }
    const close = event.target.closest('[data-close]');
    if (close) { close.closest('dialog').close(); return; }
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault(); navigation.close();
      const section = nav.dataset.nav;
      const mobile = matchMedia('(max-width: 800px)').matches;
      const target = section === 'home' ? '#main' : `#${mobile ? 'mobile' : 'desktop'}-${section}`;
      document.querySelector(target)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  });
  for (const dialog of [navigation, information]) dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  navigation.addEventListener('close', () => document.querySelectorAll('[data-menu]').forEach(button => button.setAttribute('aria-expanded', 'false')));
  fetch('./site-config.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : {}).then(value => {
    if (value && typeof value === 'object') config = value;
    if (currentPanel && information.open) renderPanel(currentPanel);
  }).catch(() => {});
})();
