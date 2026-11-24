import { createHash, randomUUID } from 'node:crypto';
import { HttpError, digest, seal, secret, unseal } from '../../sales/model.mjs';
import { day, localTime, minute } from './booking-times.mjs';

const googleEvents = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const graph = 'https://graph.microsoft.com/v1.0/me';
const microsoftLogin = 'https://login.microsoftonline.com/common/oauth2/v2.0/';
const providers = {
  google: { prefix: 'GOOGLE', authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/calendar.events' },
  microsoft: { prefix: 'MICROSOFT', authorize: microsoftLogin + 'authorize', token: microsoftLogin + 'token',
    scope: 'offline_access https://graph.microsoft.com/Calendars.ReadWrite' },
};
const unavailable = () => new HttpError(503, 'The connected calendar could not be checked. Try again or ask the rep to reconnect it.');
const stamp = ms => new Date(ms).toISOString();
const connectionKey = host => 'connection:' + host;
const eventKey = (conn, id) => 'event:' + conn.id + ':' + id;
const googleId = (conn, id) => digest(conn.id + ':' + id);
const msHeaders = { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' };

function beginningOfDate(date, zone) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw unavailable();
  const midnight = Date.parse(date + 'T00:00:00Z');
  let low = (midnight - day) / minute, high = (midnight + day) / minute;
  while (low < high) {
    const middle = Math.floor((high + low) / 2);
    if (localTime(middle * minute, zone).slice(0, 10) < date) low = middle + 1;
    else high = middle;
  }
  return low * minute;
}
function instant(value, provider, zone) {
  if (value?.date) return beginningOfDate(value.date, zone);
  if (typeof value?.dateTime !== 'string') throw unavailable();
  const ms = Date.parse(provider === 'microsoft' && !/(?:Z|[+-]\d\d:\d\d)$/i.test(value.dateTime) ? value.dateTime + 'Z' : value.dateTime);
  if (!Number.isFinite(ms)) throw unavailable();
  return ms;
}
export function calendarConnections(env, store, origin, key, { fetcher = fetch, now = Date.now } = {}) {
  const redirect = origin + '/book/connect';
  const access = new Map(), refreshing = new Map();
  const connection = host => store.setting(connectionKey(host));
  function config(provider) {
    if (!Object.hasOwn(providers, provider)) throw new HttpError(400, 'Choose Google or Microsoft.');
    const p = providers[provider], prefix = 'SDR_' + p.prefix + '_CALENDAR_';
    return { ...p, client_id: env[prefix + 'CLIENT_ID'], client_secret: env[prefix + 'CLIENT_SECRET'] };
  }
  function status(host) {
    return { connected: connection(host)?.provider || null, redirect,
      configured: Object.keys(providers).filter(p => { const c = config(p); return c.client_id && c.client_secret; }) };
  }
  async function request(url, options = {}) {
    try { return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10_000) }); }
    catch { throw unavailable(); }
  }
  async function tokens(provider, fields) {
    const { token, client_id, client_secret } = config(provider);
    const response = await request(token, { method: 'POST', body: new URLSearchParams({ client_id, client_secret, ...fields }) });
    if (!response.ok) throw unavailable();
    const result = await response.json();
    if (typeof result.access_token !== 'string' || !result.access_token) throw unavailable();
    return result;
  }
  function begin(host, provider) {
    const c = config(provider);
    if (!c.client_id || !c.client_secret) throw new HttpError(409, 'The workspace needs this provider’s calendar app credentials first.');
    if (connection(host)) throw new HttpError(409, 'Disconnect the current calendar before connecting another one.');
    const state = secret(), verifier = secret(), url = new URL(c.authorize);
    store.save('oauth:' + host, { state: digest(state), verifier, provider, expires: now() + 10 * minute });
    url.search = new URLSearchParams({ response_type: 'code', client_id: c.client_id, redirect_uri: redirect,
      scope: c.scope, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }) }).toString();
    return { url: url.href };
  }
  async function complete(host, state, code) {
    const pending = store.setting('oauth:' + host);
    if (!pending || typeof state !== 'string' || pending.state !== digest(state) || pending.expires <= now() ||
        typeof code !== 'string' || !code || code.length > 8000) throw new HttpError(400, 'Start the calendar connection again from your sales account.');
    store.clear('oauth:' + host);
    const value = await tokens(pending.provider, { grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: redirect });
    if (!value.refresh_token) throw new HttpError(409, 'Allow offline calendar access and reconnect.');
    if (connection(host) || store.setting('oauth:' + host)) throw new HttpError(409, 'A newer calendar connection was started.');
    const conn = { id: randomUUID(), provider: pending.provider,
      credential: seal({ refresh: value.refresh_token, exp: Number.MAX_SAFE_INTEGER }, key) };
    store.save(connectionKey(host), conn);
    return conn;
  }
  function disconnect(host) {
    const old = connection(host);
    if (old) access.delete(old.id);
    store.clear(connectionKey(host));
    store.clear('oauth:' + host);
  }
  async function bearer(host, conn) {
    if (connection(host)?.id !== conn.id) throw unavailable();
    const cached = access.get(conn.id);
    if (cached?.until > now() + minute) return cached.token;
    if (!refreshing.has(conn.id)) {
      const refresh = async () => {
        const credential = unseal(connection(host)?.credential || '', key);
        if (!credential?.refresh) throw unavailable();
        const result = await tokens(conn.provider, { grant_type: 'refresh_token', refresh_token: credential.refresh });
        if (connection(host)?.id !== conn.id) throw unavailable();
        if (result.refresh_token) store.save(connectionKey(host), { ...conn,
          credential: seal({ refresh: result.refresh_token, exp: Number.MAX_SAFE_INTEGER }, key) });
        access.set(conn.id, { token: result.access_token, until: now() + Math.min(3600, Number(result.expires_in) || 300) * 1000 });
        return result.access_token;
      };
      refreshing.set(conn.id, refresh().finally(() => refreshing.delete(conn.id)));
    }
    return refreshing.get(conn.id);
  }
  async function api(host, conn, url, method = 'GET', body) {
    const token = await bearer(host, conn);
    const response = await request(url, { method, headers: { Authorization: 'Bearer ' + token,
      ...(conn.provider === 'microsoft' ? msHeaders : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401) access.delete(conn.id);
    return response;
  }
  async function busy(host, conn, start, end, except) {
    if (!conn || end <= start) return [];
    const google = conn.provider === 'google', base = google ? googleEvents : graph + '/calendarView';
    let url = new URL(base);
    url.search = new URLSearchParams(google ? { timeMin: stamp(start), timeMax: stamp(end), singleEvents: 'true', maxResults: '2500',
      fields: 'timeZone,nextPageToken,items(id,status,transparency,start,end)' } :
      { startDateTime: stamp(start), endDateTime: stamp(end), '$select': 'id,start,end,showAs,isCancelled', '$top': '1000' }).toString();
    const exceptId = except && (google ? googleId(conn, except) : store.setting(eventKey(conn, except)));
    const intervals = [];
    for (let page = 0; page < 20; page++) {
      const response = await api(host, conn, url);
      if (!response.ok) throw unavailable();
      const result = await response.json(), events = google ? result.items : result.value;
      if (!Array.isArray(events)) throw unavailable();
      for (const event of events) {
        if (event.id === exceptId || event.status === 'cancelled' || event.transparency === 'transparent' || event.isCancelled || event.showAs === 'free') continue;
        intervals.push({ start: instant(event.start, conn.provider, result.timeZone || 'UTC'), end: instant(event.end, conn.provider, result.timeZone || 'UTC') });
      }
      if (google && result.nextPageToken) url.searchParams.set('pageToken', result.nextPageToken);
      else if (!google && result['@odata.nextLink']) {
        url = new URL(result['@odata.nextLink']);
        if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password) throw unavailable();
      } else return intervals;
    }
    throw unavailable();
  }
  async function sync(row, conn) {
    const host = row.host, google = conn.provider === 'google', known = store.setting(eventKey(conn, row.id));
    const base = google ? googleEvents : graph + '/events', id = google ? googleId(conn, row.id) : known;
    const target = id ? base + '/' + encodeURIComponent(id) + (google ? '?sendUpdates=all' : '') : '';
    if (row.status === 'cancelled') {
      if (id) {
        const response = await api(host, conn, target, 'DELETE');
        if (!response.ok && ![404, 410].includes(response.status)) throw unavailable();
      }
      return;
    }
    const title = row.title + ' · ' + row.client.name;
    const details = [row.hostName, row.client.company, row.client.notes, row.answer && row.question + ' ' + row.answer].filter(Boolean).join('\n');
    const body = google ? { summary: title, description: details, location: row.location,
      start: { dateTime: stamp(row.start) }, end: { dateTime: stamp(row.end) }, attendees: [{ email: row.client.email }] } :
      { subject: title, body: { contentType: 'text', content: details }, location: { displayName: row.location },
        start: { dateTime: stamp(row.start).slice(0, -1), timeZone: 'UTC' }, end: { dateTime: stamp(row.end).slice(0, -1), timeZone: 'UTC' },
        attendees: [{ emailAddress: { address: row.client.email, name: row.client.name }, type: 'required' }] };
    let response;
    if (known) response = await api(host, conn, target, 'PATCH', body);
    if (!response || response.status === 404) {
      response = await api(host, conn, base + (google ? '?sendUpdates=all' : ''), 'POST',
        { ...body, ...(google ? { id } : { transactionId: row.id }) });
      if (google && response.status === 409) response = await api(host, conn, target, 'PATCH', body);
    }
    if (!response.ok) throw unavailable();
    const savedId = (await response.json()).id;
    if (typeof savedId !== 'string' || !savedId) throw unavailable();
    store.save(eventKey(conn, row.id), savedId);
  }
  return { connection, status, begin, complete, disconnect, busy, sync };
}
