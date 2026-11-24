import { HttpError } from '../../sales/model.mjs';

export function coachStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coach_goals (
      member TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coach_turns (
      id INTEGER PRIMARY KEY, member TEXT NOT NULL, request_id TEXT NOT NULL,
      question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(member, request_id)
    );
    CREATE INDEX IF NOT EXISTS coach_member_history ON coach_turns(member, id);
    CREATE TABLE IF NOT EXISTS coach_saves (member TEXT NOT NULL, turn INTEGER NOT NULL, receipt TEXT, PRIMARY KEY(member, turn));
  `);
  const goal = db.prepare('SELECT revision, data FROM coach_goals WHERE member = ?');
  const newGoal = db.prepare('INSERT INTO coach_goals VALUES (?, 1, ?) ON CONFLICT DO NOTHING');
  const editGoal = db.prepare('UPDATE coach_goals SET data = ?, revision = revision + 1 WHERE member = ? AND revision = ?');
  const turns = db.prepare('SELECT * FROM coach_turns WHERE member = ? AND id < ? ORDER BY id DESC LIMIT ?');
  const latest = db.prepare('SELECT MAX(id) AS id FROM coach_turns WHERE member = ?');
  const receipt = db.prepare('SELECT * FROM coach_turns WHERE member = ? AND request_id = ?');
  const claim = db.prepare('INSERT OR IGNORE INTO coach_saves(member, turn) VALUES (?, ?)');
  const claimed = db.prepare('SELECT receipt FROM coach_saves WHERE member=? AND turn=?');
  const finish = db.prepare('UPDATE coach_saves SET receipt=? WHERE member=? AND turn=?');
  const release = db.prepare('DELETE FROM coach_saves WHERE member=? AND turn=? AND receipt IS NULL');
  const insert = db.prepare(`INSERT INTO coach_turns(member,request_id,question,answer,created_at)
    SELECT ?,?,?,?,? WHERE (SELECT COALESCE(MAX(id),0) FROM coach_turns WHERE member=?)=? ON CONFLICT DO NOTHING`);
  function readGoal(member) {
    const item = goal.get(member);
    return item ? { ...JSON.parse(item.data), revision: item.revision } : null;
  }
  function unpack(row) {
    return row && { id: row.id, question: row.question, ...JSON.parse(row.answer), createdAt: row.created_at };
  }
  return {
    claimSave(member, turn) { return claim.run(member, turn).changes ? { claimed: true } : { receipt: claimed.get(member, turn)?.receipt }; },
    finishSave(member, turn, result) { finish.run(JSON.stringify(result), member, turn); },
    releaseSave(member, turn) { release.run(member, turn); },
    goal: readGoal,
    saveGoal(member, value, revision) {
      const serialized = JSON.stringify(value);
      const result = revision ? editGoal.run(serialized, member, revision) : newGoal.run(member, serialized);
      if (!result.changes) throw new HttpError(409, 'Your goal changed in another tab. Reload it before saving.');
      return readGoal(member);
    },
    lastId: member => latest.get(member).id || 0,
    history(member, limit, before = Number.MAX_SAFE_INTEGER) {
      const rows = turns.all(member, before, limit + 1);
      return { turns: rows.slice(0, limit).reverse().map(unpack), hasOlder: rows.length > limit };
    },
    prior: (member, key) => unpack(receipt.get(member, key)),
    append(member, key, question, answer, after) {
      insert.run(member, key, question, JSON.stringify(answer), new Date().toISOString(), member, after);
      const row = receipt.get(member, key);
      if (!row || row.question !== question) throw new HttpError(409, 'Your conversation changed. Reload before sending again.');
      return unpack(row);
    },
  };
}
