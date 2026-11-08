'use strict';
(() => {
  const destination = document.querySelector('#app-download-links');
  const status = document.querySelector('#app-download-status');
  if (!destination || !status) return;
  const names = { ios: 'iPhone', android: 'Android' };
  const available = new Map();
  const safeUrl = value => window.rtpLinks.publicHttpsUrl(value);

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-app-download]');
    if (!control || available.has(control.dataset.appDownload)) return;
    event.preventDefault();
    status.textContent = `${names[control.dataset.appDownload] || 'App'} download links are coming soon. Explore the app features while public downloads are prepared.`;
    document.querySelector('#app-download').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    status.focus({ preventScroll: true });
  });

  Promise.resolve(window.rtpSiteConfig || {}).catch(() => ({})).then(value => {
    const config = value && typeof value === 'object' ? value : {};
    for (const [platform, value] of [['ios', config.iosDownloadUrl], ['android', config.androidDownloadUrl]]) {
      const href = safeUrl(value);
      if (!href) continue;
      available.set(platform, href);
      const link = document.createElement('a');
      link.className = 'button primary';
      link.textContent = `Get the ${names[platform]} App ↗`;
      link.href = href;
      destination.append(link);
      for (const control of document.querySelectorAll(`[data-app-download="${platform}"]`)) {
        control.href = href;
        control.dataset.available = 'true';
        control.setAttribute('aria-label', `Download the ${names[platform]} app`);
        const footerLabel = control.querySelector('.download-rating-correction');
        if (footerLabel) footerLabel.textContent = 'View app';
      }
      const availability = document.querySelector(`.download-compatibility-${platform}`);
      if (availability) availability.textContent = 'Public download available';
    }
    status.textContent = available.size === 2 ? 'Choose your device to get the free Gig Tax Pros app.'
      : available.size === 1 ? `${names[[...available.keys()][0]]} download is available. Other public download links are coming soon.`
      : 'iPhone and Android download links are coming soon.';
  });
})();
