import { HttpError, digest, metadata, seal, secret, termsValid, unseal } from './model.mjs';
import { enrollmentEligibility } from './billing.mjs';
export function contractSummary(row, office, now = Date.now()) {
  const info = metadata(row), signed = Boolean(info.signature && info.acceptedAt), active = enrollmentEligibility(row, now).eligible && office.status === 'active';
  const expired = !signed && info.expiresAt < now;
  return { id: String(row.id), officeId: String(office.id), office: office.town, address: metadata(office).address || '', city: office.locality, state: office.state, postalCode: metadata(office).postalCode || '',
    ownerName: row.contact_name, email: row.contact_email, termsTitle: info.terms?.title || '', termsHash: info.terms?.hash || '',
    preparedAt: row.created_at || info.preparedAt || null, signed, signedAt: info.acceptedAt || null, signature: info.signature || null, active,
    status: active ? 'active' : signed ? (info.terms?.paymentRequired === false ? 'signed' : 'signed_payment_pending') : expired ? 'expired' : 'awaiting_signature', expiresAt: info.expiresAt ? new Date(info.expiresAt).toISOString() : null,
    linkAvailable: Boolean(info.expiresAt >= now) && ['invited', 'payment_pending', 'active'].includes(row.status),
    agreementType: info.contractPlan?.type || '', startDate: info.contractPlan?.startDate || '', endDate: info.contractPlan?.endDate || '',
    value: info.contractPlan?.value || '', priorId: info.contractPlan?.priorId || '', archived: Boolean(info.contractArchivedAt) };
}
export function contractInvitation(env, lead, user, { ownerName, ownerEmail, terms, plan }) {
  const token = secret(), expiresAt = Date.now() + 14 * 86400000;
  const info = metadata(lead);
  return { token, record: {
    town: `Invitation ${secret().slice(0,12)}`, state: lead.state, contact_name: ownerName, contact_email: ownerEmail,
    assigned_to: user.id, status: 'invited',
    notes: JSON.stringify({ leadId: String(lead.id), officeName: lead.town, address: info.address, state: lead.state,
      agentId: String(lead.assigned_to || user.id), preparedBy: user.id, tokenHash: digest(token),
      sealedToken: seal({ token, exp: expiresAt }, env.GIGTAX_SALES_SESSION_KEY), terms, expiresAt,
      ...(plan ? { contractPlan: plan } : {}) }),
  } };
}
export function contractLink(env, row, now = Date.now()) {
  const info = metadata(row), token = unseal(info.sealedToken || '', env.GIGTAX_SALES_SESSION_KEY);
  if (!termsValid(info.terms) || !token?.token || info.expiresAt < now || !['invited', 'payment_pending', 'active'].includes(row.status)) throw new HttpError(409, 'This contract link has expired or is unavailable. Review the office before preparing a fresh invitation.');
  return `${env.GIGTAX_SALES_ORIGIN}/office-signup#${new URLSearchParams({ id: row.id, token: token.token })}`;
}
export function signedContractReceipt(row, office) {
  const info = metadata(row);
  if (!info.signature || !info.acceptedAt) throw new HttpError(409, 'The owner has not signed this contract yet.');
  const paymentRequired = info.terms.paymentRequired !== false;
  return { signed: true, active: enrollmentEligibility(row).eligible && office.status === 'active', receipt: String(row.id), office: info.officeName, signature: info.signature,
    businessEmail: row.contact_email, acceptedAt: info.acceptedAt, termsHash: info.terms.hash, terms: info.terms, paymentStatus: paymentRequired ? enrollmentEligibility(row).status : 'not_required',
    message: paymentRequired ? 'The agreement signature is recorded. Paid membership activates only after the required payment is verified.' : 'The agreement signature is recorded.' };
}
