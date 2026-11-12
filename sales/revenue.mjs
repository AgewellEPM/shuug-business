import { metadata, termsValid, visible } from './model.mjs';
import { enrollmentEligibility, initialBilling } from './billing.mjs';

export const COMMISSION_PLAN = Object.freeze({ version: '2026-11-12', signupCents: 10000, residualCents: 5000, residualStartsMonth: 2, bonusCents: 200000, bonusOffices: 10, bonusMode: 'first_ten' });

// Signed contract value is booked sales, not cash collected or agent pay.
// Attribution uses the agent saved on the contract and existing office access.
function price(terms) {
  if (!termsValid(terms) || terms.currency !== 'USD') return null;
  const { totalCents, monthlyCents, signupCents, upfrontCents, termMonths } = terms;
  if (![totalCents, monthlyCents, signupCents, upfrontCents, termMonths].every(Number.isSafeInteger) ||
      monthlyCents <= 0 || signupCents < 0 || termMonths < 1 || termMonths > 120 ||
      totalCents !== monthlyCents * termMonths + signupCents || upfrontCents !== monthlyCents + signupCents) return null;
  return { totalCents, monthlyCents };
}
export function revenueSummary(user, offices, enrollments, terms, now = Date.now()) {
  const allowed = new Map(offices.filter(office => visible(user, office)).map(office => [String(office.id), office]));
  const latest = new Map();
  for (const row of enrollments) {
    const info = metadata(row), office = allowed.get(String(info.leadId));
    const accepted = Date.parse(info.acceptedAt);
    if (!office || (user.role !== 'owner' && String(info.agentId) !== String(user.id)) || !info.signature ||
        !Number.isFinite(accepted) || accepted > now || !price(info.terms)) continue;
    const prior = latest.get(String(office.id));
    if (!prior || Date.parse(metadata(prior).acceptedAt) < accepted ||
        (Date.parse(metadata(prior).acceptedAt) === accepted && Number(prior.id) < Number(row.id))) latest.set(String(office.id), row);
  }
  let signedRevenueCents = 0, activeMonthlyCents = 0, awaitingPaymentCents = 0, signedOffices = 0, activeOffices = 0;
  for (const [officeId, row] of latest) {
    const info = metadata(row), amount = price(info.terms);
    // Ended/refunded/review-held agreements do not inflate current sales totals.
    if (!['payment_pending', 'active', 'past_due'].includes(row.status) ||
        (info.billing?.holds || []).some(hold => ['refunded', 'payment_review'].includes(hold.status))) continue;
    signedRevenueCents += amount.totalCents; signedOffices++;
    if (allowed.get(officeId).status === 'active' && enrollmentEligibility(row, now).eligible) {
      activeMonthlyCents += amount.monthlyCents; activeOffices++;
    } else if (!info.payment?.live) awaitingPaymentCents += amount.totalCents;
  }
  // Aggregate historical credit is retained for the original selling agent even
  // when office access is reassigned. No former-office details are returned.
  const paid = new Map();
  for (const row of enrollments) {
    const info = metadata(row), paidAt = Date.parse(info.payment?.verifiedAt);
    if (!info.agentId || info.agentId === 'owner' || !info.signature || !Number.isFinite(Date.parse(info.acceptedAt)) || Date.parse(info.acceptedAt) > now || !price(info.terms) || !Number.isFinite(paidAt) || paidAt > now ||
        initialBilling(info.payment, paidAt).status !== 'active' ||
        (info.billing?.holds || []).some(hold => ['refunded', 'payment_review'].includes(hold.status)) || ['refunded', 'payment_review'].includes(row.status)) continue;
    const key = String(info.leadId), prior = paid.get(key);
    if (!prior || Date.parse(metadata(prior).payment.verifiedAt) > paidAt) paid.set(key, row);
  }
  const byAgent = new Map(), invoices = new Set(), initialInvoices = new Set();
  let paidOffices = 0, residualEarnedCents = 0, monthlyResidualCents = 0, historyNeedsReview = 0;
  for (const row of [...paid.values()].sort((a, b) => Date.parse(metadata(a).payment.verifiedAt) - Date.parse(metadata(b).payment.verifiedAt) || Number(a.id) - Number(b.id))) {
    const info = metadata(row), agentId = String(info.agentId);
    if (initialInvoices.has(info.payment.invoiceId)) continue;
    initialInvoices.add(info.payment.invoiceId);
    if (user.role !== 'owner' && agentId !== String(user.id)) continue;
    paidOffices++; byAgent.set(agentId, (byAgent.get(agentId) || 0) + 1);
    const receipts = info.billing?.verifiedInvoices;
    if (info.billing?.verification === 'canonical_stripe' && !Array.isArray(receipts)) historyNeedsReview++;
    for (const invoice of receipts || []) {
      if (invoice.verification !== 'canonical_stripe' || invoice.kind !== 'subscription_cycle' || invoice.amountCents !== 30000 ||
          invoice.currency !== 'USD' || invoice.subscriptionId !== info.payment.subscriptionId || !/^in_[A-Za-z0-9_]+$/.test(invoice.id) ||
          invoice.id === info.payment.invoiceId || invoices.has(invoice.id)) continue;
      invoices.add(invoice.id); residualEarnedCents += COMMISSION_PLAN.residualCents;
      if (invoice.id === info.billing.invoiceId && enrollmentEligibility(row, now).eligible &&
          offices.some(office => String(office.id) === String(info.leadId) && office.status === 'active')) monthlyResidualCents += COMMISSION_PLAN.residualCents;
    }
  }
  const signupEarnedCents = paidOffices * COMMISSION_PLAN.signupCents;
  const bonuses = [...byAgent.values()].filter(count => count >= COMMISSION_PLAN.bonusOffices).length;
  const bonusEarnedCents = bonuses * COMMISSION_PLAN.bonusCents;
  const closest = Math.max(0, ...byAgent.values());
  const commission = { ...COMMISSION_PLAN, paidOffices, signupEarnedCents, residualEarnedCents, bonusEarnedCents,
    earnedCents: signupEarnedCents + residualEarnedCents + bonusEarnedCents, monthlyResidualCents,
    pendingSignupCents: [...latest.values()].filter(row => !metadata(row).payment?.live && !['expired', 'canceled', 'refunded'].includes(row.status) && metadata(row).agentId !== 'owner').length * COMMISSION_PLAN.signupCents,
    potentialMonthlyCents: [...latest.values()].filter(row => metadata(row).agentId !== 'owner' && ['payment_pending', 'active', 'past_due'].includes(row.status) && !(metadata(row).billing?.holds || []).length).length * COMMISSION_PLAN.residualCents, bonusQualifiedAgents: bonuses,
    milestoneOffices: Math.min(COMMISSION_PLAN.bonusOffices, closest), historyNeedsReview };
  return { scope: user.role === 'owner' ? 'team' : 'agent', currency: 'USD', signedRevenueCents, signedOffices,
    activeMonthlyCents, activeOffices, awaitingPaymentCents, nextOfficeCents: price(terms)?.totalCents ?? null,
    commissionConfigured: true, commission, basis: 'Commission estimate from verified live collections. Signed contract value is separate; no payout is recorded by this view.' };
}
