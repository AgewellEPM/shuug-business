import { platformBar } from './platform-bar.mjs';
import { mobileHeroArt } from './mobile-hero.mjs';
import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

const artwork = '/assets/drivers-reference.png';
const crop = (box, name) => `<svg class="drivers-mobile-art ${name}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="${artwork}" width="1199" height="1312"/></svg>`;
const readable = (text, tag = 'span') => `<${tag} class="drivers-readable">${text}</${tag}>`;
const action = (text, href, name) => `<a class="drivers-hit ${name}" href="${href}">${readable(e(text))}</a>`;
const list = (items, name = '') => `<ul class="drivers-readable drivers-list ${name}">${items.map(text => `<li>${e(text)}</li>`).join('')}</ul>`;
const features = [
  ['Track Earnings Across All Apps', '/get-started', [72, 397, 72, 54]],
  ['Mileage & Expenses', '/mileage-and-expenses', [232, 394, 64, 59]],
  ['Maximize Deductions', '/mileage-and-expenses', [367, 397, 64, 55]],
  ['Estimate & Plan Your Taxes', '/quarterly-taxes', [518, 395, 64, 60]],
  ['File with a Trusted Tax Pro', '/tax-preparation', [675, 396, 68, 61]],
  ['Get the Right Insurance', '#driver-future', [823, 394, 59, 62]],
  ['Build Your Retirement', '#driver-future', [959, 393, 65, 65]],
  ['Real Local Support', '/offices', [1097, 399, 59, 57]],
];

function main() {
  return `<main id="main" tabindex="-1">
    <img class="drivers-reference" src="${artwork}" width="1199" height="1312" alt="" fetchpriority="high">
    <section class="drivers-hero" aria-labelledby="drivers-title">
      ${readable('FOR GIG DRIVERS', 'p')}
      <h1 id="drivers-title" class="drivers-readable">Drive. Earn. Track.<br>Save. File. <em>Grow.</em></h1>
      <p class="drivers-readable drivers-lede">The all-in-one financial platform for Uber, Lyft, DoorDash, Instacart, Amazon Flex, and every gig worker.</p>
      ${mobileHeroArt({ artwork, width: 1199, height: 1312, box: [590, 59, 455, 321], className: 'drivers-hero-art' })}
      <div class="drivers-hero-actions">${action('▷ Get Started Free', '/get-started', 'drivers-start')}${action('⌖ Find a Local Office', '/offices', 'drivers-find')}</div>
      ${platformBar('drivers-platforms')}
    </section>
    <nav class="drivers-features" aria-label="Explore tools and support">${features.map(([title, href, box]) => `<a class="drivers-hit drivers-feature" href="${href}">${crop(box, 'drivers-feature-art')}${readable(e(title))}</a>`).join('')}</nav>
    <div class="drivers-panels">
      <section class="drivers-free drivers-panel" aria-labelledby="drivers-free-title">
        <h2 id="drivers-free-title" class="drivers-readable">Free Tools <em>for Drivers</em></h2>
        ${list(['Connect your gig apps (Uber, Lyft, DoorDash, etc.)', 'Automatic mileage tracking (GPS & manual)', 'Track income, expenses, and deductions', 'See your real profit per job and per mile', 'Plan routes and get paid going home', 'Estimate quarterly taxes and set reminders', 'Access everything free — no subscription'], 'drivers-green-list')}
        ${crop([431, 533, 222, 354], 'drivers-phone-art')}
      </section>
      <section class="drivers-paid drivers-panel" aria-labelledby="drivers-paid-title">
        <h2 id="drivers-paid-title" class="drivers-readable">Pay Only When You Need a Service</h2>
        <p class="drivers-readable">The app is free. You only pay when you choose a professional service like:</p>
        ${list(['Tax preparation and filing', 'Business setup (LLC, S-Corp, etc.)', 'IRS notices and representation', 'Other document services that require preparation, processing, or signing'])}
        ${action('Explore professional services →', '/services', 'drivers-services-link')}
      </section>
      <section id="driver-future" class="drivers-future drivers-panel" aria-labelledby="drivers-future-title">
        <h2 id="drivers-future-title" class="drivers-readable"><span>V2:</span> More Ways to Build Your Future</h2>
        <p class="drivers-readable">Coming soon: insurance, retirement savings, and financial tools built for gig workers.</p>
        <ul class="drivers-readable drivers-future-tools"><li>Auto &amp; Rideshare Insurance</li><li>Retirement Accounts (Save Weekly)</li><li>Business Coverage</li><li>More Financial Tools</li></ul>
      </section>
      <section class="drivers-local drivers-panel" aria-labelledby="drivers-local-title">
        ${crop([9, 890, 281, 190], 'drivers-office-art')}
        <div><h2 id="drivers-local-title" class="drivers-readable">Real People. Real Local Offices.</h2>
        ${list(['Get in-person help when you want it', 'Work with trusted tax pros', 'Nationwide network of neighborhood offices', 'Built for drivers, by people who understand gig work'])}
        ${action('Find a participating office →', '/offices', 'drivers-office-link')}</div>
      </section>
    </div>
    <section class="drivers-cta" aria-labelledby="drivers-cta-title">
      <h2 id="drivers-cta-title" class="drivers-readable">Turn Your Gig Work<br>Into <em>Long-Term Opportunity.</em></h2>
      <p class="drivers-readable">Stay organized, lower your taxes, protect your income, and build real financial security — all in one place.</p>
      ${action('Get Started Free →', '/get-started', 'drivers-final-start')}
    </section>
  </main>`;
}

export function driversPage() {
  const description = 'Free tools for gig drivers, professional tax services when you choose, and local office support. Drive. Earn. Track. Save. File. Grow.';
  return { slug: 'drivers', label: 'Drivers', file: 'drivers.html', html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>For Gig Drivers | Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/drivers"><meta property="og:title" content="For Gig Drivers | Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/drivers"><meta property="og:type" content="website"><meta property="og:image" content="${origin}${artwork}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/drivers.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/hero-mobile.css"><link rel="preload" as="image" href="${artwork}"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/hero-parallax.js" defer></script></head><body class="drivers-page"><a class="skip-link" href="#main">Skip to content</a><div class="drivers-sheet">${publicHeader('/drivers', brand())}${main()}</div>${footer()}${quickActions()}${publicNavigation('/drivers')}${dialogs()}</body></html>` };
}
