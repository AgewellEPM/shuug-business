/**
 * CustomerHeader — shared identity + tab nav across a customer's pages
 * (Agreement / Orders), Shopify-style. Presentational.
 */
import Link from "next/link";
import { formatPercent } from "@/lib/format";
import type { Customer, PriceAgreement } from "@/lib/data/model";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function CustomerHeader({
  customer,
  agreement,
  active,
}: {
  customer: Customer;
  agreement: PriceAgreement;
  active: "agreement" | "orders";
}) {
  const tab = (key: "agreement" | "orders", href: string, label: string) => (
    <Link
      href={href}
      className={`border-b-2 px-1 pb-2 text-sm font-medium transition ${
        active === key
          ? "border-emerald-600 text-emerald-700"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="mb-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← All customers
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{customer.company}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {customer.buyerName} · {customer.buyerEmail}{customer.phone && <> · <a href={`tel:${customer.phone.replace(/[^+0-9]/g,"")}`} className="text-emerald-700 hover:underline">{customer.phone}</a></>}
            {customer.website && (
              <>
                {" · "}
                <a
                  href={customer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline"
                >
                  {hostOf(customer.website)}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Target margin</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {formatPercent(agreement.targetMarginFraction)}
          </p>
        </div>
      </div>

      <nav className="mt-4 flex gap-6 border-b border-slate-200">
        {tab("agreement", `/customers/${customer.id}`, "Agreement & pricing")}
        {tab("orders", `/customers/${customer.id}/orders`, "Orders")}
      </nav>
    </header>
  );
}
