import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { HttpError, seal, secret, text, unseal } from '../../sales/model.mjs';
import { resolvePublicAddresses } from '../../sales/research.mjs';
import { httpsSetting } from './configuration.mjs';

export function bookingWebhooks(env, store, key) {
  const configured = new Map();
  const items = env.SDR_BOOKING_WEBHOOKS ? JSON.parse(env.SDR_BOOKING_WEBHOOKS) : [];
  if (!Array.isArray(items) || items.length > 20) throw new Error('SDR_BOOKING_WEBHOOKS must be a list of up to 20 endpoints.');
  for (const { name, url, secret } of items) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(name || '') || configured.has(name) || typeof secret !== 'string' || secret.length < 32) {
      throw new Error('Each booking webhook needs a unique name and a signing secret of at least 32 characters.');
    }
    const endpoint = httpsSetting('Booking webhook', url);
    if (!endpoint) throw new Error('Set the HTTPS URL for each booking webhook.');
    configured.set(name, { name, url: endpoint.href, key: secret, scope: 'server' });
  }
  const saved = scope => store.setting('webhooks:' + scope) || {};
  function forHost(host) {
    const all = new Map(configured);
    for (const scope of ['workspace', host]) {
      for (const [name, encrypted] of Object.entries(saved(scope))) {
        const record = unseal(encrypted, key);
        if (!record) throw new HttpError(503, 'A saved API connection could not be opened.');
        all.set(scope + '/' + name, { name, scope, ...record });
      }
    }
    return all;
  }
  function change(user, host, input, remove) {
    const scope = input.scope === 'workspace' ? 'workspace' : host;
    if ((scope === 'workspace' || host !== user.id) && user.role !== 'owner') throw new HttpError(403, 'Only the owner can manage workspace-wide webhooks.');
    const name = text(input.name, 50, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,49}$/.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) {
      throw new HttpError(400, 'Use letters, numbers, spaces, hyphens or underscores for the connection name.');
    }
    return store.transaction(() => {
      const entries = saved(scope);
      if (remove) {
        delete entries[name]; store.save('webhooks:' + scope, entries); return { removed: true };
      }
      if (Object.hasOwn(entries, name)) throw new HttpError(409, 'Choose a different connection name.');
      if (Object.keys(entries).length >= 20) throw new HttpError(400, 'This calendar already has 20 endpoints.');
      let url;
      try { url = httpsSetting('Webhook', text(input.url, 1800, true)); } catch {}
      if (!url || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
          /(?:^|\.)(localhost|local|internal|lan|home)$/.test(url.hostname)) throw new HttpError(400, 'Enter a public HTTPS webhook URL.');
      const bearer = text(input.bearer || '', 1500);
      if (bearer && !/^[!-~]+$/.test(bearer)) throw new HttpError(400, 'Check the bearer token.');
      const signingKey = secret();
      entries[name] = seal({ url: url.href, bearer, key: signingKey, exp: Number.MAX_SAFE_INTEGER }, key);
      store.save('webhooks:' + scope, entries);
      return { name, signingKey };
    });
  }
  return { forHost, change };
}

export async function postPublicWebhook(urlString, options) {
  const url = new URL(urlString), signal = options.signal;
  const addresses = await resolvePublicAddresses(url, lookup, signal);
  const address = addresses.find(a => a.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: options.headers, signal, agent: false, autoSelectFamily: false,
      lookup: (_hostname, opts, cb) => opts?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, response => {
      const ok = response.statusCode >= 200 && response.statusCode < 300;
      response.destroy();
      resolve({ ok });
    });
    req.on('error', reject); req.end(options.body);
  });
}
