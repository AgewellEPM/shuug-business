import { HttpError, digest, metadata, seal, secret, text, unseal } from './model.mjs';
import { officeContacts } from './contacts.mjs';
import { patchReviewed } from './atomic.mjs';
import { contractLink } from './contracts.mjs';
import { mailConfig, mailConnection, sendContractMail, singleEmail } from './mail-provider.mjs';

export const DELIVERY_ACTIONS = new Set(['preview-contract-email', 'send-contract-email', 'record-contract-sent', 'resolve-contract-email']);
const stopped = office => ['do_not_contact', 'not_interested'].includes(office.status) || metadata(office).primaryContactDoNotContact;
const contractFingerprint = row => { const info = metadata(row); return digest(JSON.stringify([row.id, row.status, row.contact_email, row.contact_name, info.leadId, info.terms?.hash, info.sealedToken, info.expiresAt, info.signature, info.acceptedAt])); };
const receipt = row => { const info = metadata(row), { status, from, to, replyTo, senderId, mode, createdAt, attemptedAt, sentAt, providerId, verification, resolution, deliveredAt, lastReplyAt } = info.delivery; return { id: String(row.id), contractId: String(info.contractId), officeId: String(row.assigned_to), actor: row.contact_name, status, from, to, replyTo, senderId, mode, createdAt, attemptedAt, sentAt, providerId, verification, resolution, deliveredAt, lastReplyAt }; };
export const deliveryReceipts = rows => rows.filter(row => metadata(row).action === 'contract_delivery').map(receipt);
export function safeSalesEvent(row) {
  const info = metadata(row);
  return info.action === 'contract_delivery' ? { ...row, notes: JSON.stringify({ actorId: info.actorId, action: info.action, at: info.at, detail: receipt(row), delivery: receipt(row) }) } : row;
}
export function deliveryTools(env, db, { now = Date.now, mailSender = sendContractMail } = {}) {
  async function mailboxes(user) {
    const all = await db.list('agents');
    return all.filter(row => row.status === 'mailbox' && metadata(row).mailbox && (user.role === 'owner' || row.assigned_to === 'shared' || String(row.assigned_to) === String(user.id))).map(row => ({ id: String(row.id), name: row.contact_name, email: row.contact_email,
      kind: metadata(row).kind, ownerId: String(row.assigned_to), mode: metadata(row).mode, replyTo: metadata(row).replyTo, revision: metadata(row).revision || '' }));
  }
  async function saveMailbox(user, body) {
    const kind = body.kind, ownerId = kind === 'shared' ? 'shared' : user.role === 'owner' ? String(body.ownerId || '') : String(user.id);
    if (!['shared', 'agent'].includes(kind) || (kind === 'shared' && user.role !== 'owner')) throw new HttpError(403, 'Only the workspace owner can configure a shared sender.');
    let agent;
    if (kind === 'agent') { agent = await db.get('agents', ownerId); if (!agent || agent.status !== 'active') throw new HttpError(400, 'Choose an active agent for this sender.'); }
    const address = singleEmail(body.email), replyTo = singleEmail(body.replyTo || address), name = text(body.name, 140, true);
    if (/[\r\n<>]/.test(name)) throw new HttpError(400, 'Use a plain sender name.');
    if (user.role !== 'owner' && (address !== user.email || replyTo !== user.email)) throw new HttpError(403, 'Your sender and reply address must match your agent email. Ask the owner to approve a different sender.');
    if (!['provider', 'email_app'].includes(body.mode) || body.approved !== true) throw new HttpError(400, 'Review the sender address and choose direct email or your email app.');
    const info = { mailbox: true, kind, mode: body.mode, replyTo, approvedBy: user.id, approvedAt: new Date(now()).toISOString() };
    const existing = body.profileId ? await db.get('agents', body.profileId) : null;
    if (body.profileId && !existing) throw new HttpError(404, 'Sender not found. Refresh your sender list.');
    if (existing) {
      if (existing.status !== 'mailbox' || (user.role !== 'owner' && String(existing.assigned_to) !== String(user.id))) throw new HttpError(404, 'Sender not found in your account.');
      if (body.expectedRevision !== (metadata(existing).revision || '')) throw new HttpError(409, 'This sender changed. Refresh before saving.');
      await patchReviewed(db, 'agents', existing, { contact_name: name, contact_email: address, assigned_to: ownerId, notes: JSON.stringify(info) });
    } else await db.create('agents', { town: `Mail sender ${secret().slice(0, 12)}`, status: 'mailbox', assigned_to: ownerId, contact_name: name, contact_email: address, notes: JSON.stringify({ ...info, revision: secret() }) });
    return { mailboxes: await mailboxes(user), connection: mailConnection(env) };
  }
  async function sender(user, id) {
    const profile = (await mailboxes(user)).find(profile => profile.id === String(id));
    if (!profile) throw new HttpError(404, 'Choose one of your available sender accounts.');
    if (profile.kind === 'agent') { const agent = await db.get('agents', profile.ownerId); if (!agent || agent.status !== 'active') throw new HttpError(409, 'This agent sender is no longer active.'); }
    if (user.role !== 'owner') { const agent = await db.get('agents', user.id); if (!agent || agent.status !== 'active') throw new HttpError(401, 'This agent access has been revoked.'); }
    return profile;
  }
  async function allowed(office, contract) {
    if (stopped(office)) throw new HttpError(409, 'Contract sending is paused for this office. Respect its do not contact or not interested status.');
    const matches = officeContacts(office).filter(person => person.email === contract.contact_email);
    if ((metadata(office).emailOptOuts || []).includes(contract.contact_email) || matches.some(person => person.preference === 'do_not_contact') || (matches.length && matches.every(person => person.archived))) throw new HttpError(409, 'This recipient is marked do not contact or is archived.');
    contractLink(env, contract, now());
  }
  async function execute(user, office, action, body) {
    const contract = await db.get('enrollments', body.enrollmentId);
    if (!contract || String(metadata(contract).leadId) !== String(office.id)) throw new HttpError(404, 'Contract not found in this office.');
    await allowed(office, contract);
    if (action === 'preview-contract-email') {
      const profile = await sender(user, body.senderId), config = mailConfig(env), link = contractLink(env, contract, now());
      const preview = { from: profile.email, fromName: profile.name, replyTo: profile.replyTo, to: singleEmail(contract.contact_email), subject: text(body.subject || `Office agreement · ${office.town}`, 180, true),
        text: `${text(body.intro || `Hello ${contract.contact_name},\n\nPlease review your Gig Tax Pros office agreement.`, 2000)}\n\nReview and sign your private agreement:\n${link}\n\n${metadata(contract).terms.title}\nSigning records your agreement. Membership activates only after the required payment is verified. Keep this link private.`, link };
      const snapshot = { officeRevision: metadata(office).revision || '', contractFingerprint: contractFingerprint(contract), sender: profile, configDigest: config.digest };
      const previewDigest = digest(JSON.stringify({ preview, snapshot }));
      const row = await db.create('events', { town: `Contract email ${secret().slice(0, 12)}`, assigned_to: String(office.id), contact_name: user.name, status: 'preview', notes: JSON.stringify({ action: 'contract_delivery', actorId: user.id, contractId: String(contract.id), at: new Date(now()).toISOString(),
        sealedPreview: seal({ preview, snapshot, exp: now() + 10 * 60000 }, env.GIGTAX_SALES_SESSION_KEY), previewDigest,
        delivery: { status: 'preview', from: profile.email, replyTo: profile.replyTo, to: preview.to, senderId: profile.id, mode: profile.mode === 'provider' ? config.mode || 'unconfigured' : 'manual', createdAt: new Date(now()).toISOString(), providerId: null } }) });
      return { ...receipt(row), preview, previewDigest, directSendingAvailable: profile.mode === 'provider' && config.ready && profile.email.split('@')[1] === config.domain, connection: mailConnection(env) };
    }
    const row = await db.get('events', body.deliveryId), info = row && metadata(row);
    if (!row || info.action !== 'contract_delivery' || String(row.assigned_to) !== String(office.id) || info.contractId !== String(contract.id)) throw new HttpError(404, 'Contract email preview not found.');
    if (action === 'resolve-contract-email') {
      if (user.role !== 'owner' || body.reviewed !== true || !['uncertain', 'sending'].includes(info.delivery.status)) throw new HttpError(403, 'Only the owner can review an uncertain provider outcome.');
      if (info.delivery.status === 'sending' && now() - Date.parse(info.delivery.attemptedAt) < 60000) throw new HttpError(409, 'The send attempt is still running. Wait before reviewing its outcome.');
      if (!['accepted', 'not_sent'].includes(body.outcome)) throw new HttpError(400, 'Record the reviewed provider outcome.');
      const evidence = text(body.evidence || '', 1200, true), providerId = body.outcome === 'accepted' ? text(body.providerId || '', 300, true) : null;
      const saved = await patchReviewed(db, 'events', row, { status: body.outcome, notes: JSON.stringify({ ...info, delivery: { ...info.delivery, status: body.outcome, providerId, resolution: { by: user.id, at: new Date(now()).toISOString(), evidence } } }) });
      const current = await db.get('enrollments', contract.id), currentInfo = metadata(current);
      if (currentInfo.deliveryReservation?.id === String(row.id)) await patchReviewed(db, 'enrollments', current, { notes: JSON.stringify({ ...currentInfo, deliveryReservation: { ...currentInfo.deliveryReservation, status: body.outcome } }) });
      return receipt(saved);
    }
    if (info.actorId !== user.id) throw new HttpError(403, 'Prepare your own email preview before sending.');
    if (info.delivery.status !== 'preview') return { ...receipt(row), duplicate: true };
    if (body.reviewed !== true || body.previewDigest !== info.previewDigest) throw new HttpError(400, 'Review the exact recipient, sender and contract message before sending.');
    const sealed = unseal(info.sealedPreview, env.GIGTAX_SALES_SESSION_KEY);
    if (!sealed || sealed.exp <= now()) throw new HttpError(409, 'The email preview expired. Prepare and review a new one.');
    const profile = await sender(user, info.delivery.senderId), config = mailConfig(env);
    if (sealed.snapshot.officeRevision !== (metadata(office).revision || '') || sealed.snapshot.contractFingerprint !== contractFingerprint(contract) || digest(JSON.stringify(profile)) !== digest(JSON.stringify(sealed.snapshot.sender)) || sealed.snapshot.configDigest !== config.digest) throw new HttpError(409, 'The office, contract, sender or email connection changed. Prepare a new preview.');
    if (action === 'record-contract-sent') {
      const evidence = text(body.evidence || '', 1200, true), sentAt = body.sentAt || new Date(now()).toISOString();
      if (!Number.isFinite(Date.parse(sentAt)) || Date.parse(sentAt) > now() + 300000) throw new HttpError(400, 'Record when you actually sent the email.');
      const saved = await patchReviewed(db, 'events', row, { status: 'manual_sent', notes: JSON.stringify({ ...info, delivery: { ...info.delivery, status: 'manual_sent', mode: 'manual', sentAt, evidence, verification: 'staff_recorded' } }) });
      return receipt(saved);
    }
    if (!config.ready || profile.mode !== 'provider') throw new HttpError(503, 'Direct sending is not connected for this sender. Open the reviewed message in your email app instead.');
    if (profile.email.split('@')[1] !== config.domain) throw new HttpError(409, 'The sender must be on the configured sending domain.');
    const reservation = metadata(contract).deliveryReservation;
    if (reservation && (['sending', 'uncertain'].includes(reservation.status) || (['accepted', 'delivered'].includes(reservation.status) && !(reservation.mode === 'test' && config.mode === 'live')))) throw new HttpError(409, 'This contract already has a send attempt. Review its delivery history before sending again.');
    await patchReviewed(db, 'enrollments', contract, { notes: JSON.stringify({ ...metadata(contract), deliveryReservation: { id: String(row.id), status: 'sending', mode: config.mode, at: new Date(now()).toISOString() } }) });
    let attempted = await patchReviewed(db, 'events', row, { status: 'sending', notes: JSON.stringify({ ...info, delivery: { ...info.delivery, status: 'sending', attemptedAt: new Date(now()).toISOString() } }) });
    let outcome = { status: 'uncertain', providerId: null };
    let providerStarted = false;
    try {
      await allowed(await db.get('offices', office.id), await db.get('enrollments', contract.id));
      if (digest(JSON.stringify(await sender(user, profile.id))) !== digest(JSON.stringify(profile))) throw new HttpError(409, 'The sender changed after review.');
      providerStarted = true; outcome = await mailSender(config, sealed.preview, String(row.id));
    } catch { if (!providerStarted) outcome = { status: 'not_sent', providerId: null }; }
    const latest = await db.get('events', row.id), latestInfo = metadata(latest);
    if (latestInfo.delivery.status === 'sending') attempted = await patchReviewed(db, 'events', latest, { status: outcome.status, notes: JSON.stringify({ ...latestInfo, delivery: { ...latestInfo.delivery, ...outcome, verification: outcome.status === 'accepted' ? 'provider_response' : 'unconfirmed' } }) });
    else attempted = latest;
    const updated = await db.get('enrollments', contract.id), updatedInfo = metadata(updated);
    if (updatedInfo.deliveryReservation?.id === String(row.id) && updatedInfo.deliveryReservation.status === 'sending') await patchReviewed(db, 'enrollments', updated, { notes: JSON.stringify({ ...updatedInfo, deliveryReservation: { ...updatedInfo.deliveryReservation, status: outcome.status } }) });
    return receipt(attempted);
  }
  return { mailboxes, saveMailbox, execute, connection: () => mailConnection(env) };
}
