import { createHmac, timingSafeEqual } from 'node:crypto';
import { backend } from './backend.mjs';
import { HttpError, digest, metadata } from './model.mjs';
import { patchReviewed } from './atomic.mjs';
import { progressTools } from './pipeline.mjs';

// Mailgun's ordinary event/form signature covers timestamp+token. Its JSON
// inbound format instead signs timestamp+the exact raw body.
// https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks
// https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http
const messageId = value => String(value || '').trim().replace(/^<|>$/g, '');
const uuid = value => { const hex = digest(value); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
async function payload(req) {
  let raw;
  if (Buffer.isBuffer(req.rawBody)) raw = req.rawBody;
  else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) raw = Buffer.from(req.body);
  else if (req.body !== undefined) raw = Buffer.from(JSON.stringify(req.body));
  else { const chunks = []; let size = 0; for await (const part of req) { size += part.length; if (size > 131072) throw new HttpError(413, 'Email notification is too large.'); chunks.push(part); } raw = Buffer.concat(chunks); }
  if (raw.length > 131072) throw new HttpError(413, 'Email notification is too large.');
  const type = req.headers['content-type'] || '';
  if (type.startsWith('application/json')) return { raw, data: JSON.parse(raw.toString()) };
  if (type.startsWith('application/x-www-form-urlencoded')) return { raw, data: Object.fromEntries(new URLSearchParams(raw.toString())) };
  if (type.startsWith('multipart/form-data')) {
    const form = await new Request('https://gigtax.pro/api/sales-mail-webhook', { method: 'POST', headers: { 'Content-Type': type }, body: raw }).formData();
    return { raw, data: Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')) };
  }
  throw new HttpError(415, 'Use a supported email notification format.');
}
function authenticate(req, data, raw, key, now) {
  const proof = data.signature && typeof data.signature === 'object' ? data.signature : data;
  const timestamp = String(req.headers['x-mailgun-timestamp'] || proof.timestamp || '');
  const signature = String(req.headers['x-mailgun-signature'] || proof.signature || '');
  const token = String(proof.token || '');
  if (!/^\d{10,12}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 86400) throw new HttpError(400, 'Invalid email notification signature.');
  const hmac = createHmac('sha256', key).update(timestamp);
  if (req.headers['x-mailgun-signature']) hmac.update(raw);
  else { if (!/^[A-Za-z0-9_-]{10,200}$/.test(token)) throw new HttpError(400, 'Invalid email notification signature.'); hmac.update(token); }
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), hmac.digest())) throw new HttpError(400, 'Invalid email notification signature.');
  return Number(timestamp) * 1000;
}
export function createMailWebhook(env = process.env, adapter, { now = Date.now } = {}) {
  return async (req, res) => {
    const reply = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(data)); };
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
      if (!env.GIGTAX_MAILGUN_WEBHOOK_KEY || !env.GIGTAX_TINKY_KEY) throw new HttpError(503, 'Email notifications are not connected.');
      const { raw, data } = await payload(req), receivedAt = authenticate(req, data, raw, env.GIGTAX_MAILGUN_WEBHOOK_KEY, now());
      const db = adapter || backend(env), rows = await db.list('events');
      const emails = rows.filter(row => metadata(row).action === 'contract_delivery');
      const syncReservation = async (row, status) => {
        const info = metadata(row), contract = await db.get('enrollments', info.contractId);
        if (!contract) return;
        const saved = metadata(contract);
        if (saved.deliveryReservation?.id === String(row.id) && saved.deliveryReservation.status !== status) await patchReviewed(db, 'enrollments', contract, { notes: JSON.stringify({ ...saved, deliveryReservation: { ...saved.deliveryReservation, status } }) });
      };
      if (data['event-data']) {
        const event = data['event-data'], eventId = String(event.id || ''), id = messageId(event.message?.headers?.['message-id']);
        if (!eventId || eventId.length > 300 || !id || !['accepted', 'delivered', 'failed', 'complained', 'unsubscribed'].includes(event.event)) return reply(200, { ok: true, ignored: true });
        const requested = String(event['user-variables']?.gigtax_delivery || '');
        const row = emails.find(row => requested ? String(row.id) === requested : messageId(metadata(row).delivery.providerId) === id);
        if (!row) return reply(200, { ok: true, ignored: true });
        const info = metadata(row), d = info.delivery;
        if ((d.providerId && messageId(d.providerId) !== id) || String(event.recipient || '').toLowerCase() !== d.to || (event.domain?.name && event.domain.name !== d.from.split('@')[1])) throw new HttpError(400, 'Email event does not match its saved message.');
        if ((d.webhookIds || []).includes(eventId)) { await syncReservation(row, d.status); return reply(200, { ok: true, duplicate: true }); }
        const consentEvent = ['complained', 'unsubscribed'].includes(event.event);
        if (d.mode !== 'live' || event.flags?.['is-test-mode'] === true || (!consentEvent && event.flags?.['is-test-mode'] !== false) || Number(event['delivery-status']?.code) === 650) return reply(200, { ok: true, ignored: true, testOrUnverified: true });
        const eventAt = Number(event.timestamp) * 1000;
        if (!Number.isFinite(eventAt) || eventAt > now() + 300000) throw new HttpError(400, 'Invalid email event time.');
        if (consentEvent) {
          const office = await db.get('offices', row.assigned_to), m = metadata(office);
          const emailOptOuts = [...new Set([...(m.emailOptOuts || []), d.to])];
          await patchReviewed(db, 'offices', office, { notes: JSON.stringify({ ...m, emailOptOuts,
            primaryContactDoNotContact: m.primaryContactDoNotContact || office.contact_email === d.to,
            contacts: (m.contacts || []).map(contact => contact.email === d.to ? { ...contact, preference: 'do_not_contact' } : contact) }) });
        }
        const status = consentEvent ? 'opted_out' : event.event === 'failed' ? event.severity === 'temporary' ? 'deferred' : 'failed' : event.event;
        const newer = !d.webhookAt || eventAt >= Date.parse(d.webhookAt);
        const delivery = { ...d, webhookIds: [...(d.webhookIds || []), eventId].slice(-100) };
        if (consentEvent || (newer && d.status !== 'opted_out' && !(d.deliveredAt && ['accepted', 'deferred'].includes(status)))) Object.assign(delivery, { status, providerId: d.providerId || `<${id}>`, webhookAt: new Date(eventAt).toISOString(), verification: 'signed_provider_event', ...(status === 'delivered' ? { deliveredAt: new Date(eventAt).toISOString() } : {}) });
        const savedEvent = await patchReviewed(db, 'events', row, { status: delivery.status, notes: JSON.stringify({ ...info, delivery }) });
        await syncReservation(savedEvent, delivery.status);
        return reply(200, { ok: true });
      }
      let headers = data['message-headers'] || [];
      if (typeof headers === 'string') headers = JSON.parse(headers);
      if (!Array.isArray(headers)) throw new HttpError(400, 'Invalid incoming mail headers.');
      const header = name => headers.filter(pair => Array.isArray(pair) && String(pair[0]).toLowerCase() === name).map(pair => String(pair[1])).join(' ');
      const references = (header('in-reply-to') + ' ' + header('references')).match(/<[^>]+>|\S+/g) || [];
      const sender = String(data.sender || '').trim().toLowerCase(), recipient = String(data.recipient || '').trim().toLowerCase();
      const row = emails.find(row => { const d = metadata(row).delivery; return d.mode === 'live' && d.providerId && references.map(messageId).includes(messageId(d.providerId)) && d.to === sender && [d.replyTo, d.from].includes(recipient); });
      if (!row) return reply(200, { ok: true, ignored: true, unmatchedReply: true });
      const incomingId = messageId(header('message-id'));
      if (!incomingId || incomingId.length > 300) throw new HttpError(400, 'Incoming mail needs its message ID.');
      const info = metadata(row), eventId = 'reply:' + incomingId;
      if ((info.delivery.webhookIds || []).includes(eventId)) return reply(200, { ok: true, duplicate: true });
      const requestId = uuid(eventId);
      if (!rows.some(event => metadata(event).action === 'progress_recorded' && metadata(event).detail?.requestId === requestId)) {
        const office = await db.get('offices', row.assigned_to);
        const audit = (user, id, action, detail) => db.create('events', { town: `Incoming email ${digest(incomingId).slice(0, 12)}`, assigned_to: String(id), contact_name: user.name, status: 'recorded', notes: JSON.stringify({ actorId: user.id, action, detail, at: new Date(receivedAt).toISOString() }) });
        await progressTools(db, audit, now)({ id: 'mailgun', name: 'Incoming email', role: 'system' }, office, { requestId, expectedRevision: metadata(office).revision || '', kind: 'replied', channel: 'email', outcome: 'other', waitingOn: 'us',
          note: String(data['stripped-text'] || data['body-plain'] || 'Incoming business reply; message body was empty.').slice(0, 2000), occurredAt: new Date(receivedAt).toISOString(), nextAction: 'Read the incoming reply and respond' });
      }
      const current = await db.get('events', row.id), currentInfo = metadata(current);
      await patchReviewed(db, 'events', current, { notes: JSON.stringify({ ...currentInfo, delivery: { ...currentInfo.delivery, webhookIds: [...(currentInfo.delivery.webhookIds || []), eventId].slice(-100), lastReplyAt: new Date(receivedAt).toISOString() } }) });
      return reply(200, { ok: true });
    } catch (error) { reply(error.status || (error instanceof SyntaxError ? 400 : 502), { error: error instanceof HttpError ? error.message : 'The email notification was not confirmed.' }); }
  };
}
export default createMailWebhook();
