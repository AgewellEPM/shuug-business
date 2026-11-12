import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revenueSummary } from './revenue.mjs';
import { agreement } from './terms.mjs';
import { initialBilling } from './billing.mjs';
import { contactFixture } from '../scripts/sales/contact-fixture.mjs';

const now = Date.parse('2026-11-12T12:00:00Z'), paidAt = '2026-10-01T12:00:00Z';
const terms = agreement({ business: 'SYNTHETIC COMMISSION TEST', cancellation: 'Synthetic only, no payment or payout.', approved: true });
const owner = { id: 'owner', role: 'owner', states: [] }, agent = { id: 'agent-a', role: 'agent', states: ['CT'] };
function sample(count = 10, { paid = true, recurring = false } = {}) {
  const offices = [], enrollments = [];
  for (let n = 1; n <= count; n++) {
    offices.push({ id: String(n), state: 'CT', assigned_to: agent.id, status: paid ? 'active' : 'invited' });
    const payment = { live: true, checkoutId: `cs_${n}`, subscriptionId: `sub_${n}`, customerId: `cus_${n}`, invoiceId: `in_initial${n}`,
      initialAmountCents: 50000, currency: 'USD', verifiedAt: paidAt, billingEndsAt: '2027-10-01T12:00:00Z', paidThroughAt: '2026-11-01T12:00:00Z' };
    const billing = initialBilling(payment, Date.parse(paidAt));
    if (recurring) Object.assign(billing, { verification: 'canonical_stripe', invoiceId: `in_cycle${n}`, paidThroughAt: '2026-12-01T12:00:00Z', verifiedInvoices: [
      { id: payment.invoiceId, subscriptionId: payment.subscriptionId, kind: 'subscription_create', amountCents: 50000, currency: 'USD', verification: 'canonical_stripe' },
      { id: `in_cycle${n}`, subscriptionId: payment.subscriptionId, kind: 'subscription_cycle', amountCents: 30000, currency: 'USD', verification: 'canonical_stripe' },
    ] });
    enrollments.push({ id: String(n + 100), status: paid ? 'active' : 'payment_pending', notes: JSON.stringify({ leadId: String(n), agentId: agent.id, signature: 'Synthetic owner', acceptedAt: paidAt, terms, ...(paid ? { payment, billing } : {}) }) });
  }
  return { offices, enrollments, read: (user = agent) => revenueSummary(user, offices, enrollments, terms, now) };
}
const change = (row, work) => { const info = JSON.parse(row.notes); work(info); row.notes = JSON.stringify(info); };

test('unpaid signatures show pending signup commission and sales value, with zero earned', () => {
  const f = sample(10, { paid: false }), result = f.read();
  assert.equal(result.signedRevenueCents, 3800000); assert.equal(result.commission.earnedCents, 0);
  assert.equal(result.commission.pendingSignupCents, 100000); assert.equal(result.commission.potentialMonthlyCents, 50000);
  assert.equal(result.commission.milestoneOffices, 0);
  change(f.enrollments[0], info => { delete info.signature; }); assert.equal(f.read().signedOffices, 9);
});
test('ten live paid offices earn $1,000 signup plus $2,000 once, with no first-month residual', () => {
  const f = sample(), result = f.read();
  assert.equal(result.commission.earnedCents, 300000); assert.equal(result.commission.residualEarnedCents, 0);
  assert.equal(result.commission.bonusEarnedCents, 200000); assert.equal(result.commission.paidOffices, 10);
  const twenty = sample(20).read(); assert.equal(twenty.commission.bonusEarnedCents, 200000);
});
test('month-two receipts add $500 once; duplicate invoices and refunds cannot inflate commissions', () => {
  const f = sample(10, { recurring: true });
  for (const row of f.enrollments) change(row, info => info.billing.verifiedInvoices.push(info.billing.verifiedInvoices[1]));
  assert.equal(f.read().commission.earnedCents, 350000); assert.equal(f.read().commission.monthlyResidualCents, 50000);
  change(f.enrollments[0], info => info.billing.holds.push({ status: 'refunded' }));
  assert.equal(f.read().commission.earnedCents, 135000); assert.equal(f.read().commission.monthlyResidualCents, 45000);
  change(f.enrollments[1], info => { info.payment.live = false; }); assert.equal(f.read().commission.paidOffices, 8);
});
test('bonuses are per agent; historical credit survives office reassignment without exposing former office details', () => {
  const f = sample();
  for (const row of f.enrollments.slice(6)) change(row, info => { info.agentId = 'agent-b'; });
  assert.equal(f.read(owner).commission.bonusEarnedCents, 0); assert.equal(f.read().commission.paidOffices, 6);
  f.offices.forEach(row => { row.assigned_to = 'agent-b'; });
  const result = f.read(); assert.equal(result.signedRevenueCents, 0); assert.equal(result.commission.earnedCents, 60000);
  assert(!JSON.stringify(result).includes('in_initial')); assert(!JSON.stringify(result).includes('Synthetic owner'));
  assert.equal(f.read({ id: 'unrelated', role: 'agent', states: ['CT'] }).commission.earnedCents, 0);
});
test('owner preparing for an assigned agent credits that agent in the real service bootstrap', async () => {
  const f = contactFixture(); f.db.terms = async () => terms;
  const created = await f.app.dispatch(f.owner, 'create-agent', { name: 'Synthetic Commission Agent', email: 'agent@example.test', states: ['CT'] });
  const office = await f.createOffice({ assignedTo: created.agent.id, contact: 'Synthetic Owner', email: 'owner@example.test' });
  await f.app.dispatch(f.owner, 'verify-office', { id: office.id, finding: 'independent', reviewed: true, sourceURL: 'https://example.test/team', note: 'Synthetic only.' });
  await f.app.dispatch(f.owner, 'invite', { id: office.id, ownerName: 'Synthetic Owner', email: 'owner@example.test' });
  assert.equal(JSON.parse(f.rows.enrollments[0].notes).agentId, String(created.agent.id));
  const read = await f.app.dispatch(f.owner, 'bootstrap'); assert.equal(read.revenue.commission.earnedCents, 0);
});
test('missing acceptance and a receipt copied to a second office cannot create earned credit', () => {
  const f = sample(2);
  change(f.enrollments[1], info => { info.agentId = 'agent-b'; info.payment.invoiceId = 'in_initial1'; });
  assert.equal(f.read(owner).commission.paidOffices, 1);
  assert.equal(f.read({ id: 'agent-b', role: 'agent', states: [] }).commission.earnedCents, 0);
  change(f.enrollments[0], info => { delete info.acceptedAt; });
  assert.equal(f.read().commission.earnedCents, 0);
});
