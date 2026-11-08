import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchOffice } from './research.mjs';

const host = 'https://hartford-tax.com';
const office = extra => ({ id: '12', town: 'Hartford Tax', contact_name: '', contact_email: '', contact_phone: '', notes: JSON.stringify({ website: host, independence: 'unverified' }), ...extra });
const publicDNS = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
function fixture(routes = {}, options = {}) {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    const path = new URL(url).pathname, value = routes[url] ?? routes[path];
    if (typeof value === 'function') return value(url, init);
    if (value instanceof Response) return value.clone();
    if (value !== undefined) return path === '/robots.txt' ? new Response(value, { headers: { 'content-type': 'text/plain' } }) : html(value);
    return path === '/robots.txt' ? new Response('', { status: 404 }) : html('', 404);
  };
  return { requests, run: input => researchOffice(input || office(), { lookup: publicDNS, fetcher, now: () => Date.UTC(2026, 10, 8), ...options }) };
}
const values = (result, field) => result.evidence.filter(e => e.field === field).map(e => e.value);

test('published first-party contacts retain exact evidence, do not mutate the office, and leave ownership unconfirmed', async () => {
  const input = office(), snapshot = structuredClone(input);
  const f = fixture({ '/': `<html><head><script type="application/ld+json">{"@type":"Person","name":"Jane Doe","jobTitle":"Owner"}</script></head><body><h1>Hartford Tax</h1><p>Jane Doe — Owner</p><p>Independently owned and operated.</p><a href="mailto:INFO@hartford-tax.com?subject=Hello">Email our office</a><a href="tel:+18602045588">Call 860-204-5588</a></body></html>` });
  const r = await f.run(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(r.proposedChanges, { email: 'info@hartford-tax.com', phone: '+18602045588', contact: 'Jane Doe' });
  assert.equal(r.ownership.status, 'unverified'); assert.equal(r.ownership.suggestedFinding, 'independent'); assert(r.ownership.requiresOwnerConfirmation);
  assert(!('independence' in r.proposedChanges));
  for (const e of r.evidence) { assert.equal(e.sourceURL, `${host}/`); assert.equal(e.checkedAt, '2026-11-08T00:00:00.000Z'); assert(e.excerpt.length <= 220); assert.equal(e.confidence, 'high'); assert.match(e.id, /^[a-f0-9]{20}$/); }
  assert.equal(r.evidence.find(e => e.field === 'contact').role, 'Owner');
  assert(f.requests.every(r => r.init.method === 'GET' && r.init.redirect === 'manual' && r.init.signal));
});

test('hidden text, scripts, forms, asset addresses and examples never become contacts', async () => {
  const f = fixture({ '/': `<head><script>"script@hartford-tax.com"</script><script type="application/ld+json">{"@type":"Person","name":"Hidden Person"}</script></head><body>
    <!-- comment@hartford-tax.com --><div hidden>hidden@hartford-tax.com</div><div style="display:none"><a href="mailto:invisible@hartford-tax.com">Email</a></div>
    <div aria-hidden="true">aria@hartford-tax.com</div><div class="sr-only">reader@hartford-tax.com</div><template>template@hartford-tax.com</template>
    <form action="/contact" method="post"><input value="input@hartford-tax.com"><p>form@hartford-tax.com</p></form>
    <p>name@example.com info@yourdomain.com logo@2x.png noreply@hartford-tax.com 123-456-7890 860-555-0123</p>
    <img alt="image@hartford-tax.com"><p>Contact our office for information.</p></body>` });
  const r = await f.run(); assert.deepEqual(r.evidence, []); assert.deepEqual(r.proposedChanges, {}); assert.equal(r.ownership.suggestedFinding, 'unverified');
});

test('only linked public first-party contact/team pages are visited, and page count is bounded', async () => {
  const f = fixture({ '/': `<a href="/about">About</a><a href="/contact">Contact</a><a href="/team">Our team</a><a href="https://other-company.com/contact">Contact partner</a><a href="/login">Contact login</a><a href="/contact?action=send">Contact submit</a>`, '/about': '<p>Owner: Jane Doe</p>', '/contact': '<p>hello@hartford-tax.com</p>', '/team': '<p>not-visited@hartford-tax.com</p>' });
  const r = await f.run();
  assert.deepEqual(r.pages.map(p => new URL(p.url).pathname), ['/', '/about', '/contact']);
  assert.deepEqual(values(r, 'contact'), ['Jane Doe']);
  assert(!f.requests.some(r => /other-company|login|action=|\/team$/.test(r.url)));
});

test('missing website and malformed metadata produce explicit issues with no requests or fabricated fields', async () => {
  const f = fixture();
  for (const [input, code] of [[office({ notes: '{}' }), 'website_required'], [office({ notes: '{broken' }), 'invalid_office']]) {
    const r = await f.run(input); assert.equal(r.issues[0].code, code); assert.deepEqual(r.evidence, []); assert.deepEqual(r.proposedChanges, {});
  }
  assert.equal(f.requests.length, 0);
});

test('unsafe protocols, literal IPs, credentials, private hosts and ports are rejected before DNS or requests', async () => {
  let lookups = 0;
  const f = fixture({}, { lookup: async () => { lookups++; return publicDNS(); } });
  for (const website of ['file:///etc/passwd', 'ftp://hartford-tax.com/', 'https://user:pass@hartford-tax.com/', 'https://hartford-tax.com:8443/', 'http://127.0.0.1/', 'http://2130706433/', 'https://[::1]/', 'http://metadata.google.internal/', 'https://localhost/', 'https://tax-office.local/', 'https://example.com/', `${host}/%2561dmin`]) {
    const r = await f.run(office({ notes: JSON.stringify({ website }) })); assert.equal(r.evidence.length, 0, website); assert(r.issues.length, website);
  }
  assert.equal(lookups, 0); assert.equal(f.requests.length, 0);
});

test('private, reserved, mapped and mixed DNS addresses are all rejected without sending a request', async () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.1.2', '127.0.0.1', '169.254.169.254', '172.31.0.1', '192.168.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::1', '3ffe::1', '3fff::1']) {
    const f = fixture({}, { lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }] });
    const r = await f.run(); assert.equal(f.requests.length, 0, address); assert(r.issues.some(i => i.code === 'unsafe_dns'), address);
  }
});

test('DNS is checked again for each request rather than trusting the first public resolution', async () => {
  let calls = 0;
  const f = fixture({}, { lookup: async () => ++calls === 1 ? publicDNS() : [{ address: '127.0.0.1', family: 4 }] });
  const r = await f.run(); assert.deepEqual(f.requests.map(r => new URL(r.url).pathname), ['/robots.txt']); assert(r.issues.some(i => i.code === 'unsafe_dns'));
});

test('redirects cannot escape first-party hosts, downgrade TLS, enter private pages or use a private DNS answer', async () => {
  for (const location of ['http://169.254.169.254/latest/meta-data/', 'https://other-company.com/contact', 'http://hartford-tax.com/contact', `${host}/login`, `${host}:8443/contact`]) {
    const f = fixture({ '/': new Response('', { status: 302, headers: { location } }) });
    const r = await f.run(); assert.equal(f.requests.length, 2, location); assert.equal(r.evidence.length, 0); assert(r.issues.length);
  }
  const f = fixture({ '/': new Response('', { status: 302, headers: { location: 'https://www.hartford-tax.com/contact' } }) }, { lookup: async name => name.startsWith('www.') ? [{ address: '10.0.0.3', family: 4 }] : publicDNS() });
  const r = await f.run(); assert.equal(f.requests.length, 2); assert(r.issues.some(i => i.code === 'unsafe_dns'));
});

test('safe same-party redirects are supported and each final source URL is recorded', async () => {
  const f = fixture({ '/': new Response('', { status: 301, headers: { location: '/contact' } }), '/contact': '<p>Email hello@hartford-tax.com</p>' });
  const r = await f.run(); assert.equal(r.evidence[0].sourceURL, `${host}/contact`); assert.deepEqual(values(r, 'email'), ['hello@hartford-tax.com']);
});

test('robots deny is distinct from missing contacts, and inaccessible policies fail closed', async () => {
  for (const response of ['User-agent: *\nDisallow: /', new Response('', { status: 403 }), new Response('', { status: 500 }), '<html>Verify you are human</html>']) {
    const f = fixture({ '/robots.txt': response, '/': '<p>hidden@hartford-tax.com</p>' });
    const r = await f.run(); assert.equal(f.requests.length, 1); assert.equal(r.evidence.length, 0); assert(r.issues.some(i => /^robots_/.test(i.code)));
  }
});

test('robots exact user-agent groups merge; longest path and allow ties work with encoded paths', async () => {
  const f = fixture({ '/robots.txt': 'User-agent: *\nDisallow: /\nUser-agent: GigTaxResearch\nDisallow: /private\nDisallow: /about\nUser-agent: GigTaxResearch\nAllow: /about\nDisallow: /caf%C3%A9\n', '/': '<a href="/about">About</a><a href="/private/contact">Contact</a><a href="/caf%C3%A9/contact">Contact</a>', '/about': '<p>hello@hartford-tax.com</p>' }, { maxPages: 5 });
  const r = await f.run(); assert.deepEqual(values(r, 'email'), ['hello@hartford-tax.com']);
  assert(!f.requests.some(r => /private|caf%C3%A9/.test(r.url))); assert.equal(r.issues.filter(i => i.code === 'robots_denied').length, 2);
});

test('long crawl delays stop rather than violate robots rules or wait beyond the total deadline', async () => {
  const f = fixture({ '/robots.txt': 'User-agent: *\nCrawl-delay: 60', '/': '<a href="/about">About</a>', '/about': '<p>not-visited@hartford-tax.com</p>' }, { totalTimeoutMs: 100 });
  const r = await f.run(); assert.equal(f.requests.length, 2); assert(r.issues.some(i => i.code === 'robots_delay')); assert.equal(r.evidence.length, 0);
});

test('login/captcha and non-HTML documents are skipped without harvesting challenge text', async () => {
  for (const body of ['<p>Verify you are human</p><p>bot@hartford-tax.com</p>', '<p>Sign in to continue</p><p>login@hartford-tax.com</p>']) {
    const f = fixture({ '/': body }); const r = await f.run(); assert.equal(r.evidence.length, 0); assert(r.issues.some(i => i.code === 'challenge'));
  }
  const f = fixture({ '/': new Response('pdf@hartford-tax.com', { headers: { 'content-type': 'application/pdf' } }) });
  assert((await f.run()).issues.some(i => i.code === 'unsupported_type'));
});

test('both declared and streamed oversized pages are stopped before extracting partial evidence', async () => {
  for (const response of [html('hello@hartford-tax.com', 200, { 'content-length': '20000' }), html('<p>hello@hartford-tax.com</p>' + 'x'.repeat(5000))]) {
    const f = fixture({ '/': response }, { maxBytes: 1024 }); const r = await f.run(); assert.equal(r.evidence.length, 0); assert(r.issues.some(i => i.code === 'body_limit'));
  }
});

test('a stalled fetch has a bounded timeout even when the injected transport ignores abort', async () => {
  const f = fixture({ '/': () => new Promise(() => {}) }, { timeoutMs: 50, totalTimeoutMs: 100 });
  const start = Date.now(), r = await f.run(); assert(Date.now() - start < 1000); assert(r.issues.some(i => i.code === 'timeout')); assert.equal(r.evidence.length, 0);
});

test('redirect loops are bounded and unsafe automatic-follow transports are rejected', async () => {
  const f = fixture({ '/': new Response('', { status: 302, headers: { location: '/' } }) }, { maxRedirects: 2 });
  const r = await f.run(); assert.equal(f.requests.length, 4); assert(r.issues.some(i => i.code === 'redirect_limit'));
  const response = html('not-safe@hartford-tax.com'); Object.defineProperty(response, 'url', { value: 'https://other-company.com/' });
  const redirected = fixture({ '/': () => response }); const result = await redirected.run(); assert.equal(result.evidence.length, 0); assert(result.issues.some(i => i.code === 'unsafe_redirect'));
});

test('multiple published candidates remain ambiguous, deduplicate case and never guess an address', async () => {
  const f = fixture({ '/': '<a href="mailto:INFO@hartford-tax.com">Email</a><p>info@hartford-tax.com billing@hartford-tax.com</p><p>Owner: Jane Doe</p><p>We are not independently owned.</p>' });
  const r = await f.run(); assert.deepEqual(values(r, 'email'), ['info@hartford-tax.com', 'billing@hartford-tax.com']); assert(!r.proposedChanges.email); assert.equal(r.proposedChanges.contact, 'Jane Doe');
  assert.equal(r.ownership.suggestedFinding, 'unverified'); assert.equal(r.ownership.status, 'unverified');
  assert(!r.evidence.some(e => e.value === 'jane@hartford-tax.com'));
});

test('schema-only hidden names and business names are not people; visible microdata people are accepted', async () => {
  const f = fixture({ '/': `<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Hidden Person"},{"@type":"LocalBusiness","name":"Hartford Tax"}]}</script><h1>Hartford Tax</h1><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Alice Smith</span><span itemprop="jobTitle">Manager</span></div>` });
  const r = await f.run(); assert.deepEqual(values(r, 'contact'), ['Alice Smith']); assert.equal(r.evidence[0].role, 'Manager');
});

test('evidence is bounded with stable IDs, field diversity and no false certainty after truncation', async () => {
  const body = '<p>' + Array.from({ length: 12 }, (_, i) => `office${i}@hartford-tax.com`).join(' ') + '</p><a href="tel:+18602045588">Phone</a><p>Owner: Jane Doe</p><p>' + 'Family-owned. '.repeat(10) + '</p>';
  const f = fixture({ '/': body }), r = await f.run(), again = await f.run();
  assert.equal(r.evidence.length, 8); assert.equal(r.ownership.evidence.length, 4); assert(values(r, 'phone').length); assert(values(r, 'contact').length); assert(!r.proposedChanges.email);
  assert.deepEqual(r.evidence.map(e => e.id), again.evidence.map(e => e.id)); assert(r.evidence.every(e => e.excerpt.length <= 220 && e.sourceURL.length <= 700));
});

test('large non-email text and hostile robots wildcard patterns remain bounded', async () => {
  const f = fixture({ '/': '<p>' + 'a'.repeat(150000) + '</p>' });
  const start = Date.now(), r = await f.run(); assert.equal(r.evidence.length, 0); assert(Date.now() - start < 1000);
  const hostile = fixture({ '/robots.txt': `User-agent: *\nDisallow: /${'a*'.repeat(3000)}z`, '/': '<p>never@hartford-tax.com</p>' });
  const denied = await hostile.run(); assert.equal(hostile.requests.length, 1); assert.equal(denied.evidence.length, 0); assert(denied.issues.some(i => i.code === 'robots_unavailable'));
});

test('explicit published name-and-role lines are candidates while ownership remains unconfirmed', async () => {
  const f = fixture({ '/': '<p>Jane Doe, Owner and Senior Tax Preparer</p><p>Alice Smith, Manager</p><p>Review Writer, great service!</p>' });
  const r = await f.run(); assert.deepEqual(values(r, 'contact'), ['Jane Doe', 'Alice Smith']);
  assert.equal(r.evidence.find(e => e.value === 'Jane Doe').role, 'Owner'); assert.match(r.evidence.find(e => e.value === 'Jane Doe').excerpt, /Owner and Senior Tax Preparer/);
  assert.equal(r.ownership.status, 'unverified'); assert(!r.proposedChanges.contact); assert(!r.proposedChanges.independence);
});

test('phone evidence retains published formatting and context, and explicitly labeled fax numbers are not phone proposals', async () => {
  const f = fixture({ '/': '<h3>Phone Number</h3><p>Office Receptionist: (414) 342-6572</p><h3>Fax</h3><p>(414) 933-1989</p><a href="tel:+18602045500">Fax line</a>' });
  const r = await f.run(); assert.deepEqual(values(r, 'phone'), ['+14143426572']); assert.equal(r.proposedChanges.phone, '+14143426572');
  assert.match(r.evidence[0].excerpt, /Office Receptionist: \(414\) 342-6572/);
  const shared = fixture({ '/': '<p>Phone/Fax: (414) 342-6572</p>' }); assert.deepEqual(values(await shared.run(), 'phone'), ['+14143426572']);
});
