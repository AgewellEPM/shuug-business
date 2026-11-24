import { contractInvitation, contractSummary } from './contracts.mjs';
import { email, HttpError, independenceVerified, metadata, termsValid, text, visible } from './model.mjs';
import { emailOutreachBlocked, officeOutreachBlocked } from './outreach-preferences.mjs';

export const CONTRACT_WORKSPACE_ACTIONS = new Set([
  'contract-center-read', 'contract-draft-save', 'contract-draft-action', 'contract-file-archive',
]);

const templates = [
  { id: 'pilot', title: 'Pilot Agreement', description: 'Define the trial period, participating units and success criteria.',
    guidance: 'Include the trial scope, equipment, staff training, evaluation criteria and how the pilot ends.' },
  { id: 'service', title: 'Service Agreement', description: 'Set the terms for an ongoing TinkyTown deployment.',
    guidance: 'Include the services, locations, pricing, training, support and term.' },
  { id: 'extension', title: 'Extension / Add-On', description: 'Add locations, equipment or services to an existing agreement.',
    guidance: 'Identify the signed agreement, describe the changes, and specify when and where they take effect.' },
  { id: 'renewal', title: 'Renewal Agreement', description: 'Continue service for a new term with reviewed terms.',
    guidance: 'Identify the previous agreement and confirm the new term, pricing and any changes in scope.' },
];
const pending = new Set(['invited', 'payment_pending', 'active']);

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + 'T00:00:00.000Z');
    if (Number.isFinite(+date) && date.toISOString().slice(0, 10) === value) return value;
  }
  throw new HttpError(400, 'Use a valid calendar date.');
}

export function contractWorkspace(env, db, prepareAgreement) {
  function officeFor(user, id) {
    const office = db.get('offices', id);
    if (!office || !visible(user, office)) throw new HttpError(404, 'Choose an office in your assignments.');
    return office;
  }
  function existingContract(office, id) {
    const row = db.get('enrollments', id);
    if (!row || String(metadata(row).leadId) !== String(office.id)) throw new HttpError(404, 'Choose an agreement for this office.');
    return row;
  }
  function publicDraft(row, office) {
    const { terms, archivedFrom, ...fields } = metadata(row);
    return { ...fields, id: String(row.id), office: office.town, state: office.state, city: office.locality,
      status: row.status, updatedAt: row.updated_at };
  }
  function read(user) {
    const published = db.terms();
    const prefix = published && `${published.title}\n\nContracting business: ${published.business}\n\n`;
    const defaults = termsValid(published) && published.paymentRequired === false
      ? { business: published.business, body: published.text.startsWith(prefix) ? published.text.slice(prefix.length).trim() : published.text.trim() }
      : null;
    const drafts = db.list('contract-drafts').flatMap(row => {
      const office = db.get('offices', metadata(row).officeId);
      return office && visible(user, office) ? [publicDraft(row, office)] : [];
    });
    return { templates, defaults, drafts };
  }
  function plan(fields, office) {
    const template = templates.find(item => item.id === fields.type);
    if (!template) throw new HttpError(400, 'Choose a contract template.');
    const startDate = dateOnly(fields.startDate), endDate = dateOnly(fields.endDate);
    if (startDate && endDate && endDate < startDate) throw new HttpError(400, 'The end date must follow the start date.');
    let priorId = '';
    if (['extension', 'renewal'].includes(template.id)) {
      const prior = existingContract(office, fields.priorId), info = metadata(prior);
      if (!info.signature || !info.acceptedAt || info.terms?.paymentRequired !== false) {
        throw new HttpError(409, 'Choose a signed workspace agreement for the same office.');
      }
      priorId = String(prior.id);
      if (template.id === 'renewal' && startDate && info.contractPlan?.endDate && startDate <= info.contractPlan.endDate) {
        throw new HttpError(400, 'Start the renewal after the previous agreement ends.');
      }
    }
    return { type: template.id, title: text(fields.title || '', 180, true), business: text(fields.business || '', 180),
      agreementText: text(fields.agreementText || '', 9500), value: text(fields.value || '', 120), startDate, endDate, priorId,
      officeId: String(office.id), ownerName: text(fields.ownerName || '', 140), ownerEmail: fields.ownerEmail ? email(fields.ownerEmail) : '' };
  }
  function audit(user, office, action, detail) {
    db.create('events', { town: 'Contract workspace', assigned_to: String(office.id), contact_name: user.name, status: 'recorded',
      notes: JSON.stringify({ actorId: user.id, action, detail, at: new Date().toISOString() }) });
  }
  function save(user, fields) {
    const office = officeFor(user, fields.officeId), validated = plan(fields, office);
    const row = fields.id && db.get('contract-drafts', fields.id);
    if (fields.id && !row) throw new HttpError(404, 'Contract draft not found.');
    if (row) {
      const prior = metadata(row);
      if (prior.officeId !== validated.officeId || (user.role !== 'owner' && prior.authorId !== user.id)) throw new HttpError(403, 'Only the draft author or workspace owner can edit this draft.');
      if (fields.revision !== prior.revision || row.status !== 'draft') throw new HttpError(409, 'Reload the current editable draft.');
      return { draft: publicDraft(db.patch('contract-drafts', row.id, { notes: JSON.stringify({
        ...prior, ...validated, revision: prior.revision + 1,
      }) }), office) };
    }
    const request = text(fields.requestId || '', 36, true);
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(request)) throw new HttpError(400, 'Start a new contract draft from the template picker.');
    const key = user.id + ':' + request.toLowerCase();
    const existing = db.list('contract-drafts').find(item => item.requestKey === key);
    if (existing) {
      const info = metadata(existing);
      if (Object.keys(validated).some(key => validated[key] !== info[key])) {
        throw new HttpError(409, 'This request already saved a draft. Open it from Approvals to make changes.');
      }
      return { draft: publicDraft(existing, office) };
    }
    const fresh = db.create('contract-drafts', { status: 'draft', requestKey: key,
      notes: JSON.stringify({ ...validated, authorId: user.id, revision: 1 }) });
    return { draft: publicDraft(fresh, office) };
  }
  function termsFor(draft, office) {
    text(draft.ownerName, 140, true);
    email(draft.ownerEmail);
    if (draft.agreementText.length < 100) throw new HttpError(400, 'Enter the complete agreement text before requesting review.');
    return prepareAgreement({ business: draft.business, agreementTitle: draft.title, approved: true,
      agreementText: [
        'Facility: ' + office.town,
        draft.priorId ? 'Prior workspace agreement receipt: ' + draft.priorId : '',
        draft.startDate ? 'Start date: ' + draft.startDate : '',
        draft.endDate ? 'End date: ' + draft.endDate : '',
        draft.value ? 'Contract value: ' + draft.value : '',
      ].filter(Boolean).join('\n') + '\n\n' + draft.agreementText });
  }
  function prepare(user, row, draft, office) {
    if (!termsValid(draft.terms) || draft.terms.paymentRequired !== false) throw new HttpError(409, 'Have the owner review these terms first.');
    if (draft.reviewedOffice !== office.town) throw new HttpError(409, 'The facility name changed. Reopen the draft and request a new review.');
    const info = metadata(office);
    if (!independenceVerified(info) || officeOutreachBlocked(office) ||
        emailOutreachBlocked(db, draft.ownerEmail, db.list('offices'))) {
      throw new HttpError(409, 'Verify the office’s ownership and contact preferences in its record before preparing an invitation.');
    }
    if (draft.priorId) plan(draft, office);
    if (office.status === 'active' && !draft.priorId) throw new HttpError(409, 'Choose an extension or renewal for the current agreement.');
    if (info.invitationPendingUntil > Date.now()) throw new HttpError(409, 'Another invitation is being prepared. Refresh and review the office.');
    const related = db.list('enrollments').filter(entry => String(metadata(entry).leadId) === String(office.id));
    if (draft.type === 'renewal' && related.some(entry => {
      const info = metadata(entry);
      return info.contractPlan?.type === 'renewal' && info.contractPlan.priorId === draft.priorId &&
        (Boolean(info.signature) || (entry.status === 'invited' && info.expiresAt >= Date.now()));
    })) throw new HttpError(409, 'This agreement already has a renewal. Choose the latest signed agreement.');
    if (related.some(entry => {
      const current = metadata(entry);
      return pending.has(entry.status) && (Boolean(current.payment?.live) ||
        (!current.signature && current.expiresAt >= Date.now()) ||
        (current.signature && !draft.priorId));
    })) throw new HttpError(409, 'This office already has a current invitation or agreement. Open it or choose an extension or renewal.');
    const { record } = contractInvitation(env, office, user, { ownerName: draft.ownerName, ownerEmail: draft.ownerEmail,
      terms: draft.terms, plan: { type: draft.type, startDate: draft.startDate, endDate: draft.endDate, value: draft.value, priorId: draft.priorId } });
    const enrollment = db.create('enrollments', record);
    db.patch('offices', office.id, { status: draft.priorId ? office.status : 'invited',
      notes: JSON.stringify({ ...info, lastContractPreparation: String(enrollment.id) }) });
    audit(user, office, 'invitation_created', { enrollmentId: enrollment.id, contractDraftId: String(row.id) });
    return String(enrollment.id);
  }
  function changeDraft(user, body) {
    const row = db.get('contract-drafts', body.id);
    if (!row) throw new HttpError(404, 'Contract draft not found.');
    const info = metadata(row), office = officeFor(user, info.officeId), owner = user.role === 'owner';
    if (!owner && info.authorId !== user.id) throw new HttpError(403, 'Only the draft author or owner can manage this draft.');
    if (body.operation === 'approve' && !owner) throw new HttpError(403, 'Only the workspace owner can approve an agreement.');
    if (body.operation === 'prepare' && row.status === 'prepared') return { draft: publicDraft(row, office) };
    if (info.revision !== body.revision) throw new HttpError(409, 'This draft changed. Refresh it before continuing.');
    const changed = { ...info, revision: info.revision + 1 };
    let status;
    if (body.operation === 'submit' && row.status === 'draft') {
      const terms = termsFor(info, office);
      changed.terms = terms;
      changed.reviewedOffice = office.town;
      status = 'review';
    } else if (body.operation === 'approve' && row.status === 'review' && owner && body.reviewed === true && body.termsHash === info.terms?.hash) {
      changed.approvedBy = user.id;
      changed.approvedAt = new Date().toISOString();
      status = 'approved';
    } else if (body.operation === 'reopen' && (row.status === 'review' || (owner && row.status === 'approved'))) {
      delete changed.terms;
      delete changed.approvedBy;
      delete changed.approvedAt;
      delete changed.reviewedOffice;
      status = 'draft';
    } else if (body.operation === 'prepare' && row.status === 'approved') {
      changed.enrollmentId = prepare(user, row, info, office);
      status = 'prepared';
    } else if (body.operation === 'archive' && ['draft', 'review', 'approved'].includes(row.status)) {
      changed.archivedFrom = row.status;
      status = 'archived';
    } else if (body.operation === 'restore' && row.status === 'archived') {
      status = changed.archivedFrom;
      delete changed.archivedFrom;
    } else throw new HttpError(409, 'This action is unavailable for the current review state.');
    if (['review', 'approved'].includes(status)) audit(user, office, 'contract_' + status, { draftId: String(row.id), title: info.title });
    return { draft: publicDraft(db.patch('contract-drafts', row.id, { status, notes: JSON.stringify(changed) }), office) };
  }
  return (user, action, body) => {
    if (action === 'contract-center-read') return read(user);
    return db.contractTransaction(() => {
      if (action === 'contract-draft-save') return save(user, body);
      if (action === 'contract-draft-action' && body.operation === 'preview') {
        const row = db.get('contract-drafts', body.id);
        if (!row) throw new HttpError(404, 'Contract draft not found.');
        const info = metadata(row);
        officeFor(user, info.officeId);
        if (!termsValid(info.terms)) throw new HttpError(409, 'Submit a completed draft for review first.');
        return { terms: { text: info.terms.text, hash: info.terms.hash } };
      }
      if (action === 'contract-draft-action') return changeDraft(user, body);
      if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can file signed or expired agreements.');
      if (typeof body.archived !== 'boolean') throw new HttpError(400, 'Choose whether to archive this agreement.');
      const office = officeFor(user, body.officeId), row = existingContract(office, body.id), info = metadata(row);
      const contract = contractSummary(row, office);
      if (body.archived && !contract.signed && contract.status !== 'expired') throw new HttpError(409, 'A pending invitation stays in Current Contracts.');
      if (contract.archived === body.archived) return { contract };
      const changed = { ...info, contractArchivedAt: body.archived ? new Date().toISOString() : null };
      const saved = db.patch('enrollments', row.id, { notes: JSON.stringify(changed) });
      audit(user, office, body.archived ? 'contract_archived' : 'contract_restored', { enrollmentId: String(row.id) });
      return { contract: contractSummary(saved, office) };
    });
  };
}
