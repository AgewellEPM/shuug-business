/**
 * Invoice audit — the Bedrock "stop overpaying" engine, brought over for inbound
 * supplier / freight invoices. For each vendor item code it builds a price
 * history across all invoices, takes the median, and flags any line billed above
 * that median (with enough samples to trust it). Every flag traces to the exact
 * numbers: "unit $X vs your median $Y (n=Z)". Pure and deterministic.
 */
import type { InvoiceLineItem, SupplierInvoice } from "./model";

export const MIN_SAMPLES = 3;
export const FLAG_FACTOR = 1.3; // billed > 1.3x the median = overcharge

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export interface OverchargeFlag {
  itemCode: string;
  description: string;
  unitPriceCents: number;
  medianCents: number;
  samples: number;
  quantity: number;
  overchargeCents: number;
}

export type InvoiceStatus = "held" | "clean";

export interface AuditedInvoice extends SupplierInvoice {
  flags: OverchargeFlag[];
  atRiskCents: number;
  status: InvoiceStatus;
}

export interface AuditReport {
  invoices: AuditedInvoice[];
  totalAtRiskCents: number;
  invoiceCount: number;
  flaggedInvoiceCount: number;
  /** median unit price per item code (the reusable price book). */
  medianByCode: Record<string, { medianCents: number; samples: number }>;
}

/** Build the price book: median unit price + sample count per item code. */
export function priceBook(invoices: SupplierInvoice[]): Map<string, { medianCents: number; samples: number }> {
  const byCode = new Map<string, number[]>();
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const arr = byCode.get(line.itemCode) ?? [];
      arr.push(line.unitPriceCents);
      byCode.set(line.itemCode, arr);
    }
  }
  const book = new Map<string, { medianCents: number; samples: number }>();
  for (const [code, prices] of byCode) {
    book.set(code, { medianCents: median(prices), samples: prices.length });
  }
  return book;
}

function flagLine(
  line: InvoiceLineItem,
  book: Map<string, { medianCents: number; samples: number }>,
): OverchargeFlag | null {
  const stat = book.get(line.itemCode);
  if (!stat || stat.samples < MIN_SAMPLES) return null; // not enough history to judge
  if (line.unitPriceCents <= stat.medianCents * FLAG_FACTOR) return null;
  return {
    itemCode: line.itemCode,
    description: line.description,
    unitPriceCents: line.unitPriceCents,
    medianCents: stat.medianCents,
    samples: stat.samples,
    quantity: line.quantity,
    overchargeCents: Math.round((line.unitPriceCents - stat.medianCents) * line.quantity),
  };
}

export function auditInvoices(invoices: SupplierInvoice[]): AuditReport {
  const book = priceBook(invoices);
  const audited: AuditedInvoice[] = invoices.map((inv) => {
    const flags = inv.lines.map((l) => flagLine(l, book)).filter((f): f is OverchargeFlag => f !== null);
    const atRiskCents = flags.reduce((n, f) => n + f.overchargeCents, 0);
    return { ...inv, flags, atRiskCents, status: flags.length > 0 ? "held" : "clean" };
  });

  const medianByCode: Record<string, { medianCents: number; samples: number }> = {};
  for (const [code, stat] of book) medianByCode[code] = stat;

  return {
    invoices: audited,
    totalAtRiskCents: audited.reduce((n, i) => n + i.atRiskCents, 0),
    invoiceCount: audited.length,
    flaggedInvoiceCount: audited.filter((i) => i.status === "held").length,
    medianByCode,
  };
}
