import { HttpError, digest, metadata, text } from './model.mjs';
import { patchReviewed } from './atomic.mjs';
import { enrollmentEligibility } from './billing.mjs';

export const pipelineRevision = office => metadata(office).revision || '';
const newest = rows => rows.map((row, index) => ({ ...row, order: index })).sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0) || b.order - a.order)[0];
export function progressProjection(office, events = [], enrollments = [], now = Date.now()) {
  const info = metadata(office);
  const history = events.filter(row => String(row.assigned_to) === String(office.id)).map(row => ({ ...metadata(row), actorName: row.contact_name }));
  const retained = info.progressHistory || [], retainedIds = new Set(retained.map(event => event.requestId));
  const progress = [...history.filter(event => ['call', 'email', 'meeting'].includes(event.action) || (event.action === 'progress_recorded' && !retainedIds.has(event.detail?.requestId))),
    ...retained.map(event => ({ action: 'progress_recorded', detail: event, at: event.at, actorName: event.actorName }))];
  const contacts = progress.filter(event => event.action !== 'progress_recorded' || event.detail?.kind === 'contacted').map(event => ({ requestId: event.detail?.requestId, at: event.detail?.occurredAt || event.at, by: event.actorName, channel: event.detail?.channel || event.action, note: event.detail?.note || (typeof event.detail === 'string' ? event.detail : '') }));
  const replies = progress.filter(event => event.action === 'progress_recorded' && event.detail?.kind === 'replied').map(event => ({ ...event.detail, at: event.detail.occurredAt || event.at, by: event.actorName }));
  const deliveries = history.filter(event => event.action === 'contract_delivery' && (event.delivery?.status === 'manual_sent' || event.delivery?.deliveredAt) && event.delivery?.mode !== 'test').map(event => ({ at: event.delivery.deliveredAt || event.delivery.sentAt || event.delivery.attemptedAt || event.at, by: event.actorName, channel: event.delivery.deliveredAt ? 'email · delivery confirmed' : 'email · staff recorded', note: 'Office contract' }));
  const lastContact = newest([...contacts, ...deliveries]), lastReply = newest(replies);
  const contracts = enrollments.filter(row => String(metadata(row).leadId) === String(office.id));
  const signed = contracts.filter(row => metadata(row).signature && metadata(row).acceptedAt).sort((a, b) => Date.parse(metadata(b).acceptedAt) - Date.parse(metadata(a).acceptedAt))[0];
  const current = contracts.find(row => enrollmentEligibility(row, now).eligible);
  const prepared = contracts.filter(row => ['invited', 'payment_pending', 'active'].includes(row.status)).sort((a, b) => Number(b.id) - Number(a.id))[0];
  const mail = history.filter(event => event.action === 'contract_delivery').map(event => event.delivery ? { ...event.delivery, contractId: event.contractId } : null).filter(Boolean);
  const relevant = mail.filter(item => !prepared || item.contractId === undefined || String(item.contractId) === String(prepared.id));
  const ordered = relevant.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const deliveryFact = ordered.find(item => item.mode !== 'test' && item.status !== 'preview');
  const latestDelivery = deliveryFact || ordered[0];
  const plan = info.progress || {}, closed = ['not_interested', 'do_not_contact'].includes(office.status) || info.primaryContactDoNotContact;
  let stage = info.primaryContactDoNotContact && office.status !== 'active' ? 'do_not_contact' : office.status;
  if (!closed) {
    if (current && office.status === 'active') stage = 'active';
    else if (signed) stage = 'contract_signed';
    else if (latestDelivery && latestDelivery.mode !== 'test' && ['accepted', 'manual_sent', 'delivered'].includes(latestDelivery.status)) stage = 'contract_sent';
  }
  const replyNeedsUs = lastReply && Date.parse(lastReply.at) >= Math.max(Date.parse(lastContact?.at || '') || 0, Date.parse(signed ? metadata(signed).acceptedAt : '') || 0);
  const automaticWait = current ? 'none' : replyNeedsUs ? 'us' : signed ? 'payment' : latestDelivery && latestDelivery.mode !== 'test' && ['sending', 'accepted', 'deferred'].includes(latestDelivery.status) ? 'delivery' : latestDelivery && latestDelivery.mode !== 'test' && ['manual_sent', 'delivered'].includes(latestDelivery.status) ? 'signature' : lastContact && (!lastReply || Date.parse(lastContact.at) > Date.parse(lastReply.at)) ? 'office' : 'us';
  const latestFact = Math.max(Date.parse(signed ? metadata(signed).acceptedAt : '') || 0, Date.parse(lastContact?.at || '') || 0, Date.parse(lastReply?.at || '') || 0);
  const context = digest(JSON.stringify([lastContact?.requestId || lastContact?.at, lastReply?.requestId || lastReply?.at, signed?.id, signed ? metadata(signed).acceptedAt : null, current?.id, deliveryFact?.contractId, deliveryFact?.status, deliveryFact?.attemptedAt, deliveryFact?.sentAt, deliveryFact?.deliveredAt]));
  const planCurrent = plan.context ? plan.context === context : plan.updatedAt && Date.parse(plan.updatedAt) > latestFact;
  const waitingOn = closed ? 'none' : planCurrent ? plan.waitingOn : automaticWait;
  const automaticNext = closed ? 'No further outreach' : current ? 'Membership active' : signed ? 'Review payment / membership activation' : deliveryFact?.status === 'uncertain' ? 'Review the send outcome; do not resend' : ['rejected', 'failed', 'not_sent'].includes(deliveryFact?.status) ? 'Review the failed send and correct the next message' : waitingOn === 'delivery' ? 'Confirm email delivery before following up for a signature' : waitingOn === 'signature' ? 'Follow up on the contract' : lastReply ? 'Review the reply and choose the next step' : 'Research or contact the office';
  const nextAction = planCurrent && plan.nextAction ? plan.nextAction : automaticNext;
  return { stage, lastContact: lastContact || null, lastReply: lastReply || null, waitingOn, nextAction, nextDue: office.meeting_date || null,
    contract: { id: prepared ? String(prepared.id) : null, prepared: Boolean(prepared), signed: Boolean(signed), signedAt: signed ? metadata(signed).acceptedAt : null, signedBy: signed ? metadata(signed).signature : null,
      delivery: latestDelivery ? { status: latestDelivery.status, at: latestDelivery.attemptedAt || latestDelivery.createdAt, sender: latestDelivery.from, mode: latestDelivery.mode } : null },
    converted: Boolean(signed), paidActive: Boolean(current && office.status === 'active'), revision: pipelineRevision(office), context };
}

export function progressTools(db, audit, now = Date.now) {
  return async (user, office, body) => {
    const info = metadata(office), receipts = info.progressReceipts || [];
    if (typeof body.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)) throw new HttpError(400, 'Supply a unique progress request ID.');
    const fingerprint = digest(JSON.stringify(body)), prior = receipts.find(item => item.id === body.requestId);
    if (prior) { if (prior.digest !== fingerprint || prior.actor !== user.id) throw new HttpError(409, 'This request ID belongs to different progress details.'); return { duplicate: true }; }
    if (body.expectedRevision !== pipelineRevision(office)) throw new HttpError(409, 'This office changed. Refresh before recording progress.');
    if (!['contacted', 'replied', 'waiting', 'next_step', 'note'].includes(body.kind)) throw new HttpError(400, 'Choose a contact, reply, waiting state or next step.');
    const note = text(body.note || '', 2000, true), channel = text(body.channel || 'other', 30);
    if (!['call', 'email', 'meeting', 'other'].includes(channel)) throw new HttpError(400, 'Choose how the conversation happened.');
    const occurredAt = body.occurredAt || new Date(now()).toISOString();
    if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > now() + 300000) throw new HttpError(400, 'Record when the activity actually happened, not a future contact.');
    const outcome = text(body.outcome || 'other', 40);
    if (!['interested', 'questions', 'not_now', 'declined', 'opt_out', 'other'].includes(outcome)) throw new HttpError(400, 'Choose the response outcome.');
    const waitingOn = text(body.waitingOn || (body.kind === 'replied' ? 'us' : 'office'), 40);
    if (!['us', 'office', 'delivery', 'signature', 'payment', 'none', 'other'].includes(waitingOn)) throw new HttpError(400, 'Choose what the office is waiting on.');
    const nextAction = text(body.nextAction || '', 300);
    if (body.nextDue !== undefined && (typeof body.nextDue !== 'string' || (body.nextDue && (!/^\d{4}-\d{2}-\d{2}$/.test(body.nextDue) || !Number.isFinite(Date.parse(body.nextDue)) || new Date(body.nextDue + 'T12:00:00Z').toISOString().slice(0, 10) !== body.nextDue)))) throw new HttpError(400, 'Choose a valid next-step date.');
    const patch = {};
    if (body.nextDue !== undefined) patch.meeting_date = body.nextDue || null;
    const locked = ['active', 'contract_signed', 'invited', 'contract_sent', 'not_interested', 'do_not_contact'].includes(office.status);
    if (!locked && body.kind === 'contacted') patch.status = 'contacted';
    if (!locked && body.kind === 'replied') patch.status = outcome === 'interested' ? 'interested' : outcome === 'declined' ? 'not_interested' : outcome === 'opt_out' ? 'do_not_contact' : 'replied';
    if (body.kind === 'replied' && ['declined', 'opt_out'].includes(outcome) && office.status !== 'active') patch.status = outcome === 'opt_out' ? 'do_not_contact' : 'not_interested';
    if (!locked && body.kind === 'waiting') patch.status = 'waiting';
    info.progress = { waitingOn, nextAction, updatedAt: new Date(now()).toISOString(), by: user.id };
    info.progressReceipts = [...receipts, { id: body.requestId, digest: fingerprint, actor: user.id }].slice(-30);
    const event = { requestId: body.requestId, kind: body.kind, channel, outcome, note, occurredAt, waitingOn, nextAction, nextDue: body.nextDue || null, source: user.role === 'system' ? 'provider_received' : 'staff_recorded' };
    info.progressHistory = [...(info.progressHistory || []), { ...event, actorId: user.id, actorName: user.name, at: new Date(now()).toISOString() }].slice(-10);
    const [allEvents, allEnrollments] = await Promise.all([db.list('events'), db.list('enrollments')]);
    info.progress.context = progressProjection({ ...office, ...patch, notes: JSON.stringify(info) }, allEvents, allEnrollments, now()).context;
    if (JSON.stringify(info).length > 48000) throw new HttpError(400, 'This office’s saved notes are full. Shorten contact notes before adding progress.');
    const saved = await patchReviewed(db, 'offices', office, { ...patch, notes: JSON.stringify(info) });
    await audit(user, office.id, 'progress_recorded', event);
    return { office: saved, duplicate: false };
  };
}
