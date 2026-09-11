import { randomUUID } from "node:crypto";
import type { diningManagementData } from "../src/lib/restaurant/dining";
import type { RestaurantOverview } from "../src/lib/restaurant/load";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function restaurantDiningHttpCheck(base: string, ownerCookie: string, employeeCookie: string) {
  assert(process.env.DEALDESK_DATA_DIR?.includes("shuug-http-check-"), "Dining acceptance requires the disposable fixture workspace.");
  const request = (path: string, body?: unknown, cookie = ownerCookie) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(20000) });
  const initial: ReturnType<typeof diningManagementData> = await (await request("/api/restaurant/dining")).json();
  const tableResponse = await request("/api/restaurant/service", { action: "table", input: { name: "HTTP dining table", seats: 2, area: "Main" } }); const table = (await tableResponse.json()).table.id as string;
  const waitResponse = await request("/api/restaurant/service", { action: "table", input: { name: "HTTP host table", seats: 4, area: "Main" } }); const waitTable = (await waitResponse.json()).table.id as string;
  const command = async (action: string, input: unknown) => { const response = await request("/api/restaurant/dining", { requestId: randomUUID(), action, input }), result = await response.json(); assert(response.ok, result.error ?? `Dining ${action} failed`); return result.result as { id: string }; };
  await command("settings.save", { ...initial.settings, enabled: true, tableIds: [table], leadMinutes: 15, weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: "11:00", end: "23:00", overnight: false })) });
  const publicPath = "/api/website/reservations", searchUrl = `${publicPath}?date=${initial.today}`;
  const guestFetch = (path: string) => fetch(base + path, { signal: AbortSignal.timeout(20000) });
  const post = (body: Record<string, string>) => fetch(base + publicPath, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
  const field = (html: string, key: string) => { const value = html.match(new RegExp(`name="${key}" value="([^"]+)"`))?.[1]; assert(value, `Guest ${key} field missing`); return value; };
  const search = async (url = searchUrl) => { const response = await guestFetch(url), html = await response.text(); assert(response.ok && html.includes("Find seating times") && !html.includes("HTTP dining table"), "Guest table search failed or exposed internal floor data."); return { html, proof: field(html, "proof"), slots: [...html.matchAll(/<option value="([^"]+Z)">/g)].map(m => m[1]) }; };
  const review = async (proof: string, startAt: string) => { const response = await post({ action: "review", proof, startAt, name: "HTTP dining guest", phone: "555-0100", email: "", notes: "Synthetic reservation", partySize: "2", consent: "yes" }), html = await response.text(); assert(response.ok && html.includes("60 minutes before"), "Guest reservation review failed."); return field(html, "quote"); };
  // Choose a seating far enough ahead for the cancellation/reschedule policy.
  const a = await search(), slot = a.slots.find(s => Date.parse(s) > Date.now() + 7200000); assert(slot, "No future seating times were published.");
  const q1 = await review(a.proof, slot), q2 = await review((await search()).proof, slot);
  const race = await Promise.all([q1, q2].map(quote => post({ action: "confirm", quote, confirmed: "yes" })));
  assert(race.filter(r => r.ok).length === 1 && race.filter(r => r.status === 400).length === 1, "Two guest requests reserved the last table."); const winner = race.findIndex(r => r.ok), receipt = await race[winner].text(), manage = field(receipt, "manage");
  assert((await post({ action: "confirm", quote: [q1, q2][winner], confirmed: "yes" })).ok, "Reservation retry failed.");
  const floor = async (): Promise<RestaurantOverview> => { const response = await request(`/api/restaurant/service?date=${initial.today}`); assert(response.ok, "Floor read failed"); return response.json(); };
  assert((await floor()).reservations.filter(r => r.source === "website").length === 1, "Reservation retry duplicated a guest.");
  const changed = await search(`${searchUrl}&manage=${encodeURIComponent(manage)}&change=1`), nextSlot = changed.slots.find(s => Date.parse(s) >= Date.parse(slot) + 7200000); assert(nextSlot, "Reschedule time unavailable");
  const changeQuote = await review(changed.proof, nextSlot), updated = await post({ action: "confirm", quote: changeQuote, confirmed: "yes" }); assert(updated.ok, "Guest reschedule failed"); const changedManage = field(await updated.text(), "manage");
  const cancelled = await post({ action: "cancel", manage: changedManage, confirmed: "yes" }); assert(cancelled.ok && (await cancelled.text()).includes("Reservation cancelled"), "Guest cancellation failed.");
  const finalSearch = await search(), finalQuote = await review(finalSearch.proof, slot); assert((await post({ action: "confirm", quote: finalQuote, confirmed: "yes" })).ok, "Released seating time did not become bookable.");
  const visit = (await floor()).reservations.find(r => r.source === "website" && r.status === "confirmed"); assert(visit, "Confirmed guest missing from floor.");
  const version = async (id: string) => { const r = (await floor()).reservations.find(r => r.id === id); assert(r, "Visit missing"); return { id, revision: r.revision }; };
  await command("visit.arrive", await version(visit.id)); await command("visit.status", { ...await version(visit.id), status: "seated" });
  const walk = await command("reservation.save", { name: "HTTP walk-in", partySize: 2, dateISO: initial.today, time: "23:00", tableId: null, walkIn: true, phone: "", email: "", notes: "", quotedWaitMinutes: 15, host: "HTTP host" });
  await command("visit.quote", { ...await version(walk.id), quotedWaitMinutes: 5, host: "HTTP host" }); await command("visit.table", { ...await version(walk.id), tableId: waitTable }); await command("visit.status", { ...await version(walk.id), status: "seated" }); await command("visit.status", { ...await version(walk.id), status: "completed" });
  const page = await request(`/restaurant?date=${initial.today}`), html = await page.text(); assert(page.ok && html.includes("HTTP dining guest") && html.includes("Refresh floor") && html.includes("Seated after"), "Installed floor did not render guest and seating controls.");
  const rules = await request("/restaurant/reservations"); assert(rules.ok && (await rules.text()).includes("Weekly service hours"), "Installed reservation settings did not render.");
  assert((await request("/api/restaurant/dining", undefined, "")).status === 403 && (await request("/api/restaurant/dining", undefined, employeeCookie)).status === 403, "Guest or restricted employee accessed private reservation settings.");
  console.log(JSON.stringify({ ok: true, dining: ["published hours → guest search/review/confirm", "concurrent last-table and retry protection", "private reschedule/cancel", "host arrival/seating", "walk-in/quote/table/release", "installed floor/settings", "employee restriction"] }));
  return visit.id;
}
