import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { salesSimulator, simulationStore } from './training-simulator.mjs';

const rep = { id:'rep', role:'agent' };
const colleague = { id:'colleague', role:'agent' };

test('a rephrase revisits the same buyer prompt, and only the chosen branch continues and survives reopening', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'sales-rehearsal-'));
  const file = join(folder, 'practice.sqlite');
  let db = new DatabaseSync(file);
  t.after(() => { db.close(); rmSync(folder, { recursive:true, force:true }); });
  let failModel = false;
  const calls = [];
  async function model(url, { body }) {
    const { messages, format } = JSON.parse(body);
    calls.push(messages);
    const index = calls.length;
    const reply = 'buyer' in format.properties ? { buyer:'Buyer response ' + index } :
      { coach:'Ask what was missing.', suggestion:'Which item did they need?', delivery:'Pause after the question.',
        check1:true, check2:index !== 2, check3:true, check4:false };
    return { ok: !failModel, json: async () => ({message:{content:JSON.stringify(reply)}}) };
  }
  const service = () => salesSimulator(simulationStore(db), { fetcher:model });
  let run = service();
  const id = randomUUID();
  const start = { id, focus:'objection', scenario:'shop' };
  const started = await run(rep,'simulation-start',start);
  assert.equal((await run(rep,'simulation-start',start)).active.id,id);
  await assert.rejects(run(rep,'simulation-start',{ ...start,id:randomUUID() }), /resume/);
  await assert.rejects(run(colleague,'simulation-read',{id}), /unavailable/);
  await assert.rejects(run({role:'client',id:'rep'},'simulation-read'), /Sign in/);
  const firstTurn = { id,revision:0,requestId:randomUUID(),words:'Can you sign today?' };
  failModel = true;
  await assert.rejects(run(rep,'simulation-turn',firstTurn), /local AI/);
  assert.deepEqual((await run(rep,'simulation-read')).active,started.active);
  failModel = false; calls.length = 0;
  const first = await run(rep,'simulation-turn',firstTurn);
  assert.equal(first.active.turns[0].versions[0].score,3);
  assert.equal((await run(rep,'simulation-turn',firstTurn)).active.revision,1);
  assert.equal(calls.length,2);
  const revision = { id,revision:1,retry:true,requestId:randomUUID(),words:'Which item did the shopper need?',
    speech:{seconds:3,wordCount:6} };
  const revised = await run(rep,'simulation-turn',revision);
  const turn = revised.active.turns[0];
  assert.equal(turn.prompt,started.active.opening);
  assert.deepEqual(turn.versions.map(v=>v.words),[firstTurn.words,revision.words]);
  assert.equal(turn.versions[1].speech.wordsPerMinute,120);
  assert.ok(calls[2].at(-1).content.includes(turn.prompt));
  assert.ok(!calls[2].at(-1).content.includes(firstTurn.words));
  assert.equal(JSON.parse(calls[3].at(-1).content).previousPhrasing,firstTurn.words);
  const next = await run(rep,'simulation-turn',{...firstTurn,revision:2,requestId:randomUUID(),words:'Who helped them next?'});
  assert.equal(next.active.turns[1].prompt,turn.versions[1].buyer);
  assert.ok(!calls[4].at(-1).content.includes(firstTurn.words));
  assert.ok(calls[4].at(-1).content.includes(revision.words));
  await assert.rejects(run(rep,'simulation-finish',{id,revision:1}),/latest/);
  const done = await run(rep,'simulation-finish',{id,revision:3});
  assert.equal(done.active,null);
  assert.equal(done.totals[0].attempts,3);
  assert.equal(done.selected.score,4);
  assert.deepEqual((await run(colleague,'simulation-read')).history,[]);
  db.close(); db = new DatabaseSync(file); run = service();
  assert.deepEqual((await run(rep,'simulation-read',{id})).selected,done.selected);
  const empty = await run(rep,'simulation-start',{...start,id:randomUUID()});
  await run(rep,'simulation-finish',{id:empty.active.id,revision:0});
  assert.equal((await run(rep,'simulation-read')).history.length,1);
});

test('the signing drill distinguishes a ready shop owner from a school contact who needs district review', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const briefings = [];
  const run = salesSimulator(simulationStore(db), { fetcher:async (url, {body}) => {
    const { messages, format } = JSON.parse(body);
    const buyer = 'buyer' in format.properties;
    if (buyer) briefings.push(messages[0].content);
    const reply = buyer ? { buyer:'What happens next?' } : {
      coach:'You asked for a decision.', delivery:'Pause after the question.', suggestion:'Are you ready to sign?',
      check1:true, check2:true, check3:true, check4:true,
    };
    return { ok:true, json:async () => ({ message:{content:JSON.stringify(reply)} }) };
  } });
  for (const scenario of ['shop','school']) {
    const id = randomUUID();
    const { active } = await run(rep,'simulation-start',{id,scenario,focus:'close'});
    assert.equal(active.opening.includes('I own the shop'),scenario==='shop');
    await run(rep,'simulation-turn',{id,revision:0,requestId:randomUUID(),words:'Are you ready to sign the agreement today?'});
    await run(rep,'simulation-finish',{id,revision:1});
  }
  assert.match(briefings[0],/decided to sign/);
  assert.match(briefings[1],/cannot sign/);
  const { totals } = await run(rep,'simulation-read');
  assert.equal(totals[0].sessions,2);
  assert.equal(totals[0].firstScore,5);
  assert.equal(totals[0].latestScore,5);
});
