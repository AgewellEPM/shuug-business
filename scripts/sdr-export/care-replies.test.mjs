import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { careReplies, careRepliesRoute } from './care-replies.mjs';

const bank = { name: 'Bank', bedside: false, options: ['Open an account', 'Withdraw cash', 'Deposit a check'] };

test('offers relevant board choices before contacting the model and skips spoken phrases on More', async () => {
  let calls = 0;
  const offline = { fetcher: async () => { calls++; throw Error('Offline'); } };
  const first = careReplies({ said: 'How can I help you?', place: bank }, offline);
  assert.equal((await first.next()).value.tile.say, 'Open an account');
  assert.equal(calls, 0);
  await first.return();
  const more = careReplies({ said: 'How can I help you?', mode: 'more', place: bank, shown: ['Open an account.'] }, offline);
  assert.equal((await more.next()).value.tile.say, 'Withdraw cash');
  assert.equal(calls, 0);
  for await (const { tile } of more) if (tile) assert.notEqual(tile.say, 'Open an account');
});

test('offers a usable choice for unfamiliar questions before the model starts', async () => {
  let called = false;
  const gen = careReplies({ said: 'Are you ready?' }, { fetcher: async () => { called = true; throw Error('Offline'); } });
  assert.equal((await gen.next()).value.tile.say, 'Maybe');
  assert.equal(called, false);
  await gen.return();
});

test('the nursing home sleep question offers balanced resident replies before the model starts', async () => {
  let called = false;
  const gen = careReplies({ said: 'Good morning! How did you sleep?', place: { name: 'Nursing Home — In My Room', bedside: true, options: [] } },
    { fetcher: async () => { called = true; throw Error('Offline'); } });
  const answers = [];
  for (let i = 0; i < 6; i++) answers.push((await gen.next()).value.tile.say);
  assert.deepEqual(answers.slice(0, 3), ['I slept well', 'I had a hard night', 'I slept on and off']);
  assert.equal(called, false);
  await gen.return();
});

test('finishes a full page without waiting for the model to close its stream', async () => {
  const lines = Array.from({ length: 9 }, (_, i) => ({ label: 'Choice ' + i, sentence: 'I choose item ' + i, emoji: '💬', tone: i ? 'invalid' : 'neutral' }));
  let cancelled = false;
  const source = new ReadableStream({
    start(stream) {
      const row = JSON.stringify({ message: { content: JSON.stringify({ tiles: lines }) } });
      stream.enqueue(new TextEncoder().encode(row + '\n'));
    },
    cancel() { cancelled = true; },
  });
  const parts = await Array.fromAsync(careReplies({ said: 'What happens tomorrow?' }, { fetcher: async () => new Response(source) }));
  assert.equal(parts.filter(part => part.tile).length, 9);
  assert.equal(parts.find(part => part.tile?.label === 'Choice 0').tile.tone, 'neutral');
  assert.equal(parts.find(part => part.tile?.label === 'Choice 1').tile.tone, undefined);
  assert.deepEqual(parts.at(-1), { done: true, source: 'ai' });
  assert.equal(cancelled, true);
});

test('a correction can replace the same kiosk request while other kiosks retain their concurrency limit', async () => {
  const queued = [];
  const route = careRepliesRoute({
    origin: 'http://test', cookieName: 'session', identity: async () => ({ role: 'agent', id: 'rep' }),
    fetcher: async (url, { signal }) => new Promise((resolve, reject) => {
      queued.push(signal);
      signal.addEventListener('abort', () => reject(Error('Cancelled')), { once: true });
    }),
  });
  function submit(client, said = 'How can I help you?') {
    const request = Readable.from([JSON.stringify({ client, said, place: bank })]);
    request.method = 'POST';
    request.headers = { origin: 'http://test', 'content-type': 'application/json', cookie: 'session=test' };
    const chunks = [];
    const response = Object.assign(new EventEmitter(), { setHeader() {}, write(text) { chunks.push(text); }, end(text) { if (text) chunks.push(text); } });
    return { response, complete: route(request, response), chunks };
  }
  const client = 'kiosk-123456789012', first = submit(client);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queued.length, 1);
  assert.match(first.chunks[0], /Open an account/);
  const other = submit('kiosk-222222222222');
  await other.complete;
  assert.equal(other.response.statusCode, 429);
  assert.equal(queued[0].aborted, false);
  const second = submit(client);
  await first.complete;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queued.length, 2);
  assert.equal(queued[0].aborted, true);
  const third = submit('kiosk-333333333333');
  await third.complete;
  assert.equal(third.response.statusCode, 429);
  second.response.emit('close');
  await second.complete;
  assert.equal(queued[1].aborted, true);
});
