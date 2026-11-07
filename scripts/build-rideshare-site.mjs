import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { appleAppAssociation } from './rideshare-site/app-links.mjs';
import { packageSales } from './sales/package.mjs';
const { publicHttpsUrl } = createRequire(import.meta.url)('../public/rideshare-tax-pros/links.js');
const cloudflare = process.argv.includes('--cloudflare');
process.env.RIDESHARE_SITE_ORIGIN ||= cloudflare ? 'https://rideshare-tax-pros.pages.dev' : 'https://gigtax.pro';
if (!publicHttpsUrl(process.env.RIDESHARE_SITE_ORIGIN)) throw new Error('The public site must use a hosted HTTPS domain.');
const { renderedPages } = await import('./rideshare-site/pages.mjs');
const { renderHome, renderPage } = await import('./rideshare-site/layout.mjs');
const { origin } = await import('./rideshare-site/content.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, `deployments/rideshare-tax-pros/${cloudflare ? '.cloudflare' : '.vercel'}/output`);
const source = path.join(root, 'public/rideshare-tax-pros');
const pages = renderedPages();
if (new Set(pages.map(page => page.slug)).size !== pages.length) throw new Error('Duplicate public page routes.');
const home = renderHome(readFileSync(path.join(source, 'index.html'), 'utf8'));
const config = JSON.parse(readFileSync(path.join(source, 'site-config.json'), 'utf8'));
for (const key of ['workspaceUrl', 'drakePortalUrl']) if (config[key] !== null) {
  if (!publicHttpsUrl(config[key])) throw new Error(`${key} must use a hosted HTTPS domain without embedded credentials.`);
}
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const staticPath = cloudflare ? destination : path.join(destination, 'static');
rmSync(staticPath, { recursive: true, force: true });
mkdirSync(staticPath, { recursive: true });
cpSync(source, staticPath, { recursive: true });
mkdirSync(path.join(staticPath, '.well-known'), { recursive: true });
writeFileSync(path.join(staticPath, '.well-known/apple-app-site-association'), JSON.stringify(appleAppAssociation(config.iosAppId), null, 2));
writeFileSync(path.join(staticPath, 'index.html'), home);
for (const page of pages) {
  if (!/^[a-z0-9/-]+$/.test(page.slug) || page.slug.includes('..')) throw new Error('Invalid public page slug.');
  const file = path.join(staticPath, page.file); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, page.html);
}
for (const [slug, label] of [['privacy', 'Privacy notice'], ['terms', 'Website terms'], ['accessibility', 'Accessibility']]) {
  const original = readFileSync(path.join(source, `${slug}.html`), 'utf8');
  const body = original.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1];
  if (!body) throw new Error(`Missing policy content: ${slug}`);
  writeFileSync(path.join(staticPath, `${slug}.html`), renderPage({ slug, label, description: `${label} for the Gig Tax Pros website.`, main: `<div class="legal-content">${body}</div>` }));
}
const aliases = [...pages.map(page => page.slug), 'privacy', 'terms', 'accessibility'];
writeFileSync(path.join(staticPath, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...aliases.filter(slug => !['sales','office-signup'].includes(slug))].map(slug => `<url><loc>${origin}/${slug}</loc></url>`).join('')}</urlset>`);
writeFileSync(path.join(staticPath, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
writeFileSync(path.join(staticPath, 'site-manifest.json'), JSON.stringify({ origin, aliases, pages: ['/', ...aliases.map(slug => `/${slug}`)] }, null, 2));
if (cloudflare) {
  writeFileSync(path.join(staticPath, '_redirects'), '/pricing /free 301\n/pricing.html /free 301\n');
  writeFileSync(path.join(staticPath, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/site-config.json\n  Cache-Control: no-store\n/.well-known/apple-app-site-association\n  Content-Type: application/json\n  Cache-Control: public, max-age=300\n/bank-return\n  Referrer-Policy: no-referrer\n`);
} else writeFileSync(path.join(destination, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/.*', headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }, continue: true },
  { src: '/site-config.json', headers: { 'Cache-Control': 'no-store' }, continue: true },
  { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=86400' }, continue: true },
  { src: '/\\.well-known/apple-app-site-association', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, continue: true },
  { src: '/bank-return', headers: { 'Referrer-Policy': 'no-referrer' }, dest: '/bank-return.html' },
  { src: '/pricing(?:\\.html)?', status: 308, headers: { Location: '/free' } },
  { src: '/api/sales', dest: '/api/sales' },
  { src: '/api/sales-webhook', dest: '/api/sales-webhook' },
  ...aliases.map(slug => ({ src: `/${slug}`, dest: `/${slug}.html` })),
  { handle: 'filesystem' },
  { src: '/.*', dest: '/404.html', status: 404 },
] }, null, 2));
if (!cloudflare) packageSales(root, destination);
console.log(`Gig Tax Pros: ${aliases.length + 1} public pages prepared at ${destination}`);
