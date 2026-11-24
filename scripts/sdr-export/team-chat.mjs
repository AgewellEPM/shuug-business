import { randomUUID } from 'node:crypto';
import { HttpError } from '../../sales/model.mjs';

const starterChannels = [
  ['general', 'Team updates, questions, and handoffs.'],
  ['field-notes', 'Share what you’re hearing from prospects.'],
  ['wins', 'Celebrate booked meetings and closed deals.'],
];
const pageSize = 50;
const actions = new Set(['chat-sync', 'chat-watch', 'chat-history', 'chat-create-channel', 'chat-send', 'chat-seen', 'chat-people', 'chat-direct-open']);

function positiveId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new HttpError(400, 'Choose a valid message.');
  return value;
}

function inputText(value, limit, label, required = true) {
  if (typeof value !== 'string') throw new HttpError(400, `Check the ${label}.`);
  const text = value.replace(/\r\n?/g, '\n').trim();
  if ((required && !text) || text.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new HttpError(400, `Enter a valid ${label} of up to ${limit} characters.`);
  }
  return text;
}

// Direct messages use separate tables. Earlier channel-only builds cannot expose private history.
function messageLog(db, { rooms, messages, reads }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${messages} (
      id INTEGER PRIMARY KEY, channel TEXT NOT NULL REFERENCES ${rooms}(slug),
      author_id TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL,
      sent_at TEXT NOT NULL, request_id TEXT NOT NULL, reply_to INTEGER REFERENCES ${messages}(id),
      UNIQUE(author_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS ${messages === 'chat_messages' ? 'chat_channel_history' : 'chat_direct_history'} ON ${messages}(channel, id);
    CREATE TABLE IF NOT EXISTS ${reads} (
      user_id TEXT NOT NULL, channel TEXT NOT NULL REFERENCES ${rooms}(slug),
      through_id INTEGER NOT NULL, PRIMARY KEY(user_id, channel)
    );
  `);
  const inRoom = db.prepare(`SELECT 1 FROM ${messages} WHERE channel = ? AND id = ?`);
  const add = db.prepare(`INSERT INTO ${messages}(channel, author_id, author_name, body, sent_at, request_id, reply_to)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(author_id, request_id) DO NOTHING`);
  const receipt = db.prepare(`SELECT id, channel, body, reply_to FROM ${messages} WHERE author_id = ? AND request_id = ?`);
  const mark = db.prepare(`INSERT INTO ${reads}(user_id, channel, through_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, channel) DO UPDATE SET through_id = excluded.through_id WHERE excluded.through_id > ${reads}.through_id`);
  const projection = `SELECT m.id, m.author_id AS authorId, m.author_name AS author, m.body, m.sent_at AS sentAt,
    p.id AS replyId, p.author_name AS replyAuthor, substr(p.body, 1, 160) AS replyText
    FROM ${messages} m LEFT JOIN ${messages} p ON p.id = m.reply_to AND p.channel = m.channel WHERE m.channel = ?`;
  const latest = db.prepare(projection + ' ORDER BY m.id DESC LIMIT ?');
  const newer = db.prepare(projection + ' AND m.id > ? ORDER BY m.id ASC LIMIT ?');
  const older = db.prepare(projection + ' AND m.id < ? ORDER BY m.id DESC LIMIT ?');

  function page(room, after, before) {
    const ascending = after !== undefined;
    const statement = ascending ? newer : before !== undefined ? older : latest;
    const args = [room];
    if (ascending) args.push(after === 0 ? 0 : positiveId(after));
    if (before !== undefined) args.push(positiveId(before));
    const rows = statement.all(...args, pageSize + 1);
    const hasMore = rows.length > pageSize;
    if (hasMore) rows.pop();
    return { messages: ascending ? rows : rows.reverse(), hasMore };
  }
  function send(user, room, input) {
    const body = inputText(input.body, 2000, 'message');
    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)) {
      throw new HttpError(400, 'A message receipt is required.');
    }
    const replyTo = input.replyTo == null ? null : positiveId(input.replyTo);
    if (replyTo && !inRoom.get(room, replyTo)) throw new HttpError(404, 'Choose a reply in this conversation.');
    const result = add.run(room, user.id, user.name, body, new Date().toISOString(), requestId, replyTo);
    if (result.changes) return { id: Number(result.lastInsertRowid), added: true };
    const original = receipt.get(user.id, requestId);
    if (original.channel !== room || original.body !== body || original.reply_to !== replyTo) {
      throw new HttpError(409, 'This message receipt has already been used.');
    }
    return { id: original.id, added: false };
  }
  function seen(userId, room, through) {
    if (!inRoom.get(room, positiveId(through))) throw new HttpError(404, 'Message not found in this conversation.');
    return mark.run(userId, room, through).changes;
  }
  return { page, send, seen, open: (id, room) => mark.run(id, room, 0).changes };
}

export function teamChat(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_channels (slug TEXT PRIMARY KEY, topic TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_direct_threads (
      slug TEXT PRIMARY KEY, user_a TEXT NOT NULL, user_b TEXT NOT NULL, name_a TEXT NOT NULL, name_b TEXT NOT NULL,
      UNIQUE(user_a, user_b), CHECK(user_a < user_b)
    );
    CREATE INDEX IF NOT EXISTS chat_direct_recipient ON chat_direct_threads(user_b);
  `);
  const publicLog = messageLog(db, { rooms: 'chat_channels', messages: 'chat_messages', reads: 'chat_reads' });
  const privateLog = messageLog(db, { rooms: 'chat_direct_threads', messages: 'chat_direct_messages', reads: 'chat_direct_reads' });
  const addChannel = db.prepare('INSERT INTO chat_channels(slug, topic) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING');
  for (const channel of starterChannels) addChannel.run(...channel);
  const exists = db.prepare('SELECT 1 FROM chat_channels WHERE slug = ?');
  const channels = db.prepare(`
    SELECT c.slug, c.topic, COALESCE(r.through_id, 0) AS seen,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.channel = c.slug AND m.id > COALESCE(r.through_id, 0) AND m.author_id <> ?) AS unread
    FROM chat_channels c LEFT JOIN chat_reads r ON r.channel = c.slug AND r.user_id = ? ORDER BY c.rowid
  `);
  const addThread = db.prepare(`INSERT INTO chat_direct_threads VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_a, user_b) DO NOTHING`);
  const pair = db.prepare('SELECT slug FROM chat_direct_threads WHERE user_a = ? AND user_b = ?');
  const participant = db.prepare('SELECT * FROM chat_direct_threads WHERE slug = ? AND (user_a = ? OR user_b = ?)');
  const directs = db.prepare(`
    SELECT t.slug, t.user_a, t.user_b, t.name_a, t.name_b, COALESCE(r.through_id, 0) AS seen,
      (SELECT MAX(m.id) FROM chat_direct_messages m WHERE m.channel = t.slug) AS latest,
      (SELECT COUNT(*) FROM chat_direct_messages m WHERE m.channel = t.slug AND m.id > COALESCE(r.through_id, 0) AND m.author_id <> :me) AS unread
    FROM chat_direct_threads t LEFT JOIN chat_direct_reads r ON r.channel = t.slug AND r.user_id = :me
    WHERE (t.user_a = :me OR t.user_b = :me) AND (r.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM chat_direct_messages m WHERE m.channel = t.slug))
    ORDER BY latest DESC, t.rowid DESC
  `);

  let sharedVersion = randomUUID(), closing = false;
  const personalVersions = new Map(), waiters = new Map();
  const versionFor = id => sharedVersion + '/' + (personalVersions.get(id) || '');
  function notify(recipients) {
    if (recipients) for (const id of recipients) personalVersions.set(id, randomUUID());
    else sharedVersion = randomUUID();
    for (const [wake, id] of waiters) if (!recipients || recipients.includes(id)) wake();
  }
  function wait(id, version, signal) {
    if (version !== versionFor(id) || closing || signal?.aborted) return {};
    return new Promise(resolve => {
      function wake() {
        clearTimeout(timer);
        waiters.delete(wake);
        signal?.removeEventListener('abort', wake);
        resolve({});
      }
      const timer = setTimeout(wake, 20_000);
      waiters.set(wake, id);
      signal?.addEventListener('abort', wake, { once: true });
    });
  }
  function dispatch(user, action, input, signal, messagingMembers) {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Sign in to the sales team to use chat.');
    let directory;
    const me = user.id;
    function members() {
      if (!directory) {
        directory = new Map(messagingMembers().map(member => [member.id, member]));
        if (!directory.has(me)) throw new HttpError(401, 'Your sales access has changed. Sign in again.');
      }
      return directory;
    }
    if (action === 'chat-watch') return wait(me, input.version, signal);
    if (action === 'chat-people') return { people: [...members().values()].filter(m => m.id !== me).sort((a, b) => a.name.localeCompare(b.name)) };
    if (action === 'chat-direct-open') {
      const other = members().get(input.memberId);
      if (!other || other.id === me) throw new HttpError(404, 'Choose another active teammate.');
      const [a, b] = [members().get(me), other].sort((first, second) => first.id < second.id ? -1 : 1);
      addThread.run('@' + randomUUID(), a.id, b.id, a.name, b.name);
      const { slug } = pair.get(a.id, b.id);
      if (privateLog.open(me, slug)) notify([me]);
      return { slug };
    }
    if (action === 'chat-create-channel') {
      if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can create channels.');
      const slug = inputText(input.name, 48, 'channel name').toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, 'Use letters, numbers, spaces, or hyphens for the channel name.');
      const topic = inputText(input.topic ?? '', 180, 'channel topic', false);
      if (!addChannel.run(slug, topic).changes) throw new HttpError(409, 'A channel with that name already exists.');
      notify();
      return { slug };
    }
    const room = input.channel;
    const direct = typeof room === 'string' && room.startsWith('@');
    const thread = direct ? participant.get(room, me, me) : null;
    if (room !== undefined || action !== 'chat-sync') {
      if (typeof room !== 'string' || !(direct ? thread : exists.get(room))) throw new HttpError(404, 'Conversation not found.');
    }
    const log = direct ? privateLog : publicLog;
    function peerOf(row) {
      const side = row.user_a === me ? 'b' : 'a';
      const id = row['user_' + side], person = members().get(id);
      return { peerId: id, name: person?.name || row['name_' + side], active: Boolean(person) };
    }
    if (action === 'chat-sync') {
      const personal = directs.all({ me }).map(row => ({ slug: row.slug, unread: row.unread, seen: row.seen, ...peerOf(row) }));
      const state = { channels: channels.all(me, me), directs: personal, version: versionFor(me) };
      if (room === undefined) return state;
      return { ...state, ...log.page(room, input.after), ...(direct ? { peer: peerOf(thread) } : {}) };
    }
    if (action === 'chat-history') return log.page(room, undefined, positiveId(input.before));
    if (action === 'chat-seen') {
      if (log.seen(me, room, input.through)) notify([me]);
      return { ok: true };
    }
    if (direct && !peerOf(thread).active) throw new HttpError(409, 'This teammate no longer has sales workspace access.');
    const actor = direct ? { id: me, name: members().get(me).name } : user;
    const result = log.send(actor, room, input);
    if (result.added) notify(direct ? [thread.user_a, thread.user_b] : undefined);
    return { id: result.id };
  }
  return { actions, dispatch, close() { closing = true; notify(); } };
}
