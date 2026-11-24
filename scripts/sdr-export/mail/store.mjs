import { HttpError } from '../../../sales/model.mjs';
import { allocationStore } from './allocation-store.mjs';

export function mailStore(db, transaction) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rep_mail_files (id TEXT PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rep_mail_drafts (
      owner_id TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
      status TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    CREATE INDEX IF NOT EXISTS rep_mail_drafts_updated ON rep_mail_drafts(owner_id, updated_at DESC);
  `);
  const file = db.prepare('SELECT content FROM rep_mail_files WHERE id = ?');
  const insertFile = db.prepare('INSERT INTO rep_mail_files VALUES (?, ?)');
  const removeFile = db.prepare('DELETE FROM rep_mail_files WHERE id = ?');
  const draft = db.prepare('SELECT * FROM rep_mail_drafts WHERE owner_id = ? AND id = ?');
  const activeDrafts = db.prepare(`
    SELECT * FROM rep_mail_drafts WHERE owner_id = ? AND status <> 'accepted' ORDER BY updated_at DESC LIMIT 101
  `);
  const insert = db.prepare('INSERT INTO rep_mail_drafts VALUES (?, ?, 1, \'draft\', ?, ?) ON CONFLICT DO NOTHING');
  const update = db.prepare(`
    UPDATE rep_mail_drafts SET revision = revision + 1, status = ?, content = ?, updated_at = ?
    WHERE owner_id = ? AND id = ? AND revision = ? AND status = ?
  `);
  const discard = db.prepare('DELETE FROM rep_mail_drafts WHERE owner_id = ? AND id = ? AND revision = ? AND status = \'draft\'');
  const currentTime = () => new Date().toISOString();
  const changed = () => new HttpError(409, 'This draft changed. Reopen it from Drafts.');

  return {
    ...allocationStore(db),
    transaction,
    file: id => file.get(id)?.content,
    addFile(id, content) { insertFile.run(id, content); },
    removeFile(id) { removeFile.run(id); },
    draft: (owner, id) => draft.get(owner, id),
    drafts: owner => activeDrafts.all(owner),
    createDraft(owner, id, content) {
      return transaction(() => {
        if (activeDrafts.all(owner).length >= 100) throw new HttpError(409, 'Your Drafts folder is full. Discard an old draft first.');
        if (!insert.run(owner, id, content, currentTime()).changes) throw changed();
        return draft.get(owner, id);
      });
    },
    changeDraft(owner, id, revision, from, to, content, activity) {
      return transaction(() => {
        if (!update.run(to, content, currentTime(), owner, id, revision, from).changes) throw changed();
        activity?.();
        return draft.get(owner, id);
      });
    },
    discardDraft(owner, id, revision) {
      if (!discard.run(owner, id, revision).changes) throw changed();
    },
  };
}
