/**
 * Inventory engine — pure. Answers "can we ship this?", applies a ship
 * (decrement), and builds the production/reorder plan: given how fast a product
 * sells (velocity) and how much is on hand, how many cases to make to hit the
 * target days of cover, and what that production run costs.
 */
import type { InventoryItem, ShipmentLine } from "./model";

export interface ShipCheck {
  ok: boolean;
  /** per-SKU shortfall in cases (only present when !ok). */
  shortfalls: { skuId: string; requested: number; onHand: number }[];
}

/** Can the requested lines ship from current stock? */
export function checkStock(lines: ShipmentLine[], items: InventoryItem[]): ShipCheck {
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.cases) || line.cases < 0) throw new RangeError("Shipment quantities must be finite and nonnegative.");
    requested.set(line.skuId, (requested.get(line.skuId) ?? 0) + line.cases);
  }
  const onHand = new Map(items.map((i) => [i.skuId, i.onHandCases]));
  const shortfalls = [...requested].map(([skuId, cases]) => ({ skuId, cases }))
    .filter((l) => l.cases > 0)
    .map((l) => ({ skuId: l.skuId, requested: l.cases, onHand: onHand.get(l.skuId) ?? 0 }))
    .filter((s) => s.requested > s.onHand);
  return { ok: shortfalls.length === 0, shortfalls };
}

/** Apply a ship to inventory, returning NEW items (immutable). Fail-fast if short. */
export function applyShip(lines: ShipmentLine[], items: InventoryItem[]): InventoryItem[] {
  const check = checkStock(lines, items);
  if (!check.ok) {
    const s = check.shortfalls[0];
    throw new Error(`Insufficient stock for ${s.skuId}: need ${s.requested}, have ${s.onHand}`);
  }
  const byId = new Map<string, number>();
  for (const line of lines.filter(l => l.cases > 0)) byId.set(line.skuId, (byId.get(line.skuId) ?? 0) + line.cases);
  return items.map((i) =>
    byId.has(i.skuId) ? { ...i, onHandCases: i.onHandCases - (byId.get(i.skuId) as number) } : i,
  );
}

/** Receive produced/purchased stock into inventory (immutable). */
export function applyReceive(skuId: string, cases: number, items: InventoryItem[]): InventoryItem[] {
  if (!Number.isInteger(cases) || cases <= 0) throw new RangeError(`receive cases must be a positive integer`);
  return items.map((i) => (i.skuId === skuId ? { ...i, onHandCases: i.onHandCases + cases } : i));
}

export interface ReorderRow {
  skuId: string;
  onHandCases: number;
  reorderPointCases: number;
  /** cases sold per day (sales velocity). */
  velocityCasesPerDay: number;
  /** how many days current stock lasts (Infinity if nothing selling). */
  daysOfCover: number;
  belowReorderPoint: boolean;
  /** cases to produce to reach targetDaysCover of cover (0 if already covered). */
  suggestedProduceCases: number;
  /** cost to produce the suggested run, cents. */
  productionCostCents: number;
}

/**
 * Build the reorder/production plan for one item given its sales velocity.
 * suggestedProduce = ceil(velocity * targetDays) - onHand, floored at 0.
 */
export function reorderRow(item: InventoryItem, velocityCasesPerDay: number): ReorderRow {
  const v = Math.max(0, velocityCasesPerDay);
  const daysOfCover = v === 0 ? Infinity : item.onHandCases / v;
  const target = Math.ceil(v * item.targetDaysCover);
  const suggestedProduceCases = Math.max(0, target - item.onHandCases);
  return {
    skuId: item.skuId,
    onHandCases: item.onHandCases,
    reorderPointCases: item.reorderPointCases,
    velocityCasesPerDay: v,
    daysOfCover,
    belowReorderPoint: item.onHandCases <= item.reorderPointCases,
    suggestedProduceCases,
    productionCostCents: suggestedProduceCases * item.mfgCostPerCaseCents,
  };
}

export interface ReorderPlan {
  rows: ReorderRow[];
  totalProductionCostCents: number;
  itemsBelowReorder: number;
}

export function buildReorderPlan(
  items: InventoryItem[],
  velocityBySku: Map<string, number>,
): ReorderPlan {
  const rows = items.map((i) => reorderRow(i, velocityBySku.get(i.skuId) ?? 0));
  return {
    rows,
    totalProductionCostCents: rows.reduce((n, r) => n + r.productionCostCents, 0),
    itemsBelowReorder: rows.filter((r) => r.belowReorderPoint).length,
  };
}
