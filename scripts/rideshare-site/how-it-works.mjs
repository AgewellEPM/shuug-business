import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

const artwork = '/assets/how-it-works-reference.png';
const crop = (box, className = '') => `<svg class="services-mobile-art ${className}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="${artwork}" width="1024" height="1536"/></svg>`;
const action = (text, href, className) => `<a class="services-hit ${className}" href="${href}"><span class="services-readable">${e(text)}</span></a>`;
const steps = [
  ['Connect', 'Link your gig apps and bank accounts in minutes.', '/get-started', [76, 478, 130, 100]],
  ['Track', 'We automatically pull your earnings, mileage, and business expenses.', '/mileage-and-expenses', [363, 480, 94, 96]],
  ['Organize & Maximize', 'We find every eligible deduction, estimate your taxes, and keep your records ready.', '/document-checklist', [591, 482, 126, 96]],
  ['File & Stay Supported', 'When you’re ready, hire us to prepare and file your return or handle other tax documents.', '/tax-preparation', [836, 481, 129, 97]],
];
const free = [
  'Track your gig income and expenses', 'Automatic mileage tracking (GPS & manual)',
  'Estimate deductions and quarterly taxes', 'Analyze job profitability and driving costs',
  'Organize and store your financial records', 'Access your Gig Tax Pros dashboard',
  'Find participating neighborhood tax offices',
];
const paid = [
  'Tax preparation and electronic filing', 'Business setup (LLC, S-Corp, etc.)',
  'IRS notices, responses, and representation',
  'Other professional services that require document preparation, processing, or signing on your behalf',
];
const paymentSteps = [
  ['Use the app for free.', 'Track, organize, and plan your taxes all year.'],
  ['Request a service when you need it.', 'Choose tax filing, business setup, IRS help, or another paid service.'],
  ['Review your price upfront.', 'We show you the total service fee and any government filing costs before we begin.'],
  ['Approve & pay.', 'Once you authorize the service and (if needed) sign your documents, we get it done.'],
];
const list = items => `<ul>${items.map(item => `<li>${e(item)}</li>`).join('')}</ul>`;

function main() {
  return `<main id="main" tabindex="-1">
    <img class="services-reference" src="${artwork}" width="1024" height="1536" alt="" fetchpriority="high">
    <section class="how-hero" aria-labelledby="how-title">
      <p class="services-readable services-eyebrow">HOW IT WORKS</p>
      <h1 class="services-readable" id="how-title">Use the Tools for Free.<br>Pay Only When You<br><em>Need a Service.</em></h1>
      <p class="services-readable services-lede">Track your gig income, expenses, and deductions all year for free — and only pay when you ask us to prepare, process, file, or handle documents that require signing.</p>
      ${crop([438, 49, 586, 289], 'how-hero-art')}
      <div class="how-hero-actions">${action('▷ See It in Action', '#simple-process', 'how-action-start')}${action('Get Started Free', '/get-started', 'how-action-free')}</div>
    </section>
    <ul class="services-readable services-platforms" aria-label="Gig platforms"><li>Uber</li><li>Lyft</li><li>DoorDash</li><li>Instacart</li><li>amazon flex</li><li>+ All Gig Platforms</li></ul>
    <section class="how-process" id="simple-process" aria-labelledby="how-process-title">
      <h2 class="services-readable" id="how-process-title">The Simple <em>Process</em></h2>
      <p class="services-readable how-section-intro">Four easy steps to keep your gig work organized, compliant, and tax-ready all year long.</p>
      <div class="how-step-grid">${steps.map(([title, text, href, box], index) => `<a href="${href}" class="services-hit how-step how-step-${index + 1}"><div class="services-readable how-step-copy"><span class="how-step-number" aria-hidden="true">${index + 1}</span>${crop(box, 'how-step-icon')}<h3>${e(title)}</h3><p>${e(text)}</p></div></a>`).join('')}</div>
    </section>
    <section class="how-pricing" aria-labelledby="how-pricing-title">
      <div class="services-readable how-pricing-intro"><p class="services-eyebrow">SIMPLE, TRANSPARENT PRICING</p><h2 id="how-pricing-title">Free Tools.<br><em>Real Support.</em><br>No Subscriptions.</h2><p>Gig Tax Pros is free to use. You only pay when you choose to have us perform a professional service that involves preparing, processing, filing, or handling documents that require your signature.</p></div>
      <section class="services-readable how-plan how-free" aria-labelledby="how-free-title"><h3 id="how-free-title">What’s Always <em>Free</em></h3>${list(free)}<p class="how-price"><strong>$0</strong><span>Use the app &amp; tools for free, all year long.</span></p></section>
      <section class="services-readable how-plan how-paid" aria-labelledby="how-paid-title"><h3 id="how-paid-title">When You Pay<br><em>(Paid Services)</em></h3>${list(paid)}<p class="how-price"><span>Pay only for the specific service you choose.</span></p></section>
    </section>
    <section class="how-payment" id="how-payment-works" aria-labelledby="how-payment-title">
      <div class="services-readable"><h2 id="how-payment-title">How Payment <em>Works</em></h2><p class="how-section-intro">You’re always in control. No surprise charges. No monthly fees.</p>
        <ol class="how-payment-steps">${paymentSteps.map(([title, text], index) => `<li><span class="how-step-number" aria-hidden="true">${index + 1}</span><h3>${e(title)}</h3><p>${e(text)}</p></li>`).join('')}</ol>
      </div>
    </section>
    <section class="services-readable services-benefits how-benefits" aria-labelledby="how-benefits-title"><h2 id="how-benefits-title">Why Drivers Choose <em>Gig Tax Pros</em></h2>${list(['Powerful Free Tools (No Subscription)', 'Real Tax Pros Who Know Gig Work', 'You Choose & Approve Paid Services Only', 'Year-Round Support When You Need It'])}</section>
    <section class="how-cta" aria-labelledby="how-cta-title">
      ${crop([16, 1336, 338, 183], 'how-office-art')}
      <h2 class="services-readable" id="how-cta-title">Get Started with <em>Gig Tax Pros</em> Today</h2>
      <p class="services-readable">Use the tools for free, stay organized, and get expert support when you’re ready to file or process your documents.</p>
      ${action('Create Your Free Account →', '/client-portal', 'how-create-account')}${action('Find a Local Office', '/offices', 'how-find-office')}
    </section>
  </main>`;
}

export function howItWorksPage() {
  const description = 'Use the tools for free. Pay only when you choose a professional service. See how Gig Tax Pros connects, organizes and supports your gig work.';
  return {
    slug: 'how-it-works', label: 'How it works', file: 'how-it-works.html',
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>How It Works | Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/how-it-works"><meta property="og:title" content="How It Works | Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/how-it-works"><meta property="og:type" content="website"><meta property="og:image" content="${origin}${artwork}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/services.css"><link rel="stylesheet" href="/how-it-works.css"><link rel="stylesheet" href="/navigation.css"><link rel="preload" as="image" href="${artwork}"><script src="/links.js" defer></script><script src="/app.js" defer></script></head><body class="services-page how-page"><a class="skip-link" href="#main">Skip to content</a><div class="services-sheet how-sheet">${publicHeader('/how-it-works', brand())}${main()}</div>${footer()}${quickActions()}${publicNavigation('/how-it-works')}${dialogs()}</body></html>`,
  };
}
