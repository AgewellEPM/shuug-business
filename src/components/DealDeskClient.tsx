"use client";

/**
 * DealDeskClient — orchestrates one customer's deal: an editable margin card per
 * SKU (the price→consequence engine), the terms envelope, version history, and
 * the "Save price agreement" action that appends an immutable version.
 *
 * State is the sell price per SKU, in cents. Everything else (GP, margin,
 * guardrail, discount) is derived live by the pure engine inside each MarginRow.
 */
import { useMemo, useState, useTransition } from "react";
import { MarginRow } from "./MarginRow";
import { TermsPanel } from "./TermsPanel";
import { VersionHistory } from "./VersionHistory";
import type { CustomerDeal } from "@/lib/data/model";
import type { SaveResult } from "@/app/customers/[id]/actions";

type PriceMap = Record<string, number>;

function initialPrices(deal: CustomerDeal): PriceMap {
  const out: PriceMap = {};
  for (const line of deal.agreement.lines) out[line.skuId] = line.unitPriceCents;
  return out;
}

export function DealDeskClient({
  deal,
  saveAction,
}: {
  deal: CustomerDeal;
  saveAction: (customerId: string, prices: PriceMap, note: string) => Promise<SaveResult>;
}) {
  const [prices, setPrices] = useState<PriceMap>(() => initialPrices(deal));
  const [savedPrices, setSavedPrices] = useState<PriceMap>(() => initialPrices(deal));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);

  const skuById = useMemo(
    () => Object.fromEntries(deal.skus.map((s) => [s.id, s])),
    [deal.skus],
  );

  const dirty = useMemo(
    () => deal.agreement.lines.some((l) => prices[l.skuId] !== savedPrices[l.skuId]),
    [prices, savedPrices, deal.agreement.lines],
  );

  const { targetMarginFraction: target, floorMarginFraction: floor } = deal.agreement;

  function onSave() {
    setResult(null);
    startTransition(async () => {
      const res = await saveAction(deal.customer.id, prices, note.trim() || "Price update");
      setResult(res);
      if (res.ok) {
        setSavedPrices({ ...prices });
        setNote("");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {deal.agreement.lines.map((line) => {
          const sku = skuById[line.skuId];
          const minCents = Math.round(sku.costPerCaseCents * 0.9);
          const maxCents = Math.round(sku.standardPriceCents * 1.15);
          return (
            <MarginRow
              key={line.skuId}
              sku={sku}
              sellCents={prices[line.skuId]}
              targetFraction={target}
              floorFraction={floor}
              minCents={minCents}
              maxCents={maxCents}
              onChange={(v) => setPrices((p) => ({ ...p, [line.skuId]: v }))}
            />
          );
        })}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="save-note">
            Change note
          </label>
          <input
            id="save-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Q1 renegotiation — volume commitment"
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={pending || !dirty}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save price agreement"}
            </button>
            {!dirty && !result && <span className="text-sm text-slate-400">No unsaved changes</span>}
            {result?.ok && (
              <span className="text-sm font-medium text-emerald-700">
                Saved as version {result.version}
                {result.durable === false ? " (demo — not persisted)" : ""}
              </span>
            )}
            {result && !result.ok && (
              <span className="text-sm font-medium text-red-700">{result.error}</span>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <TermsPanel agreement={deal.agreement} customer={deal.customer} />
        <VersionHistory versions={deal.versions} />
      </aside>
    </div>
  );
}
