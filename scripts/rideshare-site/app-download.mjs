import { platformBar } from './platform-bar.mjs';
import { mobileHeroArt } from './mobile-hero.mjs';
import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

const artwork = '/assets/app-download-reference.png';
const crop = (box, name) => `<svg class="download-mobile-art ${name}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="${artwork}" width="1199" height="1312"/></svg>`;
const list = items => `<ul class="download-checks">${items.map(text => `<li>${e(text)}</li>`).join('')}</ul>`;
const featureItems = [
  ['Job Profitability', 'See if a job makes or loses you money before you accept it.', [91, 673, 65, 50]],
  ['Get Paid Going Home™', 'Turn empty miles into real earnings with route-based job suggestions.', [288, 670, 64, 54]],
  ['Mileage Tracking', 'Automatic GPS tracking, mileage reports, and records for reviewing driving deductions.', [472, 672, 69, 51]],
  ['Expense Manager', 'Track fuel, wear, maintenance, tolls, supplies, and more with photo receipts.', [668, 670, 55, 54]],
  ['Tax Readiness', 'Stay organized all year, estimate what you owe, and prepare to file with a trusted local pro.', [853, 669, 63, 54]],
  ['Earn More & Save More', 'Find higher-paying jobs, cut unnecessary costs, and keep more of what you earn.', [1045, 669, 72, 54]],
];
const storeLink = (device, name, className, iconBox, label) => `<a class="download-hit ${className}" data-app-download="${device}" href="#app-download" aria-label="${e(label)}">${iconBox ? crop(iconBox, 'download-device-art') : ''}<span class="download-readable"><span class="download-device-kicker">Download for</span><strong>${e(name)}</strong><span class="download-device-store">${device === 'ios' ? 'App Store' : 'Google Play'}</span></span></a>`;

function main() {
  return `<main id="main" tabindex="-1">
    <img class="download-reference" src="${artwork}" width="1199" height="1312" alt="" fetchpriority="high">
    <section class="download-hero" aria-labelledby="download-title">
      <p class="download-readable download-eyebrow">DOWNLOAD THE APP</p>
      <h1 class="download-readable" id="download-title">Get the Free<br>Gig Tax Pros <em>App</em></h1>
      <p class="download-readable download-lede">The all-in-one money, job, and tax command center for gig workers. Drive smarter, earn more, keep more, and stay tax-ready — all in one free app.</p>
      <div class="download-readable">${list(['Track earnings across all your gig apps', 'Know if a job makes or loses you money', 'Get paid going home with smart routes', 'Track mileage, expenses, and deductions', 'Be ready for tax season all year long'])}</div>
      ${mobileHeroArt({ artwork, width: 1199, height: 1312, box: [462, 58, 737, 425], className: 'download-hero-art' })}
      ${platformBar('download-platforms')}
    </section>
    <section class="download-devices" aria-labelledby="download-devices-title">
      <h2 class="download-readable" id="download-devices-title">Choose your device</h2>
      ${storeLink('ios', 'iPhone (iOS)', 'download-device download-device-ios', [55, 503, 73, 76], 'Check iPhone app download availability')}
      ${storeLink('android', 'Android', 'download-device download-device-android', [642, 502, 68, 80], 'Check Android app download availability')}
      <span class="download-compatibility download-compatibility-ios" aria-hidden="true">Download availability coming soon</span>
      <span class="download-compatibility download-compatibility-android" aria-hidden="true">Download availability coming soon</span>
    </section>
    <section class="download-features" id="download-features" aria-labelledby="download-features-title">
      <h2 class="download-readable" id="download-features-title">What You Can Do <em>in the App</em></h2>
      <div class="download-feature-grid">${featureItems.map(([title, text, box]) => `<a class="download-hit download-feature" href="/app-features#app-features"><div class="download-readable">${crop(box, 'download-feature-art')}<h3>${e(title)}</h3><p>${e(text)}</p></div></a>`).join('')}</div>
    </section>
    <section class="download-free-strip" aria-labelledby="download-free-title">
      <a class="download-qr" href="#app-download" aria-label="Open this download page and check app availability"><img src="/assets/app-download-qr.svg" width="154" height="155" alt="QR code for the Gig Tax Pros download page"></a>
      <div class="download-readable download-scan-copy"><h2>Scan to <em>Download</em></h2><p>Open your camera and scan the code to open this download page.</p><p class="download-qr-caption">Scan for download availability.</p></div>
      <div class="download-readable download-free-copy"><h2 id="download-free-title">Free to Use. <em>Pay Only for Services.</em></h2>${list(['The app is free to use, with no subscription.', 'Track, plan, and optimize your gig work at no cost.', 'Only pay if you choose a professional service like tax preparation, business setup, or other document services.'])}</div>
      <div class="download-office-copy"><p class="download-readable">Need In-Person Help?</p><a class="download-hit download-office-link" href="/offices"><span class="download-readable">Find a Local Office →</span></a></div>
    </section>
    ${crop([0, 1070, 1199, 106], 'download-city-art')}
    <section class="download-brand-row" aria-label="Gig Tax Pros app availability">
      <div class="download-readable download-brand-copy">${brand()}<h2>The Financial Platform Built<br>for Gig Workers, <em>by Gig Workers.</em></h2></div>
      <a class="download-hit download-store-footer download-footer-ios" href="#app-download" data-app-download="ios" aria-label="Check App Store availability"><span class="download-readable">App Store</span><span class="download-rating-correction" aria-hidden="true">Coming soon</span></a>
      <a class="download-hit download-store-footer download-footer-android" href="#app-download" data-app-download="android" aria-label="Check Google Play availability"><span class="download-readable">Google Play</span><span class="download-rating-correction" aria-hidden="true">Coming soon</span></a>
    </section>
  </main>`;
}

export function appDownloadPage() {
  const description = 'Explore the free Gig Tax Pros app for earnings, job profitability, mileage, expenses, and tax readiness. Check current iPhone and Android download availability.';
  const availability = `<section class="download-availability" id="app-download" aria-labelledby="download-availability-title"><p class="download-eyebrow">GET THE APP</p><h2 id="download-availability-title">Your gig work.<br><em>All in one place.</em></h2><p id="app-download-status" role="status" tabindex="-1">iPhone and Android download links are coming soon.</p><div id="app-download-links" class="download-availability-links"></div><p>Explore the tools while public download links are being prepared. <a class="text-link" href="/app-features">See all app features →</a></p><noscript><p>Enable JavaScript to see available app download links.</p></noscript></section>`;
  return {
    slug: 'get-the-app', label: 'Get The App', file: 'get-the-app.html',
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>Get The App | Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/get-the-app"><meta property="og:title" content="Get The App | Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/get-the-app"><meta property="og:type" content="website"><meta property="og:image" content="${origin}${artwork}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/app-download.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/hero-mobile.css"><link rel="preload" as="image" href="${artwork}"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/hero-parallax.js" defer></script><script src="/app-download.js" defer></script></head><body class="download-page"><a class="skip-link" href="#main">Skip to content</a><div class="download-sheet">${publicHeader('/get-the-app', brand())}${main()}</div>${availability}${footer()}${quickActions()}${publicNavigation('/get-the-app')}${dialogs()}</body></html>`,
  };
}
