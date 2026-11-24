import { HttpError } from '../../../sales/model.mjs';

export function allocationStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rep_mail_allocations (
      member_id TEXT PRIMARY KEY, address TEXT NOT NULL, account_id TEXT NOT NULL, org_id TEXT NOT NULL,
      status TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rep_mail_allocation_address ON rep_mail_allocations(address) WHERE address <> '';
    CREATE TABLE IF NOT EXISTS rep_mail_handoffs (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_address TEXT NOT NULL, message_id TEXT NOT NULL,
      assignee_id TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
      summary TEXT NOT NULL, content TEXT NOT NULL, UNIQUE(source_id,source_address,message_id)
    );
    CREATE INDEX IF NOT EXISTS rep_mail_handoffs_recipient ON rep_mail_handoffs(assignee_id,updated_at DESC,id);
    CREATE INDEX IF NOT EXISTS rep_mail_handoffs_source ON rep_mail_handoffs(source_id,updated_at DESC,id);
  `);
  const allocation = db.prepare('SELECT * FROM rep_mail_allocations WHERE member_id=?');
  const byAddress = db.prepare("SELECT * FROM rep_mail_allocations WHERE address=? AND address<>''");
  const allAllocations = db.prepare('SELECT * FROM rep_mail_allocations ORDER BY member_id');
  const insertAllocation = db.prepare('INSERT INTO rep_mail_allocations VALUES (?,?,?,?,?,1,?) ON CONFLICT DO NOTHING');
  const updateAllocation = db.prepare(
    'UPDATE OR IGNORE rep_mail_allocations SET address=?, account_id=?, org_id=?, status=?, revision=revision+1, updated_at=? WHERE member_id=? AND revision=?'
  );
  const handoff = db.prepare('SELECT * FROM rep_mail_handoffs WHERE id=?');
  const original = db.prepare(
    'SELECT id,assignee_id,status,revision FROM rep_mail_handoffs WHERE source_id=? AND source_address=? AND message_id=?'
  );
  const insertHandoff = db.prepare(
    "INSERT INTO rep_mail_handoffs VALUES (?,?,?,?,?,'open',1,?,?,?) ON CONFLICT DO NOTHING"
  );
  const updateHandoff = db.prepare(
    'UPDATE rep_mail_handoffs SET assignee_id=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?'
  );
  const index = (column) =>
    db.prepare(
      'SELECT id,source_id,assignee_id,status,revision,updated_at,summary FROM rep_mail_handoffs WHERE ' +
        column +
        '=? ORDER BY updated_at DESC,id LIMIT 26 OFFSET ?'
    );
  const incoming = index('assignee_id'),
    outgoing = index('source_id');
  const now = () => new Date().toISOString();
  const changed = () => new HttpError(409, 'This assignment changed. Refresh and review its current owner.');
  return {
    allocation: (id) => allocation.get(id),
    allocationByAddress: (address) => byAddress.get(address),
    allocations: () => allAllocations.all(),
    setAllocation(member, revision, address, account, org, status) {
      const result = revision
        ? updateAllocation.run(address, account, org, status, now(), member, revision)
        : insertAllocation.run(member, address, account, org, status, now());
      if (!result.changes) throw changed();
      return allocation.get(member);
    },
    handoff: (id) => handoff.get(id),
    originalHandoff: (owner, address, id) => original.get(owner, address, id),
    handoffs: (member, sent, offset) => (sent ? outgoing : incoming).all(member, offset),
    addHandoff(id, source, address, message, assignee, summary, content) {
      if (!insertHandoff.run(id, source, address, message, assignee, now(), summary, content).changes) throw changed();
    },
    updateHandoff(id, revision, assignee, status) {
      if (!updateHandoff.run(assignee, status, now(), id, revision).changes) throw changed();
    },
  };
}
