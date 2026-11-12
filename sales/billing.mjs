import { HttpError, metadata } from './model.mjs';

// Stripe does not order webhook deliveries. IDs deduplicate deliveries; every
// decision below reads current provider objects instead of trusting snapshots.
// https://docs.stripe.com/webhooks#event-ordering
// Refund linkage on modern API versions uses invoice_payments, not charge.invoice.
// https://docs.stripe.com/billing/subscriptions/webhooks#handle-refunds-and-disputes
export const BILLING_EVENTS = new Set([
  'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed',
  'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed', 'invoice.payment_action_required',
  'invoice.finalization_failed', 'invoice.marked_uncollectible', 'invoice.voided',
  'checkout.session.expired', 'checkout.session.async_payment_failed',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
]);
const id = value => typeof value === 'string' ? value : value?.id;
const seconds = value => Number.isInteger(value) && value > 0 ? value : 0;
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const iso = value => value > 0 ? new Date(value).toISOString() : null;
const priorHolds = info => Array.isArray(info.billing?.holds) ? info.billing.holds : [];
const checkId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[a-zA-Z0-9_]+$`).test(value);
const statusResult = (status, reason) => ({ eligible: status === 'active', status, reason });
const initialPaymentValid = payment => payment?.live === true && payment.initialAmountCents === 50000 && payment.currency === 'USD' &&
  checkId(payment.checkoutId, 'cs') && checkId(payment.subscriptionId, 'sub') && checkId(payment.customerId, 'cus') &&
  checkId(payment.invoiceId, 'in') && instant(payment.verifiedAt) > 0;

/** Pure initial snapshot. A paid year is never inferred from a single payment. */
export function initialBilling(payment, now = Date.now()) {
  const end = instant(payment?.billingEndsAt), paid = instant(payment?.paidThroughAt);
  const ready = initialPaymentValid(payment) && end > now && paid > now && paid <= end;
  return { version: 1, status: ready ? 'active' : 'payment_review',
    reason: ready ? 'Initial live payment and paid billing period verified.' : 'The initial paid billing period needs verification.',
    live: payment?.live === true, subscriptionId: payment?.subscriptionId || null, customerId: payment?.customerId || null,
    invoiceId: payment?.invoiceId || null, paidThroughAt: iso(Math.min(paid, end)), termEndsAt: payment?.billingEndsAt || null,
    checkedAt: payment?.verifiedAt || iso(now), verification: 'initial_checkout', processedEventIds: [], holds: [] };
}

/** No provider requests or writes. Used by the public directory and receipts. */
export function enrollmentEligibility(row, now = Date.now()) {
  let info; try { info = metadata(row || {}); } catch { return statusResult('payment_review', 'Saved enrollment details need review.'); }
  if (!info.acceptedAt || !info.signature || info.payment?.live !== true) return statusResult('payment_pending', 'A signed live payment is required.');
  if (!initialPaymentValid(info.payment)) return statusResult('payment_review', 'The initial payment receipt needs verification.');
  const end = instant(info.payment.billingEndsAt);
  if (!end) return statusResult('payment_review', 'The membership end has not been verified.');
  if (now >= end) return statusResult('expired', 'The agreed 12-month membership has ended.');
  const billing = info.billing;
  const hold = priorHolds(info).find(item => ['refunded', 'payment_review'].includes(item.status));
  if (hold) return statusResult(hold.status, hold.reason || 'A payment adjustment needs owner review.');
  if (row.status !== 'active') return statusResult(row.status || 'payment_pending', 'This enrollment has not completed activation.');
  const status = billing?.status || row.status;
  if (status !== 'active') return statusResult(status || 'payment_pending', billing?.reason || 'This enrollment is not active.');
  const paid = instant(billing?.paidThroughAt || info.payment.paidThroughAt);
  if (!paid) return statusResult('payment_review', 'A current paid billing period has not been verified.');
  if (now >= Math.min(paid, end)) return statusResult('past_due', 'The verified paid billing period has ended.');
  return statusResult('active', 'Live membership is paid through the current billing period.');
}

function provider(env, fetcher) {
  return async (route, query = {}) => {
    if (!/^sk_(live|test)_/.test(env.GIGTAX_STRIPE_SECRET_KEY || '')) throw new HttpError(503, 'Stripe billing reconciliation is not configured.');
    const url = new URL('https://api.stripe.com/v1' + route);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
    const response = await fetcher(url.href, { method: 'GET', headers: { Authorization: `Bearer ${env.GIGTAX_STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2026-10-28.endive' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    const value = await response.json().catch(() => null);
    if (!response.ok || !value || typeof value !== 'object') throw new HttpError(502, 'Stripe did not confirm the current billing state. Retry reconciliation.');
    return value;
  };
}
function invoiceSubscription(invoice) {
  return id(invoice?.parent?.type === 'subscription_details' ? invoice.parent.subscription_details?.subscription : invoice?.subscription);
}
function assertMode(object, live) {
  if (object?.livemode !== live) throw new HttpError(409, 'The provider mode does not match this enrollment.');
}
async function listAll(get, route, query = {}) {
  const values = []; let after;
  // Fixed 12-month memberships should be far below this bound. Never silently
  // omit later pages when linking a refund or assessing outstanding invoices.
  for (let page = 0; page < 10; page++) {
    const result = await get(route, { ...query, limit: 100, ...(after ? { starting_after: after } : {}) });
    if (!Array.isArray(result.data)) throw new HttpError(502, 'Stripe returned an incomplete billing list.');
    values.push(...result.data);
    if (!result.has_more) return values;
    after = result.data.at(-1)?.id;
    if (!after) break;
  }
  throw new HttpError(502, 'The billing history needs owner review; no truncated history was accepted.');
}
function validateSubscription(sub, row, info, live) {
  assertMode(sub, live);
  if (!checkId(sub.id, 'sub') || sub.id !== info.payment?.subscriptionId || id(sub.customer) !== info.payment?.customerId ||
      sub.metadata?.gigtax_enrollment !== String(row.id) || sub.metadata?.terms_hash !== info.terms?.hash) {
    throw new HttpError(409, 'The subscription identity does not match the saved enrollment.');
  }
}
function fixedPrice(sub) {
  const items = sub.items?.data;
  return Array.isArray(items) && !sub.items.has_more && items.length === 1 && items[0].quantity === 1 &&
    items[0].price?.unit_amount === 30000 && items[0].price?.currency === 'usd' &&
    items[0].price?.recurring?.interval === 'month' && items[0].price?.recurring?.interval_count === 1;
}
function invoiceIdentity(invoice, sub, live) {
  assertMode(invoice, live);
  if (!checkId(invoice.id, 'in') || invoiceSubscription(invoice) !== sub.id || id(invoice.customer) !== id(sub.customer)) {
    throw new HttpError(409, 'The invoice identity does not match this membership.');
  }
}
function chargeHold(charge, invoiceId) {
  if (charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount)) {
    return { status: 'refunded', reason: 'A membership payment was refunded; owner review is required.', chargeId: charge.id, invoiceId, amountCents: charge.amount_refunded };
  }
  if (charge.amount_refunded > 0 || charge.disputed === true) {
    return { status: 'payment_review', reason: charge.disputed ? 'A membership charge has a dispute; owner review is required.' : 'A membership payment was partially refunded; owner review is required.',
      chargeId: charge.id, invoiceId, amountCents: charge.amount_refunded || 0 };
  }
  return null;
}
function paidPeriodEnd(invoice, sub) {
  const item = sub.items?.data?.[0];
  const lines = invoice.lines?.data || [];
  const recurring = lines.filter(line => id(line.parent?.subscription_item_details?.subscription || line.subscription) === sub.id &&
    id(line.parent?.subscription_item_details?.subscription_item || line.subscription_item) === item?.id &&
    line.parent?.subscription_item_details?.proration !== true && line.proration !== true &&
    line.amount === 30000 && line.currency === 'usd' && line.quantity === 1);
  if (recurring.length !== 1) return 0;
  return seconds(recurring[0].period?.end) * 1000;
}
async function paidInvoice(get, invoice, sub, live, holds) {
  invoiceIdentity(invoice, sub, live);
  const expected = invoice.billing_reason === 'subscription_create' ? 50000 : 30000;
  if (invoice.status !== 'paid' || invoice.currency !== 'usd' || invoice.amount_paid !== expected || invoice.amount_remaining !== 0 ||
      invoice.collection_method !== 'charge_automatically' || invoice.paid_out_of_band === true || invoice.amount_paid_off_stripe > 0 ||
      invoice.post_payment_credit_notes_amount > 0 || invoice.pre_payment_credit_notes_amount > 0) return false;
  if (invoice.lines?.has_more) invoice.lines = { data: await listAll(get, '/invoices/' + invoice.id + '/lines'), has_more: false };
  if (!paidPeriodEnd(invoice, sub)) return false;
  const payments = await listAll(get, '/invoice_payments', { invoice: invoice.id, status: 'paid' });
  let paid = 0;
  for (const payment of payments) {
    if (payment.livemode !== live || payment.currency !== 'usd' || payment.status !== 'paid' || id(payment.invoice) !== invoice.id || payment.payment?.type !== 'payment_intent' || !checkId(id(payment.payment.payment_intent), 'pi')) continue;
    const intent = await get('/payment_intents/' + id(payment.payment.payment_intent));
    assertMode(intent, live);
    if (intent.status !== 'succeeded' || intent.currency !== 'usd' || id(intent.customer) !== id(sub.customer) || !checkId(id(intent.latest_charge), 'ch')) continue;
    const charge = await get('/charges/' + id(intent.latest_charge));
    assertMode(charge, live);
    if (id(charge.payment_intent) !== intent.id || id(charge.customer) !== id(sub.customer) || charge.currency !== 'usd' || charge.paid !== true || charge.status !== 'succeeded') continue;
    const hold = chargeHold(charge, invoice.id); if (hold) holds.push(hold);
    // InvoicePayment records allocate an intent's amount to an invoice. Avoid
    // counting the same charge's full amount across several invoice allocations.
    if (Number.isInteger(payment.amount_paid) && payment.amount_paid > 0 && payment.amount_paid <= charge.amount) paid += payment.amount_paid;
  }
  return paid === expected;
}
function mergeHolds(...groups) {
  const values = new Map();
  for (const hold of groups.flat()) if (hold && ['refunded', 'payment_review'].includes(hold.status)) {
    const key = [hold.chargeId || '', hold.invoiceId || '', hold.reason || ''].join('|');
    const before = values.get(key);
    if (!before || hold.status === 'refunded') values.set(key, hold);
  }
  return [...values.values()];
}
function heldState(holds) {
  const hold = holds.find(item => item.status === 'refunded') || holds[0];
  return hold ? { status: hold.status, reason: hold.reason } : null;
}
async function snapshot(get, row, info, now, live) {
  const sub = await get('/subscriptions/' + info.payment.subscriptionId);
  validateSubscription(sub, row, info, live);
  const end = instant(info.payment.billingEndsAt), periodEnd = seconds(sub.items?.data?.[0]?.current_period_end || sub.current_period_end) * 1000;
  const result = { version: 1, live, subscriptionId: sub.id, customerId: id(sub.customer), subscriptionStatus: sub.status,
    invoiceId: id(sub.latest_invoice) || null, termEndsAt: info.payment.billingEndsAt, paidThroughAt: iso(Math.min(periodEnd, end)),
    checkedAt: iso(now), verification: 'canonical_stripe', holds: [] };
  if (!end || end <= now) return { ...result, status: 'expired', reason: 'The agreed 12-month membership has ended.' };
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return { ...result, status: 'canceled', reason: 'Stripe confirms that this subscription ended.' };
  if (['past_due', 'unpaid', 'incomplete'].includes(sub.status)) return { ...result, status: 'past_due', reason: 'Stripe has not confirmed the required subscription payment.' };
  if (sub.status !== 'active' || sub.pause_collection || !fixedPrice(sub) || seconds(sub.cancel_at) * 1000 !== end || !periodEnd) {
    return { ...result, status: 'payment_review', reason: 'The subscription no longer matches the agreed monthly membership.' };
  }
  const invoices = await listAll(get, '/invoices', { subscription: sub.id });
  result.verifiedInvoices = [];
  let currentPaid = false, unresolved = false;
  for (const invoice of invoices) {
    invoiceIdentity(invoice, sub, live);
    if (invoice.status === 'paid') {
      const confirmed = await paidInvoice(get, invoice, sub, live, result.holds);
      if (confirmed && ['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason)) result.verifiedInvoices.push({
        id: invoice.id, subscriptionId: sub.id, kind: invoice.billing_reason, amountCents: invoice.amount_paid,
        currency: 'USD', verification: 'canonical_stripe' });
      if (!confirmed) unresolved = true;
      if (invoice.id === result.invoiceId) currentPaid = confirmed && paidPeriodEnd(invoice, sub) === periodEnd;
    } else if (invoice.amount_remaining > 0 || ['uncollectible', 'void'].includes(invoice.status) || invoice.last_finalization_error) unresolved = true;
  }
  if (result.holds.length) return { ...result, ...heldState(result.holds) };
  if (!currentPaid || unresolved) return { ...result, status: 'past_due', reason: 'All required membership invoices have not been verified as paid.' };
  if (periodEnd <= now) return { ...result, status: 'past_due', reason: 'The verified paid billing period has ended.' };
  return { ...result, status: 'active', reason: 'Canonical subscription and membership payments are current.' };
}

async function persist(db, row, computed, event, now) {
  // Re-read to preserve concurrent office acceptance / refund holds. Atomic CAS
  // is used when available; unconditional adapters still have a distributed
  // race window and must not be described as transaction-safe.
  const latest = await db.get('enrollments', row.id), info = metadata(latest);
  const processed = Array.isArray(info.billing?.processedEventIds) ? info.billing.processedEventIds : [];
  if (event && processed.includes(event.id)) return { handled: true, enrollmentId: String(row.id), status: info.billing.status, duplicate: true };
  if (latest.notes !== row.notes || latest.status !== row.status) throw new HttpError(409, 'The enrollment changed during provider verification. Retry reconciliation.');
  const original = metadata(row);
  if (JSON.stringify(info.payment) !== JSON.stringify(original.payment) || info.terms?.hash !== original.terms?.hash) throw new HttpError(409, 'The enrollment changed during reconciliation. Retry.');
  const holds = mergeHolds(priorHolds(info), computed.holds || []);
  const held = heldState(holds);
  const billing = { ...computed, ...(computed.verifiedInvoices || !info.billing?.verifiedInvoices ? {} : { verifiedInvoices: info.billing.verifiedInvoices }), ...(held || {}), holds, processedEventIds: [...processed, ...(event ? [event.id] : [])].slice(-128),
    ...(event ? { lastEvent: { id: event.id, type: event.type } } : {}) };
  const candidate = { ...latest, status: billing.status, notes: JSON.stringify({ ...info, billing }) };
  const eligibility = enrollmentEligibility(candidate, now);
  candidate.status = eligibility.status; billing.status = eligibility.status; billing.reason = eligibility.reason;
  candidate.notes = JSON.stringify({ ...info, billing });
  const patch = { status: candidate.status, notes: candidate.notes };
  if (typeof db.patchIfUnchanged === 'function') {
    const changed = await db.patchIfUnchanged('enrollments', latest.id, latest.notes, patch);
    if (!changed || changed.matched === false) throw new HttpError(409, 'Concurrent billing change; retry reconciliation.');
  } else await db.patch('enrollments', latest.id, patch);
  return { handled: true, enrollmentId: String(row.id), status: candidate.status, duplicate: false, eligible: eligibility.eligible };
}

/** Provider reads + local enrollment update only; never charges, cancels or refunds. */
export async function reconcileEnrollment(env, db, enrollmentId, options = {}) {
  const now = options.now ?? Date.now(), row = await db.get('enrollments', enrollmentId);
  if (!row) return { handled: false, reason: 'Enrollment not found.' };
  const info = metadata(row), event = options.event;
  if (event && info.billing?.processedEventIds?.includes(event.id)) return { handled: true, enrollmentId: String(row.id), status: info.billing.status, duplicate: true };
  if (!info.acceptedAt || !info.signature || info.payment?.live !== true || !checkId(info.payment.subscriptionId, 'sub') || !checkId(info.payment.customerId, 'cus')) {
    return { handled: true, enrollmentId: String(row.id), status: row.status, pendingInitial: true };
  }
  const live = /^sk_live_/.test(env.GIGTAX_STRIPE_SECRET_KEY || '');
  if (!live) throw new HttpError(503, 'Live Stripe billing reconciliation is not configured.');
  const computed = await snapshot(provider(env, options.fetcher || fetch), row, info, now, live);
  computed.holds = mergeHolds(computed.holds, options.holds || []);
  return persist(db, row, computed, event, now);
}

async function enrollmentFromSubscription(get, db, subscriptionId, live) {
  if (!checkId(subscriptionId, 'sub')) return null;
  const sub = await get('/subscriptions/' + subscriptionId);
  assertMode(sub, live);
  const enrollmentId = sub.metadata?.gigtax_enrollment;
  if (!/^\d+$/.test(String(enrollmentId || ''))) return null;
  const row = await db.get('enrollments', enrollmentId);
  if (!row) return null;
  const info = metadata(row);
  if (info.payment?.subscriptionId && info.payment.subscriptionId !== sub.id) throw new HttpError(409, 'The provider event references a different enrollment subscription.');
  return String(row.id);
}

/** Called only after raw-body webhook signature verification. Payload data is a locator. */
export async function reconcileBilling(env, db, event, options = {}) {
  if (!BILLING_EVENTS.has(event?.type)) return { handled: false };
  if (!checkId(event.id, 'evt') || !event.data?.object) throw new HttpError(400, 'Invalid billing event.');
  const live = /^sk_live_/.test(env.GIGTAX_STRIPE_SECRET_KEY || '');
  if (event.livemode !== live) return { handled: true, ignored: 'mode' };
  const get = provider(env, options.fetcher || fetch), objectId = event.data.object.id;
  if (event.type.startsWith('checkout.session.')) {
    if (!checkId(objectId, 'cs')) throw new HttpError(400, 'Invalid checkout event.');
    const session = await get('/checkout/sessions/' + objectId); assertMode(session, live);
    const row = await db.get('enrollments', session.metadata?.gigtax_enrollment);
    if (!row) return { handled: false };
    const info = metadata(row);
    if (info.checkoutId !== session.id || session.client_reference_id !== String(row.id) || session.metadata?.terms_hash !== info.terms?.hash) throw new HttpError(409, 'The checkout does not match this enrollment.');
    if (info.payment?.live) return reconcileEnrollment(env, db, row.id, { ...options, event });
    // Delayed expiry/failure snapshots must not overwrite a now-paid session.
    if (session.status === 'complete' && session.payment_status === 'paid') return { handled: true, pendingInitial: true };
    const status = session.status === 'expired' ? 'checkout_expired' : 'payment_pending';
    const latest = await db.get('enrollments', row.id), latestInfo = metadata(latest);
    if (latestInfo.payment?.live) return reconcileEnrollment(env, db, row.id, { ...options, event });
    const processed = latestInfo.billing?.processedEventIds || [];
    if (processed.includes(event.id)) return { handled: true, duplicate: true, enrollmentId: String(row.id), status: latest.status };
    if (latest.notes !== row.notes || latest.status !== row.status) throw new HttpError(409, 'The enrollment changed during checkout verification. Retry reconciliation.');
    const billing = { version: 1, status, reason: status === 'checkout_expired' ? 'Checkout expired without confirmed payment; owner review is required.' : 'Checkout payment has not been confirmed.',
      checkedAt: iso(options.now ?? Date.now()), processedEventIds: [...processed, event.id].slice(-128), holds: [] };
    const patch = { status, notes: JSON.stringify({ ...latestInfo, billing }) };
    if (typeof db.patchIfUnchanged === 'function') {
      const changed = await db.patchIfUnchanged('enrollments', latest.id, latest.notes, patch);
      if (!changed || changed.matched === false) throw new HttpError(409, 'Concurrent checkout change; retry reconciliation.');
    } else await db.patch('enrollments', latest.id, patch);
    return { handled: true, enrollmentId: String(row.id), status, duplicate: false };
  }
  const candidates = new Map();
  if (event.type.startsWith('customer.subscription.')) {
    const enrollmentId = await enrollmentFromSubscription(get, db, objectId, live);
    if (enrollmentId) candidates.set(enrollmentId, []);
  } else if (event.type.startsWith('invoice.')) {
    if (!checkId(objectId, 'in')) throw new HttpError(400, 'Invalid invoice event.');
    const invoice = await get('/invoices/' + objectId); assertMode(invoice, live);
    const enrollmentId = await enrollmentFromSubscription(get, db, invoiceSubscription(invoice), live);
    if (enrollmentId) candidates.set(enrollmentId, []);
  } else {
    let refund, dispute, chargeId = objectId;
    if (event.type.startsWith('refund.')) { if (!checkId(objectId, 're')) throw new HttpError(400, 'Invalid refund event.'); refund = await get('/refunds/' + objectId); assertMode(refund, live); chargeId = id(refund.charge); }
    if (event.type.startsWith('charge.dispute.')) { if (!checkId(objectId, 'dp')) throw new HttpError(400, 'Invalid dispute event.'); dispute = await get('/disputes/' + objectId); assertMode(dispute, live); chargeId = id(dispute.charge); }
    if (!checkId(chargeId, 'ch')) throw new HttpError(400, 'Invalid charge event.');
    const charge = await get('/charges/' + chargeId); assertMode(charge, live);
    if (!checkId(id(charge.payment_intent), 'pi')) return { handled: false };
    const links = await listAll(get, '/invoice_payments', { 'payment[type]': 'payment_intent', 'payment[payment_intent]': id(charge.payment_intent), status: 'paid' });
    for (const link of links) {
      const invoiceId = id(link.invoice); if (!checkId(invoiceId, 'in')) continue;
      const invoice = await get('/invoices/' + invoiceId); assertMode(invoice, live);
      if (id(invoice.customer) !== id(charge.customer)) throw new HttpError(409, 'The payment customer does not match the invoice.');
      const enrollmentId = await enrollmentFromSubscription(get, db, invoiceSubscription(invoice), live);
      if (!enrollmentId) continue;
      const holds = candidates.get(enrollmentId) || [], concern = chargeHold(charge, invoice.id);
      if (concern) holds.push(concern);
      if (dispute || ['pending', 'requires_action'].includes(refund?.status)) holds.push({ status: 'payment_review', reason: dispute ? 'A charge dispute requires owner review.' : 'A refund is pending owner review.', chargeId: charge.id, invoiceId: invoice.id, amountCents: refund?.amount || 0 });
      candidates.set(enrollmentId, holds);
    }
  }
  const results = [];
  for (const [enrollmentId, holds] of candidates) results.push(await reconcileEnrollment(env, db, enrollmentId, { ...options, event, holds }));
  return { handled: results.length > 0, results, ...(results.length === 1 ? results[0] : {}) };
}
