import { requireSectionAccess } from "@/lib/permissions/guard";
import { listSupplierInvoices, listUploads } from "@/lib/ops/store";
import { auditInvoices } from "@/lib/ops/invoice-audit";
import { pullQboBillsAsInvoices } from "@/lib/integrations/quickbooks";
import { InvoiceAuditView } from "@/components/InvoiceAuditView";
import { SpreadsheetUpload } from "@/components/SpreadsheetUpload";
import { uploadSpreadsheetAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requireSectionAccess("money", "view");

  const demoReport = auditInvoices(listSupplierInvoices());
  const uploads = listUploads();
  const qbo = await pullQboBillsAsInvoices();
  const qboReport = qbo.ok ? auditInvoices(qbo.invoices) : null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoices & spend audit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every inbound invoice checked against your own price history — anything billed above your
          median is flagged and held. Stop overpaying.
        </p>
      </header>

      <div className="space-y-6">
        <SpreadsheetUpload uploads={uploads} uploadAction={uploadSpreadsheetAction} />

        <InvoiceAuditView report={demoReport} title="Supplier invoices (demo)" />

        {qboReport ? (
          <InvoiceAuditView report={qboReport} title="QuickBooks bills" />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">QuickBooks transactions</h2>
            <p className="text-slate-500">
              {qbo.error ?? "Not connected."} Connect QuickBooks in Settings to pull your bills and
              transactions in here and flag anything that looks off.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
