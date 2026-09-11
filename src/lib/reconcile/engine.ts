/**
 * Accounting reconciliation (#14) — map our records to the accounting system and
 * EXPOSE mismatches instead of hiding them. Two parts: (1) mapping coverage — how
 * many customers/products are linked to an accounting id, and which aren't; (2)
 * totals reconciliation — our ledger vs the accounting ledger, line by line, with
 * the variance and a match/mismatch verdict. When the accounting side isn't
 * connected, lines read "unknown" (never a fake match). Pure, cents-only.
 */
export interface LedgerTotals {
  arCents: number;
  incomeCents: number;
  salesTaxCents: number;
  feesCents: number;
  paymentsCents: number;
}

export type ReconStatus = "match" | "mismatch" | "unknown";

export interface ReconLine {
  key: string;
  label: string;
  localCents: number;
  accountingCents: number | null;
  varianceCents: number | null;
  status: ReconStatus;
}

export interface MappingCoverage {
  entity: string;
  total: number;
  mapped: number;
  unmapped: { id: string; label: string }[];
  pctMapped: number;
}

const LINES: { key: keyof LedgerTotals; label: string }[] = [
  { key: "arCents", label: "Accounts receivable" },
  { key: "incomeCents", label: "Income (sales)" },
  { key: "salesTaxCents", label: "Sales tax collected" },
  { key: "paymentsCents", label: "Payments received" },
  { key: "feesCents", label: "Processor fees" },
];

/** Compare our totals to the accounting system's. tolerance in cents. */
export function reconcileTotals(local: LedgerTotals, accounting: LedgerTotals | null, toleranceCents = 100): ReconLine[] {
  return LINES.map(({ key, label }) => {
    const localCents = local[key];
    if (!accounting) return { key, label, localCents, accountingCents: null, varianceCents: null, status: "unknown" as ReconStatus };
    const accountingCents = accounting[key];
    const varianceCents = localCents - accountingCents;
    return { key, label, localCents, accountingCents, varianceCents, status: Math.abs(varianceCents) <= toleranceCents ? "match" : "mismatch" };
  });
}

export function mappingCoverage(entity: string, items: { id: string; label: string; mappedId: string | null }[]): MappingCoverage {
  const mapped = items.filter((i) => i.mappedId).length;
  return {
    entity,
    total: items.length,
    mapped,
    unmapped: items.filter((i) => !i.mappedId).map((i) => ({ id: i.id, label: i.label })),
    pctMapped: items.length ? Math.round((mapped / items.length) * 100) : 100,
  };
}

export interface ReconciliationReport {
  connected: boolean;
  lines: ReconLine[];
  coverage: MappingCoverage[];
  mismatches: number;
  unmapped: number;
  /** overall: reconciled only when connected, no mismatches, all mapped. */
  status: "reconciled" | "mismatched" | "unmapped" | "not-connected";
}

export function buildReport(local: LedgerTotals, accounting: LedgerTotals | null, coverage: MappingCoverage[]): ReconciliationReport {
  const lines = reconcileTotals(local, accounting);
  const mismatches = lines.filter((l) => l.status === "mismatch").length;
  const unmapped = coverage.reduce((n, c) => n + c.unmapped.length, 0);
  const status: ReconciliationReport["status"] =
    !accounting ? "not-connected" : mismatches > 0 ? "mismatched" : unmapped > 0 ? "unmapped" : "reconciled";
  return { connected: !!accounting, lines, coverage, mismatches, unmapped, status };
}
