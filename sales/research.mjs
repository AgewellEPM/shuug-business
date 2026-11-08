import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

// Read-only, bounded first-party research. No browser, execution, forms, database
// adapter or outreach transport. DNS is checked AND pinned into the connection.
// Protocol references: https://nodejs.org/api/https.html and RFC 9309.
const PRODUCT = 'GigTaxResearch';
const USER_AGENT = `${PRODUCT}/1.0 (+https://gigtax.pro/privacy)`;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const HIDDEN = new Set(['head', 'script', 'style', 'template', 'noscript', 'svg', 'canvas', 'iframe', 'object', 'form']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'header', 'hr', 'li', 'main', 'p', 'section', 'td', 'tr']);
const SENSITIVE = /(?:^|\/)(?:log-?in|sign-?in|logout|account|auth|oauth|checkout|cart|admin|wp-admin|wp-login|captcha|challenge|register|password|reset)(?:[/.?_-]|$)/i;
class ResearchError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new ResearchError(code, message); };
const cap = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
const squash = value => String(value || '').replace(/\s+/g, ' ').trim();
const bareHost = value => value.toLowerCase().replace(/^www\./, '');

function publicIP(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    // Only native global-unicast addresses; reject mapped/local/transition and
    // special-purpose/documentation ranges even when DNS mixes in public IPs.
    const parts = address.toLowerCase().split(':');
    const first = parseInt(parts[0] || '0', 16), second = parseInt(parts[1] || '0', 16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3ffe &&
      !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) && !(first === 0x3fff && second <= 0xfff);
  }
  return false;
}
function safeURL(value, firstParty, previous) {
  let u; try { u = new URL(value); } catch { fail('invalid_url', 'A valid office website URL is required.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || u.href.length > 700) fail('unsafe_url', 'Only a public HTTP(S) office website on its default port can be researched.');
  const host = u.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') || host.endsWith('.') ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host) || host === 'example.com' || host === 'example.org' || host === 'example.net') fail('unsafe_host', 'Local, reserved and literal-IP website addresses are not allowed.');
  if (firstParty && bareHost(host) !== firstParty) fail('external_redirect', 'Research stays on the office website; an external redirect was not followed.');
  if (previous?.protocol === 'https:' && u.protocol === 'http:') fail('unsafe_redirect', 'An insecure redirect was not followed.');
  let path = u.pathname + u.search;
  try { for (let n = 0; n < 3 && /%[a-f\d]{2}/i.test(path); n++) path = decodeURIComponent(path); } catch { fail('unsafe_path', 'The website path is not valid.'); }
  if (SENSITIVE.test(path) || /[?&](?:token|password|auth|session|action|nonce|key)=/i.test(path)) fail('private_page', 'Login, account, form-action and challenge pages are skipped.');
  u.hash = '';
  return u;
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason || new ResearchError('timeout', 'The research time limit was reached.'));
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
async function resolvePublic(url, lookup, signal) {
  const addresses = await abortable(Promise.resolve().then(() => lookup(url.hostname, { all: true, order: 'verbatim' })), signal);
  if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32 || addresses.some(a => !publicIP(a.address) || isIP(a.address) !== a.family)) fail('unsafe_dns', 'The office website did not resolve exclusively to public addresses.');
  return addresses;
}
function pinnedFetch(url, { addresses, signal, headers }) {
  return new Promise((resolve, reject) => {
    const address = addresses.find(a => a.family === 4) || addresses[0];
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', headers, signal, agent: false, autoSelectFamily: false,
      lookup: (_host, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family),
    }, response => resolve({ status: response.statusCode, headers: { get: key => {
      const value = response.headers[key.toLowerCase()]; return Array.isArray(value) ? value.join(', ') : value || null;
    } }, body: response }));
    request.on('error', reject); request.end();
  });
}
function discard(response) {
  try { if (response.body?.destroy) response.body.destroy(); else response.body?.cancel?.().catch(() => {}); } catch { /* Already closed. */ }
}
async function readBody(response, maximum, budget, signal) {
  const length = response.headers.get('content-length');
  if (length && Number(length) > maximum) { discard(response); fail('body_limit', 'The page exceeded the research size limit.'); }
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding !== 'identity') { discard(response); fail('unsupported_encoding', 'The website did not provide a safely readable uncompressed page.'); }
  if (!response.body?.[Symbol.asyncIterator]) { discard(response); fail('unreadable_body', 'The page body could not be read safely.'); }
  const chunks = []; let size = 0;
  const reader = response.body.getReader?.(), iterator = reader ? { next: () => reader.read() } : response.body[Symbol.asyncIterator]();
  // Do not await a web-stream tee's cancellation: a caller's unused clone can
  // otherwise hold cancellation open indefinitely and hide the size-limit error.
  const stop = () => { if (reader) reader.cancel().catch(() => {}); else discard(response); };
  signal.addEventListener('abort', stop, { once: true });
  try {
    while (true) {
      const { value: chunk, done } = await iterator.next();
      if (signal.aborted) throw signal.reason;
      if (done) break;
      const bytes = Buffer.from(chunk); size += bytes.length; budget.used += bytes.length;
      if (size > maximum || budget.used > budget.maximum) fail('body_limit', 'The page exceeded the research size limit.');
      chunks.push(bytes);
    }
  } catch (error) { stop(); throw error; }
  finally { signal.removeEventListener('abort', stop); if (reader) reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

function robotsPath(value) {
  return value.replace(/[^\x00-\x7f]/gu, c => encodeURIComponent(c)).replace(/%([a-f\d]{2})/gi, (_, h) => {
    const c = String.fromCharCode(parseInt(h, 16)); return /[A-Za-z\d._~-]/.test(c) ? c : `%${h.toUpperCase()}`;
  });
}
function robotsPolicy(text) {
  const groups = []; let group;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.length > 4096 || groups.length > 4096) fail('robots_limit', 'The robots policy exceeds the safe parsing limits.');
    const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/i.exec(line); if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].split('#')[0].trim();
    if (key === 'user-agent') {
      if (!group || group.hasRules) { group = { agents: [], rules: [], delay: 0, hasRules: false }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      group.hasRules = true;
      if (key === 'crawl-delay') { if (/^\d+(?:\.\d+)?$/.test(value)) group.delay = Math.max(group.delay, Number(value)); }
      else if (value.startsWith('/')) group.rules.push({ allow: key === 'allow', path: robotsPath(value) });
    }
  }
  let selected = groups.filter(g => g.agents.includes(PRODUCT.toLowerCase()));
  if (!selected.length) selected = groups.filter(g => g.agents.includes('*'));
  const rules = selected.flatMap(g => g.rules), delayMs = Math.max(0, ...selected.map(g => g.delay * 1000));
  return { delayMs, allowed(url) {
    const target = robotsPath(url.pathname + url.search); let best = -1, allowed = true;
    for (const rule of rules) {
      const end = rule.path.endsWith('$'), body = end ? rule.path.slice(0, -1) : rule.path;
      // Literal segment matching avoids attacker-controlled wildcard regexes.
      const parts = body.split('*'); let position = 0, matches = target.startsWith(parts[0]);
      if (matches) position = parts[0].length;
      for (let n = 1; matches && n < parts.length; n++) {
        const part = parts[n], last = n === parts.length - 1;
        const found = end && last ? target.length - part.length : target.indexOf(part, position);
        if (found < position || !target.startsWith(part, found)) matches = false;
        else position = found + part.length;
      }
      if (!matches || (end && parts.length === 1 && target.length !== body.length)) continue;
      const specificity = Buffer.byteLength(body.replaceAll('*', ''));
      if (specificity > best || (specificity === best && rule.allow)) { best = specificity; allowed = rule.allow; }
    }
    return allowed;
  } };
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', commat: '@', period: '.', colon: ':', sol: '/', lpar: '(', rpar: ')', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘' };
function decode(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return entities[name.toLowerCase()] ?? whole;
    const n = parseInt(name.slice(name[1]?.toLowerCase() === 'x' ? 2 : 1), name[1]?.toLowerCase() === 'x' ? 16 : 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
  });
}
function attributes(raw) {
  const result = {};
  for (const m of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = m[1].toLowerCase(); if (!(key in result)) result[key] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return result;
}
// A non-executing conservative tokenizer. Hidden/form/script descendants are
// excluded. External stylesheets and JavaScript rendering are never evaluated.
function parseHTML(html) {
  const pieces = [], links = [], schemas = [], people = [], stack = []; let at = 0, tokens = 0;
  const visible = () => !stack.some(s => s.hidden);
  const close = frame => {
    if (frame.anchor && !frame.hidden) links.push({ href: frame.anchor, text: squash(pieces.slice(frame.start).join(' ')) });
    if (frame.property && frame.person && !frame.hidden) frame.person[frame.property] = squash(pieces.slice(frame.start).join(' '));
    if (frame.ownPerson && frame.person?.name) people.push(frame.person);
  };
  while (at < html.length && ++tokens < 60000) {
    if (html[at] !== '<') {
      const end = html.indexOf('<', at), value = html.slice(at, end < 0 ? html.length : end);
      if (visible()) pieces.push(decode(value)); at = end < 0 ? html.length : end; continue;
    }
    if (html.startsWith('<!--', at)) { const end = html.indexOf('-->', at + 4); at = end < 0 ? html.length : end + 3; continue; }
    let end = at + 1, quote = '';
    for (; end < html.length; end++) { const c = html[end]; if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break; }
    const raw = html.slice(at + 1, end); at = end + 1;
    const match = /^\s*(\/?)\s*([a-z][a-z\d:-]*)\b([\s\S]*)$/i.exec(raw); if (!match) continue;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.map(s => s.tag).lastIndexOf(tag);
      if (index >= 0) { while (stack.length > index) close(stack.pop()); }
      if (BLOCK.has(tag) && visible()) pieces.push('\n'); continue;
    }
    const attrs = attributes(match[3]);
    if (tag === 'script' && (attrs.type || '').toLowerCase() === 'application/ld+json') {
      const stop = html.toLowerCase().indexOf('</script', at);
      if (stop >= at && stop - at <= 65536) { try { schemas.push(JSON.parse(html.slice(at, stop))); } catch { /* Unparseable metadata is not evidence. */ } }
    }
    const hidden = !visible() || HIDDEN.has(tag) || 'hidden' in attrs || 'inert' in attrs || attrs['aria-hidden'] === 'true' ||
      /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\D|$))/i.test(attrs.style || '') || /(?:^|\s)(?:hidden|sr-only|visually-hidden|screen-reader-only)(?:\s|$)/i.test(attrs.class || '');
    if (BLOCK.has(tag) && !hidden) pieces.push('\n');
    const ownPerson = /(?:^|\s)https?:\/\/schema\.org\/Person(?:\s|$)/i.test(attrs.itemtype || '');
    const parentPerson = [...stack].reverse().find(s => s.person)?.person;
    const frame = { tag, hidden, start: pieces.length, anchor: tag === 'a' ? attrs.href : null,
      person: ownPerson ? {} : parentPerson, ownPerson,
      property: ['name', 'jobTitle'].includes(attrs.itemprop) ? attrs.itemprop : null };
    if (!VOID.has(tag)) { if (stack.length >= 128) fail('html_limit', 'The page markup exceeds the safe nesting limit.'); stack.push(frame); }
  }
  while (stack.length) close(stack.pop());
  return { text: pieces.join(' ').replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').trim().slice(0, 180000), links, schemas, people };
}
function excerpt(text, value) {
  const compact = squash(text), index = compact.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) return compact.slice(0, 220) || value.slice(0, 220);
  const start = Math.max(0, index - 65); return compact.slice(start, start + 220);
}
function cleanEmail(value) {
  const email = value.toLowerCase().trim().replace(/[.,;]+$/, '');
  if (email.length > 240 || !/^[a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,24}$/.test(email)) return null;
  const [local, host] = email.split('@');
  if (/(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/.test(host) || /^(?:yourdomain|yourcompany|domain)\.(?:com|org|net)$/.test(host) ||
    /^(?:example|your-?name|your-?email|name|user|test|noreply|no-reply|donotreply)$/.test(local) ||
    /\.(?:png|jpe?g|gif|webp|svg|css|js|woff2?|ico)$/.test(host) || /(?:sentry|wixpress|ingest\.sentry|tracking|cloudfront)\./.test(host)) return null;
  return email;
}
function cleanPhone(value) {
  const base = value.split(/(?:ext\.?|extension|;ext=|\s+x)\s*/i)[0], digits = base.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits) || /^(?:1)?1234567890$/.test(digits) || /^(?:1)?\d{3}55501\d{2}$/.test(digits)) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}
const faxLabel = value => /\b(?:fax|facsimile)\s*[:#-]?\s*$/i.test(value) && !/\b(?:phone|telephone|tel)\s*(?:and|&|\/)\s*(?:fax|facsimile)\s*[:#-]?\s*$/i.test(value);
function isName(value) {
  return value.length <= 140 && /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,4}$/u.test(value) && !/\b(?:contact|office|business|tax|accounting|meet|team|about|services|privacy|policy)\b/i.test(value);
}
function extract(parsed, url, checkedAt) {
  const evidence = [], ownership = [];
  const add = (field, value, confidence, context = parsed.text, extra = {}) => {
    if (!value) return;
    const id = createHash('sha256').update(`${field}\0${value.toLowerCase()}\0${url}`).digest('hex').slice(0, 20);
    if (!evidence.some(e => e.field === field && e.value.toLowerCase() === value.toLowerCase())) evidence.push({ id, field, value, sourceURL: url, checkedAt, excerpt: excerpt(context, value), confidence, ...extra });
  };
  for (const link of parsed.links) {
    if (/^mailto:/i.test(link.href || '')) {
      let path; try { path = decodeURIComponent(link.href.slice(7).split('?')[0]); } catch { continue; }
      for (const value of path.split(/[,;]/)) add('email', cleanEmail(value), 'high', `${link.text} ${value}`);
    } else if (/^tel:/i.test(link.href || '')) {
      let value; try { value = decodeURIComponent(link.href.slice(4)); } catch { continue; }
      if (/\b(?:fax|facsimile)\b/i.test(link.text) && !/\b(?:phone|telephone|tel)\b/i.test(link.text)) continue;
      add('phone', cleanPhone(value), 'high', `${link.text} ${value}`);
    }
  }
  for (const token of parsed.text.split(/[\s<>()[\]{},;:"]+/)) {
    if (token.length <= 242 && token.includes('@')) add('email', cleanEmail(token), 'medium');
  }
  for (const match of parsed.text.matchAll(/(?:\+?1[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]\d{3}[ .-]\d{4}(?:\s*(?:ext\.?|x)\s*\d{1,6})?/gi)) {
    if (faxLabel(parsed.text.slice(Math.max(0, match.index - 80), match.index))) continue;
    add('phone', cleanPhone(match[0]), 'medium', excerpt(parsed.text, match[0]));
  }
  const people = [...parsed.people]; let visited = 0;
  const visit = node => {
    if (!node || typeof node !== 'object' || ++visited > 600) return;
    if (Array.isArray(node)) { node.slice(0, 50).forEach(visit); return; }
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(t => typeof t === 'string' && /(?:^|\/)Person$/.test(t))) people.push({ name: node.name, jobTitle: node.jobTitle });
    for (const key of ['founder', 'employee', 'founders']) {
      const entries = Array.isArray(node[key]) ? node[key] : [node[key]];
      for (const person of entries) if (typeof person === 'string') people.push({ name: person, jobTitle: key.startsWith('founder') ? 'Founder' : 'Employee' });
    }
    for (const value of Object.values(node).slice(0, 80)) if (value && typeof value === 'object') visit(value);
  };
  parsed.schemas.forEach(visit);
  for (const person of people) {
    const name = squash(person.name), role = typeof person.jobTitle === 'string' ? squash(person.jobTitle).slice(0, 100) : '';
    if (isName(name) && squash(parsed.text).toLowerCase().includes(name.toLowerCase())) add('contact', name, 'high', parsed.text, role ? { role } : {});
  }
  for (const line of parsed.text.split('\n')) {
    const match = /\b(?:owner|founder|principal|president|manager|contact)\s*:\s*([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,4})\s*(?:[,|–—]|$)/iu.exec(line.trim());
    if (match && isName(match[1])) add('contact', match[1], 'medium', line, { role: match[0].split(':')[0].trim() });
    const namedRole = /^\s*([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,4})\s*,\s*((?:co[- ]?)?owner|founder|principal|president|manager|partner)\b/iu.exec(line);
    if (namedRole && isName(namedRole[1])) add('contact', namedRole[1], 'medium', line, { role: namedRole[2] });
  }
  for (const [finding, pattern] of [['independent', /\b(?:independently|locally|family)[ -]owned(?:\s+(?:and\s+)?operated)?\b/gi], ['chain', /\b(?:a\s+franchise\s+of|franchise(?:d)?\s+(?:office|location)|part\s+of\s+(?:the\s+)?[^.!?\n]{0,45}\s+(?:chain|franchise))\b/gi]]) {
    for (const match of parsed.text.matchAll(pattern)) {
      if (ownership.length >= 4) break;
      if (/\b(?:not|never|isn't|isn’t|aren't|aren’t)\s+(?:an?\s+)?$/i.test(parsed.text.slice(Math.max(0, match.index - 25), match.index))) continue;
      ownership.push({ finding, value: match[0], sourceURL: url, checkedAt, excerpt: excerpt(parsed.text, match[0]), confidence: 'medium', confirmed: false });
    }
  }
  return { evidence, ownership };
}

/** Return published candidates only. The caller must retain evidence and require
 * explicit human review before applying any proposed change or ownership finding.
 * Injected fetcher is a trusted TEST/transport hook; production defaults to a
 * DNS-pinned Node transport rather than a second DNS lookup inside global fetch.
 */
export async function researchOffice(office, options = {}) {
  const checkedAt = (options.now ? new Date(options.now()) : new Date()).toISOString();
  const result = { officeId: String(office?.id ?? ''), checkedAt, proposedChanges: {}, evidence: [],
    ownership: { status: 'unverified', suggestedFinding: 'unverified', requiresOwnerConfirmation: true, evidence: [] }, pages: [], issues: [] };
  const issue = (error, url) => result.issues.push({ code: error.code || (error.name === 'AbortError' || error.name === 'TimeoutError' ? 'timeout' : 'fetch_failed'), url: url || '', message: error instanceof ResearchError ? error.message : 'This page could not be checked. No missing contact field can be inferred from that failure.' });
  let info; try { info = typeof office?.notes === 'string' ? JSON.parse(office.notes || '{}') : (office?.notes || {}); } catch { issue(new ResearchError('invalid_office', 'The saved office metadata needs repair.')); return result; }
  const website = info.website || office?.website;
  if (!website) { issue(new ResearchError('website_required', 'Choose and verify the office’s own website before researching published contacts.')); return result; }
  let initial; try { initial = safeURL(website); } catch (error) { issue(error, website); return result; }
  const firstParty = bareHost(initial.hostname), lookup = options.lookup || dnsLookup;
  const maxPages = cap(options.maxPages, 3, 1, 5), maxBytes = cap(options.maxBytes, 262144, 1024, 524288);
  const timeoutMs = cap(options.timeoutMs, 6000, 50, 10000), totalTimeoutMs = cap(options.totalTimeoutMs, 20000, 100, 40000);
  const maxRedirects = cap(options.maxRedirects, 5, 0, 5), maxRequests = 18;
  const deadline = Date.now() + totalTimeoutMs, budget = { used: 0, maximum: maxPages * maxBytes + 524288 };
  const policies = new Map(), queued = [initial], seen = new Set(); let requestCount = 0, nextRequestAt = 0;
  async function fetchOne(url, robots = false) {
    if (Date.now() >= deadline) fail('timeout', 'The total research time limit was reached.');
    if (++requestCount > maxRequests) fail('request_limit', 'The research request limit was reached.');
    const controller = new AbortController(), remaining = Math.min(timeoutMs, deadline - Date.now());
    const timer = setTimeout(() => controller.abort(new ResearchError('timeout', 'The page research time limit was reached.')), remaining);
    let response;
    try {
      const addresses = await resolvePublic(url, lookup, controller.signal);
      const headers = { 'User-Agent': USER_AGENT, Accept: robots ? 'text/plain' : 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' };
      response = await abortable(options.fetcher ? Promise.resolve(options.fetcher(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers })) : pinnedFetch(url, { addresses, signal: controller.signal, headers }), controller.signal);
      if (response.url && new URL(response.url).href !== url.href) { discard(response); fail('unsafe_redirect', 'The transport followed a redirect without a safety check.'); }
      if (REDIRECTS.has(response.status)) { const location = response.headers.get('location'); discard(response); return { status: response.status, location }; }
      if (response.status !== 200) { discard(response); return { status: response.status, text: '' }; }
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!robots && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/.test(type)) { discard(response); fail('unsupported_type', 'Only public HTML contact pages are researched.'); }
      const text = await abortable(readBody(response, robots ? 524288 : maxBytes, budget, controller.signal), controller.signal);
      return { status: response.status, text };
    } catch (error) { if (response) discard(response); throw error; }
    finally { clearTimeout(timer); }
  }
  async function robotFor(url) {
    if (policies.has(url.origin)) return policies.get(url.origin);
    let current = new URL('/robots.txt', url), policy;
    try {
      for (let n = 0; n <= maxRedirects; n++) {
        const response = await fetchOne(current, true);
        if (REDIRECTS.has(response.status)) {
          if (n === maxRedirects || !response.location) fail('robots_unavailable', 'The robots policy could not be safely resolved.');
          current = safeURL(new URL(response.location, current).href, firstParty, current); continue;
        }
        if ([404, 410].includes(response.status)) { policy = robotsPolicy(''); break; }
        if (response.status !== 200 || /<(?:!doctype|html|form)\b/i.test(response.text)) fail('robots_unavailable', 'The robots policy is inaccessible or challenged; research stopped.');
        policy = robotsPolicy(response.text); break;
      }
    } catch (error) { issue(error.code?.startsWith('unsafe') || error.code === 'external_redirect' ? error : new ResearchError('robots_unavailable', 'The robots policy could not be checked; research stopped.'), current.href); policy = { allowed: () => false, delayMs: 0, unavailable: true }; }
    policies.set(url.origin, policy); return policy;
  }
  async function fetchPage(start) {
    let current = start;
    for (let n = 0; n <= maxRedirects; n++) {
      const policy = await robotFor(current);
      if (policy.unavailable) fail('robots_unavailable', 'The robots policy could not be checked; this page was not requested.');
      if (!policy.allowed(current)) fail('robots_denied', 'The website robots policy disallows this page.');
      const wait = nextRequestAt - Date.now();
      if (wait > 0) {
        if (wait >= deadline - Date.now()) fail('robots_delay', 'The website crawl delay exceeds this bounded research session.');
        await new Promise(resolve => setTimeout(resolve, wait));
      }
      const response = await fetchOne(current); nextRequestAt = Date.now() + policy.delayMs;
      if (REDIRECTS.has(response.status)) {
        if (n === maxRedirects || !response.location) fail('redirect_limit', 'The website redirect limit was reached.');
        current = safeURL(new URL(response.location, current).href, firstParty, current); continue;
      }
      return { ...response, url: current.href };
    }
  }
  while (queued.length && result.pages.length < maxPages && Date.now() < deadline) {
    const url = queued.shift(); if (seen.has(url.href)) continue; seen.add(url.href);
    try {
      const page = await fetchPage(url);
      if (page.status !== 200) { result.pages.push({ url: page.url, status: page.status }); issue(new ResearchError(page.status === 401 || page.status === 403 ? 'access_denied' : 'page_unavailable', 'The public page was not accessible; no missing field was inferred.'), page.url); continue; }
      const parsed = parseHTML(page.text);
      if (/\b(?:verify (?:that )?you are (?:a )?human|checking your browser|complete (?:the |a )?captcha|access denied|sign in to continue|log in to continue)\b/i.test(parsed.text) || /(?:cf-chl-|g-recaptcha|h-captcha)/i.test(page.text) && parsed.text.length < 350) {
        result.pages.push({ url: page.url, status: 'challenge' }); issue(new ResearchError('challenge', 'A login or anti-bot challenge was encountered; it was not bypassed.'), page.url); continue;
      }
      result.pages.push({ url: page.url, status: 'checked' });
      const findings = extract(parsed, page.url, checkedAt);
      for (const evidence of findings.evidence) if (!result.evidence.some(e => e.field === evidence.field && e.value.toLowerCase() === evidence.value.toLowerCase())) result.evidence.push(evidence);
      result.ownership.evidence.push(...findings.ownership);
      for (const link of parsed.links) {
        if (!link.href || !/(?:contact|about|our[- ]?team|our[- ]?story|leadership|staff|meet[- ]?(?:the[- ]?)?team)/i.test(`${link.text} ${link.href}`) || /^(?:mailto:|tel:|javascript:|#)/i.test(link.href)) continue;
        try {
          const candidate = safeURL(new URL(link.href, page.url).href, firstParty);
          if (candidate.search || seen.has(candidate.href) || queued.some(u => u.href === candidate.href) || queued.length >= 8) continue;
          queued.push(candidate);
        } catch { /* External, private and form-action links are never visited. */ }
      }
    } catch (error) { result.pages.push({ url: url.href, status: error.code || 'failed' }); issue(error, url.href); }
  }
  if (queued.length && Date.now() >= deadline) issue(new ResearchError('timeout', 'The total research time limit was reached.'));
  // Prefer direct published links, but retain ambiguity for human selection.
  result.evidence.sort((a, b) => (b.confidence === 'high') - (a.confidence === 'high'));
  const allEvidence = result.evidence, firstEach = ['email', 'phone', 'contact'].map(field => allEvidence.find(e => e.field === field)).filter(Boolean);
  result.evidence = [...firstEach, ...allEvidence.filter(e => !firstEach.includes(e))].slice(0, 8);
  result.ownership.evidence = result.ownership.evidence.slice(0, 4);
  const findings = new Set(result.ownership.evidence.map(e => e.finding));
  if (findings.size === 1) result.ownership.suggestedFinding = [...findings][0];
  for (const field of ['email', 'phone', 'contact']) {
    const values = allEvidence.filter(e => e.field === field);
    if (values.length === 1) result.proposedChanges[field] = values[0].value;
  }
  return result;
}
