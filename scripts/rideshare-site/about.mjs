import { platformBar } from './platform-bar.mjs';
import { mobileHeroArt } from './mobile-hero.mjs';
import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

const artwork = '/assets/about-reference.png';
const crop = (box, name) => `<svg class="about-mobile-art ${name}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="${artwork}" width="941" height="1672"/></svg>`;
const action = (text, href, name) => `<a class="about-hit ${name}" href="${href}"><span class="about-readable">${e(text)}</span></a>`;
const beliefs = [
  ['Transparency', 'Clear data, no guesswork.'], ['Real Numbers', 'Know what you’re actually earning.'],
  ['Real People', 'Built by gig workers, for gig workers.'], ['Local Offices', 'In your community when you need support.'],
  ['No Subscriptions', 'The app is free. No monthly fees.'],
];
const help = [
  ['Job Profitability Analyzer', 'See the real profit of each job after fuel, time, wear, and taxes — so you can focus on the work that actually makes money.', '/about-the-app#app-features', [78, 1091, 65, 48]],
  ['Get Paid Going Home', 'Turn your drive home into earnings with smart opportunities along your route.', '/about-the-app#app-features', [265, 1087, 64, 52]],
  ['Mileage & Expense Tracking', 'Automatically track your miles, income, and key expenses — ready for tax time.', '/mileage-and-expenses', [454, 1093, 56, 43]],
  ['Tax Planning & Filing Support', 'Stay compliant, find more deductions, and file with confidence with our expert tax support.', '/tax-preparation', [632, 1088, 42, 50]],
  ['Real Local Office Support', 'Get in-person help from a local team that understands gig work and your goals.', '/offices', [804, 1087, 57, 50]],
];

function main() {
  return `<main id="main" tabindex="-1"><img class="about-reference" src="${artwork}" width="941" height="1672" alt="" fetchpriority="high">
    <section class="about-hero" aria-labelledby="about-title"><p class="about-readable about-eyebrow">ABOUT GIG TAX PROS</p><h1 class="about-readable" id="about-title">Founded by<br>Gig Workers.<br>Built to Help<br><em>You Win.</em></h1><p class="about-readable about-lede">Gig Tax Pros is more than taxes — it helps you understand whether jobs are making or losing money, track mileage and income, optimize routes, and get paid going home.</p>${mobileHeroArt({ artwork, width: 941, height: 1672, box: [375, 48, 566, 375], className: 'about-hero-art' })}<div class="about-hero-actions">${action('Get Started Free →', '/get-the-app', 'about-hero-start')}${action('See App Features', '/about-the-app#app-features', 'about-hero-features')}</div>${platformBar('about-platforms')}</section>
    <section class="about-story" aria-labelledby="about-story-title">${crop([34, 444, 422, 183], 'about-story-art')}<div class="about-readable"><h2 id="about-story-title">Our <em>Story</em></h2><p>We’re gig workers just like you. We started Gig Tax Pros after learning the hard way that not every job actually makes money.</p><p>After factoring in fuel, time, wear and tear, and taxes, we realized many of the jobs we were taking were costing us more than they paid. That wake-up call sparked a simple idea: gig workers deserve real tools, real numbers, and a smarter way to earn.</p></div></section>
    <section class="about-why" aria-labelledby="about-why-title"><div class="about-readable"><h2 id="about-why-title">Why We Built <em>This</em></h2><p>Gig Tax Pros isn’t just a tax service — it’s a complete earnings toolkit for gig workers. We built it to help you:</p><ul class="about-checks">${['Know which jobs are profitable (and which ones lose money)', 'Get a clear, real picture of your earnings', 'Make smarter, more confident work decisions', 'Optimize your routes and time on the road', 'Get local, real-person support when you need it'].map(text => `<li>${e(text)}</li>`).join('')}</ul></div>${crop([476, 656, 435, 204], 'about-phone-art')}</section>
    <section class="about-beliefs" aria-labelledby="about-beliefs-title"><h2 class="about-readable" id="about-beliefs-title">What<br>We <em>Believe</em></h2><ul class="about-readable">${beliefs.map(([title, text]) => `<li><h3>${e(title)}</h3><p>${e(text)}</p></li>`).join('')}</ul></section>
    <section class="about-help" aria-labelledby="about-help-title"><h2 class="about-readable" id="about-help-title">How We Help <em>You Win</em></h2><div class="about-help-grid">${help.map(([title, text, href, box]) => `<a class="about-hit about-help-card" href="${href}"><div class="about-readable">${crop(box, 'about-card-icon')}<h3>${e(title)}</h3><p>${e(text)}</p></div></a>`).join('')}</div></section>
    <section class="about-mission" aria-labelledby="about-mission-title">${crop([17, 1307, 438, 185], 'about-mission-art')}<div class="about-readable"><p class="about-eyebrow">OUR MISSION</p><h2 id="about-mission-title">Help Gig Workers Keep More of What They Earn and Build <em>Long-Term Financial Security.</em></h2><p>We’re here to give gig workers the tools, insights, and support to earn smarter today and build a stronger, more secure tomorrow.</p></div></section>
    <section class="about-cta" aria-labelledby="about-cta-title"><h2 class="about-readable" id="about-cta-title">Ready to <em>Earn Smarter?</em></h2><p class="about-readable">Track earnings, find profitable work, get paid going home, and keep more of what you earn.</p><div class="about-cta-actions">${action('Get Started Free →', '/get-the-app', 'about-final-start')}${action('See App Features', '/about-the-app#app-features', 'about-final-features')}</div></section>
    </main>`;
}

export function aboutPage() {
  const description = 'Founded by gig workers. Built to help you win. Our story, values and mission to help gig workers earn smarter and keep more of what they earn.';
  return { slug: 'about', label: 'About Gig Tax Pros', file: 'about.html', html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>About Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/about"><meta property="og:title" content="About Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/about"><meta property="og:type" content="website"><meta property="og:image" content="${origin}${artwork}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/about.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/hero-mobile.css"><link rel="preload" as="image" href="${artwork}"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/hero-parallax.js" defer></script></head><body class="about-reference-page"><a class="skip-link" href="#main">Skip to content</a><div class="about-sheet">${publicHeader('/about', brand())}${main()}</div>${footer()}${quickActions()}${publicNavigation('/about')}${dialogs()}</body></html>` };
}
