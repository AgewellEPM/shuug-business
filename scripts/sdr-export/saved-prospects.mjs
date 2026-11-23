import { HttpError, metadata, secret, text } from '../../sales/model.mjs';
import { patchReviewed } from '../../sales/atomic.mjs';

function profileURL(value) {
  const raw = text(value, 1200, true);
  const invalid = () => new HttpError(400, 'Paste the LinkedIn profile or company URL.');
  let url, slug;
  try {
    url = new URL(raw);
    const match = url.pathname.match(/^\/(in|company)\/([^/]+)(?:\/|$)/);
    if (!match) throw invalid();
    slug = decodeURIComponent(match[2]);
    if (url.protocol !== 'https:' || !/^(?:www\.|[a-z]{2}\.)?linkedin\.com$/.test(url.hostname) ||
        url.username || url.password || url.port || !/^[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]{0,179}$/u.test(slug)) throw invalid();
    const type = match[1] === 'in' ? 'person' : 'company';
    const path = `${match[1]}/${encodeURIComponent(slug)}`;
    return { sourceURL: 'https://www.linkedin.com/' + path, sourceKey: `${match[1]}/${encodeURIComponent(slug.normalize('NFC').toLowerCase())}`, type };
  } catch {
    throw invalid();
  }
}

const searchable = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const details = body => ({
  name: text(body.name, 140, true),
  title: text(body.title || '', 160),
  company: text(body.company || '', 180),
  locality: text(body.locality || '', 140),
});
const visible = (user, record) => user.role === 'owner' || record.assigned_to === String(user.id);
function view(record) {
  const info = metadata(record);
  return { id: String(record.id), type: record.type, name: record.name, title: record.title,
    company: record.company, locality: record.locality, sourceURL: record.sourceURL, archived: record.archived,
    note: info.note, revision: info.revision };
}

export function savedProspects(db) {
  return async (user, action, body) => {
    if (action === 'list-prospects') {
      const terms = searchable(text(body.query || '', 140)).split(/\s+/).filter(Boolean);
      const offset = body.offset === undefined ? 0 : body.offset;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Choose a valid prospect page.');
      const matches = db.list('prospects').filter(record => {
        if (!visible(user, record) || record.archived !== (body.archived === true)) return false;
        const searchableFields = searchable([record.name, record.title, record.company, record.locality, metadata(record).note].join(' '));
        return terms.every(term => searchableFields.includes(term));
      });
      const records = matches.reverse().slice(offset, offset + 50).map(view);
      return { records, hasMore: offset + records.length < matches.length, total: matches.length };
    }
    if (action === 'save-prospect') {
      const fields = details(body);
      const link = profileURL(body.sourceURL);
      const notes = JSON.stringify({ note: text(body.note || '', 2000), revision: secret() });
      const saved = db.saveProspect({ ...fields, ...link, notes, assigned_to: String(user.id), archived: false });
      return { record: view(saved.record), existing: saved.existing };
    }
    const record = db.get('prospects', body.id);
    if (!record || !visible(user, record)) throw new HttpError(404, 'Prospect not found.');
    const current = metadata(record);
    if (body.expectedRevision !== current.revision) throw new HttpError(409, 'This prospect changed. Refresh and review it before saving.');
    const update = typeof body.archived === 'boolean' ? { archived: body.archived }
      : { ...details(body), notes: JSON.stringify({ ...current, note: text(body.note || '', 2000) }) };
    return { record: view(await patchReviewed(db, 'prospects', record, update)) };
  };
}
