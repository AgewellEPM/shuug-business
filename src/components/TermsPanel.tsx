/**
 * TermsPanel — the commercial envelope beneath the price: payment terms,
 * minimums, freight, validity window, PO requirement, QuickBooks mapping.
 * Presentational; takes the agreement + customer and renders. No state.
 */
import { formatCents } from "@/lib/money";
import { formatDate, paymentTermsLabel } from "@/lib/format";
import type { Customer, FreightPolicy, PriceAgreement } from "@/lib/data/model";

function freightText(f: FreightPolicy): string {
  switch (f.kind) {
    case "customer_pays":
      return "Customer pays freight";
    case "included":
      return "Freight included";
    case "flat":
      return `Flat freight ${formatCents(f.amountCents ?? 0)}`;
    case "free_over":
      return `Free freight over ${formatCents(f.amountCents ?? 0)}`;
    default:
      return f.kind;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

export function TermsPanel({
  agreement,
  customer,
}: {
  agreement: PriceAgreement;
  customer: Customer;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Terms</h3>
      <dl className="divide-y divide-slate-100">
        <Row label="Payment terms" value={paymentTermsLabel(agreement.paymentTerms)} />
        <Row
          label="Credit limit"
          value={agreement.creditLimitCents === null ? "—" : formatCents(agreement.creditLimitCents)}
        />
        <Row label="Minimum order" value={`${agreement.minCasesPerOrder} cases`} />
        <Row label="Minimum $ / order" value={formatCents(agreement.minOrderDollarsCents)} />
        <Row label="Freight" value={freightText(agreement.freight)} />
        <Row label="PO required" value={customer.requiresPO ? "Yes" : "No"} />
        <Row label="Price valid" value={`${formatDate(agreement.effectiveDate)} – ${formatDate(agreement.expirationDate)}`} />
        <Row label="Approved by" value={agreement.approvedBy} />
        <Row
          label="QuickBooks"
          value={customer.quickbooksCustomerId ? `Mapped · ${customer.quickbooksCustomerId}` : "Not mapped"}
        />
      </dl>
    </div>
  );
}
