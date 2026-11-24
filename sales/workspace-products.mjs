import { HttpError } from './model.mjs';

const actions = new Set(['products-read', 'products-save']);
const initial = Object.freeze({ revision: 0, rentalCents: 7500, hardwareCostCents: null, commission: null });

function hundredths(value, label, maximum, optional = false) {
  if (optional && value === '') return null;
  if (typeof value !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) {
    throw new HttpError(400, 'Enter ' + label + ' with up to two decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  const number = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (number > maximum) throw new HttpError(400, 'Enter a valid ' + label + '.');
  return number;
}

export function workspaceProducts(db) {
  function read(user, row = db.productPricing() ?? initial) {
    const { hardwareCostCents, ...pricing } = row;
    if (user.role === 'owner') pricing.hardwareCostCents = hardwareCostCents;
    const rule = pricing.commission;
    pricing.commissionCents = !rule ? null : rule.kind === 'fixed'
      ? rule.value : Math.round(pricing.rentalCents * rule.value / 10000);
    return { pricing, canEdit: user.role === 'owner' };
  }

  function dispatch(user, action, input) {
    if (action === 'products-read') return read(user);
    if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can update product pricing.');
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, 'Refresh product pricing before saving.');
    const rentalCents = hundredths(input.rental, 'a monthly rental price', 999999999);
    const hardwareCostCents = hundredths(input.hardwareCost, 'a hardware cost', 999999999, true);
    let commission = null;
    if (input.kind !== '') {
      if (!['fixed', 'percent'].includes(input.kind) || !['first', 'each'].includes(input.frequency)) {
        throw new HttpError(400, 'Choose a commission type and which paid months it applies to.');
      }
      const fixed = input.kind === 'fixed';
      const value = hundredths(input.amount, fixed ? 'a flat commission' : 'a commission percentage', fixed ? rentalCents : 10000);
      commission = { kind: input.kind, value, frequency: input.frequency };
    }
    return read(user, db.saveProductPricing(input.revision, { rentalCents, hardwareCostCents, commission }));
  }
  return { actions, dispatch };
}
