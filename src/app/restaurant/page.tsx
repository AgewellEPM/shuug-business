import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { loadRestaurant } from "@/lib/restaurant/load";
import { llmConfigured, llmLabel } from "@/lib/llm";
import { RestaurantHub } from "@/components/RestaurantHub";
import { addReservationAction, setReservationStatusAction, assignTableAction, addTicketAction, setItemStatusAction, advanceTicketAction, clearServedAction, parseBookingAction, saveTableAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSectionAccess("operations", "view");

  let canEdit = false;
  try { await requireSectionAccess("operations", "edit"); canEdit = true; } catch {}
  const { date } = await searchParams;
  const data = loadRestaurant(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);

  return (
    <div>
      <header className="mb-5">
        <p className="dd-eyebrow">Run the whole house</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Restaurant</h1>
        <p className="mt-2 text-sm text-slate-500">
          Take reservations (with an AI host that reads plain-language requests), seat the floor without double-booking,
          and run the kitchen line on a live ticket board. {data.tables.length} tables.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3"><Link className="dd-primary" href="/restaurant/manage?tab=orders">Orders, menu and ingredients</Link><Link className="dd-secondary" href="/restaurant/reservations">Booking hours and rules</Link><Link className="dd-secondary" href="/restaurant/finance">Payments and daily close</Link><Link className="dd-secondary" href="/restaurant/finance?tab=reports">Sales patterns</Link></div>

      <RestaurantHub
        data={data}
        canEdit={canEdit}
        aiEnabled={llmConfigured()}
        aiLabel={llmLabel()}
        addReservationAction={addReservationAction}
        setReservationStatusAction={setReservationStatusAction}
        assignTableAction={assignTableAction}
        addTicketAction={addTicketAction}
        setItemStatusAction={setItemStatusAction}
        advanceTicketAction={advanceTicketAction}
        clearServedAction={clearServedAction}
        parseBookingAction={parseBookingAction}
        saveTableAction={saveTableAction}
      />

      <p className="mt-6 text-xs text-slate-400">
        Hours worked by your kitchen &amp; floor staff run through the <Link href="/timeclock" className="font-semibold text-emerald-700 hover:underline">time clock</Link>. <Link href="/api/v1/restaurant" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">API →</Link>
      </p>
    </div>
  );
}
