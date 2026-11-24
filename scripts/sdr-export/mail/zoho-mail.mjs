import { HttpError } from '../../../sales/model.mjs';
import { zohoId, zohoSession } from './zoho-account.mjs';

const pageSize = 25;
const folderNames = { inbox: 'Inbox', sent: 'Sent', trash: 'Trash', drafts: 'Drafts' };
const entity = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text) {
  return String(text || '').replace(/&(amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[\da-f]{1,6});/gi, (match, name) => {
    if (entity[name.toLowerCase()]) return entity[name.toLowerCase()];
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}
function plain(value) {
  const raw = String(value || '');
  if (!/<(?:[a-z][\w-]*\b[^>]*|\/\w+)>/i.test(raw)) return decode(raw);
  // Render as text only. Remote images, styles and scripts never enter the page.
  return decode(raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:br\b[^>]*|\/(?:div|p|tr|li|h[1-6]))>/gi, '\n')
    .replace(/<[^>]*>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}
function people(value) {
  const found = [];
  for (const match of decode(value).matchAll(/[a-z\d.!#$%&'*+\-/=?^_`{|}~]+@(?:[a-z\d-]+\.)+[a-z\d-]+/gi)) {
    const address = match[0].toLowerCase();
    if (!found.some(person => person.address === address)) found.push({ address, name: '' });
  }
  return found;
}
function message(row) {
  const id = zohoId(row.messageId);
  if (!id) throw new HttpError(502, 'Zoho Mail returned an invalid message identifier.');
  const from = people(row.fromAddress);
  if (from.length && row.sender) from[0].name = decode(row.sender);
  const stamp = Number(row.receivedTime || row.sentDateInGMT || row.senttime);
  return { id, from, to: people(row.toAddress || row.to), cc: people(row.ccAddress), subject: decode(row.subject) || '(No subject)',
    unread: ['0', 'unread'].includes(String(row.status)), date: stamp && Number.isFinite(new Date(stamp).getTime()) ? new Date(stamp).toISOString() : '' };
}
function canonicalFolder(folders, name) {
  const display = folderNames[name];
  const row = display && folders.find(item => item.folderType === display && (item.path === '/' + display || item.folderName === display));
  if (!zohoId(row?.folderId)) throw new HttpError(404, 'This mail folder is unavailable.');
  return String(row.folderId);
}
const ref = value => {
  const id = zohoId(value);
  if (!id) throw new HttpError(400, 'Choose a valid message.');
  return id;
};
function fileInfo(data) {
  return (data.attachments || []).map(file => ({
    id: ref(file.attachmentId), name: String(file.attachmentName || 'Attachment').replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180), size: Number(file.attachmentSize) || 0,
  }));
}
export function zohoMail(fetcher = fetch) {
  const session = zohoSession(fetcher);
  async function context(account, folder) {
    const api = await session.open(account);
    const folders = await api('folders');
    if (!Array.isArray(folders)) throw new HttpError(502, 'Zoho Mail could not list your folders.');
    return { api, folderId: canonicalFolder(folders, folder), folders };
  }
  function base(folderId, id) { return 'folders/' + folderId + '/messages/' + ref(id); }
  async function checked(api, folderId, id) {
    const row = await api(base(folderId, id) + '/details');
    if (String(row.folderId) !== folderId || String(row.messageId) !== id) throw new HttpError(404, 'Message unavailable in this folder.');
    return row;
  }
  const update = (api, id, mode, extra = {}) => api('updatemessage', { method: 'PUT',
    json: { mode, messageId: [JSON.rawJSON(ref(id))], ...extra } });
  return {
    async list(account, { folder, query, contact, cursor }) {
      const { api, folderId } = await context(account, folder);
      const start = cursor ? Number(cursor) : 1;
      if (!Number.isSafeInteger(start) || start < 1 || start > 1_000_000) throw new HttpError(400, 'Reopen the mailbox folder.');
      const params = new URLSearchParams({ start: String(start), limit: String(pageSize + 1), includeto: 'true' });
      let path = 'messages/view';
      if (query || contact) {
        path = 'messages/search';
        const term = String(query).replace(/[:\"\\]/g, ' ').trim();
        if (query && !term) return { messages: [], next: '' };
        const filter = contact ? (folder === 'sent' || folder === 'drafts' ? 'to:' : 'sender:') + contact : 'entire:"' + term + '"';
        params.set('searchKey', 'in:' + folderNames[folder] + '::' + filter);
      } else { params.set('folderId', folderId); params.set('threadedMails', 'false'); }
      const rows = await api(path + '?' + params);
      if (!Array.isArray(rows)) throw new HttpError(502, 'Zoho Mail could not list your messages.');
      const items = rows.slice(0, pageSize).filter(row => String(row.folderId) === folderId).map(message);
      return { messages: contact ? items.filter(row => [...row.from, ...row.to, ...row.cc].some(p => p.address === contact)) : items,
        next: rows.length > pageSize ? String(start + pageSize) : '' };
    },
    async read(account, { folder, id }) {
      const { api, folderId } = await context(account, folder), path = base(folderId, id);
      const row = await checked(api, folderId, id);
      const view = message(row);
      const [body, headers, attachments] = await Promise.all([
        api(path + '/content?includeBlockContent=true'), api(path + '/header'),
        String(row.hasAttachment) === '1' || row.hasAttachment === true ? api(path + '/attachmentinfo').then(fileInfo) : [],
      ]);
      const unfolded = String(headers.headerContent || '').replace(/\r?\n[ \t]+/g, ' ');
      const replyAddress = people(/^Reply-To:\s*(.+)$/im.exec(unfolded)?.[1] || '')[0]?.address || view.from[0]?.address;
      if (view.unread) await update(api, id, 'markAsRead');
      return { ...view, unread: false, body: [plain(body.content), plain(body.blockContent)].filter(Boolean).join('\n\n'),
        attachments: attachments.map(({ name, size }) => ({ name, size })), replyTo: replyAddress };
    },
    async download(account, { folder, id, index }) {
      const { api, folderId } = await context(account, folder), path = base(folderId, id);
      await checked(api, folderId, id);
      const file = fileInfo(await api(path + '/attachmentinfo'))[index];
      if (!file) throw new HttpError(404, 'Attachment unavailable.');
      if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'This attachment is larger than 5 MB.');
      const blob = await api(path + '/attachments/' + file.id, { binary: true });
      return { name: file.name, base64: blob.toString('base64') };
    },
    async change(account, { folder, id, operation }) {
      const { api, folderId, folders } = await context(account, folder);
      await checked(api, folderId, id);
      if (operation === 'read' || operation === 'unread') await update(api, id, operation === 'read' ? 'markAsRead' : 'markAsUnread');
      else if (operation === 'trash' || operation === 'restore') {
        const target = canonicalFolder(folders, operation === 'trash' ? 'trash' : 'inbox');
        await update(api, id, 'moveMessage', { destfolderId: JSON.rawJSON(target), isFolderSpecific: true, folderId: JSON.rawJSON(folderId) });
      } else throw new HttpError(400, 'Choose a mailbox action.');
      return { changed: true };
    },
    // Resolve identity and upload files before reserving dispatch. These calls cannot send mail.
    async prepare(account, draft, files) {
      const api = await session.open(account);
      const attachments = [];
      for (const file of files) {
        const uploaded = await api('messages/attachments?' + new URLSearchParams({ fileName: file.name, isInline: 'false' }),
          { method: 'POST', bytes: Buffer.from(file.base64, 'base64') });
        const item = Array.isArray(uploaded) ? uploaded[0] : uploaded;
        if (!item?.storeName || !item.attachmentName || !item.attachmentPath) throw new HttpError(502, 'Zoho Mail could not attach this file.');
        attachments.push({ storeName: String(item.storeName), attachmentName: item.attachmentName, attachmentPath: item.attachmentPath });
      }
      return () => api(draft.reply?.zohoId ? 'messages/' + ref(draft.reply.zohoId) : 'messages', { method: 'POST', sending: true,
        json: { fromAddress: account.address, toAddress: draft.to, ccAddress: draft.cc || undefined, bccAddress: draft.bcc || undefined,
          subject: draft.subject, content: draft.body, replyTo: draft.replyTo || undefined, encoding: 'UTF-8', mailFormat: 'plaintext',
          ...(draft.reply?.zohoId ? { action: 'reply' } : {}), ...(attachments.length ? { attachments } : {}) } });
    },
  };
}
