import { escape } from '../rideshare-site/layout.mjs';
import { salesPages } from '../rideshare-site/sales.mjs';
import { bookingAPIGuide, clientBookingPage, connectionPage } from '../rideshare-site/sales-booking.mjs';
import { gettingStarted } from './getting-started-page.mjs';

const loginForm = `<section id="sales-login" class="sales-panel"><h2>Sales workspace sign-in</h2>
<form id="sales-login-form" class="sales-form" method="post">
<label>Business email <input name="email" type="email" autocomplete="username"></label>
<label>Private access code <input name="code" type="password" maxlength="200" autocomplete="current-password" required></label>
<button type="submit" class="button primary">Sign in</button>
</form></section>`;

const contractInputs = `<label>Contracting business<input name="business" required maxlength="180"></label>
<label>Agreement title<input name="agreementTitle" required maxlength="180"></label>
<label>Full agreement<textarea name="agreementText" required minlength="100" maxlength="10000" rows="9"></textarea></label>`;

export function renderWorkspace(profile, signIn) {
  const careWorkspace = profile.focus === 'senior-care';
  const legacy = salesPages({ prospects: true, careWorkspace });
  const branded = html => html.replace(/Gig Tax Pros|GIG TAX PROS/g, () => escape(profile.name));
  const portal = signIn ? ` data-identity-portal="${escape(signIn)}"` : '';
  const standalone = `data-standalone-sdr data-workspace-name="${escape(profile.name)}" data-directory-profile="${profile.directory}"${profile.contracts === 'agreement' ? ' data-agreement-only' : ''}${portal}`;
  const site = escape(profile.publicSite || '/sales');
  function salesPage(source) {
    const careStyles = careWorkspace ? ['sales-demo','care-hub','care-kiosks','care-locations','care-facility','care-stroke','care-library','care-tour','care-pilot','sales-care-campaign','sales-products']
      .map(name => `<link rel="stylesheet" href="/${name}.css">`).join('') : '';
    const careScripts = careWorkspace ? ['care-locations','care-facility','care-stroke','care-library','care-kiosk-packs','care-kiosks','care-tour','care-venue-tour','care-pilot','sales-demo','care-hub','sales-care-campaign','sales-products']
      .map(name => `<script src="/${name}.js" defer></script>`).join('') : '';
    let sales = source
      .replace('</head>', '<link rel="stylesheet" href="/sales-getting-started.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-tour-steps.js" defer></script><script src="/sales-getting-started.js" defer></script><script src="/sales.js"')
      .replace('</body>', gettingStarted + '</body>')
      .replace('<div class="sdr-topbar-right">', '<div class="sdr-topbar-right"><button class="button secondary" type="button" data-sdr-tour-open hidden>Getting started</button>')
      .replace('</head>', '<link rel="stylesheet" href="/sales-coach.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-coach-controls.js" defer></script><script src="/sales-coach.js" defer></script><script src="/sales.js"')
      .replace('</head>', '<link rel="stylesheet" href="/sales-contract-center.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-contract-center.js" defer></script><script src="/sales.js"')
      .replace('</head>', careStyles + '</head>')
      .replace('<script src="/sales.js"', careScripts + '<script src="/sales.js"')
      .replace('</head>', '<link rel="stylesheet" href="/sales-overview.css"><link rel="stylesheet" href="/sales-team.css"><link rel="stylesheet" href="/sales-prospects.css"><link rel="stylesheet" href="/facility-reviews.css"><link rel="stylesheet" href="/sales-booking.css"><link rel="stylesheet" href="/sales-chat.css"><link rel="stylesheet" href="/sales-email.css"><link rel="stylesheet" href="/sales-support.css"><link rel="stylesheet" href="/sales-today.css"><link rel="stylesheet" href="/sales-training.css"><link rel="stylesheet" href="/sales-training-demo.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/booking-ui.js" defer></script><script src="/sales-booking.js" defer></script><script src="/sales-linkedin.js" defer></script><script src="/sales-campaigns.js" defer></script><script src="/sales-overview.js" defer></script><script src="/sales-chat.js" defer></script><script src="/sdr-headshots.js" defer></script><script src="/sales-team.js" defer></script><script src="/territory-county-leads.js" defer></script><script src="/territory-ownership.js" defer></script><script src="/territory-town-map.js" defer></script><script src="/territory-facilities.js" defer></script><script src="/facility-reviews.js" defer></script><script src="/sales-prospects.js" defer></script><script src="/sales-mail-team.js" defer></script><script src="/sales-email.js" defer></script><script src="/sales-support-content.js" defer></script><script src="/sales-support.js" defer></script><script src="/sales-today.js" defer></script><script src="/sales-training.js" defer></script><script src="/sales-training-voice.js" defer></script><script src="/sales-training-pipeline.js" defer></script><script src="/sales.js"')
      .replace('</head>', '<link rel="stylesheet" href="/territory-dashboard.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/territory-dashboard.js" defer></script><script src="/sales.js"')
      .replace('</head>', '<link rel="stylesheet" href="/sales-pipeline-workspace.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-pipeline-workspace.js" defer></script><script src="/sales.js"')
      .replace('</head>', '<link rel="stylesheet" href="/sales-certification.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-certification.js" defer></script><script src="/sales.js"')
      .replace(/<section id="sales-login"[^>]*>[\s\S]*?<\/section>/, loginForm)
      .replace('<body class="sales-console-page">', `<body class="sales-console-page" ${standalone}${careWorkspace ? ' data-care-workspace' : ''}>`)
      .replace(/<img src="\/assets\/brand-mark\.svg"[^>]*>/g, '')
      .replace('<link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml">', '')
      .replace('<a class="sdr-brand" href="/"', `<a class="sdr-brand" href="${site}"`)
      .replace('<a href="/">Open public website ↗</a>', profile.publicSite ? `<a href="${site}">Open public website ↗</a>` : '');
    sales = sales
      .replace('</head>', '<link rel="stylesheet" href="/sales-display.css"><script src="/sales-display.js" defer></script></head>')
      .replace(/<form id="sdr-header-search"[^>]*>[\s\S]*?<\/form>/, '')
      .replace('<section class="cc-search-results', '<form class="cc-card" data-cc-search role="search"><label>Search campaign materials <input type="search" maxlength="180"></label></form><section class="cc-search-results')
      .replace(/<button[^>]*id="sales-logout"[^>]*>/, button => '<button type="button" class="button secondary" data-display-open>Settings</button>' + button)
      .replace('</body>', `<dialog class="sdr-display" aria-labelledby="sdr-display-title">
        <form method="dialog">
          <h2 id="sdr-display-title">Settings</h2>
          <label>Text and interface size
            <select name="scale"><option value="100">100% (default)</option><option value="125">125%</option><option value="150">150%</option><option value="175">175%</option><option value="200">200%</option></select>
          </label>
          <label class="sdr-display-check"><input type="checkbox" name="monochrome"> Black and white</label>
          <button type="button" class="button secondary" data-display-read aria-pressed="false">Read aloud</button>
          <span class="sdr-reading-status" role="status" data-display-reading-status></span>
          <div class="sdr-display-actions"><button type="button" class="button secondary" data-display-reset>Reset</button><button class="button primary" autofocus>Done</button></div>
        </form>
      </dialog></body>`);
    if (profile.directory === 'project') {
      sales = sales.replace('Find local tax offices', 'Find local businesses');
    }
    if (profile.contracts === 'agreement') {
      sales = sales
        .replace(/<p>Membership: \$300[\s\S]*?<\/p>/, '')
        .replace(/<label>Contracting legal business name[\s\S]*?(?=<button class="button secondary" type="button" id="sales-preview-terms">)/, contractInputs)
        .replace('I approve this agreement for office enrollment, including the 12-month price and payment schedule.', 'I reviewed and approve this agreement for this workspace.');
    }
    return branded(sales);
  }
  const frame = (title, main, scripts = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${escape(title)} | ${escape(profile.name)}</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/sales.css">${scripts}</head><body class="inner-page" ${standalone}><main>${main}</main></body></html>`;
  let signup = legacy.find(page => page.slug === 'office-signup').main
    .replace('Your office.<br><em>Our next chapter.</em>', 'Review and sign your agreement')
    .replace('independently owned tax office', 'independently owned business')
    .replace('Use business details only. Client tax records and taxpayer IDs do not belong in this signup.', 'Use business details only.');
  if (profile.contracts === 'agreement') {
    signup = signup.replace('Signing records the agreement. Your office activates after the $500 initial payment is verified. The $300 monthly charge continues for the remaining 11 months.', '')
      .replace('Continue to secure $500 checkout', 'Continue to checkout');
  }
  const pages = new Map([
    ['/book', clientBookingPage(profile.name)], ['/book/connect', connectionPage(profile.name)], ['/book/api', bookingAPIGuide(profile.name)],
    ['/sales', salesPage(legacy.find(page => page.slug === 'sales').html)],
    ['/sales/review-data', frame('Google Maps review data', `<article class="sales-panel">
      <h1>Google Maps review data</h1>
      <h2>Terms of use</h2>
      <p>Google Maps content is subject to the <a href="https://maps.google.com/help/terms_maps/" rel="noreferrer">Google Maps End User Additional Terms of Service</a>.</p>
      <h2>Privacy</h2>
      <p>Opening the reviews panel with Google Places connected sends the facility’s name and public address to Google to identify the listing. Your sales contact details and notes stay in the workspace. The app displays the ratings and reviews for the current profile without saving them to the workspace.</p>
      <p>See the <a href="https://policies.google.com/privacy" rel="noreferrer">Google Privacy Policy</a> and <a href="https://support.google.com/contributionpolicy/answer/7422880" rel="noreferrer">Google Maps review policy</a>.</p>
      <p><a href="/sales">Return to the sales workspace</a></p>
    </article>`)],
    ['/office-signup', frame('Private agreement', branded(signup), '<script src="/contract-signature.js" defer></script><script src="/sales.js" defer></script>')],
  ]);
  if (signIn) {
    const location = legacy.find(page => page.slug === 'location').main
      .replace('https://portal.gigtax.pro/', escape(signIn)).replace('Your tax location', 'Your location');
    pages.set('/location', frame('Location workspace', branded(location), '<script src="/sales.js" defer></script>'));
  }
  return pages;
}
