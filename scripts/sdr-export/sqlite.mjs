import { closeSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../../sales/model.mjs';

const kinds = new Set(['offices', 'agents', 'enrollments', 'events', 'prospects']);
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
    CREATE UNIQUE INDEX IF NOT EXISTS prospects_source
      ON records(json_extract(data, '$.assigned_to'), json_extract(data, '$.sourceKey'))
      WHERE kind = 'prospects';
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const all = db.prepare('SELECT id, data FROM records WHERE kind = ? ORDER BY id');
  const one = db.prepare('SELECT id, data FROM records WHERE kind = ? AND id = ?');
  const insert = db.prepare('INSERT INTO records (kind, data) VALUES (?, ?)');
  const insertProspect = db.prepare("INSERT INTO records (kind, data) VALUES ('prospects', ?) ON CONFLICT DO NOTHING");
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

  function patch(kind, id, values, expectedNotes) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const before = get(kind, id);
      if (!before) throw new HttpError(404, 'Record not found.');
      if (expectedNotes !== undefined && (before.notes ?? null) !== expectedNotes) {
        throw new HttpError(409, 'This record changed. Refresh before trying again.');
      }
      const after = { ...before, ...values, id: before.id, updated_at: new Date().toISOString() };
      update.run(JSON.stringify(after), before.id);
      db.exec('COMMIT');
      return after;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    list: kind => all.all(kindFor(kind)).map(decode),
    get,
    create(kind, body) {
      const data = stamped(body);
      const result = insert.run(kindFor(kind), JSON.stringify(data));
      return { ...data, id: Number(result.lastInsertRowid) };
    },
    saveProspect(body) {
      const data = stamped(body);
      const result = insertProspect.run(JSON.stringify(data));
      return result.changes
        ? { record: { ...data, id: Number(result.lastInsertRowid) }, existing: false }
        : { record: decode(prospect.get(body.assigned_to, body.sourceKey)), existing: true };
    },
    patch: (kind, id, body) => patch(kind, id, body),
    patchIfUnchanged: (kind, id, notes, body) => patch(kind, id, body, notes ?? null),
    terms: () => JSON.parse(setting.get('terms')?.value ?? 'null'),
    setTerms: value => save.run('terms', JSON.stringify(value)),
    support: () => JSON.parse(setting.get('support')?.value ?? 'null'),
    setSupport: value => save.run('support', JSON.stringify(value)),
    close: () => db.close(),
  };
}
