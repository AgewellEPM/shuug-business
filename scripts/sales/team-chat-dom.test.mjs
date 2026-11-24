import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { renderTeamChat } from '../rideshare-site/sales-chat.mjs';

test('the compact conversation list keeps messages unread until the room is visible', async t => {
  const panel = renderTeamChat(() => '');
  const dom = new JSDOM('<button data-tab="chat"></button>' + panel, {
    url: 'http://localhost/sales', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  t.after(() => { window.dispatchEvent(new window.Event('pagehide')); window.close(); });
  const doc = window.document;
  const toggle = doc.querySelector('#chat-nav-toggle');
  // JSDOM has no layout engine. A displayed mobile toggle has one client rect.
  toggle.getClientRects = () => [{}];
  doc.querySelector('[data-tab-panel="chat"]').hidden = false;
  const script = new URL('../../public/rideshare-tax-pros/sales-chat.js', import.meta.url);
  window.eval(await readFile(script, 'utf8'));
  const reads = [], incoming = [];
  let nextSync;
  async function api(action, args) {
    if (action === 'chat-watch') return new Promise(resolve => { nextSync = resolve; });
    if (action === 'chat-seen') { reads.push(args.through); return {}; }
    assert.equal(action, 'chat-sync');
    return { channels: [{ slug: 'general', name: 'general', unread: 0 }], directs: [],
      messages: incoming.filter(message => message.id > (args.after || 0)), version: incoming.length };
  }
  const chat = window.SdrTeamChat.mount({ api });
  chat.view({ id: '7', role: 'agent' }, 'chat', 'general');
  await delay(0);
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const selected = doc.querySelector('#chat-channels [aria-current="true"]');
  assert.equal(doc.activeElement, selected);

  incoming.push({ id: 1, authorId: '8', author: 'Field rep', body: 'An update', sentAt: new Date(0).toISOString() });
  nextSync();
  for (let attempt = 0; attempt < 40 && !doc.querySelector('.chat-bubble'); attempt++) await delay(5);
  assert.equal(doc.querySelector('.chat-bubble .chat-body')?.textContent, 'An update');
  assert.deepEqual(reads, []);

  selected.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, toggle);
  assert.deepEqual(reads, [1]);
});
