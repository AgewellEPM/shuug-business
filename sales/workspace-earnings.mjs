import { HttpError, text } from './model.mjs';

const actions = new Set(['record-earnings', 'void-earnings', 'earnings-history']);

export function workspaceEarnings(db) {
  const recorded = () => db.list('earnings').filter(row => !row.voidedAt);
  const receipt = ({ id, cents, label, created_at }) => ({ id: String(id), cents, label, recordedAt: created_at });

  function summary(user) {
    if (user.role !== 'owner') return null;
    const receipts = recorded();
    return { totalCents: receipts.reduce((sum, row) => sum + row.cents, 0), count: receipts.length,
      recent: receipts.slice(-5).reverse().map(receipt) };
  }

  function history(input) {
    const query = text(input.query ?? '', 140).toLocaleLowerCase();
    const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Choose a valid earnings page.');
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
      return { month: start.toISOString().slice(0, 7), cents: 0 };
    });
    const byMonth = new Map(months.map(month => [month.month, month]));
    const matches = [];
    let yearCents = 0;
    for (const row of recorded().reverse()) {
      const month = row.created_at.slice(0, 7);
      const bucket = byMonth.get(month);
      if (bucket) bucket.cents += row.cents;
      if (month.startsWith(year)) yearCents += row.cents;
      if (!query || row.label.toLocaleLowerCase().includes(query)) matches.push(row);
    }
    const size = 10;
    return { months, yearCents, total: matches.length, offset, size,
      rows: matches.slice(offset, offset + size).map(receipt) };
  }

  function dispatch(user, action, input) {
    if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can access recorded earnings.');
    if (action === 'earnings-history') return history(input);
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
