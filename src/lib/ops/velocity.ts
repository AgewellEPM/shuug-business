/**
 * Sales velocity — cases sold per day per SKU, derived from the deal-desk order
 * history. Feeds the production/reorder forecast. Pure.
 */
import type { Order } from "../data/model";

const DAY_MS = 86_400_000;

/** cases/day per SKU over the span of the order history (min 1 day). */
export function velocityBySku(orders: Order[]): Map<string, number> {
  const casesBySku = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const order of orders) {
    const ts = new Date(order.createdAt).getTime();
    if (Number.isFinite(ts)) {
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);
    }
    for (const line of order.lines) {
      casesBySku.set(line.skuId, (casesBySku.get(line.skuId) ?? 0) + line.cases);
    }
  }

  const spanDays = Number.isFinite(minTs) && maxTs > minTs ? Math.max(1, (maxTs - minTs) / DAY_MS) : 1;
  const out = new Map<string, number>();
  for (const [skuId, cases] of casesBySku) out.set(skuId, cases / spanDays);
  return out;
}
