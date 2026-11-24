import { visible } from '../../sales/model.mjs';
import { officeOutreachBlocked } from '../../sales/outreach-preferences.mjs';
import { readGoalInput } from './coach-context.mjs';

export async function saveReviewed({ db, user, input, previous, crm, allowedFields }) {
  const draft = previous?.draft, type = draft?.type;
  const say = answer => ({ mode: 'workflow', answer, sources: [], draft: null });
  if (!['goal','prospect','activity','followup'].includes(type) || !crm) return say('Open a prepared prospect, call note, follow-up or goal in this conversation and say “save it.” Other forms have their own save control.');
  if (draft.recordId && input.screen?.officeId && input.screen.officeId !== draft.recordId) return say('A different account is open. Open the account named in the draft before saving.');
  const source = previous.draftTurnId || previous.id;
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
    if (type === 'goal') {
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
    if (error.status >= 400 && error.status < 500) { db.coach.releaseSave(user.id, source); return { ...say(error.message), draft, draftTurnId: source }; }
    return say('The workspace did not confirm the save. Check the record before trying again.');
  }
}
