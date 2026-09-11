"use client";

/**
 * NewCustomerForm — Shopify-style add-customer form. Live-previews the URL slug
 * the customer will get, submits via the server action, and navigates to the
 * new customer's page on success.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeMargin } from "@/lib/pricing";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import type { Sku } from "@/lib/data/model";
import type { CreateCustomerResult } from "@/app/customers/new/actions";

type ItemInput = { skuId: string; carried: boolean; unitPriceCents: number };

type Channel = "wholesale_bulk" | "store" | "online" | "amazon";

type Action = (form: {
  company: string;
  channel: Channel;
  buyerName: string;
  buyerEmail: string;
  website: string;
  accountOwner: string;
  region: string;
  billingAddress: string;
  shippingAddress: string;
  quickbooksCustomerId: string;
  requiresPO: boolean;
  targetPct: number;
  floorPct: number;
  items: ItemInput[];
}) => Promise<CreateCustomerResult>;

function labelCls() {
  return "mb-1 block text-sm font-medium text-slate-700";
}
function inputCls() {
  return "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
}

type ItemState = { carried: boolean; priceDollars: string };

export function NewCustomerForm({
  createAction,
  catalog,
}: {
  createAction: Action;
  catalog: Sku[];
}) {
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      catalog.map((s) => [
        s.id,
        { carried: true, priceDollars: (s.standardPriceCents / 100).toFixed(2) },
      ]),
    ),
  );
  const [company, setCompany] = useState("");
  const [channel, setChannel] = useState<Channel>("store");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [accountOwner, setAccountOwner] = useState("");
  const [region, setRegion] = useState("");
  const [billingAddress, setBilling] = useState("");
  const [shippingAddress, setShipping] = useState("");
  const [quickbooksCustomerId, setQb] = useState("");
  const [requiresPO, setRequiresPO] = useState(false);
  const [targetPct, setTargetPct] = useState(40);
  const [floorPct, setFloorPct] = useState(30);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  function priceCentsFor(sku: Sku): number {
    const st = items[sku.id];
    try {
      return parseDollarsToCents(st.priceDollars);
    } catch {
      return sku.standardPriceCents; // fall back to standard on unparseable input
    }
  }

  function setItem(skuId: string, patch: Partial<ItemState>) {
    setItems((prev) => ({ ...prev, [skuId]: { ...prev[skuId], ...patch } }));
  }

  /** Per-bottle price derived from the per-case price and case size. */
  function eachValueFor(sku: Sku): string {
    const units = sku.unitsPerCase || 1;
    return (priceCentsFor(sku) / units / 100).toFixed(2);
  }

  /** Editing the per-bottle price writes back the per-case price (each × units). */
  function onEachChange(sku: Sku, value: string) {
    const units = sku.unitsPerCase || 1;
    const each = Number(value);
    if (!Number.isFinite(each) || each < 0) return;
    setItem(sku.id, { priceDollars: (each * units).toFixed(2) });
  }

  function submit() {
    setError(null);
    const itemInputs: ItemInput[] = catalog.map((s) => ({
      skuId: s.id,
      carried: items[s.id].carried,
      unitPriceCents: priceCentsFor(s),
    }));
    startTransition(async () => {
      const res = await createAction({
        company,
        channel,
        buyerName,
        buyerEmail,
        website,
        accountOwner,
        region,
        billingAddress,
        shippingAddress,
        quickbooksCustomerId,
        requiresPO,
        targetPct,
        floorPct,
        items: itemInputs,
      });
      if (res.ok && res.customerId) {
        router.push(`/customers/${res.customerId}`);
      } else {
        setError(res.error ?? "Could not create customer");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Company
        </h2>
        <div className="grid gap-4">
          <label className="block">
            <span className={labelCls()}>Company name *</span>
            <input className={inputCls()} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Joe's Market" />

          </label>
          <label className="block">
            <span className={labelCls()}>Sales channel / buyer type</span>
            <select className={inputCls()} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              <option value="store">Stores</option>
              <option value="wholesale_bulk">Bulk</option>
              <option value="online">Online</option>
              <option value="amazon">Online · Amazon</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls()}>Website</span>
            <input className={inputCls()} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://joesmarket.com" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls()}>Buyer / contact *</span>
              <input className={inputCls()} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Joe Ferraro" />
            </label>
            <label className="block">
              <span className={labelCls()}>Buyer email *</span>
              <input className={inputCls()} value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="joe@joesmarket.com" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls()}>Account owner</span>
              <input className={inputCls()} value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} placeholder="Sales rep (e.g. Alex Rivera)" />
            </label>
            <label className="block">
              <span className={labelCls()}>Region / territory</span>
              <input className={inputCls()} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. MA, Northeast" />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Addresses & mapping
        </h2>
        <div className="grid gap-4">
          <label className="block">
            <span className={labelCls()}>Billing address</span>
            <input className={inputCls()} value={billingAddress} onChange={(e) => setBilling(e.target.value)} placeholder="12 Main St, Springfield, MA" />
          </label>
          <label className="block">
            <span className={labelCls()}>Shipping address <span className="text-slate-400">(defaults to billing)</span></span>
            <input className={inputCls()} value={shippingAddress} onChange={(e) => setShipping(e.target.value)} placeholder="Loading dock, 12 Main St" />
          </label>
          <label className="block">
            <span className={labelCls()}>QuickBooks customer ID</span>
            <input className={inputCls()} value={quickbooksCustomerId} onChange={(e) => setQb(e.target.value)} placeholder="QB-1042 (optional)" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={requiresPO} onChange={(e) => setRequiresPO(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            Requires a PO number on every order
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Item list &amp; pricing
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Products auto-fill from your universal list at standard wholesale. Uncheck what this
          store doesn&apos;t carry, and set their price — per case or per bottle (they stay linked).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 font-medium">Carry</th>
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 text-right font-medium">Cost</th>
              <th className="py-2 text-right font-medium">Price / case</th>
              <th className="py-2 text-right font-medium">Price / bottle</th>
              <th className="py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {catalog.map((sku) => {
              const st = items[sku.id];
              const priceCents = priceCentsFor(sku);
              const margin = computeMargin(sku.costPerCaseCents, priceCents);
              return (
                <tr key={sku.id} className={st.carried ? "" : "opacity-40"}>
                  <td className="py-2.5">
                    <input
                      type="checkbox"
                      checked={st.carried}
                      onChange={(e) => setItem(sku.id, { carried: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      aria-label={`Carry ${sku.name}`}
                    />
                  </td>
                  <td className="py-2.5">
                    <div className="font-medium text-slate-800">{sku.name}</div>
                    <div className="text-xs text-slate-400">
                      {sku.unitsPerCase}/case · {formatCents(sku.retailPriceCents)} retail
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">
                    {formatCents(sku.costPerCaseCents)}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-slate-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={st.priceDollars}
                      onChange={(e) => setItem(sku.id, { priceDollars: e.target.value })}
                      disabled={!st.carried}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none disabled:bg-slate-50"
                      aria-label={`${sku.name} price per case`}
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-slate-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={eachValueFor(sku)}
                      onChange={(e) => onEachChange(sku, e.target.value)}
                      disabled={!st.carried}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none disabled:bg-slate-50"
                      aria-label={`${sku.name} price per bottle`}
                    />
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">
                    {formatPercent(margin.marginFraction)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Margin policy
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls()}>Target margin %</span>
            <input type="number" min={0} max={95} className={inputCls()} value={targetPct} onChange={(e) => setTargetPct(Number(e.target.value) || 0)} />
          </label>
          <label className="block">
            <span className={labelCls()}>Floor margin %</span>
            <input type="number" min={0} max={95} className={inputCls()} value={floorPct} onChange={(e) => setFloorPct(Number(e.target.value) || 0)} />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          New customer starts with all SKUs at standard wholesale; tune prices on the agreement page.
        </p>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create customer"}
        </button>
        <span className="text-sm text-slate-400">You can edit everything afterward.</span>
      </div>
    </div>
  );
}
