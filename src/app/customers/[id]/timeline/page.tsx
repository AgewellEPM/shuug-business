import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealStore } from "@/lib/data/store";
import { listTeam } from "@/lib/team/store";
import { loadCustomerTimeline } from "@/lib/timeline/load";
import { CustomerTimeline } from "@/components/CustomerTimeline";
import { addCommAction, assignCommAction, markRepliedAction, createQuoteAction, setQuoteStatusAction, convertQuoteAction, attachDocumentAction, removeDocumentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomerTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSectionAccess("sales", "view");

  const { id } = await params;
  const store = await getDealStore();
  const deal = await store.getDeal(id);
  if (!deal) notFound();

  const data = await loadCustomerTimeline(id);
  const team = listTeam().map((m) => ({ id: m.id, name: m.name }));
  const skus = deal.skus.map((s) => ({ id: s.id, name: s.name, standardPriceCents: s.standardPriceCents }));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <header className="mb-5">
        <Link href={`/customers/${id}`} className="text-sm text-slate-500 hover:text-slate-800">← {deal.customer.company}</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Customer record</h1>
        <p className="mt-1 text-sm text-slate-600">Every order, quote, and conversation on one timeline — with an owner on each message so no one replies twice.</p>
      </header>
      <CustomerTimeline
        customerId={id}
        data={data}
        team={team}
        skus={skus}
        todayIso={todayIso}
        addCommAction={addCommAction}
        assignCommAction={assignCommAction}
        markRepliedAction={markRepliedAction}
        createQuoteAction={createQuoteAction}
        setQuoteStatusAction={setQuoteStatusAction}
        convertQuoteAction={convertQuoteAction}
        attachDocumentAction={attachDocumentAction}
        removeDocumentAction={removeDocumentAction}
      />
    </div>
  );
}
