"use client";

/** Client portal order/receipt history + a one-click CSV download of it all. */
import { formatCents } from "@/lib/money";

interface Receipt { id: string; dateISO: string; status: string; poNumber: string | null; totalCents: number }

const STATUS_LABEL: Record<string, string> = { submitted: "Processing", fulfilled: "Shipped", cancelled: "Cancelled" };

function csvCell(v: string) {
  // Neutralize spreadsheet formula injection + quote separators.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function PortalReceipts({ receipts, company }: { receipts: Receipt[]; company: string }) {
  const download = () => {
    const header = ["Order", "PO", "Date", "Status", "Total"];
    const rows = receipts.map((r) => [r.id, r.poNumber ?? "", r.dateISO.slice(0, 10), STATUS_LABEL[r.status] ?? r.status, (r.totalCents / 100).toFixed(2)]);
    const csv = [header, ...rows].map((row) => row.map((c) => csvCell(String(c))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-orders.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Your orders &amp; receipts</h2>
        {receipts.length > 0 && (
          <button type="button" onClick={download} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50">
            Download CSV
          </button>
        )}
      </div>
      {receipts.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Status</th><th className="py-2 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4"><span className="font-medium text-slate-800">{r.id}</span>{r.poNumber && <span className="ml-2 text-xs text-slate-400">PO {r.poNumber}</span>}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{r.dateISO.slice(0, 10)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "fulfilled" ? "bg-emerald-50 text-emerald-700" : r.status === "cancelled" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-800"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatCents(r.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
