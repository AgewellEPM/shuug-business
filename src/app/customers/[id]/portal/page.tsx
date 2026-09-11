import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealStore } from "@/lib/data/store";
import { setting } from "@/lib/connections/vault";
import { formatCents } from "@/lib/money";
import { formatPercent, paymentTermsLabel } from "@/lib/format";
import { accountSummary, daysSinceLastOrder } from "@/lib/portal/summary";
import { listDocs } from "@/lib/documents/store";
import { DOC_CATEGORIES } from "@/lib/documents/model";
import { PortalReceipts } from "@/components/PortalReceipts";

const DOC_LABEL = new Map(DOC_CATEGORIES.map((c) => [c.key, c.label]));

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSectionAccess("sales", "view");

  const { id } = await params;
  const store = await getDealStore();
  const deal = await store.getDeal(id);
  if (!deal) notFound();
  const orders = await store.listOrders(id);

  const c = deal.customer;
  const a = deal.agreement;
  const s = accountSummary(orders);
  const daysAgo = daysSinceLastOrder(s.lastOrderISO, new Date());
  const supportEmail = setting("SUPPORT_EMAIL") || "support@shuug.co";
  const supportPhone = setting("SUPPORT_PHONE") || "(555) 010-7847";
  // Documents shared with this customer that have an attached file to download.
  const sharedDocs = listDocs().filter((d) => d.linkedType === "customer" && d.linkedId === id && d.fileDataUrl);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Owner context banner (this is what your customer sees) */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-800">
        <span>👀</span> This is your customer’s account view — share it with {c.company}.
        <Link href={`/customers/${id}/orders`} className="ml-auto font-semibold underline">Back to account</Link>
      </div>

      <header className="mb-6">
        <p className="dd-eyebrow">Your Shuug account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{c.company}</h1>
        <p className="mt-1 text-sm text-slate-500">Your orders, receipts, pricing and who to reach — all in one place.</p>
      </header>

      {/* Account snapshot */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last order" value={s.lastOrderISO ? s.lastOrderISO.slice(0, 10) : "—"} sub={daysAgo === null ? "no orders yet" : daysAgo === 0 ? "today" : `${daysAgo} days ago`} />
        <Stat label="Total orders" value={String(s.orderCount)} />
        <Stat label="Lifetime spend" value={formatCents(s.lifetimeSpendCents)} />
        <Stat label="Avg order" value={formatCents(s.avgOrderCents)} />
      </div>

      <div className="space-y-5">
        <PortalReceipts
          receipts={orders.map((o) => ({ id: o.id, dateISO: o.createdAt, status: o.status, poNumber: o.poNumber, totalCents: o.totalCents }))}
          company={c.company}
        />

        {/* Your pricing & terms */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Your pricing &amp; terms</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Field label="Payment terms" value={paymentTermsLabel(a.paymentTerms)} />
            <Field label="Credit limit" value={a.creditLimitCents === null ? "—" : formatCents(a.creditLimitCents)} />
            <Field label="Minimum order" value={formatCents(a.minOrderDollarsCents)} />
            <Field label="Your rate" value={formatPercent(a.targetMarginFraction) + " target"} />
          </div>
          <p className="mt-3 text-xs text-slate-400">{a.lines.length} product{a.lines.length === 1 ? "" : "s"} on your price list. Questions on pricing? Contact your rep below.</p>
        </section>

        {/* Your documents */}
        {sharedDocs.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Your documents</h2>
            <ul className="divide-y divide-slate-100">
              {sharedDocs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <span className="text-lg">📎</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
                    <p className="text-[11px] text-slate-400">{DOC_LABEL.get(d.category) ?? d.category}{d.signature === "signed" ? " · signed ✓" : ""}</p>
                  </div>
                  <a href={d.fileDataUrl!} download={d.fileName || d.name} className="flex-none rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Download</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Contacts */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Contact title="Your rep" name={c.accountOwner || "Your Shuug rep"} lines={[supportEmail]} />
          <Contact title="Your supplier" name="Shuug" lines={[supportEmail, supportPhone]} />
          <Contact title="On file for you" name={c.buyerName} lines={[c.buyerEmail, c.phone || "—", c.shippingAddress || "No shipping address"]} />
        </section>

        <p className="text-center text-xs text-slate-400">Need help with an order or an invoice? Email <a href={`mailto:${supportEmail}`} className="font-semibold text-emerald-700">{supportEmail}</a> or call {supportPhone}.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}
function Contact({ title, name, lines }: { title: string; name: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-0.5 font-semibold text-slate-900">{name}</p>
      {lines.map((l, i) => <p key={i} className="truncate text-xs text-slate-500">{l}</p>)}
    </div>
  );
}
