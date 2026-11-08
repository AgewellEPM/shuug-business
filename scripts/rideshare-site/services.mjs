import { visual } from './visuals.mjs';
import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

const artwork = '/assets/services-reference.png';
const offerings = [
  ['Tax Preparation', 'File your gig income, self-employment, and business taxes accurately and on time.', '/tax-preparation', [70, 503, 139, 86]],
  ['Deductions & Expenses', 'Maximize what you can legally deduct — mileage, phone, supplies, gear, and more.', '/mileage-and-expenses', [328, 505, 124, 84]],
  ['Quarterly Tax Support', 'Stay compliant with quarterly estimates and avoid IRS penalties.', '/quarterly-taxes', [579, 504, 122, 84]],
  ['Income & Mileage Tracking', 'Track earnings, expenses, and miles across all your gig apps in one place.', '/mileage-and-expenses', [811, 504, 130, 83]],
  ['Business Setup', 'Start or grow your business (LLC, S-Corp, or sole prop) with the right tax strategy.', '/contact', [88, 687, 105, 80]],
  ['IRS Assistance', 'Get help with notices, letters, payment plans, and representation.', '/contact', [337, 684, 113, 81]],
  ['Year-Round Support', 'Not just tax season. Get answers, updates, and planning help all year long.', '/bookkeeping', [582, 685, 114, 82]],
  ['Local Office Support', 'Work with a real person at a nearby Gig Tax Pros location in your community.', '/offices', [815, 686, 115, 82]],
];

// Photographs are decorative; every piece of page copy remains visible HTML.
const crop = (box, name = '') => visual('services', box, name);
const label = text => `<span class="page-copy">${e(text)}</span>`;
const action = (text, href, className) => `<a class="page-link ${className}" href="${href}">${label(text)}</a>`;

function main() {
  return `<main id="main" tabindex="-1">

    <section class="services-hero" aria-labelledby="services-title">
      <p class="page-copy services-eyebrow">OUR KEY SERVICES</p>
      <h1 id="services-title" class="page-copy">Everything You Need<br>for Your <em>Gig Work,<br>Taxes &amp; Business.</em></h1>
      <p class="page-copy services-lede">One team. One platform. Year-round support for drivers, contractors, and small business owners.</p>
      ${crop([391, 49, 633, 314], 'services-hero-art')}
      <div class="services-hero-actions">${action('Get Started Today →', '/get-started', 'services-hero-start')}${action('See How It Works', '#how-it-works', 'services-hero-watch')}</div>
    </section>
    <ul class="page-copy services-platforms" aria-label="Gig platforms"><li>Uber</li><li>Lyft</li><li>DoorDash</li><li>Instacart</li><li>amazon flex</li><li>+ All Gig Platforms</li></ul>
    <nav class="section-nav" aria-label="On this page"><a href="#key-services">Services</a><a href="#how-it-works">How it works</a><a href="#why-drivers">Why Gig Tax Pros</a></nav>
    <section id="key-services" class="services-catalog" aria-labelledby="key-services-title">
      <h2 id="key-services-title" class="page-copy">Key Services <em>at a Glance</em></h2>
      <p class="page-copy services-section-intro">Tax prep, deductions, business setup, and ongoing support — built for the way you work.</p>
      <div class="service-filter" data-service-filters role="group" aria-label="Filter services" hidden>${[['all','All services'],['tax','Taxes'],['records','Records & mileage'],['support','Business & support']].map(([value,label]) => `<button type="button" data-filter="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}</div><p class="service-count" data-service-count role="status" hidden>8 services shown</p>
      <div class="services-card-grid">${offerings.map(([title, text, href, box], index) => `<a class="page-link services-card services-card-${index + 1}" data-service-category="${['tax','records','tax','records','support','tax','support','support'][index]}" href="${href}"><div class="page-copy services-card-copy">${crop(box, 'services-card-icon')}<h3>${e(title)}</h3><p>${e(text)}</p><span class="services-card-arrow" aria-hidden="true">↗</span></div></a>`).join('')}</div>
    </section>
    <section class="services-how" id="how-it-works" aria-labelledby="services-how-title">
      <div class="page-copy services-how-copy"><h2 id="services-how-title">How It <em>Works</em></h2><p>A simple, proven process to keep you organized, compliant, and earning more.</p></div>
      ${crop([0, 870, 308, 278], 'services-phone-art')}
      <ol class="page-copy services-steps">
        <li><span aria-hidden="true">1</span><h3>Connect</h3><p>Link your gig apps (Uber, Lyft, DoorDash, Instacart, and more).</p></li>
        <li><span aria-hidden="true">2</span><h3>Organize</h3><p>We capture your earnings, mileage, and expenses automatically.</p></li>
        <li><span aria-hidden="true">3</span><h3>Prepare</h3><p>Our tax pros build your return, find every deduction, and keep you compliant.</p></li>
        <li><span aria-hidden="true">4</span><h3>File &amp; Support</h3><p>File with confidence and get year-round support for your gig work and business.</p></li>
      </ol>
      ${action('Get Started', '/get-started', 'services-phone-action')}
    </section>
    <section id="why-drivers" class="page-copy services-benefits" aria-labelledby="services-benefits-title">
      <h2 id="services-benefits-title">Why Drivers Choose <em>Gig Tax Pros</em></h2>
      <ul><li>Keep More of What You Earn</li><li>Real Tax Pros Who Know Gig Work</li><li>Local Offices &amp; Real Support</li><li>More Than Taxes — A Year-Round Partner</li></ul>
    </section>
    <section class="services-cta" aria-labelledby="services-cta-title">
      ${crop([22, 1290, 336, 202], 'services-office-art')}
      <h2 id="services-cta-title" class="page-copy">Get Started with <em>Gig Tax Pros</em> Today</h2>
      <p class="page-copy">File your taxes, track your income, and get the support you need — all in one place.</p>
      ${action('Create Your Account →', '/client-portal', 'services-create-account')}${action('Find a Local Office', '/offices', 'services-find-office')}
    </section>
  </main>`;
}

export function servicesPage() {
  const description = 'Everything you need for your gig work, taxes and business. Tax preparation, deductions, quarterly support and local office support.';
  return {
    slug: 'services', label: 'Services', file: 'services.html',
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>Services | Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/services"><meta property="og:title" content="Services | Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/services"><meta property="og:type" content="website"><meta property="og:image" content="${origin}${artwork}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/native-pages.css"><link rel="stylesheet" href="/services.css"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/page-experience.js" defer></script></head><body class="services-page native-page"><a class="skip-link" href="#main">Skip to content</a><div class="services-sheet">${publicHeader('/services', brand())}${main()}</div>${footer()}${quickActions()}${publicNavigation('/services')}${dialogs()}</body></html>`,
  };
}
