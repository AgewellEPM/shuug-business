import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { BILLING_EVENTS, initialBilling, enrollmentEligibility, reconcileEnrollment, reconcileBilling } from './billing.mjs';
import { createWebhookHandler } from './webhook.mjs';

// Every provider response and record below is synthetic. These checks establish
// neither live Stripe connectivity nor real checkout/webhook acceptance.
const now = Date.parse('2026-11-08T20:00:00Z');
const end = Date.parse('2027-11-08T20:00:00Z');
const paidThrough = Date.parse('2026-12-08T20:00:00Z');
const env = { GIGTAX_STRIPE_SECRET_KEY: 'sk_live_synthetic', GIGTAX_STRIPE_WEBHOOK_SECRET: 'whsec_synthetic' };
const clone = value => structuredClone(value);
function fixture({ cas = false } = {}) {
  const payment = { live: true, checkoutId: 'cs_synthetic', subscriptionId: 'sub_synthetic', customerId: 'cus_synthetic', invoiceId: 'in_synthetic',
    initialAmountCents: 50000, currency: 'USD', verifiedAt: new Date(now).toISOString(), billingEndsAt: new Date(end).toISOString(), paidThroughAt: new Date(paidThrough).toISOString() };
  let row = { id: 42, status: 'active', contact_email: 'owner@example.test', notes: JSON.stringify({ leadId: '12', signature: 'Synthetic Owner', acceptedAt: new Date(now).toISOString(),
    terms: { hash: 'a'.repeat(64) }, checkoutId: 'cs_synthetic', payment, billing: initialBilling(payment, now) }) };
  const subscription = { id: 'sub_synthetic', livemode: true, customer: 'cus_synthetic', status: 'active', metadata: { gigtax_enrollment: '42', terms_hash: 'a'.repeat(64) },
    cancel_at: end / 1000, latest_invoice: 'in_synthetic', items: { has_more: false, data: [{ id: 'si_synthetic', quantity: 1, current_period_end: paidThrough / 1000,
      price: { unit_amount: 30000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } } }] } };
  const invoice = { id: 'in_synthetic', livemode: true, customer: 'cus_synthetic', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_synthetic' } },
    status: 'paid', billing_reason: 'subscription_create', collection_method: 'charge_automatically', currency: 'usd', amount_paid: 50000, amount_remaining: 0,
    pre_payment_credit_notes_amount: 0, post_payment_credit_notes_amount: 0, lines: {has_more:false,data:[{id:'il_synthetic',amount:30000,currency:'usd',quantity:1,
      parent:{type:'subscription_item_details',subscription_item_details:{subscription:'sub_synthetic',subscription_item:'si_synthetic',proration:false}},period:{start:now/1000,end:paidThrough/1000}}]} };
  const allocation = { id: 'inpay_synthetic', livemode:true, currency:'usd', invoice: 'in_synthetic', status: 'paid', amount_paid: 50000, payment: { type: 'payment_intent', payment_intent: 'pi_synthetic' } };
  const intent = { id: 'pi_synthetic', livemode: true, customer: 'cus_synthetic', status: 'succeeded', currency: 'usd', latest_charge: 'ch_synthetic' };
  const charge = { id: 'ch_synthetic', livemode: true, customer: 'cus_synthetic', payment_intent: 'pi_synthetic', status: 'succeeded', paid: true,
    amount: 50000, amount_refunded: 0, refunded: false, disputed: false, currency: 'usd' };
  const refund = { id: 're_synthetic', livemode: true, charge: 'ch_synthetic', status: 'succeeded', amount: 50000 };
  const dispute = { id: 'dp_synthetic', livemode: true, charge: 'ch_synthetic', status: 'under_review' };
  const session = { id: 'cs_synthetic', livemode: true, metadata: { gigtax_enrollment: '42', terms_hash: 'a'.repeat(64) }, client_reference_id: '42', status: 'expired', payment_status: 'unpaid' };
  const calls = [], writes = [], invoices = [invoice]; let nextFailure = null, pagination = null;
  const db = {
    async get(kind, key) { assert.equal(kind, 'enrollments'); return String(key) === '42' ? clone(row) : undefined; },
    async patch(kind, key, patch) { assert.equal(kind, 'enrollments'); assert.equal(String(key), '42'); writes.push(clone(patch)); row = { ...row, ...clone(patch) }; return clone(row); },
  };
  if (cas) db.patchIfUnchanged = async (kind, key, expected, patch) => { if (row.notes !== expected) return false; return db.patch(kind, key, patch); };
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method }); assert.equal(options.method, 'GET', 'Lifecycle reconciliation may not modify Stripe.');
    if (nextFailure) { const response = nextFailure; nextFailure = null; return response; }
    const u = new URL(url), path = u.pathname.slice(3);
    if (path === '/subscriptions/sub_synthetic') return Response.json(subscription);
    if (path === '/invoices/in_synthetic') return Response.json(invoice);
    if (path === '/invoices') return Response.json(pagination || { data: invoices, has_more: false });
    if (path === '/invoice_payments') {
      if (u.searchParams.has('payment[payment_intent]')) assert.equal(u.searchParams.get('payment[payment_intent]'), 'pi_synthetic');
      return Response.json({ data: [allocation], has_more: false });
    }
    if (path === '/payment_intents/pi_synthetic') return Response.json(intent);
    if (path === '/charges/ch_synthetic') return Response.json(charge);
    if (path === '/refunds/re_synthetic') return Response.json(refund);
    if (path === '/disputes/dp_synthetic') return Response.json(dispute);
    if (path === '/checkout/sessions/cs_synthetic') return Response.json(session);
    throw new Error('Unexpected synthetic Stripe read: ' + u.pathname);
  };
  const event = (type = 'customer.subscription.updated', eventId = 'evt_synthetic', objectId = 'sub_synthetic') => ({ id: eventId, type, livemode: true, created: 1,
    data: { object: { id: objectId, status: 'malicious_stale_snapshot', metadata: { gigtax_enrollment: '999' } } } });
  return { db, fetcher, calls, writes, subscription, invoice, allocation, intent, charge, refund, dispute, session, invoices, event,
    row: () => clone(row), info: () => JSON.parse(row.notes), replaceInfo: value => { row.notes = JSON.stringify(value); },
    fail: response => { nextFailure = response; }, paginate: value => { pagination = value; } };
}

test('pure eligibility expires the paid month and the fixed term even without webhook delivery', () => {
  const f = fixture();
  assert.equal(enrollmentEligibility(f.row(), now).eligible, true);
  assert.equal(enrollmentEligibility(f.row(), paidThrough).status, 'past_due');
  assert.equal(enrollmentEligibility(f.row(), end).status, 'expired');
  const info = f.info(); delete info.payment.paidThroughAt; delete info.billing; f.replaceInfo(info);
  assert.equal(enrollmentEligibility(f.row(), now).status, 'payment_review');
  info.payment.live = false; f.replaceInfo(info);
  assert.equal(enrollmentEligibility(f.row(), now).eligible, false);
});
test('initial snapshot never invents a paid period or approves sandbox receipts', () => {
  const f = fixture();
  assert.equal(initialBilling(f.info().payment, now).status, 'active');
  assert.equal(initialBilling({ ...f.info().payment, paidThroughAt: null }, now).status, 'payment_review');
  assert.equal(initialBilling({ ...f.info().payment, live: false }, now).status, 'payment_review');
});
test('canonical invoice, allocation, intent and charge verify a current membership with provider GET only', async () => {
  const f = fixture(); const result = await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now });
  assert.equal(result.status, 'active'); assert(result.eligible); assert.equal(f.writes.length, 1);
  assert.equal(f.info().billing.verification, 'canonical_stripe'); assert(f.calls.every(call => call.method === 'GET'));
});
test('failed payment suspends eligibility and a later canonical paid invoice restores it', async () => {
  const f = fixture(); f.subscription.status = 'past_due';
  assert.equal((await reconcileBilling(env, f.db, f.event('invoice.payment_failed', 'evt_failure', 'in_synthetic'), { fetcher: f.fetcher, now })).status, 'past_due');
  assert.equal(enrollmentEligibility(f.row(), now).eligible, false);
  f.subscription.status = 'active';
  assert.equal((await reconcileBilling(env, f.db, f.event('invoice.paid', 'evt_recovery', 'in_synthetic'), { fetcher: f.fetcher, now })).status, 'active');
});
test('an older failure payload cannot override current paid provider state, including equal timestamps', async () => {
  const f = fixture();
  const recovered = f.event('invoice.paid', 'evt_new', 'in_synthetic');
  const oldFailure = f.event('invoice.payment_failed', 'evt_old', 'in_synthetic');
  await reconcileBilling(env, f.db, recovered, { fetcher: f.fetcher, now });
  const result = await reconcileBilling(env, f.db, oldFailure, { fetcher: f.fetcher, now });
  assert.equal(result.status, 'active'); assert.deepEqual(f.info().billing.processedEventIds, ['evt_new', 'evt_old']);
});
test('duplicate event ID produces no second enrollment write', async () => {
  const f = fixture(), event = f.event();
  await reconcileBilling(env, f.db, event, { fetcher: f.fetcher, now });
  const result = await reconcileBilling(env, f.db, event, { fetcher: f.fetcher, now });
  assert.equal(result.duplicate, true); assert.equal(f.writes.length, 1);
});
test('current cancellation defeats stale active snapshots and term expiry defeats active subscriptions', async () => {
  const f = fixture(); f.subscription.status = 'canceled';
  assert.equal((await reconcileBilling(env, f.db, f.event(), { fetcher: f.fetcher, now })).status, 'canceled');
  f.subscription.status = 'active';
  assert.equal((await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now: end })).status, 'expired');
});
test('modern refund linkage uses invoice payments and full refunds cannot be reactivated by invoice.paid', async () => {
  const f = fixture(); f.charge.amount_refunded = 50000; f.charge.refunded = true;
  const result = await reconcileBilling(env, f.db, f.event('refund.updated', 'evt_refund', 're_synthetic'), { fetcher: f.fetcher, now });
  assert.equal(result.status, 'refunded'); assert.equal(f.info().billing.holds[0].chargeId, 'ch_synthetic');
  assert(f.calls.some(call => new URL(call.url).searchParams.has('payment[payment_intent]')));
  f.charge.amount_refunded = 0; f.charge.refunded = false;
  await reconcileBilling(env, f.db, f.event('invoice.paid', 'evt_paid_after_refund', 'in_synthetic'), { fetcher: f.fetcher, now });
  assert.equal(enrollmentEligibility(f.row(), now).status, 'refunded', 'A refund hold requires explicit review rather than automatic reactivation.');
});
test('partial refunds, pending refunds and disputes require owner review without issuing provider mutations', async () => {
  for (const type of ['partial', 'pending', 'dispute']) {
    const f = fixture(); let event;
    if (type === 'partial') { f.charge.amount_refunded = 1000; event = f.event('charge.refunded', 'evt_partial', 'ch_synthetic'); }
    if (type === 'pending') { f.refund.status = 'pending'; event = f.event('refund.created', 'evt_pending', 're_synthetic'); }
    if (type === 'dispute') event = f.event('charge.dispute.created', 'evt_dispute', 'dp_synthetic');
    const result = await reconcileBilling(env, f.db, event, { fetcher: f.fetcher, now });
    assert.equal(result.status, 'payment_review'); assert.equal(enrollmentEligibility(f.row(), now).eligible, false);
  }
});
test('reconciliation discovers an older refunded invoice even when the triggering event is unrelated', async () => {
  const f = fixture(); f.charge.amount_refunded = 50000; f.charge.refunded = true;
  assert.equal((await reconcileBilling(env, f.db, f.event(), { fetcher: f.fetcher, now })).status, 'refunded');
});
test('foreign subscription/customer/mode and invoice identities fail without local writes', async () => {
  for (const kind of ['subscription', 'customer', 'mode', 'invoice']) {
    const f = fixture();
    if (kind === 'subscription') f.subscription.metadata.terms_hash = 'b'.repeat(64);
    if (kind === 'customer') f.subscription.customer = 'cus_foreign';
    if (kind === 'mode') f.subscription.livemode = false;
    if (kind === 'invoice') f.invoice.parent.subscription_details.subscription = 'sub_foreign';
    await assert.rejects(reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })); assert.equal(f.writes.length, 0);
  }
});
test('changed amount, billing end, collection pause or recurring interval removes eligibility', async () => {
  for (const kind of ['amount', 'end', 'pause', 'interval']) {
    const f = fixture();
    if (kind === 'amount') f.subscription.items.data[0].price.unit_amount = 1;
    if (kind === 'end') f.subscription.cancel_at = end / 1000 + 1;
    if (kind === 'pause') f.subscription.pause_collection = { behavior: 'void' };
    if (kind === 'interval') f.subscription.items.data[0].price.recurring.interval = 'year';
    assert.equal((await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })).status, 'payment_review');
  }
});
test('manually marked paid, credits, wrong invoice amount, unpaid allocation and unrelated charge never grant access', async () => {
  for (const kind of ['manual', 'credit', 'amount', 'allocation', 'intent', 'charge']) {
    const f = fixture();
    if (kind === 'manual') f.invoice.paid_out_of_band = true;
    if (kind === 'credit') f.invoice.post_payment_credit_notes_amount = 1000;
    if (kind === 'amount') f.invoice.amount_paid = 30000;
    if (kind === 'allocation') f.allocation.status = 'open';
    if (kind === 'intent') f.intent.customer = 'cus_unrelated';
    if (kind === 'charge') f.charge.payment_intent = 'pi_unrelated';
    assert.equal((await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })).eligible, false);
  }
});
test('a paid latest invoice cannot hide an earlier outstanding membership invoice', async () => {
  const f = fixture(); f.invoices.push({ ...clone(f.invoice), id: 'in_unpaid', status: 'open', amount_paid: 0, amount_remaining: 30000 });
  assert.equal((await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })).status, 'past_due');
});
test('provider errors and truncated pagination fail without overwriting stored billing state', async () => {
  const f = fixture(); f.fail(Response.json({ error: 'synthetic failure' }, { status: 503 }));
  await assert.rejects(reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })); assert.equal(f.writes.length, 0);
  f.paginate({ data: [], has_more: true });
  await assert.rejects(reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now }), /truncated history/); assert.equal(f.writes.length, 0);
});
test('expired checkout is recorded without activation, and delayed expiry cannot overwrite a paid canonical session', async () => {
  const f = fixture(); const info = f.info(); delete info.payment; delete info.billing; f.replaceInfo(info);
  const event = f.event('checkout.session.expired', 'evt_expired', 'cs_synthetic');
  assert.equal((await reconcileBilling(env, f.db, event, { fetcher: f.fetcher, now })).status, 'checkout_expired');
  assert.equal(enrollmentEligibility(f.row(), now).eligible, false);
  const g = fixture(); const unsignedInfo = g.info(); delete unsignedInfo.payment; delete unsignedInfo.billing; g.replaceInfo(unsignedInfo);
  g.session.status = 'complete'; g.session.payment_status = 'paid';
  assert.equal((await reconcileBilling(env, g.db, event, { fetcher: g.fetcher, now })).pendingInitial, true); assert.equal(g.writes.length, 0);
});
test('missing live credentials and foreign event modes cannot mutate enrollment', async () => {
  const f = fixture();
  await assert.rejects(reconcileEnrollment({}, f.db, '42', { fetcher: f.fetcher, now }), /not configured/);
  const event = f.event(); event.livemode = false;
  assert.equal((await reconcileBilling(env, f.db, event, { fetcher: f.fetcher, now })).ignored, 'mode');
  assert.equal(f.writes.length, 0);
});
test('CAS is used when available and a conflict returns retry without unconditional fallback', async () => {
  const f = fixture({ cas: true });
  assert.equal((await reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now })).status, 'active');
  f.db.patchIfUnchanged = async () => false;
  await assert.rejects(reconcileEnrollment(env, f.db, '42', { fetcher: f.fetcher, now }), /Concurrent billing/); assert.equal(f.writes.length, 1);
});
test('signed webhook dispatches billing reconciliation; unsigned delivery never reaches provider or storage', async () => {
  const f = fixture(); f.subscription.status = 'canceled';
  const handler = createWebhookHandler(env, f.db, { fetcher: f.fetcher, now });
  async function request(signature) {
    const raw = JSON.stringify(f.event('customer.subscription.deleted', 'evt_signed'));
    const t = String(Math.floor(Date.now() / 1000));
    const req = Readable.from([Buffer.from(raw)]); req.method = 'POST';
    req.headers = { 'stripe-signature': signature || `t=${t},v1=${createHmac('sha256', env.GIGTAX_STRIPE_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest('hex')}` };
    let response; await handler(req, { setHeader() {}, statusCode: 0, end(body) { response = { status: this.statusCode, body: JSON.parse(body) }; } }); return response;
  }
  assert.equal((await request('invalid')).status, 400); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
  assert.equal((await request()).status, 200); assert.equal(f.info().billing.status, 'canceled');
  assert(BILLING_EVENTS.has('invoice.payment_failed'));
});

test('renewal extends only the billing period explicitly covered by its paid recurring invoice line',async()=>{
  const f=fixture(), renewed=Date.parse('2027-01-08T20:00:00Z');
  f.subscription.items.data[0].current_period_end=renewed/1000;
  assert.equal((await reconcileEnrollment(env,f.db,'42',{fetcher:f.fetcher,now})).eligible,false,'An old paid invoice cannot fund a new period.');
  f.invoice.billing_reason='subscription_cycle';f.invoice.amount_paid=30000;f.allocation.amount_paid=30000;f.charge.amount=30000;
  f.invoice.lines.data[0].period.end=renewed/1000;
  const result=await reconcileEnrollment(env,f.db,'42',{fetcher:f.fetcher,now});
  assert(result.eligible);assert.equal(f.info().billing.paidThroughAt,new Date(renewed).toISOString());
});

test('an active billing snapshot cannot publish a pending or canceled enrollment row',()=>{
  const f=fixture();
  for(const status of ['payment_pending','canceled','checkout_expired']){
    assert.equal(enrollmentEligibility({...f.row(),status},now).eligible,false);
  }
});

test('a cancellation written while provider reads are pending defeats a stale active reconciliation',async()=>{
  const f=fixture({cas:true});let changed=false;
  const fetcher=async(url,options)=>{const response=await f.fetcher(url,options);
    if(!changed&&new URL(url).pathname.endsWith('/charges/ch_synthetic')){changed=true;
      const saved=f.info();saved.billing.status='canceled';saved.billing.reason='Synthetic concurrent cancellation';
      await f.db.patch('enrollments','42',{status:'canceled',notes:JSON.stringify(saved)});
    }return response;};
  await assert.rejects(reconcileEnrollment(env,f.db,'42',{fetcher,now}),/changed during provider verification/);
  assert.equal(f.row().status,'canceled');assert.equal(enrollmentEligibility(f.row(),now).eligible,false);
  assert.equal(f.writes.length,1,'Only the competing cancellation may write.');
});
