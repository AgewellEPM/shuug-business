"use client";

/**
 * OrdersClient — orchestrates ordering for one customer: the live-priced order
 * builder and the order history with one-click reorder. Holds draft state so
 * reorder can prefill the builder; prices/validates live via the pure engine;
 * submits through the server action and refreshes history on success.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { priceOrder, validateOrder } from "@/lib/pricing";
import { parseDollarsToCents } from "@/lib/money";
import { OrderBuilder } from "./OrderBuilder";
import { OrderHistory } from "./OrderHistory";
import type { CustomerDeal, Order, OrderUnit } from "@/lib/data/model";
import type { PlaceOrderResult } from "@/app/customers/[id]/orders/actions";

export function OrdersClient({
  deal,
  orders,
  placeAction,
}: {
  deal: CustomerDeal;
  orders: Order[];
  placeAction: (
    customerId: string,
    draft: { skuId: string; quantity?: number; unit?: OrderUnit; overrideUnitPriceCents?: number }[],
    poNumber: string | null,
    note: string,
  ) => Promise<PlaceOrderResult>;
}) {
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [unitById, setUnitById] = useState<Record<string, OrderUnit>>({});
  const [overrideById, setOverrideById] = useState<Record<string, string>>({});
  const [poNumber, setPoNumber] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  const router = useRouter();

  /** Parse a per-line override dollar string to cents, or undefined if blank/invalid. */
  function overrideCents(skuId: string): number | undefined {
    const raw = overrideById[skuId];
    if (!raw || !raw.trim()) return undefined;
    try {
      return parseDollarsToCents(raw);
    } catch {
      return undefined; // ignore half-typed values; the tier price stands
    }
  }

  const draft = useMemo(
    () =>
      deal.skus.map((s) => ({
        skuId: s.id,
        unit: unitById[s.id] ?? ("case" as OrderUnit),
        quantity: qtyById[s.id] ?? 0,
        overrideUnitPriceCents: overrideCents(s.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deal.skus, qtyById, unitById, overrideById],
  );

  const pricing = useMemo(
    () => priceOrder(draft, deal.agreement, deal.skus),
    [draft, deal.agreement, deal.skus],
  );

  const validation = useMemo(
    () =>
      validateOrder({
        pricing,
        agreement: deal.agreement,
        requiresPO: deal.customer.requiresPO,
        poNumber: poNumber.trim() || null,
      }),
    [pricing, deal.agreement, deal.customer.requiresPO, poNumber],
  );

  function onQty(skuId: string, quantity: number) {
    setResult(null);
    setQtyById((prev) => ({ ...prev, [skuId]: quantity }));
  }

  function onUnit(skuId: string, unit: OrderUnit) {
    setResult(null);
    setUnitById((prev) => ({ ...prev, [skuId]: unit }));
    setOverrideById((prev) => ({ ...prev, [skuId]: "" })); // price basis changed
  }

  function onOverride(skuId: string, value: string) {
    setResult(null);
    setOverrideById((prev) => ({ ...prev, [skuId]: value }));
  }

  function onReorder(order: Order) {
    setResult(null);
    const nextQty: Record<string, number> = {};
    const nextUnit: Record<string, OrderUnit> = {};
    const nextOverrides: Record<string, string> = {};
    for (const line of order.lines) {
      nextQty[line.skuId] = line.quantity;
      nextUnit[line.skuId] = line.unit;
      if (line.isOverride) nextOverrides[line.skuId] = (line.unitPriceCents / 100).toFixed(2);
    }
    setQtyById(nextQty);
    setUnitById(nextUnit);
    setOverrideById(nextOverrides);
    setPoNumber("");
    setNote("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await placeAction(
        deal.customer.id,
        draft,
        poNumber.trim() || null,
        note.trim(),
      );
      setResult(res);
      if (res.ok) {
        setQtyById({});
        setUnitById({});
        setOverrideById({});
        setPoNumber("");
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      <OrderBuilder
        skus={deal.skus}
        qtyById={qtyById}
        onQty={onQty}
        unitById={unitById}
        onUnit={onUnit}
        overrideById={overrideById}
        onOverride={onOverride}
        targetFraction={deal.agreement.targetMarginFraction}
        floorFraction={deal.agreement.floorMarginFraction}
        pricing={pricing}
        validation={validation}
        requiresPO={deal.customer.requiresPO}
        poNumber={poNumber}
        onPO={(v) => {
          setResult(null);
          setPoNumber(v);
        }}
        note={note}
        onNote={setNote}
        onSubmit={onSubmit}
        pending={pending}
        result={result}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Order history
        </h2>
        <OrderHistory orders={orders} skus={deal.skus} onReorder={onReorder} />
      </section>
    </div>
  );
}
