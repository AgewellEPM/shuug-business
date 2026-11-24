import { patchReviewed } from './atomic.mjs';
import { HttpError, metadata, secret, text } from './model.mjs';

const collection = 'support-requests';
const categories = new Set(['access', 'prospects', 'pipeline', 'contracts', 'mobile', 'billing', 'other']);
const statuses = new Set(['open', 'in_progress', 'resolved']);

export const SUPPORT_REQUEST_ACTIONS = new Set([
  'support-requests', 'support-request-create', 'support-request-update',
]);

function author(user) {
  return { id: String(user.id), name: user.name };
}

function messageFrom(user, message, createdAt) {
  return { id: secret(), author: author(user), message, createdAt };
}

function requestSummary(row, info = metadata(row)) {
  return {
    id: String(row.id),
    subject: row.town,
    category: info.category,
    status: row.status,
    createdAt: info.createdAt,
    updatedAt: info.updatedAt,
    resolvedAt: info.resolvedAt,
    requester: info.requester,
    messages: info.messages,
  };
}

export function supportRequests(db, now = Date.now) {
  return async (user, action, body) => {
    const canManage = user.role === 'owner';
    if (!canManage && user.role !== 'agent') throw new HttpError(403, 'Open the Sales Workspace to use support.');
    const canSee = row => canManage || row.assigned_to === String(user.id);

    if (action === 'support-requests') {
      const requests = (await db.list(collection)).filter(canSee).map(row => requestSummary(row))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || Number(b.id) - Number(a.id));
      return { requests, canManage };
    }

    if (action === 'support-request-create') {
      const subject = text(body.subject, 160, true);
      const message = text(body.message, 5000, true);
      const category = body.category;
      if (!categories.has(category)) throw new HttpError(400, 'Choose a support category.');
      const createdAt = new Date(now()).toISOString();
      const info = {
        category, createdAt, updatedAt: createdAt, resolvedAt: null,
        requester: author(user), messages: [messageFrom(user, message, createdAt)],
      };
      const row = await db.create(collection, {
        town: subject, assigned_to: String(user.id), status: 'open', notes: JSON.stringify(info),
      });
      return { request: requestSummary(row, info) };
    }

    const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
    if (!/^[1-9]\d*$/.test(id)) throw new HttpError(404, 'Support request not found.');
    const message = body.message === undefined ? '' : text(body.message, 5000);
    const status = body.status;
    // Retry conditional writes so simultaneous replies append to the same conversation.
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await db.get(collection, id);
      if (!row || !canSee(row)) throw new HttpError(404, 'Support request not found.');
      if (status !== undefined && !canManage) throw new HttpError(403, 'Only the workspace owner can change support request status.');
      if (status !== undefined && !statuses.has(status)) throw new HttpError(400, 'Choose a valid support status.');
      if (!message && status === undefined) throw new HttpError(400, 'Enter a reply or choose a status.');
      const info = metadata(row);
      const nextStatus = status ?? row.status;
      if (!message && nextStatus === row.status) return { request: requestSummary(row, info) };
      const updatedAt = new Date(now()).toISOString();
      const next = {
        ...info,
        updatedAt,
        resolvedAt: nextStatus === 'resolved' ? (info.resolvedAt ?? updatedAt) : null,
        messages: message ? [...info.messages, messageFrom(user, message, updatedAt)] : info.messages,
      };
      try {
        const saved = await patchReviewed(db, collection, row, { status: nextStatus, notes: JSON.stringify(next) });
        return { request: requestSummary(saved, next) };
      } catch (error) {
        if (error.status !== 409 || attempt === 2) throw error;
      }
    }
  };
}
