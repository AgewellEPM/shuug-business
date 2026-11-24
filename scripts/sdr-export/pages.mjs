import { escape } from '../rideshare-site/layout.mjs';
import { salesPages } from '../rideshare-site/sales.mjs';

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
  function salesPage(source, seniorCare = false) {
    let sales = source
      .replace('</head>', '<link rel="stylesheet" href="/sales-overview.css"><link rel="stylesheet" href="/sales-team.css"><link rel="stylesheet" href="/sales-prospects.css"><link rel="stylesheet" href="/sales-chat.css"></head>')
      .replace('<script src="/sales.js"', '<script src="/sales-linkedin.js" defer></script><script src="/sales-campaigns.js" defer></script><script src="/sales-overview.js" defer></script><script src="/sales-chat.js" defer></script><script src="/sdr-headshots.js" defer></script><script src="/sales-team.js" defer></script><script src="/territory-county-leads.js" defer></script><script src="/territory-ownership.js" defer></script><script src="/territory-town-map.js" defer></script><script src="/territory-facilities.js" defer></script><script src="/sales-prospects.js" defer></script><script src="/sales.js"')
      .replace(/<section id="sales-login"[^>]*>[\s\S]*?<\/section>/, loginForm)
      .replace('<body class="sales-console-page">', `<body class="sales-console-page" ${standalone}${seniorCare ? ' data-care-crm' : ''}>`)
      .replace(/<img src="\/assets\/brand-mark\.svg"[^>]*>/g, '')
      .replace('<link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml">', '')
      .replace('<a class="sdr-brand" href="/"', `<a class="sdr-brand" href="${site}"`)
      .replace('<a href="/">Open public website ↗</a>', profile.publicSite ? `<a href="${site}">Open public website ↗</a>` : '');
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
    ['/sales', salesPage(legacy.find(page => page.slug === 'sales').html)],
    ['/office-signup', frame('Private agreement', branded(signup), '<script src="/contract-signature.js" defer></script><script src="/sales.js" defer></script>')],
  ]);
  if (careWorkspace) {
    const care = salesPages({ prospects: true, seniorCare: true, careWorkspace });
    pages.set('/sales/senior-care', salesPage(care.find(page => page.slug === 'sales').html, true));
  }
  if (signIn) {
    const location = legacy.find(page => page.slug === 'location').main
      .replace('https://portal.gigtax.pro/', escape(signIn)).replace('Your tax location', 'Your location');
    pages.set('/location', frame('Location workspace', branded(location), '<script src="/sales.js" defer></script>'));
  }
  return pages;
}
