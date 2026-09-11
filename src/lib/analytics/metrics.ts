/**
 * Analytics engine — pure aggregations over orders for the distribution
 * dashboard and the AI copilot's grounding. Deterministic, integer cents, no
 * I/O. Every number the copilot cites comes from here, not the model's guess.
 */
import { CHANNEL_LABELS, type Customer, type Order, type Sku } from "../data/model";

export interface NamedRevenue {
  key: string;
  label: string;
  revenueCents: number;
  orderCount: number;
  cases: number;
}

export interface MonthPoint {
  month: string; // "YYYY-MM"
  revenueCents: number;
  orderCount: number;
}

export interface DayPoint {
  dow: number; // 0=Sun .. 6=Sat
  label: string;
  revenueCents: number;
  orderCount: number;
}

export interface Analytics {
  totalRevenueCents: number;
  orderCount: number;
  avgOrderCents: number;
  totalCases: number;
  /** total individual bottles sold (bottle lines + case lines × units). */
  totalBottles: number;
  /** average sale price per case-equivalent, cents (revenue / case-equiv). */
  avgCasePriceCents: number;
  /** average sale price per bottle, cents (revenue / bottles). */
  avgBottlePriceCents: number;
  topProducts: NamedRevenue[]; // by revenue, desc
  byCustomer: NamedRevenue[]; // by revenue, desc
  byRegion: NamedRevenue[]; // by revenue, desc
  byOwner: NamedRevenue[]; // by revenue, desc
  byChannel: NamedRevenue[]; // by revenue, desc
  byMonth: MonthPoint[]; // ascending by month
  byDayOfWeek: DayPoint[]; // Sun..Sat
  /** latest complete month vs the one before, as a fraction (null if <2 months). */
  momGrowth: number | null;
  bestDay: DayPoint | null;
  /** trailing-average projection for next month, cents (null if no data). */
  forecastNextMonthCents: number | null;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addRevenue(
  map: Map<string, NamedRevenue>,
  key: string,
  label: string,
  revenueCents: number,
  cases: number,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.revenueCents += revenueCents;
    existing.orderCount += 1;
    existing.cases += cases;
  } else {
    map.set(key, { key, label, revenueCents, orderCount: 1, cases });
  }
}

function sortedByRevenue(map: Map<string, NamedRevenue>): NamedRevenue[] {
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export function computeAnalytics(
  orders: Order[],
  customers: Customer[],
  skus: Sku[],
): Analytics {
  // Cancelled orders do not contribute to recorded sales or averages.
  orders = orders.filter(order => order.status !== "cancelled");
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const skuName = new Map(skus.map((s) => [s.id, s.name]));

  const unitsBySku = new Map(skus.map((s) => [s.id, s.unitsPerCase]));
  const byCustomer = new Map<string, NamedRevenue>();
  const byRegion = new Map<string, NamedRevenue>();
  const byOwner = new Map<string, NamedRevenue>();
  const byChannel = new Map<string, NamedRevenue>();
  const byProduct = new Map<string, NamedRevenue>();
  const byMonth = new Map<string, MonthPoint>();
  const byDay = new Map<number, DayPoint>();

  let totalRevenueCents = 0;
  let totalCases = 0;
  let totalBottles = 0;

  for (const order of orders) {
    // Use subtotal (product revenue) for seller/region/product rollups; freight
    // is a pass-through cost, not sales performance.
    const revenue = order.subtotalCents;
    const cases = order.lines.reduce((n, l) => n + l.cases, 0);
    totalRevenueCents += revenue;
    totalCases += cases;

    const customer = customerById.get(order.customerId);
    const company = customer?.company ?? order.customerId;
    const region = customer?.region?.trim() || "Unassigned";
    const owner = customer?.accountOwner?.trim() || "Unassigned";
    const channelLabel = customer ? CHANNEL_LABELS[customer.channel] : "Unassigned";

    addRevenue(byCustomer, order.customerId, company, revenue, cases);
    addRevenue(byRegion, region, region, revenue, cases);
    addRevenue(byOwner, owner, owner, revenue, cases);
    addRevenue(byChannel, channelLabel, channelLabel, revenue, cases);

    for (const line of order.lines) {
      addRevenue(byProduct, line.skuId, skuName.get(line.skuId) ?? line.skuId, line.lineTotalCents, line.cases);
      const units = unitsBySku.get(line.skuId) ?? 1;
      totalBottles += line.unit === "bottle" ? line.quantity : line.quantity * units;
    }

    const date = new Date(order.createdAt);
    const month = order.createdAt.slice(0, 7); // YYYY-MM
    const m = byMonth.get(month) ?? { month, revenueCents: 0, orderCount: 0 };
    m.revenueCents += revenue;
    m.orderCount += 1;
    byMonth.set(month, m);

    const dow = date.getUTCDay();
    const d = byDay.get(dow) ?? { dow, label: DOW_LABELS[dow], revenueCents: 0, orderCount: 0 };
    d.revenueCents += revenue;
    d.orderCount += 1;
    byDay.set(dow, d);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const momGrowth =
    months.length >= 2
      ? (() => {
          const last = months[months.length - 1].revenueCents;
          const prev = months[months.length - 2].revenueCents;
          return prev === 0 ? null : (last - prev) / prev;
        })()
      : null;

  const byDayOfWeek: DayPoint[] = DOW_LABELS.map(
    (label, dow) => byDay.get(dow) ?? { dow, label, revenueCents: 0, orderCount: 0 },
  );
  const bestDay =
    [...byDay.values()].sort((a, b) => b.revenueCents - a.revenueCents)[0] ?? null;

  // Forecast: average of up to the last 3 months of revenue.
  const forecastNextMonthCents =
    months.length === 0
      ? null
      : Math.round(
          months.slice(-3).reduce((sum, m) => sum + m.revenueCents, 0) /
            Math.min(3, months.length),
        );

  return {
    totalRevenueCents,
    orderCount: orders.length,
    avgOrderCents: orders.length === 0 ? 0 : Math.round(totalRevenueCents / orders.length),
    totalCases,
    totalBottles,
    avgCasePriceCents: totalCases === 0 ? 0 : Math.round(totalRevenueCents / totalCases),
    avgBottlePriceCents: totalBottles === 0 ? 0 : Math.round(totalRevenueCents / totalBottles),
    topProducts: sortedByRevenue(byProduct),
    byCustomer: sortedByRevenue(byCustomer),
    byRegion: sortedByRevenue(byRegion),
    byOwner: sortedByRevenue(byOwner),
    byChannel: sortedByRevenue(byChannel),
    byMonth: months,
    byDayOfWeek,
    momGrowth,
    bestDay,
    forecastNextMonthCents,
  };
}
