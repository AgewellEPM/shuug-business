import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRedirects } from './seo-routes.mjs';

test('canonical redirects cover indexable aliases without intercepting APIs, assets or private flows', () => {
  const { vercel, cloudflare } = canonicalRedirects(['services', 'guides/uber-lyft-tax-forms', 'sales', 'office-signup', 'client-portal'], 'https://gigtax.pro');
  const resolve = path => vercel.find(route => !route.has && new RegExp(route.src).test(path));
  for (const [from, to] of [['/index.html', '/'], ['/services.html', '/services'], ['/guides/uber-lyft-tax-forms.html', '/guides/uber-lyft-tax-forms'], ['/tour/index.html', '/tour/'], ['/tour', '/tour/']]) {
    assert.equal(resolve(from)?.status, 308);
    assert.equal(resolve(from)?.headers.Location, to);
    assert(cloudflare.includes(`${from} ${to} 301\n`));
  }
  for (const path of ['/services', '/servicesXhtml', '/api/sales', '/assets/about-reference.png', '/sales.html', '/office-signup.html', '/client-portal.html', '/bank-return.html', '/tour/']) assert.equal(resolve(path), undefined, path);
  assert.deepEqual(vercel[0].has, [{ type: 'host', value: 'www.gigtax.pro' }]);
  assert.equal(vercel[0].headers.Location, 'https://gigtax.pro/$1');
});

test('alternate build origins do not redirect to the production host', () => {
  assert(canonicalRedirects(['services'], 'https://rideshare-tax-pros.pages.dev').vercel.every(route => !route.has));
});

test('the previous App Features links redirect to the distinct About The App page', () => {
  const { vercel } = canonicalRedirects(['get-the-app', 'about-the-app'], 'https://gigtax.pro');
  for (const path of ['/app-features', '/app-features.html']) {
    const route = vercel.find(route => !route.has && new RegExp(route.src).test(path));
    assert.equal(route?.status, 308);
    assert.equal(route?.headers.Location, '/about-the-app');
  }
});
