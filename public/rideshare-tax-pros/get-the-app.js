'use strict';
(() => {
  const destination = document.querySelector('#app-download-links');
  if (!destination) return;
  Promise.resolve(window.rtpSiteConfig || {}).then(config => {
    const links = [
      ['Get the iPhone App', config.iosDownloadUrl],
      ['Get the Android App', config.androidDownloadUrl],
    ];
    for (const [label, value] of links) {
      const href = window.rtpLinks.publicHttpsUrl(value);
      if (!href) continue;
      const link = document.createElement('a');
      link.className = 'button primary'; link.textContent = `${label} ↗`; link.href = href;
      destination.append(link);
    }
    if (destination.childElementCount) document.querySelector('#app-download-status').textContent = 'Choose your device to get the free Gig Tax Pros app.';
  });
})();
