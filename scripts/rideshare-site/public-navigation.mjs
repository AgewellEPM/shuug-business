const primary = [
  ['Home', '/'], ['About', '/about'], ['Services', '/services'],
  ['How It Works', '/how-it-works'], ['Drivers', '/drivers'], ['Offices', '/offices'],
];
const current = (active, href) => active === href ? ' aria-current="page"' : '';
const person = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3Z"/></svg>';

export function publicHeader(active, brandMarkup) {
  return `<header class="public-header"><div class="public-header-inner"><div class="public-brand">${brandMarkup}</div>
    <nav class="public-primary" aria-label="Primary">${primary.map(([text, href]) => `<a class="public-nav-link" href="${href}"${current(active, href)}>${text}</a>`).join('')}</nav>
    <div class="public-actions"><a class="public-portal" href="/client-portal">${person}<span>My Portal</span></a><a class="public-ready" href="/get-the-app"${current(active, '/get-the-app')}>Get The App <span aria-hidden="true">→</span></a></div>
    <button class="public-menu-toggle" data-menu aria-label="Open navigation" aria-expanded="false" aria-controls="navigation"><span></span><span></span><span></span></button>
  </div></header>`;
}

export function publicNavigation(active) {
  return `<dialog id="navigation" class="navigation" aria-labelledby="navigation-title"><div class="dialog-top"><strong id="navigation-title">Find your next step</strong><button class="close-button" data-close aria-label="Close navigation">×</button></div><nav aria-label="Main navigation">${[...primary, ['My Portal', '/client-portal'], ['Get The App', '/get-the-app']].map(([text, href]) => `<a href="${href}"${current(active, href)}>${text}<span aria-hidden="true">↗</span></a>`).join('')}</nav></dialog>`;
}
