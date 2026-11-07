const primary = [
  ['Home', '/'], ['Services', '/services'], ['How It Works', '/how-it-works'],
  ['Drivers', '/get-started'], ['Offices', '/contact'],
  ['Resources', '/resources'], ['About', '/about'],
];
const serviceLinks = [
  ['Tax Preparation', '/tax-preparation'], ['Deductions &amp; Expenses', '/mileage-and-expenses'],
  ['Quarterly Tax Support', '/quarterly-taxes'], ['Income &amp; Mileage Tracking', '/mileage-and-expenses'],
  ['Business Setup', '/contact'], ['IRS Assistance', '/contact'],
  ['Year-Round Support', '/bookkeeping'], ['Local Office Support', '/contact'],
];
const current = (active, href) => active === href ? ' aria-current="page"' : '';
const person = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3Z"/></svg>';

export function publicHeader(active, brandMarkup) {
  return `<header class="public-header"><div class="public-header-inner"><div class="public-brand">${brandMarkup}</div>
    <nav class="public-primary" aria-label="Primary">${primary.map(([text, href]) => href === '/services'
      ? `<details class="public-services"><summary class="public-nav-link"${current(active, href)}>Services <span aria-hidden="true">⌄</span></summary><nav aria-label="Service details"><a href="/services">All services</a>${serviceLinks.map(([label, to]) => `<a href="${to}">${label}</a>`).join('')}</nav></details>`
      : `<a class="public-nav-link" href="${href}"${current(active, href)}>${text}</a>`).join('')}</nav>
    <div class="public-actions"><a class="public-portal" href="/client-portal">${person}<span>Client Portal</span></a><a class="public-ready" href="/get-started">Get Tax-Ready <span aria-hidden="true">→</span></a></div>
    <button class="public-menu-toggle" data-menu aria-label="Open navigation" aria-expanded="false" aria-controls="navigation"><span></span><span></span><span></span></button>
  </div></header>`;
}

export function publicNavigation(active) {
  return `<dialog id="navigation" class="navigation" aria-labelledby="navigation-title"><div class="dialog-top"><strong id="navigation-title">Find your next step</strong><button class="close-button" data-close aria-label="Close navigation">×</button></div><nav aria-label="Main navigation">${[...primary, ['Client Portal', '/client-portal'], ['Get Tax-Ready', '/get-started']].map(([text, href]) => `<a href="${href}"${current(active, href)}>${text}<span aria-hidden="true">↗</span></a>`).join('')}</nav></dialog>`;
}
