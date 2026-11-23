import { HttpError, metadata } from '../../sales/model.mjs';
import { patchReviewed } from '../../sales/atomic.mjs';

const messageId = value => String(value || '').trim().replace(/^<|>$/g, '');
const address = value => String(value || '').trim().toLowerCase();
const deliveryEvents = new Set(['accepted', 'delivered', 'failed', 'complained', 'unsubscribed']);

export function campaignNotifications(db, now = Date.now) {
  async function delivery(event) {
    const provider = messageId(event.message?.headers?.['message-id']);
    const hint = String(event['user-variables']?.gigtax_delivery || '');
    const row = hint ? db.get('campaign-leads', hint) : db.list('campaign-leads').find(item => {
      const attempt = metadata(item).attempt;
      return provider && messageId(attempt?.providerId) === provider;
    });
    if (!row) return false;
    const info = metadata(row), attempt = info.attempt;
    if (!attempt || !deliveryEvents.has(event.event)) return true;
    const eventId = String(event.id || '');
    if (!provider || !eventId || eventId.length > 300 || (attempt.providerId && messageId(attempt.providerId) !== provider) ||
        address(event.recipient) !== attempt.to || (event.domain?.name && event.domain.name !== attempt.from.split('@')[1])) {
      throw new HttpError(400, 'Email event does not match its campaign message.');
    }
    const timestamp = Number(event.timestamp) * 1000;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now() + 300000) throw new HttpError(400, 'Invalid delivery time.');
    if ((attempt.ids || []).includes(eventId)) return true;
    const optedOut = ['unsubscribed', 'complained'].includes(event.event);
    const testMode = event.flags?.['is-test-mode'];
    if (attempt.mode !== 'live' || testMode === true || (!optedOut && testMode !== false)) return true;
    if (optedOut) db.suppressEmail(attempt.to);
    const recent = !attempt.eventAt || timestamp >= attempt.eventAt;
    const next = { ...attempt, ids: [...(attempt.ids || []), eventId].slice(-100) };
    const status = optedOut ? 'opted_out' : event.event === 'failed' && event.severity === 'temporary' ? 'deferred' : event.event;
    if (optedOut || (recent && attempt.status !== 'opted_out' && !(attempt.deliveredAt && ['accepted', 'deferred'].includes(status)))) {
      Object.assign(next, { status, providerId: attempt.providerId || '<' + provider + '>', eventAt: timestamp });
      if (status === 'delivered') next.deliveredAt = new Date(timestamp).toISOString();
    }
    await patchReviewed(db, 'campaign-leads', row, { status: info.reply && next.status !== 'opted_out' ? 'replied' : next.status,
      notes: JSON.stringify({ ...info, attempt: next }) });
    return true;
  }

  async function reply(data, receivedAt) {
    let headers = data['message-headers'] || [];
    if (typeof headers === 'string') headers = JSON.parse(headers);
    if (!Array.isArray(headers)) throw new HttpError(400, 'Invalid incoming mail headers.');
    const header = name => headers.filter(pair => Array.isArray(pair) && String(pair[0]).toLowerCase() === name).map(pair => String(pair[1])).join(' ');
    const references = new Set(((header('in-reply-to') + ' ' + header('references')).match(/<[^>]+>|\S+/g) || []).map(messageId));
    const sender = address(data.sender), recipient = address(data.recipient);
    const row = db.list('campaign-leads').find(item => {
      const attempt = metadata(item).attempt;
      return attempt?.mode === 'live' && attempt.providerId && references.has(messageId(attempt.providerId)) &&
        attempt.to === sender && [attempt.replyTo, attempt.from].map(address).includes(recipient);
    });
    if (!row) return false;
    const id = messageId(header('message-id'));
    if (!id || id.length > 300) throw new HttpError(400, 'Incoming mail needs its message ID.');
    const info = metadata(row);
    if ((info.replyIds || []).includes(id)) return true;
    const text = String(data['stripped-text'] || data['body-plain'] || '').trim().slice(0, 2000);
    const optOut = /^(?:please\s+)?(?:unsubscribe\b|remove me\b|stop emailing\b|stop\b)/i.test(text);
    if (optOut) db.suppressEmail(sender);
    const recent = !info.reply || receivedAt >= Date.parse(info.reply.at);
    if (recent) info.reply = { at: new Date(receivedAt).toISOString(), text };
    info.replyIds = [...(info.replyIds || []), id].slice(-100);
    await patchReviewed(db, 'campaign-leads', row, { status: optOut || row.status === 'opted_out' ? 'opted_out' : 'replied', notes: JSON.stringify(info) });
    return true;
  }
  return (data, receivedAt) => data['event-data'] ? delivery(data['event-data']) : reply(data, receivedAt);
}
