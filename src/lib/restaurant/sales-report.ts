import type { RestaurantBusiness, RestaurantClose } from "./business-model";
import { restaurantDay } from "./business-model";
import { creditedRestaurantLine, restaurantCheckBalance } from "./credits";
import { dayNumber, reportQuery, shiftReportDate, type ReportQuery } from "./report-model";

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sum = <T>(rows: T[], value: (v: T) => number) => rows.reduce((n, v) => n + value(v), 0);
const gross = (c: RestaurantClose) => c.grossSales ?? c.sales;
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null;
const change = (now: number | null, before: number | null) => now === null || before === null || before <= 0 ? null : (now - before) / before * 100;

export function restaurantPeriodReport(b: RestaurantBusiness, raw: ReportQuery = {}) {
  const query = reportQuery.parse(raw), today = restaurantDay(b.config);
  if (query.to && query.to > today) throw new Error("Choose an end date no later than the current restaurant business date.");
  const exposure = new Map((b.serviceHours ?? []).map(h => [h.closeId, h]));
  const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to);
  function period(from?: string, to?: string) {
    const closes = b.closes.filter(c => inRange(c.date, from, to)).sort((a, c) => a.date.localeCompare(c.date)), open = closes.filter(c => c.operated);
    const withHours = open.filter(c => exposure.has(c.id)), minutes = sum(withHours, c => exposure.get(c.id)!.openMinutes);
    return {
      from: from ?? closes[0]?.date ?? null, to: to ?? closes.at(-1)?.date ?? null,
      openDays: open.length, closedDays: closes.length - open.length,
      unreviewedDays: from && to ? Math.max(0, dayNumber(to) - dayNumber(from) + 1 - new Set(closes.map(c => c.date)).size) : null,
      daysWithHours: withHours.length, daysMissingHours: open.length - withHours.length, openMinutes: minutes,
      sales: sum(open, gross), covers: sum(open, c => c.covers),
      // Credits are reported on their posting dates, including non-service days.
      credits: sum(closes, c => c.credits ?? 0), netSales: sum(closes, c => c.sales), foodCost: sum(closes, c => c.foodCost),
      averageSales: ratio(sum(open, gross), open.length), averageCovers: ratio(sum(open, c => c.covers), open.length),
      salesPerHour: ratio(sum(withHours, gross) * 60, minutes), coversPerHour: ratio(sum(withHours, c => c.covers) * 60, minutes),
    };
  }
  const current = period(query.from, query.to), selected = b.closes.filter(c => inRange(c.date, query.from, query.to));
  const observed = selected.filter(c => c.operated);
  const weekdays = weekdayNames.map((name, index) => {
    const days = observed.filter(c => new Date(`${c.date}T12:00:00Z`).getUTCDay() === index), timed = days.filter(c => exposure.has(c.id));
    const sales = sum(days, gross), covers = sum(days, c => c.covers), minutes = sum(timed, c => exposure.get(c.id)!.openMinutes);
    return { name, observedDays: days.length, sales, covers, credits: sum(days, c => c.credits ?? 0), netSales: sum(days, c => c.sales), foodCost: sum(days, c => c.foodCost),
      averageSales: ratio(sales, days.length), averageCovers: ratio(covers, days.length),
      daysWithHours: timed.length, daysMissingHours: days.length - timed.length, openMinutes: minutes,
      salesPerHour: ratio(sum(timed, gross) * 60, minutes), coversPerHour: ratio(sum(timed, c => c.covers) * 60, minutes),
      comparable: days.length >= 3 && (query.basis === "open_day" || timed.length === days.length),
    };
  });
  const comparable = weekdays.filter(d => d.comparable);
  const salesRate = (d: typeof weekdays[number]) => query.basis === "open_hour" ? d.salesPerHour! : d.averageSales!;
  const coverRate = (d: typeof weekdays[number]) => query.basis === "open_hour" ? d.coversPerHour! : d.averageCovers!;
  const quietestDays = comparable.length < 2 ? [] : comparable.filter(d => coverRate(d) === Math.min(...comparable.map(coverRate)));
  const busiestDays = comparable.length < 2 ? [] : comparable.filter(d => salesRate(d) === Math.max(...comparable.map(salesRate)));
  const quietest = quietestDays.length === 1 ? quietestDays[0] : null, busiest = busiestDays.length === 1 ? busiestDays[0] : null;
  const unit = query.basis === "open_hour" ? "reviewed open hour" : "reviewed open day";
  const guidance = comparable.length < 2
    ? `Record at least three open service days for each of two weekdays${query.basis === "open_hour" ? ", with reviewed opening time for every observed day of those weekdays" : ""} before ranking busy and quiet days. Missing days are unknown; closed days are excluded.`
    : `${quietestDays.map(d => d.name).join(" and ")}${quietestDays.length > 1 ? " are tied for" : " has"} the lowest recorded covers per ${unit}. Test a limited special against similar service periods. These observations do not establish that a promotion will cause extra sales.`;

  // Menu/hour/channel reports follow original service dates. Later credits are
  // included only through the selected end date, never shifted into a new sale.
  const creditView = { ...b, credits: (b.credits ?? []).filter(c => !query.to || c.date <= query.to) };
  const served = b.orders.filter(o => ["served", "closed"].includes(o.status) && o.saleDate && inRange(o.saleDate, query.from, query.to));
  const items = new Map<string, { id: string; name: string; quantity: number; sales: number }>();
  for (const o of served) for (const line of o.lines) {
    const item = items.get(line.menuId) ?? { id: line.menuId, name: line.name, quantity: 0, sales: 0 };
    item.quantity += line.qty; item.sales += line.subtotal - creditedRestaurantLine(creditView, o, line); items.set(line.menuId, item);
  }
  const net = (o: typeof served[number]) => o.subtotal - restaurantCheckBalance(creditView, o).foodCredit;
  const hours = Array.from({ length: 24 }, (_, hour) => { const orders = served.filter(o => o.saleHour === hour); return { hour, orders: orders.length, sales: sum(orders, net) }; });
  const channels = (["dine_in", "takeaway", "online"] as const).map(channel => {
    const orders = served.filter(o => o.channel === channel), covers = sum([...new Map(orders.map(o => [o.reservationId ?? o.id, o.covers])).values()], n => n);
    return { channel, orders: orders.length, covers, sales: sum(orders, net), foodCost: sum(orders, o => o.foodCost), averageCheck: ratio(sum(orders, net), orders.length) };
  });
  const span = query.from && query.to ? dayNumber(query.to) - dayNumber(query.from) + 1 : null;
  const previous = span && query.from ? period(shiftReportDate(query.from, -span), shiftReportDate(query.from, -1)) : null;
  const adequate = (p: typeof current) => p.openDays >= 3 && p.unreviewedDays === 0 && (query.basis === "open_day" || p.daysMissingHours === 0);
  const comparablePeriods = !!previous && adequate(current) && adequate(previous);
  const periodSales = (p: typeof current) => query.basis === "open_hour" ? p.salesPerHour : p.averageSales;
  const periodCovers = (p: typeof current) => query.basis === "open_hour" ? p.coversPerHour : p.averageCovers;
  return { query, currency: b.config.currency, timezone: b.config.timezone, businessDayStartHour: b.config.businessDayStartHour,
    observedOpenDays: current.openDays, recordedClosedDays: current.closedDays,
    firstDate: observed.map(c => c.date).sort()[0] ?? null, lastDate: observed.map(c => c.date).sort().at(-1) ?? null,
    period: current, previous, comparison: { comparable: comparablePeriods, salesPercent: comparablePeriods ? change(periodSales(current), periodSales(previous!)) : null, coversPercent: comparablePeriods ? change(periodCovers(current), periodCovers(previous!)) : null },
    weekdays, quietest, busiest, quietestDays: quietestDays.map(d => d.name), busiestDays: busiestDays.map(d => d.name), guidance,
    items: [...items.values()].sort((a, c) => c.sales - a.sales), hours, channels,
    unclosedServiceDays: new Set(served.filter(o => !selected.some(c => c.date === o.saleDate)).map(o => o.saleDate)).size,
    days: selected.sort((a, c) => a.date.localeCompare(c.date)).map(c => ({ date: c.date, operated: c.operated, openMinutes: c.operated ? exposure.get(c.id)?.openMinutes ?? null : 0, sales: gross(c), credits: c.credits ?? 0, netSales: c.sales, covers: c.covers, checks: c.orderCount, foodCost: c.foodCost })),
  };
}

/** Only validated dates and numeric totals go into this CSV; no guest or free-text fields. */
export function restaurantReportCsv(report: ReturnType<typeof restaurantPeriodReport>) {
  return ["Business date,Open for service,Reviewed open minutes,Sales before credits (USD cents),Credits posted (USD cents),Net sales (USD cents),Recorded covers,Checks,Food cost (USD cents)",
    ...report.days.map(d => [d.date, d.operated ? "yes" : "no", d.openMinutes ?? "", d.sales, d.credits, d.netSales, d.covers, d.checks, d.foodCost].join(","))].join("\r\n") + "\r\n";
}
