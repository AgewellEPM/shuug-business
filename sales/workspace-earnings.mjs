import { HttpError, text } from './model.mjs';

const actions = new Set(['record-earnings', 'void-earnings']);

export function workspaceEarnings(db) {
  function summary(user) {
    if (user.role !== 'owner') return null;
    const receipts = db.list('earnings').filter(row => !row.voidedAt);
    return { totalCents: receipts.reduce((sum, row) => sum + row.cents, 0), count: receipts.length,
      recent: receipts.slice(-5).reverse().map(({ id, cents, label, created_at }) => ({ id: String(id), cents, label, recordedAt: created_at })) };
  }

  function dispatch(user, action, input) {
    if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can record earnings.');
    if (action === 'void-earnings') {
      const receipt = db.get('earnings', input.id);
      if (!receipt) throw new HttpError(404, 'Earnings entry not found.');
      if (!receipt.voidedAt) db.patch('earnings', receipt.id, { voidedAt: new Date().toISOString() });
      return { earnings: summary(user) };
    }
    const label = text(input.label, 140, true);
    const amount = text(input.amount, 12, true);
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)) throw new HttpError(400, 'Enter a USD amount with up to two decimal places.');
    const [dollars, change = ''] = amount.split('.');
    const cents = Number(dollars) * 100 + Number(change.padEnd(2, '0'));
    if (!cents) throw new HttpError(400, 'Enter an amount greater than zero.');
    const requestId = text(input.requestId, 36, true);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) throw new HttpError(400, 'Refresh before recording this payment.');
    const prior = db.list('earnings').find(row => row.requestId === requestId);
    if (prior && (prior.cents !== cents || prior.label !== label)) throw new HttpError(409, 'This payment has already been recorded. Refresh before retrying.');
    if (!prior) db.create('earnings', { label, cents, requestId });
    return { earnings: summary(user) };
  }
  return { actions, summary, dispatch };
}
