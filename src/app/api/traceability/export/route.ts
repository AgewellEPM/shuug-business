/**
 * FSMA 204 traceability export — the "sortable spreadsheet within 24 hours"
 * an FDA request requires. Streams every Critical Tracking Event as CSV.
 * An API route, so it works independent of the page shell.
 */
import { requireSectionAccess } from "@/lib/permissions/guard";
import { traceabilityExportRows } from "@/lib/ops/store";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try { await requireSectionAccess("operations", "view"); } catch { return new Response("Access denied", { status: 403 }); }
  const rows = traceabilityExportRows();
  const headers = rows.length
    ? Object.keys(rows[0])
    : ["EventType", "TraceabilityLotCode", "Product", "Quantity_Cases", "EventDate", "Location", "Reference", "Counterparty", "InputLotCodes"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvCell(r[h] ?? "")).join(",")),
  ];
  const csv = lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fsma204-traceability-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
