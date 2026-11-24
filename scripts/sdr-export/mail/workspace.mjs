import { contactBook } from '../../../sales/contacts.mjs';
import { singleEmail } from '../../../sales/mail-provider.mjs';
import { HttpError, digest, secret, seal, text, unseal, visible } from '../../../sales/model.mjs';
import { emailOutreachBlocked, officeOutreachBlocked } from '../../../sales/outreach-preferences.mjs';
import { mailProviders, mailTransport } from './transport.mjs';

const draftId = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Open a valid draft.');
  }
  return value;
};
function messageKey(value) {
  const match = typeof value === 'string' && /^(\d{1,20}):([1-9]\d{0,9})$/.exec(value);
  if (!match || Number(match[2]) > 4294967295) throw new HttpError(400, 'Choose a message from your mailbox.');
  return { validity: match[1], uid: Number(match[2]) };
}
const singleLine = (value, max) => {
  const clean = text(value, max);
  if (/[\r\n\x00-\x1F\x7F]/.test(clean)) throw new HttpError(400, 'Use a single line for this field.');
  return clean;
};
const messageId = value => typeof value === 'string' && /^<[^<>\s\x00-\x1F\x7F]{1,240}>$/.test(value) ? value : '';
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

export function repEmailWorkspace(db, sessionKey, env, transport = mailTransport) {
  const providers = mailProviders(env), store = db.repMail;
  const key = digest('Universal SDR rep email:' + sessionKey);
  const connectionsInProgress = new Set();
  const protect = (owner, value) => seal({ owner, value, exp: 8.64e15 }, key);
  function recover(owner, token) {
    const data = unseal(token, key);
    if (data?.owner !== owner) throw new HttpError(502, 'A saved email record could not be unlocked.');
    return data.value;
  }
  function accountFor(user) {
    const row = store.account(user.id);
    if (!row || (user.role !== 'owner' && row.address !== user.email)) return null;
    const data = recover(user.id, row.credential);
    return { ...data, address: row.address, revision: row.revision };
  }
  function summary(user) {
    const account = accountFor(user);
    return {
      providers: Object.entries(providers).map(([id, provider]) => ({ id, name: provider.name })),
      mailbox: account ? { address: account.address, name: account.name, provider: account.provider,
        providerName: providers[account.provider]?.name || 'Workspace mail provider' } : null,
      revision: store.account(user.id)?.revision || '',
    };
  }
  const connected = user => {
    const account = accountFor(user);
    if (!account || !Object.hasOwn(providers, account.provider)) throw new HttpError(409, 'Connect your business mailbox in Senders.');
    return account;
  };
  async function connect(user, body) {
    if (!Object.hasOwn(providers, body.provider)) throw new HttpError(400, 'Choose a supported mailbox provider.');
    const address = mailAddress(body.address);
    if (user.role !== 'owner' && address !== user.email) throw new HttpError(403, 'Connect the business email you use to sign in to the sales workspace.');
    const name = singleLine(body.name, 140);
    let password = text(body.password, 256, true);
    if (body.provider === 'gmail') password = password.replace(/\s/g, '');
    if (password.length < 8 || /[\r\n\0]/.test(password) || !name) throw new HttpError(400, 'Enter your sender name and a valid app password.');
    const expected = text(body.revision ?? '', 50);
    if ((store.account(user.id)?.revision || '') !== expected || connectionsInProgress.has(user.id)) {
      throw new HttpError(409, 'Your mailbox settings changed or are being verified. Reopen Senders.');
    }
    connectionsInProgress.add(user.id);
    try {
      await transport.verify({ address, password }, providers[body.provider]);
      store.saveAccount(user.id, address, secret(), expected, protect(user.id, { provider: body.provider, name, password }));
      return summary(user);
    } finally { connectionsInProgress.delete(user.id); }
  }
  function draftFor(user, id) {
    const row = store.draft(user.id, draftId(id));
    if (!row) throw new HttpError(404, 'Draft not found in your account.');
    return row;
  }
  const draftView = (user, row) => {
    const { to, subject, body, from, link, reply } = recover(user.id, row.content);
    return { id: row.id, revision: row.revision, status: row.status === 'sending' ? 'uncertain' : row.status,
      to, subject, body, from, link, isReply: Boolean(reply), updatedAt: row.updated_at };
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
    const from = accountFor(user)?.address || '';
    const id = draftId(body.id);
    const old = body.revision === 0 ? null : draftFor(user, id);
    if (old && (old.status !== 'draft' || old.revision !== body.revision)) throw new HttpError(409, 'This draft changed. Reopen it from Drafts.');
    const previous = old ? recover(user.id, old.content) : {};
    const to = body.to ? mailAddress(body.to) : '';
    const subject = singleLine(body.subject ?? '', 300);
    const message = text(body.body ?? '', 7500);
    if (Buffer.byteLength(message) > 10_000 || /\0/.test(message)) throw new HttpError(400, 'Shorten the email message before saving.');
    let link;
    if (body.link) {
      link = { officeId: text(body.link.officeId, 24, true), contactId: text(body.link.contactId, 64, true) };
      contactFor(user, link, to);
    }
    const proof = body.replyToken ? unseal(text(body.replyToken, 3200), key) : null;
    if (body.replyToken && (proof?.type !== 'reply' || proof.owner !== user.id || proof.from !== from || proof.to !== to)) {
      throw new HttpError(409, 'Reopen the original email to reply.');
    }
    const reply = proof ? proof.reply : (previous.to === to && previous.from === from ? previous.reply : undefined);
    if (previous.reply && previous.from !== from) throw new HttpError(409, 'Reconnect the original mailbox before editing this reply.');
    const content = protect(user.id, { to, subject, body: message, from, link, reply });
    return draftView(user, old
      ? store.changeDraft(user.id, id, old.revision, 'draft', 'draft', content)
      : store.createDraft(user.id, id, content));
  }
  async function send(user, body) {
    const row = draftFor(user, body.id);
    if (row.status === 'accepted') return { status: 'accepted' };
    if (row.status === 'sending' || row.status === 'uncertain') return { status: 'uncertain' };
    if (body.revision !== row.revision) throw new HttpError(409, 'This draft changed. Review the latest draft before sending.');
    const account = connected(user);
    const draft = recover(user.id, row.content);
    if (!draft.to || !draft.subject || !draft.body) throw new HttpError(400, 'Complete the recipient, subject and message.');
    if (draft.from && draft.from !== account.address) throw new HttpError(409, 'Reopen and review this draft from your connected mailbox.');
    if (draft.link) contactFor(user, draft.link, draft.to);
    if (emailOutreachBlocked(db, draft.to, db.list('offices'))) throw new HttpError(409, 'Email outreach is paused for this recipient.');
    const date = new Date().toISOString();
    const messageId = '<' + row.id + '@' + account.address.split('@')[1] + '>';
    const attempt = store.changeDraft(user.id, row.id, row.revision, 'draft', 'sending', row.content);
    let result;
    try { result = await transport.send(account, providers[account.provider], { ...draft, date, messageId }); }
    catch (error) {
      const rejected = error instanceof HttpError && error.status === 422;
      const status = rejected ? 'draft' : 'uncertain';
      const saved = store.changeDraft(user.id, row.id, attempt.revision, 'sending', status, row.content);
      return { status: rejected ? 'rejected' : 'uncertain', revision: saved.revision };
    }
    store.changeDraft(user.id, row.id, attempt.revision, 'sending', 'accepted', protect(user.id, { messageId, date }), () => {
      const office = draft.link && db.get('offices', draft.link.officeId);
      if (!office || !visible(user, office)) return;
      db.create('events', { town: 'email ' + row.id, assigned_to: String(office.id), contact_name: user.name, status: 'recorded',
        notes: JSON.stringify({ action: 'email', actorId: user.id, at: date, detail: 'Email accepted by the rep’s mail provider.' }) });
    });
    return { status: 'accepted', copySaved: await result.saveCopy() };
  }
  function folderFor(value) {
    if (!['inbox', 'sent'].includes(value)) throw new HttpError(400, 'Choose Inbox or Sent.');
    return value;
  }
  const actions = new Set(['rep-email-connect', 'rep-email-disconnect', 'rep-email-list', 'rep-email-read', 'rep-email-download',
    'rep-email-drafts', 'rep-email-save', 'rep-email-discard', 'rep-email-send', 'rep-email-settings']);
  async function dispatch(user, action, body) {
    switch (action) {
      case 'rep-email-settings': return summary(user);
      case 'rep-email-connect': return connect(user, body);
      case 'rep-email-disconnect':
        store.disconnect(user.id, text(body.revision, 50, true));
        return summary(user);
      case 'rep-email-drafts': return { drafts: store.drafts(user.id).map(row => draftView(user, row)) };
      case 'rep-email-save': return { draft: saveDraft(user, body) };
      case 'rep-email-discard':
        store.discardDraft(user.id, draftId(body.id), Number.isInteger(body.revision) ? body.revision : 0);
        return { discarded: true };
      case 'rep-email-send': return send(user, body);
      case 'rep-email-list': {
        const account = connected(user), folder = folderFor(body.folder);
        const query = singleLine(body.query || '', 160), contact = body.contact ? mailAddress(body.contact) : '';
        const cursor = body.cursor ? messageKey(body.cursor) : null;
        if (cursor?.uid === 1) return { messages: [], next: '' };
        return transport.list(account, providers[account.provider], { folder, query, contact, cursor });
      }
      case 'rep-email-download': {
        const account = connected(user), folder = folderFor(body.folder), id = messageKey(body.id);
        if (!Number.isInteger(body.index) || body.index < 0 || body.index >= 30) throw new HttpError(400, 'Choose an attachment from this message.');
        return transport.download(account, providers[account.provider], { folder, id, index: body.index });
      }
      case 'rep-email-read': {
        const account = connected(user), folder = folderFor(body.folder), id = messageKey(body.id);
        const { replyTo, messageId: original, references, ...message } = await transport.read(account, providers[account.provider], { folder, id });
        const to = folder === 'inbox' ? safeAddress(replyTo) : '';
        if (!to) return { message };
        const parent = messageId(original), refs = Array.isArray(references) ? references : String(references || '').split(/\s+/);
        const reply = { messageId: parent, references: [...new Set([...refs.map(messageId).filter(Boolean).slice(-6), parent].filter(Boolean))] };
        const replyToken = seal({ type: 'reply', owner: user.id, from: account.address, to, reply, exp: Date.now() + 2 * 3600000 }, key);
        const subject = (/^re:/i.test(message.subject) ? message.subject : 'Re: ' + message.subject).replace(/[\r\n\x00-\x1F\x7F]/g, ' ').slice(0, 300);
        return { message, reply: { to, subject, replyToken } };
      }
      default: throw new HttpError(404, 'Email action unavailable.');
    }
  }
  function bookingSender(user) {
    const account = accountFor(user);
    return account && Object.hasOwn(providers, account.provider)
      ? { from: account.address, fromName: account.name, replyTo: account.address, revision: account.revision, mode: 'smtp' } : null;
  }
  async function sendBooking(user, revision, message) {
    const account = connected(user);
    if (account.revision !== revision) return 'setup-changed';
    try {
      const receipt = await transport.send(account, providers[account.provider], message);
      await receipt.saveCopy();
      return 'accepted';
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) return 'failed';
      throw error;
    }
  }
  return { actions, dispatch, summary, bookingSender, sendBooking };
}
