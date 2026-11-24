import { HttpError } from '../../../sales/model.mjs';

const MAX_SOURCE = 6 * 1024 * 1024;
const MAX_HTML = 512 * 1024;
const MAX_TEXT = 90_000;
const PAGE = 25;
const TLS = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
const hostName = value => typeof value === 'string' && /^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])$/i.test(value);

export function mailProviders(env) {
  const providers = {
    gmail: { name: 'Gmail / Google Workspace', imap: 'imap.gmail.com', smtp: 'smtp.gmail.com', port: 465, savesSent: true },
    icloud: { name: 'iCloud Mail', imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', port: 587, startTLS: true },
    fastmail: { name: 'Fastmail', imap: 'imap.fastmail.com', smtp: 'smtp.fastmail.com', port: 465 },
  };
  if (env.SDR_MAIL_IMAP_HOST || env.SDR_MAIL_SMTP_HOST) {
    const imap = env.SDR_MAIL_IMAP_HOST, smtp = env.SDR_MAIL_SMTP_HOST;
    const port = Number(env.SDR_MAIL_SMTP_PORT || 465), imapPort = Number(env.SDR_MAIL_IMAP_PORT || 993);
    const usablePort = value => Number.isInteger(value) && value > 0 && value <= 65535;
    if (!hostName(imap) || !hostName(smtp) || !usablePort(port) || !usablePort(imapPort)) {
      throw new Error('Set both SDR mail server hosts and valid TLS ports.');
    }
    providers.custom = { name: 'Workspace mail provider', imap, imapPort, smtp, port, startTLS: port === 587, savesSent: env.SDR_MAIL_SMTP_SAVES_SENT === '1' };
  }
  return providers;
}

let dependencies;
function libraries() {
  dependencies ??= Promise.all([import('imapflow'), import('nodemailer'), import('mailparser'), import('html-to-text')]).catch(() => {
    throw new HttpError(503, 'Mailbox support needs the Universal SDR mail dependencies installed.');
  });
  return dependencies;
}

async function withImap(account, provider, task) {
  const [{ ImapFlow }] = await libraries();
  const client = new ImapFlow({
    host: provider.imap, port: provider.imapPort || 993, secure: true, tls: TLS,
    auth: { user: account.address, pass: account.password },
    logger: false, disableAutoIdle: true, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    return await task(client);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not read your mailbox. Check the connection and app password in Senders.');
  } finally { client.close(); }
}

const smtpOptions = (account, provider) => ({
  host: provider.smtp, port: provider.port, secure: !provider.startTLS, requireTLS: Boolean(provider.startTLS), tls: TLS,
  auth: { user: account.address, pass: account.password },
  logger: false, debug: false, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 16_000,
  disableFileAccess: true, disableUrlAccess: true,
});

async function sentFolder(client) {
  const folders = await client.list({ listOnly: true });
  const usable = folders.filter(row => !row.flags?.has('\\Noselect'));
  return usable.find(row => row.specialUse === '\\Sent')?.path ||
    usable.find(row => /^(sent|sent mail|sent items)$/i.test(row.path))?.path;
}

async function inFolder(account, provider, folder, readOnly, task) {
  return withImap(account, provider, async client => {
    const path = folder === 'inbox' ? 'INBOX' : await sentFolder(client);
    if (!path) throw new HttpError(409, 'Your mail provider did not report a Sent folder.');
    const lock = await client.getMailboxLock(path, { readOnly });
    try { return await task(client, String(client.mailbox.uidValidity)); }
    finally { lock.release(); }
  });
}

const party = item => ({ name: String(item.name || '').slice(0, 180), address: String(item.address || '').slice(0, 240) });
const parties = value => (value || []).filter(item => item.address).slice(0, 16).map(party);
function message(item, validity) {
  const { envelope = {} } = item;
  return {
    id: validity + ':' + item.uid, subject: (envelope.subject || '(No subject)').slice(0, 300),
    from: parties(envelope.from), to: parties(envelope.to),
    date: Number.isFinite(Number(envelope.date)) ? envelope.date?.toISOString() : item.internalDate?.toISOString(),
    unread: !item.flags?.has('\\Seen'),
  };
}
async function parseMessage(client, uid) {
  const raw = await client.fetchOne(uid, { source: { start: 0, maxLength: MAX_SOURCE } }, { uid: true });
  if (!raw?.source) throw new HttpError(404, 'This message is no longer in the folder.');
  const [, , { simpleParser }] = await libraries();
  return simpleParser(raw.source, { skipImageLinks: true, skipTextToHtml: true, skipHtmlToText: true });
}
function attachmentName(file) {
  return String(file.filename || 'Attachment').replace(/[\\/\x00-\x1F\x7F]/g, '_').slice(0, 180);
}

export const mailTransport = {
  async verify(account, provider) {
    return inFolder(account, provider, 'inbox', true, async () => {
      const [, { default: nodemailer }] = await libraries();
      const smtp = nodemailer.createTransport(smtpOptions(account, provider));
      try { await smtp.verify(); }
      catch { throw new HttpError(502, 'The outgoing mail server could not verify this account. Check the provider and app password.'); }
      finally { smtp.close(); }
    });
  },
  async list(account, provider, { folder, query, contact, cursor }) {
    return inFolder(account, provider, folder, true, async (client, validity) => {
      if (cursor && cursor.validity !== validity) throw new HttpError(409, 'The mailbox changed. Refresh to start at the newest message.');
      const criteria = contact ? { or: [{ from: contact }, { to: contact }] } :
        query ? { or: [{ from: query }, { to: query }, { subject: query }] } : { all: true };
      if (cursor) criteria.uid = '1:' + (cursor.uid - 1);
      const matches = await client.search(criteria, { uid: true });
      if (!Array.isArray(matches)) throw new HttpError(502, 'The mailbox could not finish this search. Try again.');
      const page = matches.slice(-PAGE);
      const rows = page.length ? await client.fetchAll(page, { envelope: true, flags: true, internalDate: true }, { uid: true }) : [];
      const ordered = rows.sort((a, b) => b.uid - a.uid).map(row => message(row, validity));
      return { messages: contact ? ordered.filter(row => [...row.from, ...row.to].some(person => person.address.toLowerCase() === contact)) : ordered,
        next: matches.length > PAGE ? validity + ':' + page[0] : '' };
    });
  },
  async read(account, provider, { folder, id }) {
    return inFolder(account, provider, folder, false, async (client, validity) => {
      if (validity !== id.validity) throw new HttpError(409, 'The mailbox changed. Reopen this message from the folder.');
      const item = await client.fetchOne(id.uid, { envelope: true, flags: true, internalDate: true, size: true }, { uid: true });
      if (!item) throw new HttpError(404, 'This message is no longer in the folder.');
      const view = message(item, validity);
      const parsed = item.size <= MAX_SOURCE ? await parseMessage(client, id.uid) : null;
      if (view.unread && await client.messageFlagsAdd(id.uid, ['\\Seen'], { uid: true })) view.unread = false;
      let body = parsed?.text?.trim() || '';
      let limited = !parsed;
      if (!body && parsed?.html) {
        const [, , , { convert }] = await libraries();
        body = convert(parsed.html.slice(0, MAX_HTML), {
          wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }],
          limits: { maxDepth: 80, maxChildNodes: 4096 },
        });
        limited = parsed.html.length > MAX_HTML;
      }
      return { ...view, body: body.slice(0, MAX_TEXT), limited: limited || body.length > MAX_TEXT,
        attachments: (parsed?.attachments || []).slice(0, 30).map(file => ({ name: attachmentName(file), size: file.size })),
        replyTo: parties(item.envelope?.replyTo)[0]?.address || view.from[0]?.address || '',
        messageId: item.envelope?.messageId, references: parsed?.references };
    });
  },
  async download(account, provider, { folder, id, index }) {
    return inFolder(account, provider, folder, true, async (client, validity) => {
      if (validity !== id.validity) throw new HttpError(409, 'The mailbox changed. Reopen this message from the folder.');
      const item = await client.fetchOne(id.uid, { size: true }, { uid: true });
      if (!item) throw new HttpError(404, 'This message is no longer in the folder.');
      if (item.size > MAX_SOURCE) throw new HttpError(413, 'Open your provider’s webmail to download files from this large message.');
      const parsed = await parseMessage(client, id.uid);
      const file = parsed.attachments[index];
      if (!file) throw new HttpError(404, 'Attachment not found in this message.');
      return { name: attachmentName(file), base64: file.content.toString('base64') };
    });
  },
  async send(account, provider, draft) {
    const [, { default: nodemailer }] = await libraries();
    const smtp = nodemailer.createTransport(smtpOptions(account, provider));
    const mime = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
    let raw, result;
    try {
      ({ message: raw } = await mime.sendMail({
        from: { name: account.name, address: account.address }, to: draft.to, subject: draft.subject,
        text: draft.body, messageId: draft.messageId, date: new Date(draft.date),
        inReplyTo: draft.reply?.messageId || undefined, references: draft.reply?.references,
      }));
      result = await smtp.sendMail({ envelope: { from: account.address, to: [draft.to] }, raw });
    } catch (error) {
      const refused = error.responseCode >= 400 && error.responseCode <= 599;
      throw new HttpError(refused ? 422 : 502, refused
        ? 'Your provider rejected the email. The draft is still available.'
        : 'The provider did not confirm submission. Check Sent before trying again.');
    } finally { smtp.close(); mime.close(); }
    if (!result.accepted?.length) throw new HttpError(422, 'Your provider did not accept the recipient. The draft is still available.');
    return { async saveCopy() {
      if (provider.savesSent) return true;
      return withImap(account, provider, async client => {
        const path = await sentFolder(client);
        if (!path) return false;
        const lock = await client.getMailboxLock(path, { readOnly: true });
        let existing;
        try { existing = await client.search({ header: { 'message-id': draft.messageId } }, { uid: true }); }
        finally { lock.release(); }
        return Boolean(existing?.length || await client.append(path, raw, ['\\Seen']));
      }).catch(() => false);
    } };
  },
};
