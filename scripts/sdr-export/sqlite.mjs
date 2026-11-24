import { closeSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../../sales/model.mjs';
import { bookingStore } from './booking-store.mjs';
import { mailStore } from './mail/store.mjs';
import { teamChat } from './team-chat.mjs';

const kinds = new Set(['offices', 'agents', 'enrollments', 'events', 'prospects', 'campaigns', 'campaign-leads', 'earnings']);
function kindFor(kind) {
  if (!kinds.has(kind)) throw new Error('Unknown SDR collection.');
  return kind;
}

export function sqliteStore(filename) {
  closeSync(openSync(filename, 'a', 0o600));
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_kind ON records(kind, id);
    CREATE UNIQUE INDEX IF NOT EXISTS campaign_lead_key
      ON records(json_extract(data, '$.campaignId'), json_extract(data, '$.leadKey'))
      WHERE kind = 'campaign-leads';
    CREATE TABLE IF NOT EXISTS outreach_suppression (email TEXT PRIMARY KEY);
    CREATE UNIQUE INDEX IF NOT EXISTS prospects_source
      ON records(json_extract(data, '$.assigned_to'), json_extract(data, '$.sourceKey'))
      WHERE kind = 'prospects';
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const all = db.prepare('SELECT id, data FROM records WHERE kind = ? ORDER BY id');
  const one = db.prepare('SELECT id, data FROM records WHERE kind = ? AND id = ?');
  const insert = db.prepare('INSERT INTO records (kind, data) VALUES (?, ?)');
  const insertProspect = db.prepare("INSERT INTO records (kind, data) VALUES ('prospects', ?) ON CONFLICT DO NOTHING");
  const insertLead = db.prepare("INSERT INTO records (kind, data) VALUES ('campaign-leads', ?) ON CONFLICT DO NOTHING");
  const getLead = db.prepare(`
    SELECT id, data FROM records WHERE kind = 'campaign-leads'
      AND json_extract(data, '$.campaignId') = ? AND json_extract(data, '$.leadKey') = ?
  `);
  const suppressEmail = db.prepare('INSERT OR IGNORE INTO outreach_suppression VALUES (?)');
  const suppressedEmail = db.prepare('SELECT 1 FROM outreach_suppression WHERE email = ?');
  const prospect = db.prepare(`
    SELECT id, data FROM records WHERE kind = 'prospects'
      AND json_extract(data, '$.assigned_to') = ? AND json_extract(data, '$.sourceKey') = ?
  `);
  const update = db.prepare('UPDATE records SET data = ? WHERE id = ?');
  const setting = db.prepare('SELECT value FROM settings WHERE name = ?');
  const save = db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value');
  const decode = row => row && { ...JSON.parse(row.data), id: row.id };
  const stamped = body => {
    const timestamp = new Date().toISOString();
    return { ...body, created_at: timestamp, updated_at: timestamp };
  };
  const get = (kind, id) => /^[1-9]\d*$/.test(String(id)) ? decode(one.get(kindFor(kind), String(id))) : undefined;
  const salesRepProfile = id => JSON.parse(setting.get('sales-rep-profile:' + id)?.value ?? 'null') ??
    { bio: '', photo: '', revision: 0 };

  let writing = false;
  function writeTransaction(work) {
    if (writing) return work();
    db.exec('BEGIN IMMEDIATE');
    writing = true;
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      writing = false;
    }
  }

  function patch(kind, id, values, expectedNotes) {
    return writeTransaction(() => {
      const before = get(kind, id);
      if (!before) throw new HttpError(404, 'Record not found.');
      if (expectedNotes !== undefined && (before.notes ?? null) !== expectedNotes) {
        throw new HttpError(409, 'This record changed. Refresh before trying again.');
      }
      const after = { ...before, ...values, id: before.id, updated_at: new Date().toISOString() };
      update.run(JSON.stringify(after), before.id);
      return after;
    });
  }

  const chat = teamChat(db);
  return {
    booking: bookingStore(db, writeTransaction),
    repMail: mailStore(db, writeTransaction),
    chat,
    list: kind => all.all(kindFor(kind)).map(decode),
    get,
    create(kind, body) {
      const data = stamped(body);
      const result = insert.run(kindFor(kind), JSON.stringify(data));
      return { ...data, id: Number(result.lastInsertRowid) };
    },
    createOfficeOnce(body, matches) {
      return writeTransaction(() => {
        const existing = this.list('offices').find(matches);
        return existing ? { office: existing, duplicate: true } : { office: this.create('offices', body) };
      });
    },
    saveProspect(body) {
      const data = stamped(body);
      const result = insertProspect.run(JSON.stringify(data));
      return result.changes
        ? { record: { ...data, id: Number(result.lastInsertRowid) }, existing: false }
        : { record: decode(prospect.get(body.assigned_to, body.sourceKey)), existing: true };
    },
    saveCampaignLead(body) {
      const data = stamped(body);
      const result = insertLead.run(JSON.stringify(data));
      return result.changes ? { ...data, id: Number(result.lastInsertRowid) } : decode(getLead.get(body.campaignId, body.leadKey));
    },
    suppressEmail: address => suppressEmail.run(address),
    suppressedEmail: address => Boolean(suppressedEmail.get(address)),
    patch: (kind, id, body) => patch(kind, id, body),
    patchIfUnchanged: (kind, id, notes, body) => patch(kind, id, body, notes ?? null),
    countyLead: id => JSON.parse(setting.get('county-lead:' + id)?.value ?? 'null'),
    saveCountyLead(id, revision, changes) {
      return writeTransaction(() => {
        const before = this.countyLead(id);
        if ((before?.revision || 0) !== revision) throw new HttpError(409, 'The county lead changed. Reopen this state and review the assignment.');
        const next = { ...changes, revision: revision + 1 };
        save.run('county-lead:' + id, JSON.stringify(next));
        return next;
      });
    },
    salesRepProfile,
    setSalesRepProfile(id, revision, changes) {
      return writeTransaction(() => {
        const previous = salesRepProfile(id);
        if (previous.revision !== revision) throw new HttpError(409, 'Your profile changed. Reopen it before saving.');
        const profile = { ...previous, ...changes, revision: revision + 1 };
        save.run('sales-rep-profile:' + id, JSON.stringify(profile));
        return profile;
      });
    },
    writeAgentTeam: writeTransaction,
    terms: () => JSON.parse(setting.get('terms')?.value ?? 'null'),
    setTerms: value => save.run('terms', JSON.stringify(value)),
    support: () => JSON.parse(setting.get('support')?.value ?? 'null'),
    setSupport: value => save.run('support', JSON.stringify(value)),
    lastResearch: userId => JSON.parse(setting.get('research-' + userId)?.value ?? 'null'),
    setLastResearch: (userId, value) => save.run('research-' + userId, JSON.stringify(value)),
    close: () => { chat.close(); db.close(); },
  };
}
