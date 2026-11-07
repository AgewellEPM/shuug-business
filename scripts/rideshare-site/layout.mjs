import { origin, sources, reviewed } from './content.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';
export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const button = (label, href, primary = true) => `<a class="button ${primary ? 'primary' : 'secondary'}" href="${escape(href)}">${escape(label)} <span aria-hidden="true">↗</span></a>`;
export const textLink = (label, href) => `<a class="text-link" href="${escape(href)}">${escape(label)} <span aria-hidden="true">↗</span></a>`;
const links = [['Services', '/services'], ['How it works', '/how-it-works'], ['Free to use', '/free'], ['Resources', '/resources'], ['About', '/about']];
export function brand() { return `<a class="brand" href="/"><span class="brand-symbol" aria-hidden="true"></span><span>Gig Tax Pros<sup>™</sup><small>TAX & ACCOUNTING</small></span></a>`; }
export function navigation(active = '') {
  return `<dialog id="navigation" class="navigation" aria-labelledby="navigation-title"><div class="dialog-top"><strong id="navigation-title">Find your next step</strong><button class="close-button" data-close aria-label="Close navigation">×</button></div><nav aria-label="Main navigation">${[['Home', '/'], ...links, ['Document checklist', '/document-checklist'], ['FAQs', '/faq'], ['Contact', '/contact'], ['Client portal', '/client-portal']].map(([label, href]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}<span aria-hidden="true">↗</span></a>`).join('')}</nav></dialog>`;
}
export function header(active) {
  return `<header class="inner-header"><div class="inner-header-content">${brand()}<nav class="desktop-links" aria-label="Primary">${links.map(([label, href]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="header-actions"><a class="header-portal" href="/client-portal">Client portal ↗</a><button class="menu-button" data-menu aria-label="Open navigation" aria-expanded="false" aria-controls="navigation"><span></span><span></span><span></span></button></div></div></header>`;
}
export function footer() {
  const nav = (label, items) => `<nav aria-label="Footer ${escape(label)}"><h2>${escape(label)}</h2>${items.map(([name, href]) => `<a href="${href}">${escape(name)}</a>`).join('')}</nav>`;
  return `<footer class="site-footer"><div class="footer-main"><div class="footer-brand">${brand()}<p>You drive.<br>We handle the taxes.</p></div>${nav('Tax & accounting', [['All services', '/services'], ['Tax preparation', '/tax-preparation'], ['Mileage & expenses', '/mileage-and-expenses'], ['Quarterly support', '/quarterly-taxes'], ['Bookkeeping', '/bookkeeping']])}${nav('Start here', [['How it works', '/how-it-works'], ['Free to use', '/free'], ['Get started', '/get-started'], ['About the firm', '/about'], ['Contact & availability', '/contact']])}${nav('Driver resources', [['Document checklist', '/document-checklist'], ['Uber & Lyft tax forms', '/guides/uber-lyft-tax-forms'], ['Resource library', '/resources'], ['Frequently asked questions', '/faq'], ['Client portal', '/client-portal']])}</div><div class="footer-bottom"><p>© <span data-year>2026</span> Gig Tax Pros. All rights reserved.</p><nav aria-label="Legal"><a href="/privacy">Privacy notice</a><a href="/terms">Website terms</a><a href="/accessibility">Accessibility</a><a href="#main">Back to top ↑</a></nav></div><p class="footer-disclaimer">Independent of Uber and Lyft. Their trademarks belong to their respective owners. General information is not individualized tax advice. No refund or tax saving is guaranteed.</p></footer>`;
}
export function dialogs() {
  return `<dialog id="information" class="information" aria-labelledby="information-title" aria-describedby="information-description"><div class="dialog-top"><span class="eyebrow">GIG TAX PROS</span><button class="close-button" data-close aria-label="Close dialog">×</button></div><h2 id="information-title"></h2><p id="information-description"></p><div id="information-extra"></div><div id="information-actions"></div></dialog>`;
}
export const quickActions = () => `<div class="mobile-action-bar" aria-label="Quick actions">${button('Get Started', '/get-started')}${button('Client Portal', '/client-portal', false)}</div>`;
export function sourceLinks(keys) {
  return `<aside class="source-note"><h2>Go to the original source</h2><p>General US information. Check current instructions for your year and circumstances. Sources reviewed ${reviewed}.</p><ul>${keys.map(key => `<li><a href="${escape(sources[key][1])}" target="_blank" rel="noopener noreferrer">${escape(sources[key][0])} ↗</a></li>`).join('')}</ul></aside>`;
}
export function callout(title = 'Get organized before you get started.', description = 'Build a preparation plan and take a useful checklist into your next conversation.') {
  return `<section class="inner-cta"><div><p class="eyebrow">YOUR NEXT STEP</p><h2>${escape(title)}</h2><p>${escape(description)}</p></div>${button('Create my preparation plan', '/get-started')}</section>`;
}
export function cards(items) {
  return `<div class="link-grid">${items.map(item => `<a class="link-card" href="/${item.slug}" data-search-card data-search-text="${escape(`${item.label} ${item.short} ${item.keywords || ''}`)}"><span class="card-kicker">${escape(item.number || item.category || 'EXPLORE')}</span><h3>${escape(item.label)} <span aria-hidden="true">↗</span></h3><p>${escape(item.short)}</p></a>`).join('')}</div>`;
}
export function renderPage(page) {
  const title = `${page.label} | Gig Tax Pros`;
  const hero = page.main ? '' : `<section class="inner-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span>${page.parent ? `<a href="/${page.parent.slug}">${escape(page.parent.label)}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${escape(page.label)}</span></nav><p class="eyebrow">${escape(page.eyebrow || 'GIG TAX PROS')}</p><h1>${escape(page.title)}${page.accent ? `<br><em>${escape(page.accent)}</em>` : ''}</h1><p class="inner-lede">${escape(page.description)}</p>${page.heroActions || ''}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#05060c"><title>${escape(title)}</title><meta name="description" content="${escape(page.description)}"><link rel="canonical" href="${origin}/${page.slug}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${origin}/${page.slug}"><meta property="og:type" content="website"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/inner-pages.css"><link rel="stylesheet" href="/navigation.css"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/inner-pages.js" defer></script></head><body class="inner-page"><a class="skip-link" href="#main">Skip to content</a>${header(page.nav || `/${page.slug}`)}<main id="main" tabindex="-1">${page.main || `${hero}<div class="inner-content">${page.body}</div>`}</main>${footer()}${quickActions()}${navigation(`/${page.slug}`)}${dialogs()}</body></html>`;
}
export function renderHome(html) {
  for (const [marker, value] of [['<!-- SITE_PUBLIC_HEADER -->', publicHeader('/', brand())], ['<!-- SITE_FOOTER -->', footer()], ['<!-- SITE_NAVIGATION -->', publicNavigation('/')]]) {
    if (!html.includes(marker)) throw new Error(`Home template is missing ${marker}`);
    html = html.replace(marker, value);
  }
  return html.replaceAll('https://gigtax.pro', origin);
}
