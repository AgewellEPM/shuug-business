import { randomUUID } from 'node:crypto';
import { salesTeamTools } from '../../../sales/sales-team.mjs';
import { contactBook } from '../../../sales/contacts.mjs';
import { singleEmail } from '../../../sales/mail-provider.mjs';
import { HttpError, digest, seal, text, unseal, visible } from '../../../sales/model.mjs';
import { emailOutreachBlocked, officeOutreachBlocked } from '../../../sales/outreach-preferences.mjs';
import { zohoAssignment, zohoConfig, zohoId } from './zoho-account.mjs';
import { zohoMail } from './zoho-mail.mjs';

const draftId = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Open a valid draft.');
  }
  return value;
};
const singleLine = (value, max) => {
  const clean = text(value, max);
  if (/[\r\n\x00-\x1F\x7F]/.test(clean)) throw new HttpError(400, 'Use a single line for this field.');
  return clean;
};
function mailAddress(value) {
  const clean = singleEmail(value);
  const [local, domain] = clean.split('@');
  if (!/^[a-z\d.!#$%&'*+/=?^_\x60{|}~-]+$/.test(local) ||
      !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(domain)) {
    throw new HttpError(400, 'Enter one email address without a display name.');
  }
  return clean;
}
const safeAddress = value => { try { return mailAddress(value); } catch { return ''; } };

function addressList(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 1800 || /[\r\n]/.test(value)) throw new HttpError(400, 'Enter valid recipient addresses.');
  const parts = value.split(',').map(mailAddress);
  if (parts.length > 12) throw new HttpError(400, 'Use up to 12 recipients per field.');
  return [...new Set(parts)].join(', ');
}

export function repEmailWorkspace(db, sessionKey, env, { directory, transport = zohoMail() } = {}) {
  const store = db.repMail;
  const key = digest('Universal SDR rep email:' + sessionKey);
  const protect = (owner, value) => seal({ owner, value, exp: 8.64e15 }, key);
  function recover(owner, token) {
    const data = unseal(token, key);
    if (data?.owner !== owner) throw new HttpError(502, 'A saved email record could not be unlocked.');
    return data.value;
  }
  function accountFor(user) { return zohoAssignment(db, user, zohoConfig(env, directory)); }
  function summary(user) {
    let account;
    try { account = accountFor(user); }
    catch { account = { address: '', name: user.name, configured: false }; }
    const mailbox = { name: account.name, address: account.address, provider: 'zoho', providerName: 'Zoho Mail', configured: account.configured };
    return { mailbox, revision: digest(JSON.stringify(mailbox)), apiVersion: 1 };
  }
  function fileList(owner, input, old) {
    if (input === undefined) return old;
    if (!Array.isArray(input) || input.length > 8) throw new HttpError(400, 'Use up to eight attachments.');
    let total = 0;
    const chosen = input.map(file => {
      if (!file || typeof file !== 'object') throw new HttpError(400, 'Invalid attachment.');
      if (file.id) {
        const saved = old.find(item => item.id === file.id);
        if (!saved) throw new HttpError(400, 'Reopen the draft to use its attachments.');
        total += saved.size;
        return saved;
      }
      const name = singleLine(file.name, 180).replace(/[\\/]/g, '_');
      if (!name || typeof file.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new HttpError(400, 'Invalid attached file.');
      const bytes = Buffer.from(file.base64, 'base64');
      if (bytes.toString('base64') !== file.base64) throw new HttpError(400, 'Invalid file encoding.');
      total += bytes.length;
      const id = randomUUID();
      store.addFile(id, protect(owner, file.base64));
      return { id, name, size: bytes.length };
    });
    if (total > 4 * 1024 * 1024) throw new HttpError(413, 'Attachments can total up to 4 MB per draft.');
    for (const file of old) if (!chosen.some(item => item.id === file.id)) store.removeFile(file.id);
    return chosen;
  }
  function draftFor(user, id) {
    const row = store.draft(user.id, draftId(id));
    if (!row) throw new HttpError(404, 'Draft not found in your account.');
    return row;
  }
  const draftView = (user, row) => {
    const { to, cc, bcc, subject, body, from, link, reply, files } = recover(user.id, row.content);
    return { id: row.id, revision: row.revision, status: row.status === 'sending' ? 'uncertain' : row.status,
      to, cc, bcc, subject, body, from, link, files: files || [], isReply: Boolean(reply?.zohoId), updatedAt: row.updated_at };
  };
  function contactFor(user, link, to) {
    const office = db.get('offices', link.officeId);
    if (!office || !visible(user, office)) throw new HttpError(404, 'That contact is unavailable in your assignments.');
    const person = contactBook(office).contacts.find(row => row.id === link.contactId && safeAddress(row.email) === to);
    if (!person || person.archived) throw new HttpError(409, 'This saved contact changed. Open a new draft from the Rolodex.');
    if (person.suppressed || officeOutreachBlocked(office)) throw new HttpError(409, 'Email outreach is paused for this contact.');
    return office;
  }
  function saveDraft(user, body) {
    const from = summary(user).mailbox.address;
    const id = draftId(body.id);
    const old = body.revision === 0 ? null : draftFor(user, id);
    if (old && (old.status !== 'draft' || old.revision !== body.revision)) throw new HttpError(409, 'This draft changed. Reopen it from Drafts.');
    const previous = old ? recover(user.id, old.content) : {};
    const to = addressList(body.to), cc = addressList(body.cc), bcc = addressList(body.bcc);
    const subject = singleLine(body.subject ?? '', 300);
    const message = text(body.body ?? '', 100_000);
    if (Buffer.byteLength(message) > 400_000 || /\0/.test(message)) throw new HttpError(400, 'Shorten the email message before saving.');
    let link;
    if (body.link) {
      link = { officeId: text(body.link.officeId, 24, true), contactId: text(body.link.contactId, 64, true) };
      contactFor(user, link, to);
    }
    const proof = body.replyToken ? unseal(text(body.replyToken, 3200), key) : null;
    if (body.replyToken && (proof?.type !== 'reply' || proof.owner !== user.id || proof.from !== from || proof.to !== to)) {
      throw new HttpError(409, 'Reopen the original email to reply.');
    }
    const reply = proof ? proof.reply : (previous.to === to && previous.from === from && previous.reply?.zohoId ? previous.reply : undefined);
    const files = fileList(user.id, body.files, previous.files || []);
    const content = protect(user.id, { to, cc, bcc, subject, body: message, from, link, reply, files });
    return draftView(user, old
      ? store.changeDraft(user.id, id, old.revision, 'draft', 'draft', content)
      : store.createDraft(user.id, id, content));
  }
  async function send(user, body) {
    const row = draftFor(user, body.id);
    if (row.status === 'accepted') return { status: 'accepted' };
    if (row.status === 'sending' || row.status === 'uncertain') return { status: 'uncertain' };
    if (body.revision !== row.revision) throw new HttpError(409, 'This draft changed. Review the latest draft before sending.');
    const account = accountFor(user);
    const draft = recover(user.id, row.content);
    if (!draft.to || !draft.subject || !draft.body) throw new HttpError(400, 'Complete the recipient, subject and message.');
    if (!account.configured) throw new HttpError(503, 'The workspace is awaiting Zoho Mail authorization. Your draft is saved.');
    if (draft.from !== account.address) throw new HttpError(409, 'Reopen and save this draft to confirm your business sender address.');
    const recipients = [draft.to, draft.cc, draft.bcc].filter(Boolean).flatMap(field => field.split(',').map(mailAddress));
    function checkRecipients() {
      if (draft.link) contactFor(user, draft.link, draft.to);
      const offices = db.list('offices');
      if (recipients.some(address => emailOutreachBlocked(db, address, offices))) throw new HttpError(409, 'Email outreach is paused for this recipient.');
    }
    checkRecipients();
    const files = (draft.files || []).map(file => ({ name: file.name, base64: recover(user.id, store.file(file.id)) }));
    const dispatchMail = await transport.prepare(account, draft, files);
    const attempt = store.transaction(() => {
      checkRecipients();
      // A slow upload must not outlive the rep's access or an owner changing the assignment.
      if (user.role === 'agent') {
        const roster = salesTeamTools(db, undefined, { id: 'owner', role: 'owner' });
        if (!roster.rosterUser(db.get('agents', user.id))) throw new HttpError(403, 'Sales access has changed.');
      }
      if (accountFor(user).address !== account.address) throw new HttpError(409, 'The mailbox assignment changed.');
      return store.changeDraft(user.id, row.id, row.revision, 'draft', 'sending', row.content);
    });
    let receipt;
    try { receipt = await dispatchMail(); }
    catch (error) {
      const rejected = error instanceof HttpError && error.status === 422;
      const saved = store.changeDraft(user.id, row.id, attempt.revision, 'sending', rejected ? 'draft' : 'uncertain', row.content);
      return { status: rejected ? 'rejected' : 'uncertain', revision: saved.revision };
    }
    const date = new Date().toISOString();
    store.changeDraft(user.id, row.id, attempt.revision, 'sending', 'accepted', protect(user.id, { date, messageId: zohoId(receipt?.messageId) }), () => {
      for (const file of draft.files || []) store.removeFile(file.id);
      const office = draft.link && db.get('offices', draft.link.officeId);
      if (!office || !visible(user, office)) return;
      db.create('events', { town: 'email ' + row.id, assigned_to: String(office.id), contact_name: user.name, status: 'recorded',
        notes: JSON.stringify({ action: 'email', actorId: user.id, at: date, detail: 'Zoho Mail accepted the email.' }) });
    });
    return { status: 'accepted' };
  }
  function folderFor(value) {
    if (!['inbox', 'sent', 'drafts', 'trash'].includes(value)) throw new HttpError(400, 'Choose a mailbox folder.');
    return value;
  }
  const actions = new Set(['rep-email-list', 'rep-email-read', 'rep-email-download', 'rep-email-change',
    'rep-email-drafts', 'rep-email-save', 'rep-email-discard', 'rep-email-send', 'rep-email-settings']);
  async function dispatch(user, action, body = {}) {
    switch (action) {
      case 'rep-email-settings': return summary(user);
      case 'rep-email-drafts': return { drafts: store.drafts(user.id).map(row => draftView(user, row)) };
      case 'rep-email-save': return { draft: store.transaction(() => saveDraft(user, body)) };
      case 'rep-email-discard': return store.transaction(() => {
        const draft = draftFor(user, body.id);
        store.discardDraft(user.id, draft.id, Number.isInteger(body.revision) ? body.revision : 0);
        for (const file of recover(user.id, draft.content).files || []) store.removeFile(file.id);
        return { discarded: true };
      });
      case 'rep-email-send': return send(user, body);
      case 'rep-email-list': return transport.list(accountFor(user), { folder: folderFor(body.folder), query: singleLine(body.query || '', 160),
        contact: body.contact ? mailAddress(body.contact) : '', cursor: body.cursor });
      case 'rep-email-download':
      case 'rep-email-change':
      case 'rep-email-read': {
        const account = accountFor(user), folder = folderFor(body.folder), id = zohoId(body.id);
        if (!id) throw new HttpError(400, 'Choose a message from your mailbox.');
        if (action === 'rep-email-change') return transport.change(account, { folder, id, operation: body.operation });
        if (action === 'rep-email-download') {
          if (!Number.isInteger(body.index) || body.index < 0) throw new HttpError(400, 'Choose an attachment from this message.');
          return transport.download(account, { folder, id, index: body.index });
        }
        const { replyTo, ...message } = await transport.read(account, { folder, id });
        const to = folder === 'inbox' || folder === 'trash' ? safeAddress(replyTo) : '';
        if (!to) return { message };
        const replyToken = seal({ type: 'reply', owner: user.id, from: account.address, to, reply: { zohoId: id }, exp: Date.now() + 7200000 }, key);
        const subject = (/^re:/i.test(message.subject) ? message.subject : 'Re: ' + message.subject).replace(/[\r\n\x00-\x1F\x7F]/g, ' ').slice(0, 300);
        return { message, reply: { to, subject, replyToken } };
      }
      default: throw new HttpError(404, 'Email action unavailable.');
    }
  }
  function bookingSender(user) {
    if (!user) return null;
    const { mailbox, revision } = summary(user);
    return mailbox.configured ? { from: mailbox.address, fromName: mailbox.name, replyTo: mailbox.address, revision, mode: 'zoho' } : null;
  }
  async function sendBooking(user, revision, message) {
    if (!user || bookingSender(user)?.revision !== revision) return 'setup-changed';
    const files = message.icalEvent ? [{ name: message.icalEvent.filename, base64: Buffer.from(message.icalEvent.content).toString('base64') }] : [];
    const deliver = await transport.prepare(accountFor(user), message, files);
    if (bookingSender(user)?.revision !== revision) return 'setup-changed';
    try { await deliver(); return 'accepted'; }
    catch (error) {
      if (error instanceof HttpError && error.status === 422) return 'failed';
      throw error;
    }
  }
  return { actions, dispatch, summary, bookingSender, sendBooking };
}
