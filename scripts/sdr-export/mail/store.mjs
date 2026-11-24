import { HttpError } from '../../../sales/model.mjs';

export function mailStore(db, transaction) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rep_mail_accounts (
      owner_id TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, credential TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rep_mail_drafts (
      owner_id TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
      status TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    CREATE INDEX IF NOT EXISTS rep_mail_drafts_updated ON rep_mail_drafts(owner_id, updated_at DESC);
  `);
  const account = db.prepare('SELECT address, revision, credential FROM rep_mail_accounts WHERE owner_id = ?');
  const addressOwner = db.prepare('SELECT owner_id FROM rep_mail_accounts WHERE address = ?');
  const saveAccount = db.prepare(`
    INSERT INTO rep_mail_accounts VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET address = excluded.address, revision = excluded.revision, credential = excluded.credential
  `);
  const removeAccount = db.prepare('DELETE FROM rep_mail_accounts WHERE owner_id = ? AND revision = ?');
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
    account: owner => account.get(owner),
    saveAccount(owner, address, revision, expected, credential) {
      return transaction(() => {
        if ((account.get(owner)?.revision || '') !== expected) throw new HttpError(409, 'Your mailbox settings changed. Reopen Senders.');
        const assigned = addressOwner.get(address);
        if (assigned && assigned.owner_id !== owner) throw new HttpError(409, 'This mailbox is already connected to a workspace account.');
        saveAccount.run(owner, address, revision, credential);
      });
    },
    disconnect(owner, expected) {
      if (!removeAccount.run(owner, expected).changes) throw new HttpError(409, 'Your mailbox settings changed. Reopen Senders.');
    },
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
