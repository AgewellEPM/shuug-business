import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { salesDailyPlan } from '../../sales/sales-daily-plan.mjs';
import { bookings } from './bookings.mjs';
import { handleCoachBooking } from './coach-booking.mjs';
import { salesCoach } from './sales-coach.mjs';
import { sqliteStore } from './sqlite.mjs';

const clock = () => Date.parse('2027-03-08T12:00:00Z');
const owner = { id: 'owner', role: 'owner', name: 'Owner' };

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sdr-coach-booking-'));
  const db = sqliteStore(join(dir, 'workspace.sqlite'));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const server = bookings({}, db, 'https://booking.example', '11'.repeat(32), { now: clock });
  const { id } = db.create('agents', { status: 'active', contact_name: 'Lee', contact_email: 'lee@example.invalid', notes: '{}' });
  const rep = { id: String(id), role: 'agent', name: 'Lee' };
  const ask = (question, previous) => handleCoachBooking({ user: rep, input: { timeZone: 'America/New_York' }, previous, question,
    crm: server.staff, calendar: { today: '2027-03-08' } });
  const dashboard = () => server.staff(rep, 'booking-dashboard', {});
  const publish = async fields => server.staff(rep, 'booking-settings', { ...(await dashboard()).policy, published: true, ...fields });
  return { ask, db, server, publish, dashboard, rep };
}

test('a rep checks live policy, dictates an appointment, confirms and gets one calendar record on retry', async t => {
  const { ask, publish, dashboard } = fixture(t);
  const unpublished = await ask('Book a demo tomorrow at 2 PM');
  assert.match(unpublished.answer, /Enable client bookings/);
  await publish({ location: 'Online' });
  const start = await ask('Book a demo tomorrow at 2 PM Eastern time');
  assert.match(start.answer, /attendee’s full name.*March 9, 2027.*2:00 PM Eastern Standard Time/);
  const named = await ask('Avery Kim.', start);
  assert.match(named.answer, /email address.*Avery Kim/);
  const preview = await ask('avery dot kim at example dot invalid.', named);
  assert.match(preview.answer, /avery\.kim@example\.invalid.*45 minutes.*Location: Online.*confirm booking/);
  assert.equal((await dashboard()).entries.length, 0);
  const confirmed = await ask('Confirm booking.', preview);
  assert.match(confirmed.answer, /Product demo confirmed.*Booking email is not configured/);
  assert.equal((await ask('Confirm booking', preview)).bookingSaved.id, confirmed.bookingSaved.id);
  const [entry] = (await dashboard()).entries;
  assert.equal(entry.id, confirmed.bookingSaved.id);
  assert.equal(entry.start, Date.parse('2027-03-09T19:00:00Z'));
  assert.deepEqual(entry.client, { name: 'Avery Kim', email: 'avery.kim@example.invalid', company: '', phone: '', notes: '' });
});

test('spoken choices and edits stay in preview until confirmed, and a stale policy prevents confirmation', async t => {
  const { ask, dashboard, publish } = fixture(t);
  await publish();
  const times = await ask('Find availability for an appointment on March 10th');
  assert.match(times.answer, /Option 1.*Option 2.*Option 3/i);
  const selected = await ask('Option two.', times);
  assert.match(selected.answer, /9:15 AM/);
  const name = await ask('Avery Kim', selected);
  const badEmail = await ask('I am not sure', name);
  assert.match(badEmail.answer, /one email address/);
  const preview = await ask('avery@example.invalid', badEmail);
  const changed = await ask('Change the email to other@example.invalid', preview);
  assert.match(changed.answer, /other@example.invalid/);
  assert.equal((await dashboard()).entries.length, 0);
  await publish({ location: 'Phone' });
  const stale = await ask('Book it.', changed);
  assert.match(stale.answer, /calendar changed/);
  assert.equal((await dashboard()).entries.length, 0);
  assert.match((await ask('Cancel booking draft.', stale)).answer, /discarded/);
  assert.equal((await ask('Confirm booking.')).bookingSaved, undefined);
});

test('staff booking cannot read or reserve someone else’s calendar', async t => {
  const { server, rep } = fixture(t);
  for (const action of ['booking-staff-slots', 'booking-staff-book', 'booking-staff-manage']) {
    await assert.rejects(server.staff(rep, action, { host: owner.id }), { status: 403 });
    await assert.rejects(server.staff(owner, action, { host: rep.id }), { status: 403 });
  }
});

test('rescheduling and cancelling require the matching confirmation and preserve the actual booking identity', async t => {
  const { ask, dashboard, publish, server } = fixture(t);
  await publish();
  const start = await ask('Book a demo tomorrow at 2 PM');
  const named = await ask('Avery Kim', start);
  const preview = await ask('avery@example.invalid', named);
  const confirmed = await ask('Confirm booking', preview);
  const move = await ask('Reschedule the demo with Avery Kim to March 10th at 3 PM', confirmed);
  assert.match(move.answer, /March 9, 2027.*2:00 PM.*March 10, 2027.*3:00 PM.*confirm reschedule/);
  assert.equal((await dashboard()).entries[0].revision, 1);
  const wrong = await ask('Confirm cancellation', move);
  assert.equal(wrong.bookingSaved, undefined);
  const moved = await ask('Confirm reschedule', wrong);
  assert.match(moved.answer, /rescheduled for Avery Kim/);
  assert.equal(moved.bookingSaved.id, confirmed.bookingSaved.id);
  assert.equal((await ask('Confirm reschedule', move)).bookingSaved.id, confirmed.bookingSaved.id);
  assert.equal((await dashboard()).entries[0].revision, 2);

  await assert.rejects(server.staff(owner, 'booking-staff-manage', { operation: 'cancel', bookingId: confirmed.bookingSaved.id, revision: 2 }), { status: 404 });
  const cancel = await ask('Cancel the demo with Avery Kim', moved);
  assert.match(cancel.answer, /March 10, 2027.*confirm cancellation/);
  assert.equal((await dashboard()).entries[0].status, 'confirmed');
  const cancelled = await ask('Confirm cancellation', cancel);
  assert.match(cancelled.answer, /cancelled for Avery Kim/);
  assert.equal((await ask('Confirm cancellation', cancel)).bookingSaved.id, cancelled.bookingSaved.id);
  const [event] = (await dashboard()).entries;
  assert.equal(event.status, 'cancelled');
  assert.equal(event.revision, 3);
});

test('Ask Tinky retains the booking preview through a spoken readback and commits via the calendar service', async t => {
  const { db, server, publish, dashboard, rep } = fixture(t);
  await publish();
  const coach = salesCoach(db, salesDailyPlan(db, clock), { fetcher: () => assert.fail('booking commands need no model') });
  async function ask(question, previous) {
    const result = await coach.dispatch(rep, 'coach-ask', { question, lastId: previous?.id || 0, requestId: randomUUID(), timeZone: 'America/New_York' }, server.staff);
    return result.turn;
  }
  const time = await ask('Book a demo tomorrow at 2 PM');
  const attendee = await ask('Avery Kim', time);
  const preview = await ask('Avery at example dot invalid', attendee);
  const readback = await ask('Read it back', preview);
  assert.equal(readback.answer, preview.answer);
  assert.equal(readback.booking.requestId, preview.booking.requestId);
  const booked = await ask('Confirm booking', readback);
  assert.equal((await dashboard()).entries[0].id, booked.bookingSaved.id);
});
