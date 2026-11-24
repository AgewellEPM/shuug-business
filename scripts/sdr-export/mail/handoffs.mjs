import { randomUUID } from 'node:crypto';
import { HttpError, text } from '../../../sales/model.mjs';
import { sameAddress, zohoId } from './zoho-account.mjs';

export function messageHandoffs({ db, roster, accountFor, transport, protect, recover }) {
  const store = db.repMail;
  const actions = [
    'rep-email-handoff-options',
    'rep-email-handoff',
    'rep-email-handoffs',
    'rep-email-handoff-read',
    'rep-email-handoff-status',
    'rep-email-handoff-download',
  ];
  const owner = { id: 'owner', role: 'owner', name: 'Workspace owner' };
  const person = (id) => (id === 'owner' ? owner : roster.rosterUser(db.get('agents', id)));
  const name = (id) => db.salesRepProfile(id)?.name || person(id)?.name || 'Former team member';
  function recipient(id, source) {
    if (typeof id !== 'string' || id === source || id === 'owner' || !person(id))
      throw new HttpError(400, 'Choose another active sales rep.');
  }
  function accessible(user, id) {
    if (!person(user.id)) throw new HttpError(403, 'Your sales access has changed.');
    const row = store.handoff(text(id, 80, true));
    if (!row || (row.source_id !== user.id && row.assignee_id !== user.id))
      throw new HttpError(404, 'This email assignment is unavailable.');
    return row;
  }
  function view(row) {
    return {
      id: row.id,
      source: name(row.source_id),
      sourceId: row.source_id,
      assignee: name(row.assignee_id),
      assigneeId: row.assignee_id,
      status: row.status,
      revision: row.revision,
      updatedAt: row.updated_at,
      ...recover('handoff-summary:' + row.id, row.summary),
    };
  }
  async function dispatch(user, action, body) {
    if (action === 'rep-email-handoffs') {
      if (!['to-me', 'by-me'].includes(body.view) || !Number.isSafeInteger(body.offset ?? 0) || (body.offset ?? 0) < 0)
        throw new HttpError(400, 'Choose a valid assignment list.');
      const offset = body.offset ?? 0;
      if (offset > 1000000) throw new HttpError(400, 'Reload the assignment list.');
      const rows = store.handoffs(user.id, body.view === 'by-me', offset);
      return { assignments: rows.slice(0, 25).map(view), next: rows.length > 25 ? offset + 25 : null };
    }
    if (action === 'rep-email-handoff' || action === 'rep-email-handoff-options') {
      const source = accountFor(user),
        messageId = zohoId(body.messageId);
      if (!messageId || !source.configured)
        throw new HttpError(400, 'Open an incoming message from your business mailbox.');
      const original = () => store.originalHandoff(user.id, source.address, messageId);
      if (action === 'rep-email-handoff-options') {
        const current = original();
        return {
          members: roster.messagingMembers().filter((p) => p.id !== 'owner' && p.id !== user.id),
          current: current
            ? {
                assigneeId: current.assignee_id,
                name: name(current.assignee_id),
                revision: current.revision,
                status: current.status,
              }
            : null,
        };
      }
      const id = body.memberId;
      recipient(id, user.id);
      const current = original();
      if (current?.assignee_id === id && current.status === 'open')
        return { assignment: view(store.handoff(current.id)) };
      if (body.revision !== (current?.revision || 0))
        throw new HttpError(409, 'The assignment changed. Reload the original message.');
      if (current) {
        store.updateHandoff(current.id, body.revision, id, 'open');
        return { assignment: view(store.handoff(current.id)) };
      }
      const message = await transport.read(source, { folder: 'inbox', id: messageId, markRead: false });
      if (message.id !== messageId) throw new HttpError(404, 'The original incoming message is unavailable.');
      return store.transaction(() => {
        recipient(id, user.id);
        if (!person(user.id) || !sameAddress(accountFor(user).address, source.address))
          throw new HttpError(409, 'Your mailbox assignment changed.');
        const key = randomUUID(),
          summary = { subject: message.subject, from: message.from, date: message.date };
        store.addHandoff(
          key,
          user.id,
          source.address,
          messageId,
          id,
          protect('handoff-summary:' + key, summary),
          protect('handoff:' + key, message)
        );
        return { assignment: view(store.handoff(key)) };
      });
    }
    const row = accessible(user, body.id);
    if (action === 'rep-email-handoff-read')
      return { assignment: view(row), message: recover('handoff:' + row.id, row.content) };
    if (action === 'rep-email-handoff-status') {
      if (!['open', 'done'].includes(body.status) || body.revision !== row.revision)
        throw new HttpError(409, 'Reload the current assignment.');
      store.updateHandoff(row.id, body.revision, row.assignee_id, body.status);
      return { assignment: view(store.handoff(row.id)) };
    }
    const msg = recover('handoff:' + row.id, row.content);
    if (!Number.isSafeInteger(body.index) || body.index < 0 || !msg.attachments?.[body.index])
      throw new HttpError(404, 'Choose an attachment from this message.');
    const source = person(row.source_id),
      box = source && accountFor(source);
    if (!box?.configured || !sameAddress(box.address, row.source_address))
      throw new HttpError(410, 'The original mailbox is unavailable for this attachment.');
    const file = await transport.download(box, { folder: 'inbox', id: row.message_id, index: body.index });
    accessible(user, row.id);
    if (file.name !== msg.attachments[body.index].name) throw new HttpError(409, 'The original attachment changed.');
    return file;
  }
  return { actions, dispatch };
}
