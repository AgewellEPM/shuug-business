import { HttpError, visible } from '../../sales/model.mjs';
import { officeOutreachBlocked } from '../../sales/outreach-preferences.mjs';
import { readGoalInput } from './coach-context.mjs';

const workspaceSaves = {
  contact: { label: 'contact', required: ['name'], account: true },
  accountContact: { label: 'account contact', required: ['name'], account: true },
  progress: { label: 'pipeline progress', required: ['kind', 'note'], account: true },
  support: { label: 'support request', required: ['subject', 'category', 'message'] },
  linkedIn: { label: 'LinkedIn prospect', required: ['sourceURL'] },
};
export function workspaceSaveReview(draft) {
  const entry = workspaceSaves[draft.formKey];
  if (!entry) return;
  const label = key => key.replace(/URL$/, ' URL').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const missing = entry.required.filter(key => !draft.fields[key]).map(label);
  if (entry.account && !draft.recordId) missing.unshift('saved account name');
  const details = Object.entries(draft.fields).filter(([key]) => key !== 'officeId').map(([key, value]) => label(key) + '. ' + value);
  const preview = ['Draft ' + entry.label + (draft.recordName ? ' for ' + draft.recordName : ''), ...details].join('. ');
  return { missing, text: preview + '. ' + (missing.length ? 'I still need ' + missing.join(', ') + '.' : 'Say “save it” to record this or “cancel draft.”') };
}

async function saveWorkspaceForm(user, draft, crm, requestId) {
  const review = workspaceSaveReview(draft);
  if (!review || review.missing.length) throw new HttpError(400, review?.text || 'This form has its own submit control.');
  const { fields, formKey, recordId } = draft;
  if (formKey === 'support') {
    const result = await crm(user, 'support-request-create', fields);
    return 'Support request ' + result.request.id + ' was submitted. ' + result.request.subject + '.';
  }
  if (formKey === 'linkedIn') {
    const result = await crm(user, 'save-prospect', fields);
    return result.existing ? 'That LinkedIn prospect was already saved.' : 'Saved the LinkedIn prospect.';
  }
  const current = await crm(user, 'office', { id: recordId });
  if (formKey === 'progress') {
    await crm(user, 'record-progress', { ...fields, id: recordId, requestId, expectedRevision: draft.revision ?? current.pipeline.revision });
    return 'Saved pipeline progress for ' + current.office.town + '.';
  }
  const contactId = requestId;
  await crm(user, 'save-contact', { id: recordId, contactId, requestId, expectedRevision: current.contacts.revision, contact: fields });
  return 'Saved ' + fields.name + ' as a contact for ' + current.office.town + '.';
}

export async function saveReviewed({ db, user, input, previous, crm, allowedFields }) {
  const draft = previous?.draft, type = draft?.type;
  const say = answer => ({ mode: 'workflow', answer, sources: [], draft: null });
  if (!['goal','prospect','activity','followup','workspaceForm'].includes(type) || !crm) return say('Prepare a draft in this conversation, review it and then say “save it.”');
  const source = previous.draftTurnId || previous.id;
  const retry = answer => ({ ...say(answer), draft, draftTurnId: source });
  if (type === 'workspaceForm' && (!workspaceSaves[draft.formKey] || !draft.reviewedInConversation)) return retry('This form has its own submit control. Use your screen reader to review and submit it.');
  if (type !== 'workspaceForm' && draft.recordId && input.screen?.officeId && input.screen.officeId !== draft.recordId && !input.voice) return retry('A different account is open. Open the account named in the draft before saving.');
  const guard = db.coach.claimSave(user.id, source);
  if (!guard.claimed) return guard.receipt ? JSON.parse(guard.receipt) : say('The previous save has an unconfirmed outcome. Check the record before trying again.');
  try {
    const fields = { ...draft.fields };
    if (input.reviewed?.type === type && input.reviewed.recordId === draft.recordId) {
      for (const [key, max] of Object.entries(allowedFields[type])) {
        const v = input.reviewed.fields?.[key]; if (typeof v === 'string' && v.length <= max) fields[key] = v;
      }
    }
    let receipt, officeId = draft.recordId;
    if (type === 'workspaceForm') {
      receipt = await saveWorkspaceForm(user, draft, crm, input.requestId);
    } else if (type === 'goal') {
      db.coach.saveGoal(user.id, readGoalInput({ ...fields, target: Number(fields.target), timeZone: input.timeZone }), draft.goalRevision || 0);
      receipt = 'Your personal sales goal was saved.';
    } else if (type === 'prospect') {
      const result = await crm(user, 'create-office', fields); officeId = String(result.office.id);
      receipt = result.duplicate ? 'That prospect is already in Pipeline.' : 'Saved ' + result.office.town + ' to Pipeline.';
    } else {
      const office = db.get('offices', officeId);
      if (!office || !visible(user, office)) throw Object.assign(new Error('This account is unavailable in your assignments.'), { status: 403 });
      if (type === 'followup' && officeOutreachBlocked(office)) throw Object.assign(new Error('Outreach is paused for this account.'), { status: 409 });
      await crm(user, type === 'activity' ? 'activity' : 'update-office', { ...fields, id: officeId });
      receipt = type === 'activity' ? 'Saved the ' + fields.kind + ' on ' + office.town + '.' : 'Saved the follow-up on ' + office.town + ' for ' + fields.nextFollowup + '.';
    }
    const result = { ...say(receipt), saved: { type, officeId } };
    db.coach.finishSave(user.id, source, result); return result;
  } catch (error) {
    if (error.status >= 400 && error.status < 500) { db.coach.releaseSave(user.id, source); return retry(error.message); }
    return say('The workspace did not confirm the save. Check the record before trying again.');
  }
}
