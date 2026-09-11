/**
 * Cash-flow forecast — see it before it's tight. Combines an opening balance with
 * expected collections (from open invoices + their terms) and outflows (bills,
 * payroll) into a forward weekly calendar with a running balance, plus A/R aging.
 * Confirmed inputs and forecast are kept separate — no single falsely-precise
 * number. Pure, cents-only. A collection-delay knob powers "what-if" scenarios.
 */
import type { PaymentTermsCode } from "../data/model";

const DAY = 86_400_000;

export function termDays(code: PaymentTermsCode): number {
  return code === "net45" ? 45 : code === "net30" ? 30 : code === "net15" ? 15 : 0; // prepaid/card = due now
}

export interface CashItem { amountCents: number; dueMs: number; label: string; kind: "collection" | "payroll" | "bill" }

export interface CashWeek { weekStartMs: number; inflowCents: number; outflowCents: number; netCents: number; endingBalanceCents: number }
export interface ArAging { currentCents: number; d1_30Cents: number; d31_60Cents: number; d61_90Cents: number; d90plusCents: number; totalCents: number }

export interface CashForecast {
  openingCents: number;
  weeks: CashWeek[];
  arAging: ArAging;
  lowestBalanceCents: number;
  lowestWeekStartMs: number;
  goesNegative: boolean;
  totalExpectedInCents: number;
  totalExpectedOutCents: number;
}

export function computeCashFlow(input: {
  openingCents: number;
  receivables: CashItem[];
  payables: CashItem[];
  nowMs: number;
  weeks?: number;
  collectionDelayDays?: number;
}): CashForecast {
  const weeksN = input.weeks ?? 12;
  const delay = (input.collectionDelayDays ?? 0) * DAY;
  const weekStart = (i: number) => input.nowMs + i * 7 * DAY;

  const weeks: CashWeek[] = Array.from({ length: weeksN }, (_, i) => ({
    weekStartMs: weekStart(i), inflowCents: 0, outflowCents: 0, netCents: 0, endingBalanceCents: 0,
  }));

  // Which week a due date lands in (anything already due lands in week 0).
  const weekIndex = (dueMs: number) => {
    if (dueMs < input.nowMs) return 0;
    const i = Math.floor((dueMs - input.nowMs) / (7 * DAY));
    return i >= weeksN ? -1 : i;
  };

  for (const r of input.receivables) {
    const i = weekIndex(r.dueMs + delay);
    if (i >= 0) weeks[i].inflowCents += r.amountCents;
  }
  for (const p of input.payables) {
    const i = weekIndex(p.dueMs);
    if (i >= 0) weeks[i].outflowCents += p.amountCents;
  }

  let running = input.openingCents;
  let lowest = input.openingCents;
  let lowestWeek = input.nowMs;
  for (const w of weeks) {
    w.netCents = w.inflowCents - w.outflowCents;
    running += w.netCents;
    w.endingBalanceCents = running;
    if (running < lowest) { lowest = running; lowestWeek = w.weekStartMs; }
  }

  return {
    openingCents: input.openingCents,
    weeks,
    arAging: ageReceivables(input.receivables, input.nowMs),
    lowestBalanceCents: lowest,
    lowestWeekStartMs: lowestWeek,
    goesNegative: lowest < 0,
    totalExpectedInCents: weeks.reduce((n, w) => n + w.inflowCents, 0),
    totalExpectedOutCents: weeks.reduce((n, w) => n + w.outflowCents, 0),
  };
}

export function ageReceivables(receivables: CashItem[], nowMs: number): ArAging {
  const a: ArAging = { currentCents: 0, d1_30Cents: 0, d31_60Cents: 0, d61_90Cents: 0, d90plusCents: 0, totalCents: 0 };
  for (const r of receivables) {
    if (r.kind !== "collection") continue;
    a.totalCents += r.amountCents;
    const overdueDays = Math.floor((nowMs - r.dueMs) / DAY);
    if (overdueDays <= 0) a.currentCents += r.amountCents;
    else if (overdueDays <= 30) a.d1_30Cents += r.amountCents;
    else if (overdueDays <= 60) a.d31_60Cents += r.amountCents;
    else if (overdueDays <= 90) a.d61_90Cents += r.amountCents;
    else a.d90plusCents += r.amountCents;
  }
  return a;
}
