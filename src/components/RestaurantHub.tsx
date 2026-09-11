"use client";

/**
 * Restaurant hub — two tabs over one service:
 *  • Reservations: AI host (plain-language → structured booking), the night's list,
 *    seat / confirm / no-show, best-fit table suggestions.
 *  • Kitchen: a live ticket board (new → cooking → ready), station load, new tickets.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RestaurantOverview } from "@/lib/restaurant/load";
import { DiningVisitControls } from "@/components/restaurant/DiningVisitControls";
import type { ReservationStatus } from "@/lib/restaurant/reservations";
import type { TicketStatus } from "@/lib/restaurant/kitchen";
import type { ActionResult } from "@/app/restaurant/actions";
import type { ParseResult } from "@/lib/restaurant/ai";

interface Actions {
  saveTableAction: (input: { id?: string; name: string; seats: number; area: string }) => Promise<ActionResult>;
  addReservationAction: (form: { name: string; partySize: number; dateISO: string; time: string; tableId: string | null; phone: string; notes: string }) => Promise<ActionResult>;
  setReservationStatusAction: (id: string, status: ReservationStatus) => Promise<ActionResult>;
  assignTableAction: (id: string, tableId: string | null) => Promise<ActionResult>;
  addTicketAction: (form: { ref: string; server: string; note: string; items: { name: string; station: string; qty: number }[] }) => Promise<ActionResult>;
  setItemStatusAction: (ticketId: string, itemIndex: number, status: TicketStatus) => Promise<ActionResult>;
  advanceTicketAction: (ticketId: string, status: TicketStatus) => Promise<ActionResult>;
  clearServedAction: () => Promise<ActionResult>;
  parseBookingAction: (message: string, todayISO: string) => Promise<ParseResult>;
}

const STATUS_TONE: Record<ReservationStatus, string> = {
  waiting: "bg-orange-100 text-orange-900",
  requested: "bg-amber-100 text-amber-900", confirmed: "bg-sky-100 text-sky-800", seated: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-100 text-slate-500", cancelled: "bg-slate-100 text-slate-400", "no-show": "bg-red-100 text-red-800",
};

export function RestaurantHub({ data, aiEnabled, aiLabel, canEdit, ...actions }: { data: RestaurantOverview; aiEnabled: boolean; aiLabel: string; canEdit: boolean } & Actions) {
  const router = useRouter();
  const [working, start] = useTransition();
  const pending = working || !canEdit;
  useEffect(() => { const timer = setInterval(() => router.refresh(), 30000); return () => clearInterval(timer); }, [router]);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"reservations" | "kitchen">("reservations");
  const run = (fn: () => Promise<ActionResult>) => start(async () => { const r = await fn(); setToast(r.ok ? "Saved" : r.error ?? "Failed"); router.refresh(); });

  return (
    <div className="space-y-5">
      {toast && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">{toast}</p>}
      <div className="flex flex-wrap items-center gap-4"><form method="get" action="/restaurant" className="flex items-center gap-2"><label>Service date <input className="dd-input" type="date" name="date" defaultValue={data.dateISO} required/></label><button className="dd-secondary">Open service</button></form><span className="text-sm">{data.reservations.filter(r => r.status === "waiting").length} parties waiting · {data.timezone}</span><button type="button" className="dd-secondary" onClick={() => router.refresh()}>Refresh floor</button></div>
      <details className="dd-card"><summary className="cursor-pointer font-semibold">Tables and floor plan · {data.tables.length} tables</summary><p className="my-3 text-sm">Add your actual tables and seating capacity. Table assignments are checked against other bookings and seated parties.</p><div className="grid gap-3 sm:grid-cols-2">{data.tables.map(t => <form key={t.id} className="space-y-2 rounded-lg border p-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => actions.saveTableAction({ id: t.id, name: String(f.get("name")), seats: Number(f.get("seats")), area: String(f.get("area")) })); }}><label className="block text-sm">Table name<input className="dd-input ml-2" name="name" defaultValue={t.name} maxLength={60} required/></label><label className="block text-sm">Seats<input className="dd-input ml-2 w-20" name="seats" type="number" min="1" max="50" defaultValue={t.seats} required/></label><label className="block text-sm">Area<input className="dd-input ml-2" name="area" defaultValue={t.area} maxLength={60} required/></label><button disabled={pending} className="dd-secondary">Save table</button></form>)}</div><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => actions.saveTableAction({ name: String(f.get("name")), seats: Number(f.get("seats")), area: String(f.get("area")) })); }}><label className="text-sm">New table<input className="dd-input mt-1 block" name="name" maxLength={60} required/></label><label className="text-sm">Seats<input className="dd-input mt-1 block w-20" type="number" name="seats" min="1" max="50" defaultValue="2" required/></label><label className="text-sm">Area<input className="dd-input mt-1 block" name="area" maxLength={60} defaultValue="Main" required/></label><button className="dd-primary" disabled={pending}>Add table</button></form></details>
      <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm w-fit">
        {(["reservations", "kitchen"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-4 py-1.5 font-semibold capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{t}</button>
        ))}
      </div>

      {tab === "reservations"
        ? <Reservations data={data} aiEnabled={aiEnabled} aiLabel={aiLabel} pending={pending} run={run} actions={actions} />
        : <Kitchen data={data} pending={pending} run={run} actions={actions} />}
    </div>
  );
}

function Reservations({ data, aiEnabled, aiLabel, pending, run, actions }: { data: RestaurantOverview; aiEnabled: boolean; aiLabel: string; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const router = useRouter();
  const blank = () => ({ name: "", partySize: "2", dateISO: data.dateISO, time: "19:00", occurrence: "first", phone: "", email: "", notes: "", walkIn: false, quotedWaitMinutes: "15", host: "" });
  const [form, setForm] = useState(blank), [aiText, setAiText] = useState(""), [aiBusy, setAiBusy] = useState(false), [aiMsg, setAiMsg] = useState<string | null>(null);
  const requests = useRef(new Map<string, string>()), field = "dd-input mt-1 block w-full";
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => {
    const input = { ...form, partySize: Number(form.partySize), tableId: null, quotedWaitMinutes: form.walkIn ? Number(form.quotedWaitMinutes) : null };
    const key = JSON.stringify(input), requestId = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, requestId);
    run(async () => {
      try { const response = await fetch("/api/restaurant/dining", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action: "reservation.save", input }) }), result = await response.json();
        if (!response.ok) return { ok: false, error: result.error ?? "Could not save reservation." };
        requests.current.delete(key); setForm(blank()); router.push(`/restaurant?date=${encodeURIComponent(input.walkIn ? result.data.today : input.dateISO)}`); return { ok: true };
      } catch { return { ok: false, error: "Could not confirm the save. Retry to check the original request." }; }
    });
  };
  const askAi = async () => {
    if (!aiText.trim()) return; setAiBusy(true); setAiMsg(null);
    try { const result = await actions.parseBookingAction(aiText, data.dateISO);
      if (!result.ok || !result.booking) { setAiMsg(result.error ?? "Could not read that."); return; }
      const b = result.booking; setForm({ ...blank(), name: b.name ?? "", partySize: String(b.partySize ?? 2), dateISO: b.dateISO ?? data.dateISO, time: b.time ?? "19:00", phone: b.phone ?? "", notes: b.notes ?? "" });
      setAiMsg("Review the guest, date, time and party size below before saving.");
    } catch { setAiMsg("Could not read the request. You can still enter the reservation below."); } finally { setAiBusy(false); }
  };
  const visits = [...data.reservations].sort((a, b) => Number(b.status === "waiting") - Number(a.status === "waiting") || (a.status === "waiting" && b.status === "waiting" ? (a.arrivedAt ?? a.createdAt).localeCompare(b.arrivedAt ?? b.createdAt) : a.time.localeCompare(b.time)));
  const observed = data.observedAt;
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div><div className="mb-3 flex flex-wrap gap-2 text-xs"><Chip label={`${data.night.covers} covers booked for ${data.dateISO}`} tone="bg-emerald-100 text-emerald-800"/><Chip label={`${data.reservations.filter(r => r.status === "seated").length} seated`} tone="bg-sky-100 text-sky-800"/><Chip label={`${data.night.upcoming.length} upcoming`} tone="bg-amber-100 text-amber-900"/></div>
      <p className="mb-3 text-xs text-slate-500">Waiting parties appear in arrival order. The floor refreshes every 30 seconds. Open priced checks from Orders to connect each seated table to stock, kitchen and payments.</p>
      <ol className="space-y-3">{visits.map(r => <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{r.time} · {r.name} <span className="font-normal text-slate-500">· party {r.partySize}</span></p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{r.status}</span></div>
        <p className="mt-1 text-xs text-slate-500">{r.source === "website" ? "Website reservation" : r.source === "walk_in" ? "Walk-in" : "Staff reservation"}{r.phone && ` · ${r.phone}`}{r.host && ` · Host: ${r.host}`}</p>
        {r.status === "waiting" && r.arrivedAt && <p className="mt-2 text-sm">Waiting {Math.max(0, Math.floor((observed - Date.parse(r.arrivedAt)) / 60000))} minutes{r.quotedWaitMinutes != null && ` · quoted ${r.quotedWaitMinutes} minutes`}</p>}
        {r.seatedAt && r.arrivedAt && <p className="mt-1 text-xs">Seated after {Math.max(0, Math.floor((Date.parse(r.seatedAt) - Date.parse(r.arrivedAt)) / 60000))} minutes waiting</p>}
        {r.carriedFromEarlierDate && <p className="mt-2 text-xs font-semibold text-amber-800">Still active from {r.dateISO}. Complete or resolve this visit to release its place on the floor.</p>}
        {r.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>}
        <DiningVisitControls key={`${r.id}-${r.revision ?? 1}`} reservation={r} tables={data.tables} timezone={data.timezone} disabled={pending}/>
      </li>)}{!visits.length && <li className="dd-card text-sm">No reservations for {data.dateISO}. Add a guest or walk-in.</li>}</ol>
    </div>
    <div className="space-y-4"><section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"><h2 className="text-sm font-semibold">AI host</h2><p className="mt-1 text-xs">Paste the guest’s request to prepare a reservation for review.</p><label className="mt-3 block text-sm">Guest request<textarea className={field} value={aiText} onChange={e => setAiText(e.target.value)} rows={3}/></label><button type="button" className="dd-secondary mt-3" disabled={pending || aiBusy || !aiEnabled || !aiText.trim()} onClick={() => void askAi()}>{aiBusy ? "Reading…" : "Read request"}</button><p className="mt-2 text-xs">{aiEnabled ? `via ${aiLabel}` : "Connect an AI model to enable"}</p>{aiMsg && <p role="status" className="mt-2 text-sm">{aiMsg}</p>}</section>
      <form className="dd-card space-y-3" onSubmit={e => { e.preventDefault(); submit(); }}><h2 className="font-semibold">Add a guest</h2><fieldset disabled={pending} className="space-y-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.walkIn} onChange={e => set("walkIn", e.target.checked)}/>Walk-in arriving now</label><label className="block text-sm">Guest name<input className={field} value={form.name} onChange={e => set("name", e.target.value)} required maxLength={120}/></label><label className="block text-sm">Party size<input className={field} type="number" min="1" max="50" value={form.partySize} onChange={e => set("partySize", e.target.value)} required/></label>
      {!form.walkIn && <><label className="block text-sm">Visit date<input className={field} type="date" value={form.dateISO} onChange={e => set("dateISO", e.target.value)} required/></label><label className="block text-sm">Seating time ({data.timezone})<input className={field} type="time" value={form.time} onChange={e => set("time", e.target.value)} required/></label><label className="block text-sm">Repeated hour when clocks go back<select className={field} value={form.occurrence} onChange={e => set("occurrence", e.target.value)}><option value="first">First occurrence (usual default)</option><option value="second">Second occurrence</option></select></label></>}
      {form.walkIn && <><p className="text-xs">Arrival uses the current restaurant date and time.</p><label className="block text-sm">Quoted wait (minutes)<input className={field} type="number" min="0" max="240" value={form.quotedWaitMinutes} onChange={e => set("quotedWaitMinutes", e.target.value)} required/></label><label className="block text-sm">Host (optional)<input className={field} value={form.host} onChange={e => set("host", e.target.value)} maxLength={100}/></label></>}
      <label className="block text-sm">Phone<input className={field} value={form.phone} onChange={e => set("phone", e.target.value)} maxLength={40}/></label><label className="block text-sm">Email<input className={field} type="email" value={form.email} onChange={e => set("email", e.target.value)} maxLength={160}/></label><label className="block text-sm">Guest notes<textarea className={field} value={form.notes} onChange={e => set("notes", e.target.value)} maxLength={500}/></label><button className="dd-primary" disabled={!form.name.trim()}>{form.walkIn ? "Add to waitlist" : "Save reservation"}</button></fieldset></form>
    </div>
  </div>;
}

function Kitchen({ data, pending, run, actions }: { data: RestaurantOverview; pending: boolean; run: (fn: () => Promise<ActionResult>) => void; actions: Actions }) {
  const [ref, setRef] = useState("");
  const [server, setServer] = useState("");
  const [itemsText, setItemsText] = useState("");
  const next: Record<TicketStatus, TicketStatus> = { new: "cooking", cooking: "ready", ready: "served", served: "served" };

  const fire = () => {
    // one item per line: "Name | Station" (station optional)
    const items = itemsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, station] = l.split("|").map((s) => s.trim()); return { name, station: station || "Line", qty: 1 }; });
    if (!ref.trim() || items.length === 0) return;
    run(() => actions.addTicketAction({ ref, server, note: "", items }));
    setRef(""); setServer(""); setItemsText("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Chip label={`${data.kitchen.summary.activeTickets} active tickets`} tone="bg-emerald-100 text-emerald-800" />
        {data.kitchen.summary.oldestMinutes > 0 && <Chip label={`oldest ${data.kitchen.summary.oldestMinutes}m`} tone={data.kitchen.summary.oldestMinutes > 15 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"} />}
        {data.kitchen.summary.stationLoads.slice(0, 4).map((s) => <Chip key={s.station} label={`${s.station}: ${s.open}`} tone="bg-slate-100 text-slate-600" />)}
        <button type="button" disabled={pending} onClick={() => run(() => actions.clearServedAction())} className="ml-auto rounded-lg px-3 py-1 font-semibold text-slate-500 ring-1 ring-slate-200">Clear served</button>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {data.kitchen.columns.map((col) => (
          <div key={col.status} className="rounded-2xl bg-slate-50 p-2">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{col.status} <span className="text-slate-400">({col.tickets.length})</span></p>
            <div className="space-y-2">
              {col.tickets.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{t.ref}{t.server ? ` · ${t.server}` : ""}</p>
                    {t.orderId && t.kitchenReviewRequired ? <a className="text-sm underline" href={`/restaurant/manage?tab=orders#order-${t.orderId}`}>Review online order before cooking</a> : t.orderId && col.status === "ready" ? <a className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white" href={`/restaurant/manage?tab=orders#order-${t.orderId}`}>Serve priced order</a> : <button type="button" disabled={pending} onClick={() => run(() => actions.advanceTicketAction(t.id, next[col.status]))} className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">All → {next[col.status]}</button>}
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {t.items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{it.qty}× {it.name} <span className="text-slate-400">· {it.station}</span>{it.modifiers?.map((label, index) => <span className="block font-semibold" key={index}>{label}</span>)}{it.allergens && <span className="block">Allergens: {it.allergens}</span>}</span>
                        <button type="button" disabled={pending || t.kitchenReviewRequired || it.status === "served" || Boolean(t.orderId && it.status === "ready")} onClick={() => run(() => actions.setItemStatusAction(t.id, i, next[it.status]))} className={`rounded px-1.5 py-0.5 font-semibold ${it.status === "served" ? "text-slate-300" : it.status === "ready" ? "bg-emerald-100 text-emerald-800" : it.status === "cooking" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{it.status}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {col.tickets.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">—</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Fire a ticket */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Unpriced kitchen instructions</h2><p className="mb-3 text-sm text-slate-600">For customer sales, <a className="underline" href="/restaurant/manage?tab=orders">create a priced check</a> to track recipes, stock, payments and accounting. This manual ticket sends instructions only.</p>
        <div className="flex flex-wrap gap-2">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Table / order (e.g. T3)" className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="Server" className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={3} placeholder={"One item per line — Name | Station\nBurger | Grill\nFries | Fry\nCaesar | Salad"} className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="button" disabled={pending || !ref.trim() || !itemsText.trim()} onClick={fire} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700">Send to kitchen</button>
      </section>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 font-semibold ${tone}`}>{label}</span>;
}
