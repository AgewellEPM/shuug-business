import { metadata, visible } from './model.mjs';
import { progressProjection } from './pipeline.mjs';

const xpPerLevel = 100;

function officeExperience(pipeline) {
  return 10 + (pipeline?.lastContact ? 20 : 0) + (pipeline?.lastReply ? 30 : 0) + (pipeline?.converted ? 40 : 0);
}

function experience(xp) {
  return { level: Math.floor(xp / xpPerLevel) + 1, xp, xpIntoLevel: xp % xpPerLevel, xpPerLevel };
}

export function pipelineExperience(offices) {
  return experience(offices.reduce((xp, office) => xp + officeExperience(office.pipeline), 0));
}

function groupByOffice(rows, officeId) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(officeId(row));
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

export function teamExperience(members, offices, events, enrollments) {
  const users = new Map(members.filter(member => member.active !== false).map(member => [member.id, member]));
  const totals = new Map([...users.keys()].map(id => [id, 0]));
  const includesOwner = users.has('owner');
  const officeEvents = groupByOffice(events, row => row.assigned_to);
  const officeEnrollments = groupByOffice(enrollments, row => metadata(row).leadId);
  for (const office of offices) {
    const assignee = users.get(String(office.assigned_to));
    const personal = assignee && assignee.id !== 'owner' && visible(assignee, office);
    if (!includesOwner && !personal) continue;
    const id = String(office.id);
    const xp = officeExperience(progressProjection(office, officeEvents.get(id), officeEnrollments.get(id)));
    // The owner header tracks the workspace. Each rep header tracks their own authorized pipeline.
    if (includesOwner) totals.set('owner', totals.get('owner') + xp);
    if (personal) totals.set(assignee.id, totals.get(assignee.id) + xp);
  }
  return new Map([...totals].map(([id, xp]) => [id, experience(xp)]));
}
