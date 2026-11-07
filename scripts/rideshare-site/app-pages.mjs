import { appFeatures } from './app-features.mjs';
import { appScreens } from './app-screens.mjs';
import { escape as e, button, textLink } from './layout.mjs';

const route = feature => `app/${typeof feature === 'string' ? feature : feature.id}`;
const journey = [
  ['Set your own targets', 'Start with your goals and vehicle-cost estimate, so the numbers reflect how you work.', 'earnings'],
  ['Look at the whole job', 'Review the pay, fees, travel, waiting and missing details before deciding in the original gig app.', 'offers'],
  ['Plan your way home', 'Compare the job and onward travel with your destination and finish time in mind.', 'routes'],
  ['Save what happened', 'Keep completed work, mileage, income, purchases and supporting receipts together.', 'trips'],
  ['Learn from your records', 'Review your earnings and ask record-based questions before the next shift or tax conversation.', 'coach'],
];

function checkCatalog() {
  const ids = new Set(appFeatures.map(feature => feature.id));
  if (ids.size !== appFeatures.length) throw new Error('Duplicate app-feature IDs.');
  for (const feature of appFeatures) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature.id)) throw new Error('Invalid app-feature ID.');
    if (feature.related.some(id => !ids.has(id) || id === feature.id)) throw new Error(`Invalid related app feature: ${feature.id}`);
  }
  const screenIds = new Set();
  for (const screen of appScreens) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(screen.id) || screenIds.has(screen.id)) throw new Error('Invalid or duplicate app-screen ID.');
    if (!/^\/assets\/[a-zA-Z0-9_./-]+$/.test(screen.src) || screen.src.includes('..')) throw new Error('App screenshots must use local asset paths.');
    if (![screen.width, screen.height].every(value => Number.isInteger(value) && value > 0 && value <= 10000)) throw new Error('Invalid app-screen dimensions.');
    if (![screen.alt, screen.label, screen.caption].every(value => typeof value === 'string' && value.trim())) throw new Error('App screenshots need descriptive text.');
    screenIds.add(screen.id);
  }
}

function featureCard(feature) {
  const search = [feature.label, feature.kicker, feature.title, feature.description, feature.intro,
    ...feature.features.flatMap(item => [item.title, item.text])].join(' ');
  return `<a class="app-feature-card" href="/${route(feature)}" data-search-card data-search-text="${e(search)}" data-feature-id="${e(feature.id)}">
    <span class="card-kicker">${e(feature.kicker)}</span><h3>${e(feature.label)} <span aria-hidden="true">↗</span></h3>
    <p>${e(feature.description)}</p><ul>${feature.features.slice(0, 3).map(item => `<li>${e(item.title)}</li>`).join('')}</ul>
    <span class="app-feature-card-action">Explore ${e(feature.label.toLowerCase())}</span></a>`;
}

function screenFigure(screen, context = 'detail') {
  const tour = context === 'tour';
  return `<figure class="app-screen" id="${e(context)}-screen-${e(screen.id)}"${tour ? ` data-tour-frame data-screen-id="${e(screen.id)}" data-tour-topic="${e(screen.topic || '')}"` : ''}>
    <div class="app-screen-media"><img src="${e(screen.src)}" width="${screen.width}" height="${screen.height}" alt="${e(screen.alt)}" loading="${context === 'intro' ? 'eager' : 'lazy'}" decoding="async"></div>
    <figcaption class="app-screen-caption"><span class="card-kicker">ACTUAL APP · DEMONSTRATION DATA</span><h3>${e(screen.label)}</h3><p>${e(screen.caption)}</p>${screen.tap ? `<p class="app-screen-tap"><strong>In the app:</strong> ${e(screen.tap)}</p>` : ''}<a class="text-link app-screen-full" href="${e(screen.src)}" target="_blank" rel="noopener noreferrer" aria-label="${e(`Open ${screen.label} app image at full size`)}">Open image at full size <span aria-hidden="true">↗</span></a></figcaption></figure>`;
}

function tourSection() {
  if (!appScreens.length) return '';
  return `<section class="article-section app-tour" id="app-tour" data-app-tour aria-labelledby="app-tour-title">
    <div class="section-heading"><p class="eyebrow">SEE THE REAL APP</p><h2 id="app-tour-title">A closer look.<br>One screen at a time.</h2><p>Explore captured app screens with demonstration records. The captions explain where to go and what each screen helps you review.</p></div>
    <div class="app-tour-controls"><label for="app-tour-select">Choose a screen<select id="app-tour-select" data-tour-select aria-controls="app-tour-frames" disabled>${appScreens.map(screen => `<option value="${e(screen.id)}">${e(screen.label)}</option>`).join('')}</select></label>
      <div class="app-tour-buttons"><button class="button secondary" type="button" data-tour-prev aria-controls="app-tour-frames" disabled>← Previous screen</button><button class="button primary" type="button" data-tour-next aria-controls="app-tour-frames" disabled>Next screen →</button></div></div>
    <p class="app-tour-status" data-tour-status role="status" aria-live="polite">${appScreens.length} app screens shown below.</p>
    <div class="app-tour-frames" id="app-tour-frames">${appScreens.map(screen => screenFigure(screen, 'tour')).join('')}</div>
    <p class="field-hint">This is a website walkthrough. It does not start a drive, access another app, connect an account or save financial records.</p>
    <noscript><p>All captured screens and their captions are available below the controls without JavaScript.</p></noscript></section>`;
}

function availabilitySection() {
  return `<section class="article-section app-availability" id="app-availability" aria-labelledby="app-availability-title">
    <div class="section-heading"><p class="eyebrow">AVAILABILITY & YOUR CHOICES</p><h2 id="app-availability-title">Know what is ready.<br>Choose what to connect.</h2><p>These pages describe an iPhone app in development. Public App Store availability has not been announced here.</p></div>
    <div class="app-availability-grid">
      <section><h3>Start with your phone</h3><p>Local records, cost assumptions and review tools form the core experience. Location, motion, notifications, photos and screen sharing have their own permission and setup steps.</p></section>
      <section><h3>Add a firm account by invitation</h3><p>Workspace features need your invited client account and a configured firm workspace. This public website does not sign you in or upload your tax records.</p></section>
      <section><h3>Check each connection</h3><p>Opening a gig app, reading an offer and linking a provider account are different actions. Bank and provider connections require approved, configured access. You make the actual gig decision in its original app.</p></section>
      <section><h3>Review protected-data setup</h3><p>Device-key setup and manual encrypted Journal snapshots are preview features. Full automatic encrypted synchronization, legacy-data migration and recovery are not activated.</p></section>
    </div><div class="related-links">${textLink('Understand connections and privacy', '/app/connections')}${textLink('Check client workspace availability', '/client-portal')}</div></section>`;
}

function hubPage() {
  const firstScreen = appScreens.find(screen => screen.topic === 'home') || appScreens[0];
  return {
    slug: 'app', label: 'Gig Tax Pros app', nav: '/app', appPage: true,
    title: 'Your shift.', accent: 'A clearer picture.',
    seoTitle: 'Gig Tax Pros App: Offers, Mileage, Earnings & Records',
    eyebrow: 'GIG TAX PROS · IPHONE APP PREVIEW',
    description: 'Explore the Gig Tax Pros app: review offers, plan your way home, record mileage and costs, understand earnings and prepare useful records for your tax team.',
    heroActions: `<div class="hero-actions-row">${button(appScreens.length ? 'Explore the real app screens' : 'Explore the app features', appScreens.length ? '#app-tour' : '#app-features')}${button('Find the feature I need', '#app-features', false)}</div>`,
    body: `<section class="app-hub-intro app-feature-hero"><div><p class="eyebrow">MORE THAN A TAX-SEASON CHECKLIST</p><h2>Useful through<br>the working day.</h2><p>Bring your work decisions and records into one routine. Set your own costs and goals, review a job, record the work you completed and use those records to understand the numbers.</p><p>Follow a feature below for the actual steps, the details it keeps and the setup it needs.</p>${textLink('Read availability and setup notes', '#app-availability')}</div>${firstScreen ? screenFigure(firstScreen, 'intro') : ''}</section>
    <section class="article-section app-journey" id="app-how-it-works"><p class="eyebrow">HOW IT FITS YOUR SHIFT</p><h2>From the next job<br>to your next review.</h2><ol class="app-feature-steps">${journey.map(([title, text, id], index) => `<li><span class="step-number" aria-hidden="true">0${index + 1}</span><div><h3>${e(title)}</h3><p>${e(text)}</p>${textLink('See how it works', `/${route(id)}`)}</div></li>`).join('')}</ol></section>
    <section class="article-section app-feature-finder" id="app-features" data-search-library data-search-noun="feature area" data-search-plural="feature areas" aria-labelledby="app-features-title"><p class="eyebrow">EXPLORE EVERY PART</p><h2 id="app-features-title">What do you want<br>to do next?</h2><div class="search-controls"><label for="app-feature-search">Find an app feature<input id="app-feature-search" type="search" data-search-input placeholder="Try receipts, offers, shopping or goals"></label></div><p class="search-result-count" data-search-count role="status" aria-live="polite">${appFeatures.length} feature areas</p><div class="app-feature-grid">${appFeatures.map(featureCard).join('')}</div><p class="empty-results" data-search-empty hidden>No matching feature. Clear your search or try a broader word.</p><noscript><p>All feature guides are listed here without using search.</p></noscript></section>
    ${tourSection()}${availabilitySection()}
    <section class="inner-cta"><div><p class="eyebrow">GET THE RECORDS READY</p><h2>Take a clearer story<br>into your tax conversation.</h2><p>Explore the app’s recordkeeping, then use the public checklist to organize what you want to discuss.</p></div>${button('Open the preparation checklist', '/document-checklist')}</section>`,
  };
}

function featurePage(feature) {
  const explicitScreens = feature.screenIds.map(id => appScreens.find(screen => screen.id === id)).filter(Boolean);
  const screens = [...explicitScreens, ...appScreens.filter(screen => screen.topic === feature.id && !explicitScreens.includes(screen))];
  const related = feature.related.map(id => appFeatures.find(item => item.id === id));
  return {
    slug: route(feature), label: feature.label, nav: '/app', appPage: true,
    parent: { slug: 'app', label: 'Gig Tax Pros app' },
    title: feature.title, eyebrow: `IPHONE APP PREVIEW · ${feature.kicker}`,
    seoTitle: `${feature.label} | Gig Tax Pros App`, description: feature.description,
    heroActions: `<div class="hero-actions-row">${button('See the steps', '#app-steps')}${button('Explore all app features', '/app#app-features', false)}</div>`,
    body: `<section class="app-feature-intro"><p>${e(feature.intro)}</p></section>
    <section class="article-section" id="app-steps"><p class="eyebrow">YOUR NEXT STEPS</p><h2>How to use it.</h2><ol class="app-feature-steps">${feature.steps.map((step, index) => `<li><span class="step-number" aria-hidden="true">0${index + 1}</span><div><h3>${e(step.title)}</h3><p>${e(step.text)}</p></div></li>`).join('')}</ol></section>
    <section class="article-section" id="app-details"><p class="eyebrow">THE DETAILS THAT HELP</p><h2>What is included.</h2><div class="app-feature-details">${feature.features.map((item, index) => `<section id="${e(feature.id)}-feature-${index + 1}"><h3>${e(item.title)}</h3><p>${e(item.text)}</p></section>`).join('')}</div></section>
    ${screens.length ? `<section class="article-section" id="app-screens"><p class="eyebrow">INSIDE THE APP</p><h2>See these tools<br>on the real screens.</h2><div class="app-screen-grid">${screens.map(screen => screenFigure(screen)).join('')}</div></section>` : ''}
    ${feature.conditions.length ? `<aside class="app-conditions"><h2>Before you use it.</h2><ul>${feature.conditions.map(condition => `<li>${e(condition)}</li>`).join('')}</ul>${textLink('Read app availability and connection details', '/app#app-availability')}</aside>` : ''}
    <section class="article-section"><p class="eyebrow">KEEP EXPLORING</p><h2>Make the next step<br>part of your routine.</h2><div class="app-feature-grid app-feature-related">${related.map(featureCard).join('')}</div>${textLink('Back to the complete app guide', '/app')}</section>`,
  };
}

export function appPages() {
  checkCatalog();
  return [hubPage(), ...appFeatures.map(featurePage)];
}
