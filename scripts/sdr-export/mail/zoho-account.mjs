import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { HttpError, metadata } from '../../../sales/model.mjs';
import { privateValue } from '../setup.mjs';

const regions = { us: 'zoho.com', eu: 'zoho.eu', in: 'zoho.in', au: 'zoho.com.au', jp: 'zoho.jp', ca: 'zohocloud.ca', sa: 'zoho.sa', cn: 'zoho.com.cn' };
const addressOf = value => typeof value === 'string' && /^[^\s<>,;@"\\]+@(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim()) ? value.trim().toLowerCase() : '';
export const zohoId = value => /^[1-9]\d{0,24}$/.test(String(value)) ? String(value) : '';

export function zohoConfig(env, directory) {
  let file = {};
  if (directory || env.SDR_ZOHO_CONFIG_FILE) {
    try { file = JSON.parse(privateValue(env.SDR_ZOHO_CONFIG_FILE || join(directory, 'zoho-mail.json'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new HttpError(503, 'The workspace Zoho Mail configuration needs administrator attention.');
    }
  }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new HttpError(503, 'Invalid workspace Zoho Mail configuration.');
  const region = String(env.SDR_ZOHO_REGION || file.region || 'us').toLowerCase();
  if (!Object.hasOwn(regions, region)) throw new HttpError(503, 'The workspace Zoho data center is unavailable.');
  return {
    host: regions[region], clientId: env.ZOHO_CLIENT_ID || file.clientId, clientSecret: env.ZOHO_CLIENT_SECRET || file.clientSecret,
    refreshToken: env.ZOHO_REFRESH_TOKEN || file.refreshToken, orgId: zohoId(env.SDR_ZOHO_ORG_ID || file.orgId),
    ownerAddress: addressOf(env.SDR_ZOHO_OWNER_ADDRESS || file.ownerAddress), mailboxes: file.mailboxes || {},
  };
}

// Only an owner-issued CRM identity or a server-side assignment can open a company mailbox.
export function zohoAssignment(db, user, config) {
  const override = Object.hasOwn(config.mailboxes, user.id) ? config.mailboxes[user.id] : undefined;
  const row = user.role === 'agent' && db.get('agents', user.id);
  const info = row && metadata(row);
  const trusted = row && row.status === 'active' && (info.invitedBy ? info.invitedBy === 'owner' : (!info.parentId || info.parentId === 'owner'));
  const address = addressOf(override?.address || (user.role === 'owner' ? config.ownerAddress : trusted ? user.email : ''));
  const reserved = address && (user.role !== 'owner' && address === config.ownerAddress ||
    Object.entries(config.mailboxes).some(([id, assignment]) => id !== user.id && addressOf(assignment?.address) === address));
  const refreshToken = override?.refreshToken || config.refreshToken;
  return { name: db.salesRepProfile?.(user.id)?.name || user.name, address: reserved ? '' : address,
    configured: Boolean(address && !reserved && config.clientId && config.clientSecret && refreshToken),
    accountId: zohoId(override?.accountId), config: { ...config, orgId: override?.refreshToken ? '' : config.orgId, refreshToken } };
}

const unavailable = () => new HttpError(503, 'Zoho Mail is unavailable for this workspace account. Your drafts are saved here.');
export const sameAddress = (one, two) => Boolean(addressOf(one)) && addressOf(one) === addressOf(two);
export function zohoSession(fetcher = fetch) {
  const tokens = new Map();
  async function refresh(config) {
    try {
      const result = await fetcher('https://accounts.' + config.host + '/oauth/v2/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken }),
      });
      const data = await result.json();
      if (!result.ok || typeof data.access_token !== 'string' || !data.access_token) throw unavailable();
      return { value: data.access_token, expires: Date.now() + Math.max(1, Math.min(Number(data.expires_in) || 3600, 3600) - 60) * 1000 };
    } catch { throw unavailable(); }
  }
  async function token(config) {
    const key = createHash('sha256').update(JSON.stringify([config.host, config.clientId, config.clientSecret, config.refreshToken])).digest('hex');
    let entry = tokens.get(key);
    if (!entry || entry.expires <= Date.now()) {
      if (tokens.size > 256) tokens.clear();
      entry = { expires: Date.now() + 15_000, pending: refresh(config) };
      tokens.set(key, entry);
      entry.pending.then(value => Object.assign(entry, value), () => { if (tokens.get(key) === entry) tokens.delete(key); });
    }
    const access = await entry.pending;
    return { value: access.value, invalidate() { if (tokens.get(key) === entry) tokens.delete(key); } };
  }

  async function request(config, path, { method = 'GET', json, bytes, binary, sending = false } = {}) {
    const access = await token(config);
    const headers = { Authorization: 'Zoho-oauthtoken ' + access.value };
    if (json || bytes) headers['Content-Type'] = json ? 'application/json' : 'application/octet-stream';
    let response;
    try { response = await fetcher('https://mail.' + config.host + '/api/' + path, { method, headers,
      body: json ? JSON.stringify(json) : bytes, signal: AbortSignal.timeout(20_000), redirect: 'error' }); }
    catch { throw new HttpError(502, 'Zoho Mail did not confirm the request.'); }
    if (response.status === 401) access.invalidate();
    function failed(code) {
      if (sending && code >= 400 && code < 500 && code !== 408) return new HttpError(422, 'Zoho Mail declined the message. Your draft is saved.');
      if (code === 401 || code === 403) return unavailable();
      return new HttpError(code === 404 ? 404 : code === 429 ? 429 : 502, code === 429 ? 'Zoho Mail is busy. Try again shortly.' : 'Zoho Mail could not complete this request.');
    }
    if (!response.ok) throw failed(response.status);
    if (binary) return readBounded(response, 5 * 1024 * 1024);
    const raw = await readBounded(response, 10 * 1024 * 1024);
    let data;
    try { data = JSON.parse(raw.toString('utf8'), (_, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) ? context.source : value); }
    catch { throw new HttpError(502, 'Zoho Mail returned an unreadable response.'); }
    if (Number(data?.status?.code) >= 400) throw failed(Number(data.status.code));
    if (data?.data === undefined && !(method !== 'GET' && Number(data?.status?.code) >= 200 && Number(data.status.code) < 300)) throw new HttpError(502, 'Zoho Mail did not confirm the request.');
    return data.data;
  }

  async function open(mailbox) {
    if (!mailbox.configured) throw unavailable();
    const { config, address } = mailbox;
    let account;
    if (mailbox.accountId) account = await request(config, 'accounts/' + mailbox.accountId);
    else if (config.orgId) account = await request(config, 'organization/' + config.orgId + '/accounts/' + encodeURIComponent(address));
    else account = await request(config, 'accounts');
    const matching = (Array.isArray(account) ? account : [account]).filter(row => sameAddress(row?.primaryEmailAddress, address) && zohoId(row.accountId));
    if (matching.length !== 1 || (mailbox.accountId && String(matching[0].accountId) !== mailbox.accountId)) throw unavailable();
    const root = 'accounts/' + matching[0].accountId + '/';
    return (path, options) => request(config, root + path, options);
  }
  return { open };
}

async function readBounded(response, limit) {
  const parts = [];
  let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, 'This message or attachment exceeds the workspace size limit.');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
