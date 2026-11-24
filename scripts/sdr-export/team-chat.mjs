import { randomUUID } from 'node:crypto';
import { HttpError } from '../../sales/model.mjs';

const starterChannels = [
  ['general', 'Team updates, questions, and handoffs.'],
  ['field-notes', 'Share what you’re hearing from prospects.'],
  ['wins', 'Celebrate booked meetings and closed deals.'],
];
const pageSize = 50;
const actions = new Set(['chat-sync', 'chat-watch', 'chat-history', 'chat-create-channel', 'chat-send', 'chat-seen']);

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

export function teamChat(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_channels (
      slug TEXT PRIMARY KEY, topic TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY, channel TEXT NOT NULL REFERENCES chat_channels(slug),
      author_id TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL,
      sent_at TEXT NOT NULL, request_id TEXT NOT NULL, reply_to INTEGER REFERENCES chat_messages(id),
      UNIQUE(author_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS chat_channel_history ON chat_messages(channel, id);
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id TEXT NOT NULL, channel TEXT NOT NULL REFERENCES chat_channels(slug),
      through_id INTEGER NOT NULL, PRIMARY KEY(user_id, channel)
    );
  `);
  const addChannel = db.prepare('INSERT INTO chat_channels(slug, topic) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING');
  for (const channel of starterChannels) addChannel.run(...channel);

  const channels = db.prepare(`
    SELECT c.slug, c.topic, COALESCE(r.through_id, 0) AS seen,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.channel = c.slug
        AND m.id > COALESCE(r.through_id, 0) AND m.author_id <> ?) AS unread
    FROM chat_channels c LEFT JOIN chat_reads r ON r.channel = c.slug AND r.user_id = ?
    ORDER BY c.rowid
  `);
  const exists = db.prepare('SELECT 1 FROM chat_channels WHERE slug = ?');
  const inChannel = db.prepare('SELECT 1 FROM chat_messages WHERE channel = ? AND id = ?');
  const addMessage = db.prepare(`
    INSERT INTO chat_messages(channel, author_id, author_name, body, sent_at, request_id, reply_to)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(author_id, request_id) DO NOTHING
  `);
  const receipt = db.prepare('SELECT id, channel, body, reply_to FROM chat_messages WHERE author_id = ? AND request_id = ?');
  const mark = db.prepare(`
    INSERT INTO chat_reads(user_id, channel, through_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, channel) DO UPDATE SET through_id = excluded.through_id
    WHERE excluded.through_id > chat_reads.through_id
  `);
  const projection = `SELECT m.id, m.author_id AS authorId, m.author_name AS author, m.body, m.sent_at AS sentAt,
    p.id AS replyId, p.author_name AS replyAuthor, substr(p.body, 1, 160) AS replyText
    FROM chat_messages m LEFT JOIN chat_messages p ON p.id = m.reply_to AND p.channel = m.channel
    WHERE m.channel = ?`;
  const latest = db.prepare(projection + ' ORDER BY m.id DESC LIMIT ?');
  const newer = db.prepare(projection + ' AND m.id > ? ORDER BY m.id ASC LIMIT ?');
  const older = db.prepare(projection + ' AND m.id < ? ORDER BY m.id DESC LIMIT ?');

  // A wake-up carries no conversation data. The next sync rechecks the sales session.
  let version = randomUUID(), closing = false;
  const waiters = new Set();
  function notify() {
    version = randomUUID();
    for (const wake of waiters) wake();
  }
  function wait(knownVersion, signal) {
    if (knownVersion !== version || closing || signal?.aborted) return {};
    return new Promise(resolve => {
      function wake() {
        clearTimeout(timer);
        waiters.delete(wake);
        signal?.removeEventListener('abort', wake);
        resolve({});
      }
      const timer = setTimeout(wake, 20_000);
      waiters.add(wake);
      signal?.addEventListener('abort', wake, { once: true });
    });
  }

  function channelFor(slug) {
    if (typeof slug !== 'string' || !exists.get(slug)) throw new HttpError(404, 'This channel could not be found.');
    return slug;
  }
  function page(statement, args, ascending = false) {
    const rows = statement.all(...args, pageSize + 1);
    const hasMore = rows.length > pageSize;
    if (hasMore) rows.pop();
    return { messages: ascending ? rows : rows.reverse(), hasMore };
  }
  function dispatch(user, action, input, signal) {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Sign in to the sales team to use chat.');
    if (action === 'chat-watch') return wait(input.version, signal);
    if (action === 'chat-sync') {
      const state = { channels: channels.all(user.id, user.id), version };
      if (input.channel === undefined) return state;
      const channel = channelFor(input.channel);
      const history = input.after === undefined ? page(latest, [channel]) : page(newer, [channel, input.after === 0 ? 0 : positiveId(input.after)], true);
      return { ...state, ...history };
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
    const channel = channelFor(input.channel);
    if (action === 'chat-history') return page(older, [channel, positiveId(input.before)]);
    if (action === 'chat-seen') {
      const through = positiveId(input.through);
      if (!inChannel.get(channel, through)) throw new HttpError(404, 'Message not found in this channel.');
      if (mark.run(user.id, channel, through).changes) notify();
      return { ok: true };
    }
    const body = inputText(input.body, 2000, 'message');
    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)) {
      throw new HttpError(400, 'A message receipt is required.');
    }
    const replyTo = input.replyTo == null ? null : positiveId(input.replyTo);
    if (replyTo && !inChannel.get(channel, replyTo)) throw new HttpError(404, 'Choose a reply in this channel.');
    const result = addMessage.run(channel, user.id, user.name, body, new Date().toISOString(), requestId, replyTo);
    if (result.changes) {
      notify();
      return { id: Number(result.lastInsertRowid) };
    }
    const original = receipt.get(user.id, requestId);
    if (original.channel !== channel || original.body !== body || original.reply_to !== replyTo) {
      throw new HttpError(409, 'This message receipt has already been used.');
    }
    return { id: original.id };
  }
  return { actions, dispatch, close() { closing = true; notify(); } };
}
