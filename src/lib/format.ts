/** Presentation helpers. Money formatting lives in ./money (formatCents). */

/** Format a 0..1 fraction as a percent string, e.g. 0.4272 -> "42.7%". */
export function formatPercent(fraction: number | null, digits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

const PAYMENT_LABELS: Record<string, string> = {
  prepaid: "Prepaid",
  card: "Credit card",
  net15: "Net 15",
  net30: "Net 30",
  net45: "Net 45",
};

export function paymentTermsLabel(code: string): string {
  return PAYMENT_LABELS[code] ?? code;
}

/** Human date from an ISO date/datetime, e.g. "2027-01-01" -> "Jan 1, 2027". */
export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
