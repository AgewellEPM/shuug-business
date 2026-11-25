import { closeSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../../sales/model.mjs';
import { bookingStore } from './booking-store.mjs';
import { mailStore } from './mail/store.mjs';
import { teamChat } from './team-chat.mjs';
import { coachStore } from './coach-store.mjs';
import { simulationStore } from '../../sales/training-simulator.mjs';
import { salesScriptsStore } from './sales-scripts.mjs';

const kinds = new Set(['offices', 'agents', 'enrollments', 'events', 'prospects', 'campaigns', 'campaign-leads', 'earnings', 'support-requests', 'contract-drafts']);
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
    CREATE TABLE IF NOT EXISTS daily_plan_completions (
      member_id TEXT NOT NULL, day TEXT NOT NULL, task_id TEXT NOT NULL,
      PRIMARY KEY (member_id, day, task_id)
    );
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const all = db.prepare('SELECT id, data FROM records WHERE kind = ? ORDER BY id');
  const one = db.prepare('SELECT id, data FROM records WHERE kind = ? AND id = ?');
  const pilotEvent = db.prepare("SELECT id, data FROM records WHERE kind = 'events' AND json_extract(data, '$.pilotRequest') = ?");
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
  const dailyCompletions = db.prepare('SELECT task_id FROM daily_plan_completions WHERE member_id = ? AND day = ?');
  const completeDailyTask = db.prepare('INSERT OR IGNORE INTO daily_plan_completions (member_id, day, task_id) VALUES (?, ?, ?)');
  const reopenDailyTask = db.prepare('DELETE FROM daily_plan_completions WHERE member_id = ? AND day = ? AND task_id = ?');
  const setting = db.prepare('SELECT value FROM settings WHERE name = ?');
  const assignedCounties = db.prepare(`SELECT substr(name, 13) AS county, json_extract(value, '$.memberId') AS memberId,
    json_extract(value, '$.name') AS leadName FROM settings WHERE name GLOB 'county-lead:*'`);
  const save = db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value');
  const decode = row => row && { ...JSON.parse(row.data), id: row.id };
  const stamped = body => {
    const timestamp = new Date().toISOString();
    return { ...body, created_at: timestamp, updated_at: timestamp };
  };
  const get = (kind, id) => /^[1-9]\d*$/.test(String(id)) ? decode(one.get(kindFor(kind), String(id))) : undefined;
  const salesRepProfile = id => JSON.parse(setting.get('sales-rep-profile:' + id)?.value ?? 'null') ??
    { bio: '', photo: '', revision: 0 };
  const trainingProgress = id => JSON.parse(setting.get('training-progress:' + id)?.value ?? 'null');

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
  const readTour = id => JSON.parse(setting.get('getting-started:' + id)?.value ?? 'null');
  return {
    gettingStarted: {
      read: readTour,
      save(id, { step, state, revision }) {
        if (typeof step !== 'string' || !/^[a-z][a-z0-9-]{0,35}$/.test(step) ||
            !['active', 'paused', 'complete'].includes(state) || !Number.isSafeInteger(revision) || revision < 0) {
          throw new HttpError(400, 'Invalid walkthrough progress.');
        }
        return writeTransaction(() => {
          const current = readTour(id);
          if (current?.state === 'complete') return current;
          if ((current?.revision ?? 0) !== revision) throw new HttpError(409, 'Walkthrough progress changed in another tab.');
          const next = { step, state, revision: revision + 1 };
          save.run('getting-started:' + id, JSON.stringify(next));
          return next;
        });
      },
    },
    booking: bookingStore(db, writeTransaction),
    coach: coachStore(db),
    simulations: simulationStore(db),
    salesScripts: salesScriptsStore(db, writeTransaction),
    repMail: mailStore(db, writeTransaction),
    contractTransaction: writeTransaction,
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
    saveCarePilot(user, officeId, requestId, detail) {
      return writeTransaction(() => {
        const pilotRequest = user.id + ':' + requestId.toLowerCase();
        const existing = decode(pilotEvent.get(pilotRequest));
        if (existing) {
          if (existing.assigned_to !== String(officeId) || JSON.parse(existing.notes).detail !== detail) throw new HttpError(409, 'This pilot was already saved with different details. Check the facility history.');
          return existing;
        }
        const notes = JSON.stringify({ actorId: user.id, action: 'care_pilot', detail, at: new Date().toISOString() });
        return this.create('events', { town: 'Nursing-home pilot', assigned_to: String(officeId), contact_name: user.name, status: 'recorded', pilotRequest, notes });
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
    productPricing: () => JSON.parse(setting.get('product-pricing')?.value ?? 'null'),
    saveProductPricing(revision, pricing) {
      return writeTransaction(() => {
        const current = this.productPricing();
        if ((current?.revision ?? 0) !== revision) throw new HttpError(409, 'Product pricing changed. Review the current values before saving.');
        const next = { ...pricing, revision: revision + 1 };
        save.run('product-pricing', JSON.stringify(next));
        return next;
      });
    },
    countyLead: id => JSON.parse(setting.get('county-lead:' + id)?.value ?? 'null'),
    countyLeadAssignments: () => new Map(assignedCounties.all().map(row => [row.county, { memberId: row.memberId, name: row.leadName }])),
    saveCountyLead(id, revision, changes) {
      return writeTransaction(() => {
        const before = this.countyLead(id);
        if ((before?.revision || 0) !== revision) throw new HttpError(409, 'The county lead changed. Reopen this state and review the assignment.');
        const next = { ...changes, revision: revision + 1 };
        save.run('county-lead:' + id, JSON.stringify(next));
        return next;
      });
    },
    dailyPlanCompletions: (memberId, day) => new Set(dailyCompletions.all(memberId, day).map(row => row.task_id)),
    setDailyPlanCompletion(memberId, day, taskId, completed) {
      (completed ? completeDailyTask : reopenDailyTask).run(memberId, day, taskId);
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
    trainingProgress,
    updateTrainingProgress(id, apply) {
      return writeTransaction(() => {
        const progress = apply(trainingProgress(id));
        save.run('training-progress:' + id, JSON.stringify(progress));
        return progress;
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
